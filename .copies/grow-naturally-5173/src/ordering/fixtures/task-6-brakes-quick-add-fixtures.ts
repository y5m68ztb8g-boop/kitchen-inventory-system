export type FakeBrakesOutcome = "confirmed" | "invalid" | "ambiguous";

export type FakeBrakesAdapter = {
  actions: string[];
  selectors: string[];
  openCart: () => Promise<void>;
  fillProductCode: (code: string) => Promise<void>;
  fillQuantity: (quantity: number) => Promise<void>;
  clickAdd: () => Promise<void>;
  readResult: (productCode: string) => Promise<FakeBrakesOutcome>;
};

export const task6BrakesQueue = [
  { itemId: "brakes-confirmed", productCode: "135177", quantity: 2 },
  { itemId: "brakes-invalid", productCode: "BAD-404", quantity: 3 },
  { itemId: "brakes-ambiguous", productCode: "WAIT-101", quantity: 1 }
];

export function createFakeBrakesAdapter(outcomes: Record<string, FakeBrakesOutcome>): FakeBrakesAdapter {
  const actions: string[] = [];
  const selectors: string[] = [];

  return {
    actions,
    selectors,
    async openCart() {
      actions.push("goto-cart");
    },
    async fillProductCode(code) {
      actions.push(`fill-code:${code}`);
    },
    async fillQuantity(quantity) {
      actions.push(`fill-quantity:${quantity}`);
    },
    async clickAdd() {
      actions.push("click-add");
    },
    async readResult(productCode) {
      actions.push(`read-result:${productCode}`);
      return outcomes[productCode] ?? "ambiguous";
    }
  };
}
