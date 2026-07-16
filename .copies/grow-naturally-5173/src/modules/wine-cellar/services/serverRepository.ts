import {
  LocalStorageWineCellarRepository,
  emptyWineCellarSnapshot
} from "./localStorageRepository";
import type { WineCellarRepository } from "./repository";
import type {
  CreatePositionInput,
  CreateRackInput,
  RecordAdjustmentInput,
  RecordCountInput,
  RecordReceiptInput,
  UpdatePositionInput,
  UpdateRackInput,
  WineCellarActor,
  WineCellarScope,
  WineCellarSnapshot
} from "../types";

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return Array.from(this.values.keys())[index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

function snapshotKey(scope: WineCellarScope) {
  return `grow-naturally:wine-cellar:v1:${encodeURIComponent(scope.hotelId)}:${encodeURIComponent(scope.areaId)}`;
}

type SnapshotResponse = { snapshot?: WineCellarSnapshot; error?: string };

export class ServerWineCellarRepository implements WineCellarRepository {
  private readonly storage = new MemoryStorage();
  private readonly repository = new LocalStorageWineCellarRepository({ storage: this.storage });
  private writeQueue = Promise.resolve();

  constructor(private readonly onPersistError: (message: string) => void) {}

  async load(scope: WineCellarScope) {
    const response = await fetch(`/api/wine-cellar/snapshot?hotelId=${encodeURIComponent(scope.hotelId)}&areaId=${encodeURIComponent(scope.areaId)}`);
    const payload = await response.json().catch(() => ({})) as SnapshotResponse;
    if (!response.ok || !payload.snapshot) throw new Error(payload.error || "酒水库读取失败。 ");
    this.setSnapshot(scope, payload.snapshot);
  }

  getSnapshot(scope: WineCellarScope) {
    try {
      return this.repository.getSnapshot(scope);
    } catch {
      return emptyWineCellarSnapshot();
    }
  }

  createRack(scope: WineCellarScope, input: CreateRackInput, actor: WineCellarActor) {
    return this.persist(scope, () => this.repository.createRack(scope, input, actor));
  }

  updateRack(scope: WineCellarScope, id: string, input: UpdateRackInput, actor: WineCellarActor) {
    return this.persist(scope, () => this.repository.updateRack(scope, id, input, actor));
  }

  reorderRacks(scope: WineCellarScope, ids: string[], actor: WineCellarActor) {
    return this.persist(scope, () => this.repository.reorderRacks(scope, ids, actor));
  }

  createPosition(scope: WineCellarScope, input: CreatePositionInput, actor: WineCellarActor) {
    return this.persist(scope, () => this.repository.createPosition(scope, input, actor));
  }

  updatePosition(scope: WineCellarScope, id: string, input: UpdatePositionInput, actor: WineCellarActor) {
    return this.persist(scope, () => this.repository.updatePosition(scope, id, input, actor));
  }

  archiveRack(scope: WineCellarScope, id: string, actor: WineCellarActor) {
    return this.persist(scope, () => this.repository.archiveRack(scope, id, actor));
  }

  archivePosition(scope: WineCellarScope, id: string, actor: WineCellarActor) {
    return this.persist(scope, () => this.repository.archivePosition(scope, id, actor));
  }

  recordCount(scope: WineCellarScope, input: RecordCountInput, actor: WineCellarActor) {
    return this.persist(scope, () => this.repository.recordCount(scope, input, actor));
  }

  recordReceipt(scope: WineCellarScope, input: RecordReceiptInput, actor: WineCellarActor) {
    return this.persist(scope, () => this.repository.recordReceipt(scope, input, actor));
  }

  recordAdjustment(scope: WineCellarScope, input: RecordAdjustmentInput, actor: WineCellarActor) {
    return this.persist(scope, () => this.repository.recordAdjustment(scope, input, actor));
  }

  private setSnapshot(scope: WineCellarScope, snapshot: WineCellarSnapshot) {
    this.storage.setItem(snapshotKey(scope), JSON.stringify({ version: 1, snapshot }));
  }

  private persist<T>(scope: WineCellarScope, operation: () => T): T {
    const result = operation();
    const snapshot = this.repository.getSnapshot(scope);
    this.writeQueue = this.writeQueue
      .catch(() => undefined)
      .then(async () => {
        const response = await fetch("/api/wine-cellar/snapshot", {
          body: JSON.stringify({ scope, snapshot }),
          headers: { "Content-Type": "application/json" },
          method: "PUT"
        });
        if (!response.ok) {
          const payload = await response.json().catch(() => ({})) as SnapshotResponse;
          throw new Error(payload.error || "酒水库保存失败。 ");
        }
      })
      .catch((error) => this.onPersistError(error instanceof Error ? error.message : "酒水库保存失败。 "));
    return result;
  }
}
