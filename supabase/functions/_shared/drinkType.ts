export type DrinkType = "creamer" | "fresh_milk" | "pure_tea" | "fruit";

export function getDrinkType(haystack: string): DrinkType {
  const h = haystack.toLowerCase();

  if (
    h.includes("鮮奶") ||
    h.includes("鮮奶茶") ||
    h.includes("拿鐵") ||
    h.includes("latte")
  ) {
    return "fresh_milk";
  }
  if (h.includes("奶茶") || h.includes("奶蓋")) return "creamer";
  if (h.includes("果汁") || h.includes("水果茶")) return "fruit";

  return "pure_tea";
}
