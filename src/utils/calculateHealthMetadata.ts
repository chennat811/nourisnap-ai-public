/**
 * Health Metadata Calculation Utility
 * Generates health score labels and tags based on NouriQuest branding
 * and Taiwan HPA/USDA nutrition guidelines
 */

export interface HealthTag {
  label: string;
  type: 'good' | 'info' | 'warn';
  translationKey: string;
}

export interface HealthScoreMetadata {
  stage: 'highly_nutritious' | 'balanced' | 'moderate' | 'could_improve' | 'needs_improvement';
  color: string;
  translationKey: string;
}

export interface NutritionData {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  sodium: number;
}

type AiHealthTag =
  | "whole_food"
  | "lean_protein"
  | "high_fiber"
  | "healthy_fat"
  | "whole_grain"
  | "deep_fried"
  | "high_sugar"
  | "high_sodium"
  | "refined_carbs"
  | "processed"
  | "fermented"
  | "grilled"
  | "steamed"
  | "raw";

const AI_TAG_MAP: Record<AiHealthTag, Omit<HealthTag, "label"> & { label: string }> = {
  whole_food: { label: "Whole Food", type: "good", translationKey: "results.tagWholeFood" },
  lean_protein: { label: "Lean Protein", type: "good", translationKey: "results.tagLeanProtein" },
  high_fiber: { label: "High Fiber", type: "good", translationKey: "results.tagHighFiber" },
  healthy_fat: { label: "Healthy Fat", type: "good", translationKey: "results.tagHealthyFat" },
  whole_grain: { label: "Whole Grain", type: "good", translationKey: "results.tagWholeGrain" },
  deep_fried: { label: "Deep Fried", type: "warn", translationKey: "results.tagDeepFried" },
  high_sugar: { label: "High Sugar", type: "warn", translationKey: "results.tagHighSugar" },
  high_sodium: { label: "High Sodium", type: "warn", translationKey: "results.tagHighSodium" },
  refined_carbs: { label: "Refined Carbs", type: "warn", translationKey: "results.tagRefinedCarbs" },
  processed: { label: "Processed", type: "warn", translationKey: "results.tagProcessed" },
  fermented: { label: "Fermented", type: "good", translationKey: "results.tagFermented" },
  grilled: { label: "Grilled", type: "info", translationKey: "results.tagGrilled" },
  steamed: { label: "Steamed", type: "good", translationKey: "results.tagSteamed" },
  raw: { label: "Raw", type: "info", translationKey: "results.tagRaw" },
};

function generateAiHealthTags(aiHealthTags?: string[]): HealthTag[] {
  if (!aiHealthTags || aiHealthTags.length === 0) return [];
  return aiHealthTags
    .filter((t): t is AiHealthTag => t in AI_TAG_MAP)
    .map((t) => AI_TAG_MAP[t]);
}

/**
 * Maps health score (0-10) to 5 descriptive stages
 * @param score - Health score from backend (0-10)
 * @param colors - Theme colors object
 * @returns Metadata object with stage, color, and translation key
 */
export function getHealthScoreMetadata(
  score: number,
  colors: { green: string; lime: string; coral: string }
): HealthScoreMetadata {
  if (score >= 8.0) {
    return {
      stage: 'highly_nutritious',
      color: colors.green,
      translationKey: 'results.scoreHighlyNutritious',
    };
  }
  if (score >= 6.0) {
    return {
      stage: 'balanced',
      color: colors.lime,
      translationKey: 'results.scoreBalanced',
    };
  }
  if (score >= 4.0) {
    return {
      stage: 'moderate',
      color: '#F4A347',
      translationKey: 'results.scoreModerate',
    };
  }
  if (score >= 2.0) {
    return {
      stage: 'could_improve',
      color: '#F4A347',
      translationKey: 'results.scoreCouldImprove',
    };
  }
  return {
    stage: 'needs_improvement',
    color: colors.coral,
    translationKey: 'results.scorePoor',
  };
}

/**
 * Generates health tags based on advanced nutrition logic
 * Follows Taiwan HPA/USDA guidelines
 * @param nutrition - Nutrition data object
 * @returns Array of health tags, sorted with good/info tags first
 */
export function generateHealthTags(nutrition: NutritionData): HealthTag[] {
  const goodTags: HealthTag[] = [];
  const infoTags: HealthTag[] = [];
  const warnTags: HealthTag[] = [];

  const { calories, protein, carbs, fat, fiber, sodium } = nutrition;

  // Positive/Info Tags
  
  // High Protein: protein > 20g
  if (protein > 20) {
    goodTags.push({
      label: 'High Protein',
      type: 'good',
      translationKey: 'results.tagHighProtein',
    });
  }

  // High Fiber: fiber > 5g
  if (fiber > 5) {
    goodTags.push({
      label: 'High Fiber',
      type: 'good',
      translationKey: 'results.tagHighFiber',
    });
  }

  // Fiber Source: fiber between 3g and 5g
  if (fiber >= 3 && fiber <= 5) {
    infoTags.push({
      label: 'Fiber Source',
      type: 'info',
      translationKey: 'results.tagFiberSource',
    });
  }

  // Low Glycemic Potential: fiber > 3g AND carbs < 40g
  if (fiber > 3 && carbs < 40) {
    goodTags.push({
      label: 'Low Glycemic Potential',
      type: 'good',
      translationKey: 'results.tagLowGlycemic',
    });
  }

  // Warning Tags

  // High Sodium: sodium > 800mg
  if (sodium > 800) {
    warnTags.push({
      label: 'High Sodium',
      type: 'warn',
      translationKey: 'results.tagHighSodium',
    });
  }

  // Refined Carbs: carbs > 60g AND fiber < 2g
  if (carbs > 60 && fiber < 2) {
    warnTags.push({
      label: 'Refined Carbs',
      type: 'warn',
      translationKey: 'results.tagRefinedCarbs',
    });
  }

  // High Fat Ratio: (fat * 9) / calories > 0.35 OR fat > 30g
  const fatCalories = fat * 9;
  const fatRatio = calories > 0 ? fatCalories / calories : 0;
  if (fatRatio > 0.35 || fat > 30) {
    warnTags.push({
      label: 'High Fat',
      type: 'warn',
      translationKey: 'results.tagHighFat',
    });
  }

  // Heavy Meal: calories > 800
  if (calories > 800) {
    warnTags.push({
      label: 'Heavy Meal',
      type: 'warn',
      translationKey: 'results.tagHeavyMeal',
    });
  }

  // Return sorted: good tags first, then info tags, then warn tags
  return [...goodTags, ...infoTags, ...warnTags];
}

/**
 * Complete health metadata calculation
 * Combines score metadata and tag generation
 */
export function calculateHealthMetadata(
  score: number,
  nutrition: NutritionData,
  colors: { green: string; lime: string; coral: string },
  aiHealthTags?: string[]
) {
  const derivedTags = generateHealthTags(nutrition);
  const aiTags = generateAiHealthTags(aiHealthTags);

  // Merge AI tags with derived tags, deduplicating by translation key so
  // nutrition-derived tags (e.g. High Fiber, High Sodium) take precedence.
  const derivedKeys = new Set(derivedTags.map((t) => t.translationKey));
  const mergedTags = [...derivedTags, ...aiTags.filter((t) => !derivedKeys.has(t.translationKey))];

  return {
    scoreMetadata: getHealthScoreMetadata(score, colors),
    tags: mergedTags,
  };
}
