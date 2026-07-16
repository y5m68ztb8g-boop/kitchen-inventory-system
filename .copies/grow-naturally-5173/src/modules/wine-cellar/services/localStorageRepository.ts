import type {
  CreatePositionInput,
  CreateRackInput,
  ProductAssignmentInput,
  RecordAdjustmentInput,
  RecordCountInput,
  RecordReceiptInput,
  UpdatePositionInput,
  UpdateRackInput,
  WineCellarActor,
  WineCellarAuditEvent,
  WineCellarCountEntry,
  WineCellarPosition,
  WineCellarProductAssignment,
  WineCellarRack,
  WineCellarReceipt,
  WineCellarScope,
  WineCellarSnapshot,
  WineCellarStockAdjustment
} from "../types";
import { WineCellarPersistenceError, WineCellarValidationError } from "../types/errors";
import { calculateCapacity } from "../utils/inventory";
import { getOrderedSlots, hasAbnormalEmptyPattern } from "../utils/slots";
import type { WineCellarRepository } from "./repository";

type RepositoryOptions = {
  storage?: Storage;
  now?: () => string;
  createId?: () => string;
};

type StoredPayload = { version: 1; snapshot: WineCellarSnapshot };

export function emptyWineCellarSnapshot(): WineCellarSnapshot {
  return { racks: [], positions: [], assignments: [], countSessions: [], countEntries: [], receipts: [], adjustments: [], auditEvents: [] };
}

