import { SUPPLIER_CATALOGUE } from "./generated/supplierCatalogue";

export type SupplierProduct = {
  id: string;
  supplierCode: string;
  supplierName: string;
  supplierProductCode: string;
  productName: string;
  packSize: string;
  latestPrice: number;
  averagePrice: number;
  lowestPrice: number;
  highestPrice: number;
  latestPurchaseDate: string;
  purchaseCount: number;
  vatRate: number;
};

export function searchSupplierProducts(query: string, limit = 12): SupplierProduct[] {
  const terms = query
    .trim()
    .toLocaleLowerCase()
    .split(/\s+/)
    .filter(Boolean);

  if (terms.length === 0) {
    return [];
  }

  return SUPPLIER_CATALOGUE.map((product) => ({ product, score: scoreProduct(product, terms) }))
    .filter((result) => result.score > 0)
    .sort((a, b) => b.score - a.score || b.product.purchaseCount - a.product.purchaseCount)
    .slice(0, limit)
    .map((result) => result.product);
}

export function findSupplierProduct(supplierCode: string, supplierProductCode: string) {
  const normalizedSupplier = supplierCode.trim().toLocaleLowerCase();
  const normalizedCode = supplierProductCode.trim().toLocaleLowerCase();

  if (!normalizedSupplier || !normalizedCode) {
    return undefined;
  }

  return SUPPLIER_CATALOGUE.find(
    (product) =>
      product.supplierCode.toLocaleLowerCase() === normalizedSupplier &&
      product.supplierProductCode.toLocaleLowerCase() === normalizedCode
  );
}

export function getInvoiceMatchCandidates(input: {
  productName: string;
  suggestedSupplierCode?: string;
  suggestedSupplierProductCode?: string;
}) {
  const suggested = findSupplierProduct(input.suggestedSupplierCode || "", input.suggestedSupplierProductCode || "");
  const searched = searchInvoiceCandidateTerms(input.productName);
  const candidates = suggested ? [suggested, ...searched] : searched;
  const seen = new Set<string>();

  return candidates.filter((product) => {
    if (seen.has(product.id)) {
      return false;
    }
    seen.add(product.id);
    return true;
  });
}

function searchInvoiceCandidateTerms(productName: string) {
  const exactResults = searchSupplierProducts(productName, 12);
  if (exactResults.length > 0) {
    return exactResults;
  }

  const fallbackTerms = productName
    .split(/[^a-zA-Z0-9]+/)
    .map((term) => term.trim())
    .filter((term) => term.length >= 4);
  const seen = new Set<string>();
  const results = [];

  for (const term of fallbackTerms) {
    for (const product of searchSupplierProducts(term, 12)) {
      if (!seen.has(product.id)) {
        seen.add(product.id);
        results.push(product);
      }
      if (results.length >= 12) {
        return results;
      }
    }
  }

  return results;
}

function scoreProduct(product: SupplierProduct, terms: string[]) {
  const searchable = [
    product.supplierCode,
    product.supplierName,
    product.supplierProductCode,
    product.productName,
    product.packSize
  ]
    .join(" ")
    .toLocaleLowerCase();

  if (!terms.every((term) => searchable.includes(term))) {
    const normalizedProductCode = normalizeProductCode(product.supplierProductCode);
    if (!terms.every((term) => codeTermMatches(term, normalizedProductCode) || searchable.includes(term))) {
      return 0;
    }
  }

  let score = 10;
  for (const term of terms) {
    if (product.supplierProductCode.toLocaleLowerCase() === term) {
      score += 40;
    }
    if (product.productName.toLocaleLowerCase().startsWith(term)) {
      score += 20;
    }
  }
  return score;
}

function codeTermMatches(term: string, normalizedProductCode: string) {
  const normalizedTerm = normalizeProductCode(term);
  const withoutFrozenPrefix = normalizedTerm.startsWith("f") ? normalizedTerm.slice(1) : normalizedTerm;

  return Boolean(
    normalizedTerm &&
      normalizedProductCode &&
      (normalizedProductCode.includes(normalizedTerm) ||
        (withoutFrozenPrefix.length > 0 && normalizedProductCode.includes(withoutFrozenPrefix)))
  );
}

function normalizeProductCode(value: string) {
  return value.toLocaleLowerCase().replace(/[^a-z0-9]/g, "");
}
