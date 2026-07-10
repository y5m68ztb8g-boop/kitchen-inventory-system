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

export type HistoricalMatchFeedback = {
  confirmationCount: number;
  lastConfirmedAt: string;
  supplierProductId: string;
};

export type RankedHistoricalProduct = HistoricalProductCandidate &
  HistoricalRecommendationFields & {
    isRecommended: boolean;
    score: number;
  };

export type HistoricalMatchInput = {
  candidates: HistoricalProductCandidate[];
  feedback?: HistoricalMatchFeedback[];
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

const MARK_MURPHY = "Mark Murphy (Dole Ltd)";
const CAMPBELLS = "Campbells Prime Meat Ltd";
const BRAKES = "Brakes / Sysco GB Ltd";

const dairyTerms = new Set([
  "egg",
  "milk",
  "cream",
  "butter",
  "cheese",
  "yogurt",
  "yoghurt",
  "dairy",
  "buttermilk",
  "cheddar",
  "mozzarella",
  "parmesan",
  "mascarpone",
  "brie",
  "feta",
  "halloumi"
]);

const seafoodTerms = new Set([
  "seafood",
  "fish",
  "haddock",
  "cod",
  "salmon",
  "seabass",
  "pollock",
  "plaice",
  "halibut",
  "tuna",
  "mackerel",
  "trout",
  "sole",
  "prawn",
  "shrimp",
  "scampi",
  "crab",
  "lobster",
  "mussel",
  "clam",
  "scallop",
  "squid",
  "calamari",
  "octopus"
]);

type SemanticMatch = {
  score: number;
  tier: number;
};

export function preferredSupplierForProduct(productName: string) {
  const tokens = new Set(normaliseProductName(productName).split(" ").filter(Boolean));
  if (Array.from(tokens).some((token) => dairyTerms.has(token))) return MARK_MURPHY;
  if (Array.from(tokens).some((token) => seafoodTerms.has(token))) return CAMPBELLS;
  return BRAKES;
}

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
    .replace(/\bsea bass\b/g, "seabass")
    .replace(/\bsoft drinks?\b/g, "softdrink");

  return plain
    .split(" ")
    .filter(Boolean)
    .map(singulariseToken)
    .map((token) => tokenAliases.get(token) ?? token)
    .join(" ");
}

export function rankHistoricalProducts(input: HistoricalMatchInput): RankedHistoricalProduct[] {
  const requestedName = normaliseProductName(input.productName);
  if (!requestedName) {
    return [];
  }

  const semanticCandidates = input.candidates
    .map((candidate) => ({
      candidate,
      semantic: scoreSemanticName(requestedName, normaliseProductName(candidate.productName))
    }))
    .filter((entry) => entry.semantic.score >= 35);

  if (semanticCandidates.length === 0) {
    return [];
  }

  const newestPurchaseTime = Math.max(
    ...semanticCandidates.map(({ candidate }) => parseDate(candidate.latestPurchaseDate))
  );
  const preferredSupplier = preferredSupplierForProduct(input.productName);
  const hasPreferredSupplier = semanticCandidates.some(
    ({ candidate }) => candidate.supplierName === preferredSupplier
  );
  const feedbackBySupplierProductId = new Map(
    input.feedback?.map((feedback) => [feedback.supplierProductId, feedback])
  );
  const ranked = semanticCandidates
    .map(({ candidate, semantic }) => ({
      feedback: feedbackBySupplierProductId.get(candidate.id),
      ...candidate,
      currentInventoryQuantity: currentInventoryQuantity(
        candidate,
        input.inventoryEntries,
        semanticCandidates.map(({ candidate: semanticCandidate }) => semanticCandidate.id)
      ),
      recommendedLastPrice: candidate.latestPrice,
      recommendedLastPurchaseDate: candidate.latestPurchaseDate,
      recommendedPackSize: candidate.packSize,
      recommendedProductCode: candidate.supplierProductCode,
      recommendedProductName: candidate.productName,
      recommendedPurchaseCount: candidate.purchaseCount,
      recommendedSupplierCode: candidate.supplierCode,
      recommendedSupplierName: candidate.supplierName,
      recommendedSupplierProductId: candidate.id,
      score:
        semantic.score +
        frequencyBonus(candidate.purchaseCount) +
        recencyBonus(candidate.latestPurchaseDate, newestPurchaseTime),
      semanticScore: semantic.score,
      matchTier: semantic.tier,
      preferredSupplier: hasPreferredSupplier && candidate.supplierName === preferredSupplier
    }))
    .sort(
      (left, right) =>
        right.matchTier - left.matchTier ||
        Number(right.preferredSupplier) - Number(left.preferredSupplier) ||
        (right.feedback?.confirmationCount ?? 0) - (left.feedback?.confirmationCount ?? 0) ||
        parseDate(right.feedback?.lastConfirmedAt ?? "") - parseDate(left.feedback?.lastConfirmedAt ?? "") ||
        Number(right.currentInventoryQuantity > 0) - Number(left.currentInventoryQuantity > 0) ||
        right.purchaseCount - left.purchaseCount ||
        parseDate(right.latestPurchaseDate) - parseDate(left.latestPurchaseDate) ||
        right.semanticScore - left.semanticScore ||
        left.id.localeCompare(right.id)
    );

  return ranked.map(({ feedback, matchTier, preferredSupplier, semanticScore, ...candidate }, index) => ({
    ...candidate,
    isRecommended: index === 0
  }));
}

