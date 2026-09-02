export {
  getDrinkType,
  type DrinkType,
} from "../../supabase/functions/_shared/drinkType";

export function isAddedSugarIngredient(name: string): boolean {
  const normalized = name.toLowerCase().replace(/\s+/g, "");
  return [
    "sugar",
    "brownsugar",
    "blacksugar",
    "syrup",
    "糖",
    "白糖",
    "砂糖",
    "黑糖",
    "糖漿",
    "糖水",
  ].includes(normalized);
}
