import type {
  WineCellarInventorySummary,
  WineCellarPosition,
  WineCellarProductAssignment,
  WineCellarSnapshot
} from "../types";
import { WineCellarValidationError } from "../types/errors";

export function calculateCapacity(width: number, depth: number) {
  if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(depth) || depth <= 0) {
    throw new WineCellarValidationError("每排数量和纵深排数必须是正整数。");
  }
  return width * depth;
}

export function calculateInventoryPercentage(currentQuantity: number, capacity: number) {
  if (capacity <= 0) return 0;
  return Math.min(100, Math.max(0, (currentQuantity / capacity) * 100));
}

export function isLowStock(position: Pick<WineCellarPosition, "capacity" | "currentQuantity" | "lowStockMode" | "lowStockThreshold">) {
  if (position.capacity <= 0) return false;
  return position.lowStockMode === "absolute"
    ? position.currentQuantity <= position.lowStockThreshold
    : calculateInventoryPercentage(position.currentQuantity, position.capacity) <= position.lowStockThreshold;
}

export function calculatePositionValue(
  position: Pick<WineCellarPosition, "currentQuantity">,
  assignment?: Pick<WineCellarProductAssignment, "active" | "matchStatus" | "unitCost" | "currency"> | null
) {
  if (!assignment?.active || assignment.matchStatus !== "matched" || assignment.unitCost === null || assignment.unitCost < 0 ||
    (assignment.currency !== undefined && assignment.currency !== "GBP")) {
    return 0;
  }
  return position.currentQuantity * assignment.unitCost;
}

export function calculateInventorySummary(snapshot: WineCellarSnapshot): WineCellarInventorySummary {
  const positions = snapshot.positions.filter((position) => position.active);
  const activeAssignments = new Map(
    snapshot.assignments.filter((assignment) => assignment.active).map((assignment) => [assignment.positionId, assignment])
  );
  const totalQuantity = positions.reduce((sum, position) => sum + position.currentQuantity, 0);
  const totalCapacity = positions.reduce((sum, position) => sum + position.capacity, 0);

  return {
    totalQuantity,
    totalCapacity,
    inventoryPercentage: calculateInventoryPercentage(totalQuantity, totalCapacity),
    lowStockPositionCount: positions.filter(isLowStock).length,
    unmatchedProductCount: positions.filter((position) => {
      const assignment = activeAssignments.get(position.id);
      return assignment?.matchStatus === "unmatched";
    }).length,
    totalValue: positions.reduce(
      (sum, position) => sum + calculatePositionValue(position, activeAssignments.get(position.id)),
      0
    )
  };
}
