import type { FillDirection } from "../types";
import { WineCellarValidationError } from "../types/errors";

export type WineCellarSlot = { id: string; row: number; column: number };

export function getOrderedSlots(width: number, depth: number, direction: FillDirection): WineCellarSlot[] {
  if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(depth) || depth <= 0) {
    throw new WineCellarValidationError("每排数量和纵深排数必须是正整数。");
  }

  const rows = Array.from({ length: depth }, (_, index) => index);
  const columns = Array.from({ length: width }, (_, index) => index);
  const slots: WineCellarSlot[] = [];

  if (direction === "front-to-back" || direction === "back-to-front") {
    const orderedRows = direction === "back-to-front" ? [...rows].reverse() : rows;
    orderedRows.forEach((row) => columns.forEach((column) => slots.push({ id: `${row}:${column}`, row, column })));
  } else {
    const orderedColumns = direction === "right-to-left" ? [...columns].reverse() : columns;
    orderedColumns.forEach((column) => rows.forEach((row) => slots.push({ id: `${row}:${column}`, row, column })));
  }

  return slots;
}

export function hasAbnormalEmptyPattern(orderedSlots: WineCellarSlot[], emptySlotIds: string[]) {
  const empty = new Set(emptySlotIds);
  return orderedSlots.slice(0, empty.size).some((slot) => !empty.has(slot.id));
}
