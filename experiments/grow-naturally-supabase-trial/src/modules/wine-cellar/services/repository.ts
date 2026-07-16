import type {
  CreatePositionInput,
  CreateRackInput,
  RecordAdjustmentInput,
  RecordCountInput,
  RecordReceiptInput,
  UpdatePositionInput,
  UpdateRackInput,
  WineCellarActor,
  WineCellarCountEntry,
  WineCellarPosition,
  WineCellarRack,
  WineCellarReceipt,
  WineCellarScope,
  WineCellarSnapshot,
  WineCellarStockAdjustment
} from "../types";

export interface WineCellarRepository {
  getSnapshot(scope: WineCellarScope): WineCellarSnapshot;
  createRack(scope: WineCellarScope, input: CreateRackInput, actor: WineCellarActor): WineCellarRack;
  updateRack(scope: WineCellarScope, rackId: string, input: UpdateRackInput, actor: WineCellarActor): WineCellarRack;
  reorderRacks(scope: WineCellarScope, orderedRackIds: string[], actor: WineCellarActor): WineCellarRack[];
  createPosition(scope: WineCellarScope, input: CreatePositionInput, actor: WineCellarActor): WineCellarPosition;
  updatePosition(scope: WineCellarScope, positionId: string, input: UpdatePositionInput, actor: WineCellarActor): WineCellarPosition;
  archiveRack(scope: WineCellarScope, rackId: string, actor: WineCellarActor): void;
  archivePosition(scope: WineCellarScope, positionId: string, actor: WineCellarActor): void;
  recordCount(scope: WineCellarScope, input: RecordCountInput, actor: WineCellarActor): WineCellarCountEntry;
  recordReceipt(scope: WineCellarScope, input: RecordReceiptInput, actor: WineCellarActor): WineCellarReceipt;
  recordAdjustment(scope: WineCellarScope, input: RecordAdjustmentInput, actor: WineCellarActor): WineCellarStockAdjustment;
}

export { WineCellarPersistenceError, WineCellarValidationError } from "../types/errors";
