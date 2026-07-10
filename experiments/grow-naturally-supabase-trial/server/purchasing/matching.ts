import type { HistoricalRecommendationFields } from "./database";

export type HistoricalProductCandidate = {
  id: string;
  latestPrice: number;
  latestPurchaseDate: string;
  packSize: string;
  productName: string;
  purchaseCount: number;
  supplierCode: string;
  supplierName: string;
  supplierProductCode: string;
};

export type HistoricalInventoryEntry = {
  productName: string;
  quantity: number;
  supplierProduct?: {
    id: string;
  };
};

export type HistoricalProductRecommendation = HistoricalRecommendationFields;

export type HistoricalMatchInput = {
  candidates: HistoricalProductCandidate[];
  inventoryEntries: HistoricalInventoryEntry[];
  productName: string;
};

const tokenAliases = new Map([
  ["chip", "friedpotato"],
  ["fry", "friedpotato"],
  ["roll", "breadroll"],
  ["bun", "breadroll"],
  ["potato", "potato"],
  ["spud", "potato"],
  ["soda", "softdrink"]
]);

export function normaliseProductName(value: string) {
  const plain = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("en-GB")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\bwashing up liquid\b/g, "dishsoap")
    .replace(/\bdish soap\b/g, "dishsoap")
    .replace(/\bsoft drinks?\b/g, "softdrink");

  return plain
    .split(" ")
    .filter(Boolean)
    .map(singulariseToken)
    .map((token) => tokenAliases.get(token) ?? token)
    .join(" ");
}

export function recommendHistoricalProduct(input: HistoricalMatchInput): HistoricalProductRecommendation | null {
  const requestedName = normaliseProductName(input.productName);
  if (!requestedName) {
    return null;
  }

  const semanticCandidates = input.candidates
    .map((candidate) => ({
      candidate,
      semanticScore: scoreSemanticName(requestedName, normaliseProductName(candidate.productName))
    }))
    .filter((entry) => entry.semanticScore >= 35);

  if (semanticCandidates.length === 0) {
    return null;
  }

  const newestPurchaseTime = Math.max(
    ...semanticCandidates.map(({ candidate }) => parseDate(candidate.latestPurchaseDate))
  );
  const ranked = semanticCandidates
    .map(({ candidate, semanticScore }) => ({
      candidate,
      score:
        semanticScore +
        frequencyBonus(candidate.purchaseCount) +
        recencyBonus(candidate.latestPurchaseDate, newestPurchaseTime),
      semanticScore
    }))
    .sort(
      (left, right) =>
        right.score - left.score ||
        right.semanticScore - left.semanticScore ||
        right.candidate.purchaseCount - left.candidate.purchaseCount ||
        parseDate(right.candidate.latestPurchaseDate) - parseDate(left.candidate.latestPurchaseDate) ||
        left.candidate.id.localeCompare(right.candidate.id)
    );

  const candidate = ranked[0].candidate;
  return {
    currentInventoryQuantity: currentInventoryQuantity(candidate, input.inventoryEntries),
    recommendedLastPrice: candidate.latestPrice,
    recommendedLastPurchaseDate: candidate.latestPurchaseDate,
    recommendedPackSize: candidate.packSize,
    recommendedProductCode: candidate.supplierProductCode,
    recommendedProductName: candidate.productName,
    recommendedPurchaseCount: candidate.purchaseCount,
    recommendedSupplierCode: candidate.supplierCode,
    recommendedSupplierName: candidate.supplierName,
    recommendedSupplierProductId: candidate.id
  };
}

function singulariseToken(token: string) {
  if (token.length > 4 && token.endsWith("ies")) {
    return `${token.slice(0, -3)}y`;
  }
  if (token.length > 4 && /(ches|shes|xes|zes|ses|oes)$/.test(token)) {
    return token.slice(0, -2);
  }
  if (token.length > 3 && token.endsWith("s") && !/(ss|us|is)$/.test(token)) {
    return token.slice(0, -1);
  }
  return token;
}

function scoreSemanticName(requestedName: string, candidateName: string) {
  if (!candidateName) {
    return 0;
  }
  if (requestedName === candidateName) {
    return 100;
  }

  const requestedTokens = requestedName.split(" ");
  const candidateTokens = candidateName.split(" ");
  const overlap = tokenOverlap(requestedTokens, candidateTokens);
  const containsPhrase =
    ` ${requestedName} `.includes(` ${candidateName} `) ||
    ` ${candidateName} `.includes(` ${requestedName} `);

  if (containsPhrase) {
    return 70 + overlap * 20;
  }

  return overlap >= 0.5 ? overlap * 60 : 0;
}

function tokenOverlap(left: string[], right: string[]) {
  const leftTokens = new Set(left);
  const rightTokens = new Set(right);
  let matchingTokens = 0;

  leftTokens.forEach((token) => {
    if (rightTokens.has(token)) {
      matchingTokens += 1;
    }
  });

  return matchingTokens / Math.max(leftTokens.size, rightTokens.size);
}

function frequencyBonus(purchaseCount: number) {
  return Math.min(6, Math.log1p(Math.max(0, Number.isFinite(purchaseCount) ? purchaseCount : 0)));
}

function recencyBonus(latestPurchaseDate: string, newestPurchaseTime: number) {
  const purchaseTime = parseDate(latestPurchaseDate);
  if (purchaseTime === 0 || newestPurchaseTime === 0) {
    return 0;
  }

  const ageInDays = Math.max(0, newestPurchaseTime - purchaseTime) / (24 * 60 * 60 * 1000);
  return 4 / (1 + ageInDays / 365);
}

function parseDate(value: string) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function currentInventoryQuantity(candidate: HistoricalProductCandidate, inventoryEntries: HistoricalInventoryEntry[]) {
  const candidateName = normaliseProductName(candidate.productName);
  const idMatches = inventoryEntries.filter((entry) => entry.supplierProduct?.id === candidate.id);
  if (idMatches.length > 0) {
    const nameOnlyMatches = inventoryEntries.filter(
      (entry) => !entry.supplierProduct?.id && normaliseProductName(entry.productName) === candidateName
    );
    return sumInventoryQuantity([...idMatches, ...nameOnlyMatches]);
  }

  return sumInventoryQuantity(
    inventoryEntries.filter((entry) => normaliseProductName(entry.productName) === candidateName)
  );
}

function sumInventoryQuantity(entries: HistoricalInventoryEntry[]) {
  return entries.reduce(
    (total, entry) => total + (Number.isFinite(entry.quantity) ? entry.quantity : 0),
    0
  );
}
