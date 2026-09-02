export interface FoodItem {
  name: string;
  confidence?: number;
  calories: number;
  macros: {
    protein: number;
    carbs: number;
    fat: number;
    sodium_mg?: number;
    sugar_g?: number;
    fiber_g?: number;
  };
}

export interface DetailedItem {
  name: string;
  grams_g: number | null;
  volume_ml: number | null;
  confidence: number;
  is_garnish: boolean;
  is_base: boolean;
}

export interface LabelNutrition {
  serving_size?: string;
  servings_per_container?: number | null;
  calories?: number;
  carbs_g?: number;
  protein_g?: number;
  fat_g?: number;
  sodium_mg?: number;
  sugar_g?: number | null;
  fiber_g?: number | null;
  saturated_fat_g?: number | null;
  trans_fat_g?: number | null;
}

export interface FoodAnalysis {
  // Breakdown-mode fields
  dish_name?: string;
  food_breakdown?: string;
  items?: string[];
  items_detailed?: DetailedItem[];
  needs_dish_name?: boolean;
  is_drink?: boolean | null;
  is_nutrition_label?: boolean;
  label_nutrition?: LabelNutrition | null;
  portion_confidence?: string;

  // Analysis-mode fields
  foodItems?: FoodItem[];
  calories?: number;
  carbs_g?: number;
  protein_g?: number;
  fat_g?: number;
  sodium_mg?: number;
  sugar_g?: number;
  fiber_g?: number;
  tip_or_fact?: string;
  suggestion?: string;
  title?: string | null;
  health_score?: number;
  health_recommendation?: string;
  health_tags?: string[];
  food_type?: "drink" | "dish" | "packaged";
  title_en?: string | null;
  title_zh?: string | null;
  breakdown_en?: string | null;
  breakdown_zh?: string | null;

  // Fallback raw response marker
  raw?: string;
}