export function recommendHistoricalProduct(input: HistoricalMatchInput): HistoricalProductRecommendation | null {
  const [candidate] = rankHistoricalProducts(input);
  return candidate ? recommendationFromRankedCandidate(candidate) : null;
}

function recommendationFromRankedCandidate(candidate: RankedHistoricalProduct): HistoricalProductRecommendation {
  return {
    currentInventoryQuantity: candidate.currentInventoryQuantity,
    recommendedLastPrice: candidate.recommendedLastPrice,
    recommendedLastPurchaseDate: candidate.recommendedLastPurchaseDate,
    recommendedPackSize: candidate.recommendedPackSize,
    recommendedProductCode: candidate.recommendedProductCode,
    recommendedProductName: candidate.recommendedProductName,
    recommendedPurchaseCount: candidate.recommendedPurchaseCount,
    recommendedSupplierCode: candidate.recommendedSupplierCode,
    recommendedSupplierName: candidate.recommendedSupplierName,
    recommendedSupplierProductId: candidate.recommendedSupplierProductId
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

function scoreSemanticName(requestedName: string, candidateName: string): SemanticMatch {
  if (!candidateName) {
    return { score: 0, tier: 0 };
  }
  if (requestedName === candidateName) {
    return { score: 100, tier: 3 };
  }

  const requestedTokens = requestedName.split(" ");
  const candidateTokens = candidateName.split(" ");
  const overlap = tokenOverlap(requestedTokens, candidateTokens);
  const containsPhrase =
    ` ${requestedName} `.includes(` ${candidateName} `) ||
    ` ${candidateName} `.includes(` ${requestedName} `);

  if (containsPhrase) {
    return { score: 70 + overlap * 20, tier: 2 };
  }

  if (overlap >= 0.5) {
    return { score: Math.max(35, overlap * 60), tier: 1 };
  }

  return { score: 0, tier: 0 };
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

function currentInventoryQuantity(
  candidate: HistoricalProductCandidate,
  inventoryEntries: HistoricalInventoryEntry[],
  candidateIds: string[]
) {
  const candidateName = normaliseProductName(candidate.productName);
  const idMatches = inventoryEntries.filter((entry) => entry.supplierProduct?.id === candidate.id);
  if (idMatches.length > 0) {
    const nameOnlyMatches = inventoryEntries.filter(
      (entry) => !entry.supplierProduct?.id && normaliseProductName(entry.productName) === candidateName
    );
    return sumInventoryQuantity([...idMatches, ...nameOnlyMatches]);
  }

  const hasKnownCandidateIdMatch = inventoryEntries.some(
    (entry) => entry.supplierProduct?.id && candidateIds.includes(entry.supplierProduct.id)
  );
  if (hasKnownCandidateIdMatch) {
    return sumInventoryQuantity(
      inventoryEntries.filter((entry) => !entry.supplierProduct?.id && normaliseProductName(entry.productName) === candidateName)
    );
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
