import type { OrderingProfile, PurchaseBatchItem } from "./types";

export type SupplierEmailDraft = {
  supplierCode: "CMP" | "MM";
  to: string;
  subject: string;
  body: string;
};

type DraftItem = Pick<
  PurchaseBatchItem,
  "productName" | "supplierProductCode" | "packSize" | "orderQuantity"
>;

export function buildSupplierEmailDraft(input: {
  supplierCode: "CMP" | "MM";
  poNumber: string;
  profile: OrderingProfile;
  items: DraftItem[];
}): SupplierEmailDraft {
  if (input.supplierCode !== "CMP" && input.supplierCode !== "MM") {
    throw new Error("Unsupported email supplier");
  }

  const poNumber = input.poNumber.trim();
  const purchaserName = input.profile.purchaserName.trim();
  const hotelName = input.profile.hotelName.trim();
  const to = (input.supplierCode === "CMP"
    ? input.profile.campbellsEmail
    : input.profile.markMurphyEmail
  ).trim();
  if (!poNumber || !purchaserName || !hotelName || !to || input.items.length === 0) {
    throw new Error("Incomplete supplier email details");
  }

  const lines = input.items.map((item) => {
    const name = item.productName.trim();
    if (!name || item.orderQuantity === null || !Number.isFinite(item.orderQuantity) || item.orderQuantity <= 0) {
      throw new Error("Invalid supplier email item");
    }
    const pack = item.packSize?.trim() || "unit";
    const code = item.supplierProductCode?.trim();
    return `${code ? `${code} - ` : ""}${item.orderQuantity} x ${pack} ${name}`;
  });

  return {
    supplierCode: input.supplierCode,
    to,
    subject: `Order - ${hotelName} - PO ${poNumber}`,
    body: [
      "Hello,",
      "",
      "Please place the following order:",
      "",
      ...lines,
      "",
      `PO: ${poNumber}`,
      "",
      "Kind regards,",
      purchaserName,
      hotelName
    ].join("\n")
  };
}