function defaultId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `wine-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function scopeKey(scope: WineCellarScope) {
  return `grow-naturally:wine-cellar:v1:${encodeURIComponent(scope.hotelId)}:${encodeURIComponent(scope.areaId)}`;
}

function requireText(value: string, message: string) {
  const trimmed = value.trim();
  if (!trimmed) throw new WineCellarValidationError(message);
  return trimmed;
}

function requireInteger(value: number, message: string, allowNegative = false) {
  if (!Number.isInteger(value) || (allowNegative ? value === 0 : value <= 0)) {
    throw new WineCellarValidationError(message);
  }
}

function cloneSnapshot(snapshot: WineCellarSnapshot): WineCellarSnapshot {
  return structuredClone(snapshot);
}

export class LocalStorageWineCellarRepository implements WineCellarRepository {
  private readonly storage: Storage;
  private readonly now: () => string;
  private readonly createId: () => string;

  constructor(options: RepositoryOptions = {}) {
    this.storage = options.storage ?? window.localStorage;
    this.now = options.now ?? (() => new Date().toISOString());
    this.createId = options.createId ?? defaultId;
  }

  getSnapshot(scope: WineCellarScope) {
    try {
      const raw = this.storage.getItem(scopeKey(scope));
      if (!raw) return emptyWineCellarSnapshot();
      const parsed = JSON.parse(raw) as StoredPayload;
      this.validateStoredSnapshot(scope, parsed);
      return cloneSnapshot(parsed.snapshot);
    } catch (error) {
      if (error instanceof WineCellarPersistenceError) throw error;
      throw new WineCellarPersistenceError("酒库本地数据无法读取，请先恢复或清理损坏的数据。", { cause: error });
    }
  }

  private validateStoredSnapshot(scope: WineCellarScope, payload: StoredPayload) {
    const snapshot = payload?.snapshot;
    const collections: Array<keyof WineCellarSnapshot> = ["racks", "positions", "assignments", "countSessions", "countEntries", "receipts", "adjustments", "auditEvents"];
    if (payload?.version !== 1 || !snapshot || collections.some((name) => !Array.isArray(snapshot[name]))) {
      throw new WineCellarPersistenceError("酒库本地数据格式无效。");
    }
    if (collections.some((name) => snapshot[name].some((entity) => entity.hotelId !== scope.hotelId || entity.areaId !== scope.areaId))) {
      throw new WineCellarPersistenceError("酒库本地数据包含其他酒店或区域的记录。");
    }
    const rackIds = new Set(snapshot.racks.map((rack) => rack.id));
    const positionIds = new Set(snapshot.positions.map((position) => position.id));
    const sessionIds = new Set(snapshot.countSessions.map((session) => session.id));
    if (snapshot.positions.some((position) => !rackIds.has(position.rackId)) ||
      snapshot.assignments.some((assignment) => !positionIds.has(assignment.positionId)) ||
      snapshot.countEntries.some((entry) => !positionIds.has(entry.positionId) || !sessionIds.has(entry.sessionId)) ||
      snapshot.receipts.some((receipt) => !positionIds.has(receipt.positionId)) ||
      snapshot.adjustments.some((adjustment) => !positionIds.has(adjustment.positionId))) {
      throw new WineCellarPersistenceError("酒库本地数据关系不完整。");
    }
  }

  private save(scope: WineCellarScope, snapshot: WineCellarSnapshot) {
    try {
      this.storage.setItem(scopeKey(scope), JSON.stringify({ version: 1, snapshot } satisfies StoredPayload));
    } catch (error) {
      throw new WineCellarPersistenceError("酒库数据保存失败，请重试。", { cause: error });
    }
  }

  private mutate<T>(scope: WineCellarScope, mutation: (snapshot: WineCellarSnapshot) => T): T {
    const snapshot = this.getSnapshot(scope);
    const result = mutation(snapshot);
    this.save(scope, snapshot);
    return result;
  }

  private audit(scope: WineCellarScope, snapshot: WineCellarSnapshot, type: WineCellarAuditEvent["type"], entityId: string, changes: Record<string, unknown>, actor: WineCellarActor, createdAt: string) {
    snapshot.auditEvents.push({ id: this.createId(), ...scope, type, entityId, changes, actorId: actor.id, actorName: actor.name, createdAt });
  }

  private findRack(snapshot: WineCellarSnapshot, rackId: string) {
    const rack = snapshot.racks.find((item) => item.id === rackId && item.active);
    if (!rack) throw new WineCellarValidationError("找不到该区域中的酒架。");
    return rack;
  }

  private findPosition(snapshot: WineCellarSnapshot, positionId: string) {
    const position = snapshot.positions.find((item) => item.id === positionId && item.active);
    if (!position) throw new WineCellarValidationError("找不到该区域中的酒位。");
    return position;
  }

  private validateAlert(mode: CreatePositionInput["lowStockMode"], threshold: number) {
    if (!Number.isFinite(threshold) || threshold < 0 || (mode === "percentage" && threshold > 100)) {
      throw new WineCellarValidationError("低库存阈值无效。");
    }
  }

  private addAssignment(scope: WineCellarScope, snapshot: WineCellarSnapshot, positionId: string, input: ProductAssignmentInput, actor: WineCellarActor, createdAt: string) {
    const productName = requireText(input.productName, "请输入酒品名称。");
    if (input.matchStatus === "matched" && !input.productId) {
      throw new WineCellarValidationError("已匹配商品必须包含商品 ID。");
    }
    if (input.currency && input.currency !== "GBP") {
      throw new WineCellarValidationError("当前版本只支持 GBP 成本估值。");
    }
    if (input.unitCost !== undefined && input.unitCost !== null && (!Number.isFinite(input.unitCost) || input.unitCost < 0)) {
      throw new WineCellarValidationError("单位成本不能小于零。");
    }
    snapshot.assignments.forEach((assignment) => {
      if (assignment.positionId === positionId && assignment.active) assignment.active = false;
    });
    const assignment: WineCellarProductAssignment = {
      id: this.createId(), ...scope, positionId, productId: input.productId, productName,
      matchStatus: input.matchStatus, supplierName: input.supplierName ?? null,
      supplierProductCode: input.supplierProductCode ?? null, invoiceReference: input.invoiceReference ?? null,
      unitCost: input.unitCost ?? null, currency: input.currency || "GBP", assignedAt: createdAt,
      assignedById: actor.id, assignedByName: actor.name, active: true
    };
    snapshot.assignments.push(assignment);
    this.audit(scope, snapshot, "product-assigned", positionId, { productName, matchStatus: assignment.matchStatus }, actor, createdAt);
  }

  createRack(scope: WineCellarScope, input: CreateRackInput, actor: WineCellarActor) {
    return this.mutate(scope, (snapshot) => {
      const createdAt = this.now();
      const rack: WineCellarRack = { id: this.createId(), ...scope, name: requireText(input.name, "请输入酒架名称。"), displayOrder: snapshot.racks.length, active: true, createdAt, updatedAt: createdAt };
      snapshot.racks.push(rack);
      this.audit(scope, snapshot, "rack-created", rack.id, { name: rack.name }, actor, createdAt);
      return rack;
    });
  }

  updateRack(scope: WineCellarScope, rackId: string, input: UpdateRackInput, actor: WineCellarActor) {
    return this.mutate(scope, (snapshot) => {
      const rack = this.findRack(snapshot, rackId);
      if (input.name !== undefined) rack.name = requireText(input.name, "请输入酒架名称。");
      if (input.displayOrder !== undefined) {
        if (!Number.isInteger(input.displayOrder) || input.displayOrder < 0) throw new WineCellarValidationError("酒架顺序无效。");
        rack.displayOrder = input.displayOrder;
      }
      rack.updatedAt = this.now();
      this.audit(scope, snapshot, "rack-updated", rack.id, input, actor, rack.updatedAt);
      return { ...rack };
    });
  }

  reorderRacks(scope: WineCellarScope, orderedRackIds: string[], actor: WineCellarActor) {
    return this.mutate(scope, (snapshot) => {
      const activeRacks = snapshot.racks.filter((rack) => rack.active);
      const uniqueIds = new Set(orderedRackIds);
      if (orderedRackIds.length !== activeRacks.length || uniqueIds.size !== activeRacks.length ||
        orderedRackIds.some((id) => !activeRacks.some((rack) => rack.id === id))) {
        throw new WineCellarValidationError("酒架排序包含无效或其他区域的酒架。");
      }
      const updatedAt = this.now();
      const ordered = orderedRackIds.map((id, displayOrder) => {
        const rack = activeRacks.find((item) => item.id === id)!;
        rack.displayOrder = displayOrder;
        rack.updatedAt = updatedAt;
        this.audit(scope, snapshot, "rack-updated", rack.id, { displayOrder }, actor, updatedAt);
        return { ...rack };
      });
      return ordered;
    });
  }

  createPosition(scope: WineCellarScope, input: CreatePositionInput, actor: WineCellarActor) {
    return this.mutate(scope, (snapshot) => {
      this.findRack(snapshot, input.rackId);
      this.validateAlert(input.lowStockMode, input.lowStockThreshold);
      const createdAt = this.now();
      const position: WineCellarPosition = {
        id: this.createId(), ...scope, rackId: input.rackId, code: requireText(input.code, "请输入酒位编号。"),
        width: input.width, depth: input.depth, capacity: calculateCapacity(input.width, input.depth), currentQuantity: 0,
        stockUnit: input.stockUnit, fillDirection: input.fillDirection, lowStockMode: input.lowStockMode,
        lowStockThreshold: input.lowStockThreshold, active: true, createdAt, updatedAt: createdAt
      };
      if (snapshot.positions.some((item) => item.active && item.rackId === input.rackId && item.code.toLowerCase() === position.code.toLowerCase())) {
        throw new WineCellarValidationError("该酒架中已存在相同酒位编号。");
      }
      snapshot.positions.push(position);
      this.audit(scope, snapshot, "position-created", position.id, { code: position.code, capacity: position.capacity }, actor, createdAt);
      if (input.assignment) this.addAssignment(scope, snapshot, position.id, input.assignment, actor, createdAt);
      return position;
    });
  }

  updatePosition(scope: WineCellarScope, positionId: string, input: UpdatePositionInput, actor: WineCellarActor) {
    return this.mutate(scope, (snapshot) => {
      const position = this.findPosition(snapshot, positionId);
      if (input.rackId !== undefined) this.findRack(snapshot, input.rackId);
      const width = input.width ?? position.width;
      const depth = input.depth ?? position.depth;
      const capacity = calculateCapacity(width, depth);
      if (position.currentQuantity > capacity) throw new WineCellarValidationError("新容量不能小于当前库存。");
      const lowStockMode = input.lowStockMode ?? position.lowStockMode;
      const lowStockThreshold = input.lowStockThreshold ?? position.lowStockThreshold;
      this.validateAlert(lowStockMode, lowStockThreshold);
      Object.assign(position, {
        rackId: input.rackId ?? position.rackId, code: input.code === undefined ? position.code : requireText(input.code, "请输入酒位编号。"),
        width, depth, capacity, stockUnit: input.stockUnit ?? position.stockUnit,
        fillDirection: input.fillDirection ?? position.fillDirection, lowStockMode, lowStockThreshold, updatedAt: this.now()
      });
      this.audit(scope, snapshot, "position-updated", position.id, input, actor, position.updatedAt);
      if (input.assignment === null) {
        snapshot.assignments.forEach((assignment) => { if (assignment.positionId === position.id && assignment.active) assignment.active = false; });
      } else if (input.assignment) this.addAssignment(scope, snapshot, position.id, input.assignment, actor, position.updatedAt);
      return { ...position };
    });
  }

  archiveRack(scope: WineCellarScope, rackId: string, actor: WineCellarActor) {
    this.mutate(scope, (snapshot) => {
      const rack = this.findRack(snapshot, rackId);
      const createdAt = this.now();
      rack.active = false;
      rack.updatedAt = createdAt;
      snapshot.positions.filter((position) => position.rackId === rackId).forEach((position) => { position.active = false; position.updatedAt = createdAt; });
      this.audit(scope, snapshot, "rack-archived", rack.id, {}, actor, createdAt);
    });
  }

  archivePosition(scope: WineCellarScope, positionId: string, actor: WineCellarActor) {
    this.mutate(scope, (snapshot) => {
      const position = this.findPosition(snapshot, positionId);
      position.active = false;
      position.updatedAt = this.now();
      this.audit(scope, snapshot, "position-archived", position.id, {}, actor, position.updatedAt);
    });
  }

  private requireAssigned(snapshot: WineCellarSnapshot, positionId: string) {
    if (!snapshot.assignments.some((assignment) => assignment.positionId === positionId && assignment.active)) {
      throw new WineCellarValidationError("请先为酒位分配商品。");
    }
  }

  recordCount(scope: WineCellarScope, input: RecordCountInput, actor: WineCellarActor) {
    return this.mutate(scope, (snapshot) => {
      const position = this.findPosition(snapshot, input.positionId);
      this.requireAssigned(snapshot, position.id);
      const orderedSlots = getOrderedSlots(position.width, position.depth, position.fillDirection);
      const validIds = new Set(orderedSlots.map((slot) => slot.id));
      const emptySlotIds = Array.from(new Set(input.emptySlotIds));
      if (emptySlotIds.some((id) => !validIds.has(id))) throw new WineCellarValidationError("盘点包含无效酒位格。");
      const createdAt = this.now();
      const sessionId = this.createId();
      snapshot.countSessions.push({ id: sessionId, ...scope, status: "completed", notes: input.notes?.trim() || null, startedAt: createdAt, completedAt: createdAt, actorId: actor.id, actorName: actor.name });
      const entry: WineCellarCountEntry = {
        id: this.createId(), ...scope, sessionId, positionId: position.id, beforeQuantity: position.currentQuantity,
        afterQuantity: position.capacity - emptySlotIds.length, capacity: position.capacity, emptySlotIds,
        abnormalPattern: hasAbnormalEmptyPattern(orderedSlots, emptySlotIds), actorId: actor.id, actorName: actor.name, createdAt
      };
      position.currentQuantity = entry.afterQuantity;
      position.updatedAt = createdAt;
      snapshot.countEntries.push(entry);
      return entry;
    });
  }

  recordReceipt(scope: WineCellarScope, input: RecordReceiptInput, actor: WineCellarActor) {
    return this.mutate(scope, (snapshot) => {
      const position = this.findPosition(snapshot, input.positionId);
      this.requireAssigned(snapshot, position.id);
      requireInteger(input.quantity, "收货数量必须是正整数。");
      if (position.currentQuantity + input.quantity > position.capacity) throw new WineCellarValidationError(`收货超过容量，当前只剩 ${position.capacity - position.currentQuantity} 个空位。`);
      if (input.unitCost !== undefined && input.unitCost !== null && (!Number.isFinite(input.unitCost) || input.unitCost < 0)) throw new WineCellarValidationError("单位成本不能小于零。");
      const createdAt = this.now();
      const receipt: WineCellarReceipt = { id: this.createId(), ...scope, positionId: position.id, quantity: input.quantity, beforeQuantity: position.currentQuantity, afterQuantity: position.currentQuantity + input.quantity, invoiceReference: input.invoiceReference?.trim() || null, unitCost: input.unitCost ?? null, actorId: actor.id, actorName: actor.name, createdAt };
      position.currentQuantity = receipt.afterQuantity;
      position.updatedAt = createdAt;
      const assignment = snapshot.assignments.find((item) => item.positionId === position.id && item.active);
      if (assignment && input.unitCost !== undefined && input.unitCost !== null) assignment.unitCost = input.unitCost;
      if (assignment && input.invoiceReference?.trim()) assignment.invoiceReference = input.invoiceReference.trim();
      snapshot.receipts.push(receipt);
      return receipt;
    });
  }

  recordAdjustment(scope: WineCellarScope, input: RecordAdjustmentInput, actor: WineCellarActor) {
    return this.mutate(scope, (snapshot) => {
      const position = this.findPosition(snapshot, input.positionId);
      this.requireAssigned(snapshot, position.id);
      requireInteger(input.delta, "修正数量必须是非零整数。", true);
      const reason = requireText(input.reason, "请填写库存修正原因。");
      const afterQuantity = position.currentQuantity + input.delta;
      if (afterQuantity < 0 || afterQuantity > position.capacity) throw new WineCellarValidationError("修正后的库存必须在零与最大容量之间。");
      const createdAt = this.now();
      const adjustment: WineCellarStockAdjustment = { id: this.createId(), ...scope, positionId: position.id, delta: input.delta, reason, beforeQuantity: position.currentQuantity, afterQuantity, actorId: actor.id, actorName: actor.name, createdAt };
      position.currentQuantity = afterQuantity;
      position.updatedAt = createdAt;
      snapshot.adjustments.push(adjustment);
      return adjustment;
    });
  }
}
