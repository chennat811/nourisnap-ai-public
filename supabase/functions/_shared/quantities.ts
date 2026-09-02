export type QuantityOverride = {
  name: string;
  quantity: number | null;
  unit: string | null;
};

function normNumToken(token: string): number | null {
  const frac = token.match(/^(\d+)\/(\d+)$/);
  if (frac) {
    const n = Number(frac[1]);
    const d = Number(frac[2]);
    return d ? n / d : null;
  }
  if (/^half$/i.test(token) || token === "半") return 0.5;
  if (token === "½" || token === "１／２" || token === "1⁄2") return 0.5;
  if (token === "¼" || token === "１／４" || token === "1⁄4") return 0.25;
  if (token === "¾" || token === "３／４" || token === "3⁄4") return 0.75;
  if (token === "１／３" || token === "1⁄3") return 1 / 3;
  const range = token.match(/^(\d+(?:\.\d+)?)\s*[\-–~〜]\s*(\d+(?:\.\d+)?)$/);
  if (range) return (Number(range[1]) + Number(range[2])) / 2;
  const n = Number(token.replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : null;
}

// Token-based unit matching to avoid false positives (e.g., 'l' inside 'lemon').
const UNIT_ALIASES = new Map<string, string>([
  ["g", "g"],
  ["gram", "g"],
  ["grams", "g"],
  ["公克", "g"],
  ["kg", "kg"],
  ["kilogram", "kg"],
  ["千克", "kg"],
  ["公斤", "kg"],
  ["mg", "mg"],
  ["ml", "ml"],
  ["毫升", "ml"],
  ["cc", "ml"],
  ["CC", "ml"],
  ["l", "l"],
  ["liter", "l"],
  ["升", "l"],
  ["公升", "l"],
  ["cup", "cup"],
  ["cups", "cup"],
  ["杯", "cup"],
  ["tbsp", "tbsp"],
  ["tablespoon", "tbsp"],
  ["tablespoons", "tbsp"],
  ["湯匙", "tbsp"],
  ["大匙", "tbsp"],
  ["tsp", "tsp"],
  ["teaspoon", "tsp"],
  ["teaspoons", "tsp"],
  ["茶匙", "tsp"],
  ["小匙", "tsp"],
  ["piece", "piece"],
  ["pieces", "piece"],
  ["個", "piece"],
  ["顆", "piece"],
  ["根", "piece"],
  ["支", "piece"],
  ["塊", "piece"],
  ["朵", "piece"],
  ["串", "skewer"],
  ["skewer", "skewer"],
  ["clove", "clove"],
  ["cloves", "clove"],
  ["瓣", "clove"],
  ["sprig", "sprig"],
  ["sprigs", "sprig"],
  ["twig", "sprig"],
  ["twigs", "sprig"],
  ["枝", "sprig"],
  ["束", "bunch"],
  ["把", "handful"],
  ["leaf", "leaf"],
  ["leaves", "leaf"],
  ["葉", "leaf"],
  ["片", "slice"],
  ["slice", "slice"],
  ["slices", "slice"],
  ["片數", "slice"],
  ["wedge", "wedge"],
  ["wedges", "wedge"],
  ["角", "wedge"],
  ["handful", "handful"],
  ["handfuls", "handful"],
  ["pinch", "pinch"],
  ["撮", "pinch"],
  ["小撮", "pinch"],
  ["bowl", "bowl"],
  ["碗", "bowl"],
  ["盤", "plate"],
  ["plate", "plate"],
  ["oz", "oz"],
  ["ounce", "oz"],
  ["ounces", "oz"],
  ["盎司", "oz"],
  ["floz", "floz"],
  ["fl-oz", "floz"],
  ["fl", "floz"],
  ["fl oz", "floz"],
  ["液量盎司", "floz"],
  ["lb", "lb"],
  ["lbs", "lb"],
  ["pound", "lb"],
  ["pounds", "lb"],
  ["斤", "jin_tw"],
  ["台斤", "jin_tw"],
  ["兩", "tael_tw"],
  ["台兩", "tael_tw"],
  ["公兩", "tael_metric"],
  ["錢", "mace_tw"],
]);

const STOPWORDS = new Set([
  "of",
  "the",
  "a",
  "an",
  "and",
  "in",
  "with",
  "to",
  "for",
  "over",
  "night",
  "overnight",
  "brined",
  "brine",
  "的",
  "和",
  "及",
  "於",
  "用",
  "在",
  "以",
  "與",
]);

function normalizeUnitToken(token: string): string | null {
  const t = token.trim();
  if (!t) return null;
  // Exact match only to avoid partial hits
  return UNIT_ALIASES.get(t) ?? UNIT_ALIASES.get(t.toLowerCase()) ?? null;
}

function splitWords(p: string): string[] {
  // Basic word split; keeps Chinese as-is, splits Latin on whitespace and punctuation
  return p
    .replace(/[，,。;；]/g, " ")
    .split(/\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function cleanNameTokens(tokens: string[]): string {
  const filtered = tokens.filter((t) => !STOPWORDS.has(t.toLowerCase()));
  const joined = filtered.join(" ");
  // Remove trailing sentence fragments like 'over night.'
  return joined.replace(/[.,;。；]+$/g, "").trim();
}

function parseQuantityFromPhrase(phrase: string): QuantityOverride | null {
  const raw = phrase.trim();
  if (!raw) return null;
  const tokensAll = splitWords(raw);
  if (tokensAll.length === 0) return null;

  // Find first token that looks numeric (start of the quantity expression)
  const numIdx = tokensAll.findIndex((tok) => !!normNumToken(tok));
  if (numIdx === -1) return null;

  const tokens = tokensAll.slice(numIdx); // drop dish-name prefixes like '烤全雞'
  // Quantity
  const qty = normNumToken(tokens[0]) ?? null;

  // Unit: prefer the next token if it is a recognized unit
  let unit: string | null = null;
  let unitIdx = -1;
  if (tokens.length > 1) {
    const cand = normalizeUnitToken(tokens[1]);
    if (cand) {
      unit = cand;
      unitIdx = 1;
    }
  }

  // Handle multi-word units like 'fl oz'
  if (!unit && tokens.length > 2) {
    const two = normalizeUnitToken(tokens.slice(1, 3).join(" "));
    if (two) {
      unit = two;
      unitIdx = 2;
    }
  }

  // Ingredient name: if there is an 'of', take everything after the last 'of'
  const ofIdx = tokens.findIndex((t) => t.toLowerCase() === "of");
  let nameTokens: string[];
  if (ofIdx !== -1) {
    nameTokens = tokens.slice(ofIdx + 1);
  } else if (unitIdx !== -1) {
    nameTokens = tokens.slice(unitIdx + 1);
  } else {
    nameTokens = tokens.slice(1);
  }

  // Remove count nouns already captured as units
  nameTokens = nameTokens.filter((t) => normalizeUnitToken(t) == null);

  const name = cleanNameTokens(nameTokens);
  if (!name) return null;
  return { name, quantity: qty, unit };
}

export function extractQuantityOverrides(input?: string): QuantityOverride[] {
  if (!input || typeof input !== "string") return [];
  const parts = input
    .split(/[,，。;；\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
  const res: QuantityOverride[] = [];
  for (const part of parts) {
    const o = parseQuantityFromPhrase(part);
    if (o) res.push(o);
  }
  const dedup = new Map<string, QuantityOverride>();
  for (const o of res) {
    const key = o.name;
    if (!dedup.has(key)) dedup.set(key, o);
  }
  return Array.from(dedup.values());
}

export function convertToGrams(
  quantity: number | null,
  unit: string | null,
): number | null {
  if (quantity == null || !unit) return null;
  switch (unit) {
    case "g":
      return quantity;
    case "kg":
      return quantity * 1000;
    case "mg":
      return quantity / 1000;
    case "oz":
      return quantity * 28.3495;
    case "lb":
      return quantity * 453.592;
    case "jin_tw":
      return quantity * 600;
    case "tael_tw":
      return quantity * 37.5;
    case "tael_metric":
      return quantity * 50;
    case "mace_tw":
      return quantity * 3.75;
    default:
      return null;
  }
}
