import { StackNavigationProp } from "@react-navigation/stack";
import { FoodAnalysis, FoodItem, LabelNutrition } from "./analysis";

export type AppNavigation = StackNavigationProp<RootStackParamList>;
export type AnalysisLoadingScreenNavigationProp = StackNavigationProp<
  RootStackParamList,
  "AnalysisLoading"
>;

export type CachedBreakdown = {
  dish_name?: string;
  food_breakdown: string;
  items?: string[];
  items_detailed?: Array<{
    name: string;
    grams_g?: number | null;
    volume_ml?: number | null;
    confidence?: number | null;
    is_garnish?: boolean;
    is_base?: boolean;
    user_specified?: boolean;
  }>;
  needs_dish_name?: boolean;
  is_drink?: boolean | null;
  is_nutrition_label?: boolean;
  label_nutrition?: LabelNutrition | null;
  portion_confidence?: string;
  originalFoodItems?: FoodItem[];
  originalAnalysis?: Partial<FoodAnalysis & { imageUri?: string | null }>;
};

export type RootStackParamList = {
  Dashboard:
    | {
        lastLoggedMeal?: {
          mealType: "breakfast" | "lunch" | "dinner" | "snack";
          calories: number;
        };
      }
    | undefined;
  Onboarding: undefined;
  MealCapture:
    | {
        mealType?: "breakfast" | "lunch" | "dinner" | "snack";
        portion?: number;
        recordedDateISO?: string;
      }
    | undefined;
  BreakdownConfirm: {
    imageUri: string;
    mealType?: "breakfast" | "lunch" | "dinner" | "snack";
    portion?: number;
    servings?: number;
    recordedDateISO?: string;
    query?: string;
    cachedBreakdown?: CachedBreakdown; // Pass breakdown result to avoid re-running API call
    foodType?: "drink" | "dish" | "packaged";
    sugarLevel?: number | null;
    drinkType?: "creamer" | "fresh_milk" | "pure_tea" | "fruit" | null;
    hasEditedIngredients?: boolean; // One-time edit: if true, editing is disabled
    isTextAnalysis?: boolean; // True when coming from a text-only query; skip re-analysis confirmation
    confirmedSubstance?: "alcohol" | "drugs" | null;
  };
  Profile: undefined;
  HistoryDates: undefined;
  HistoryDay: { dateISO: string };
  HistoryDetail: { logId: string };
  Settings: undefined;
  SignIn: undefined;
  SignUp: undefined;
  Results: {
    analysis: FoodAnalysis & { imageUri?: string | null };
    mealType?: "breakfast" | "lunch" | "dinner" | "snack";
    portion?: number;
    servings?: number;
    recordedDateISO?: string;
    query?: string;
    sugarLevel?: number | null;
    drinkType?: "creamer" | "fresh_milk" | "pure_tea" | "fruit" | null;
    justEdited?: boolean; // Set when returning from BreakdownConfirm after editing
  };
  AnalysisLoading: {
    imageUri?: string;
    mealType?: "breakfast" | "lunch" | "dinner" | "snack";
    portion?: number;
    servings?: number;
    recordedDateISO?: string;
    query?: string;
    foodBreakdown?: string;
    sugarLevel?: number | null;
    foodType?: "drink" | "dish" | "packaged";
    confirmedSubstance?: "alcohol" | "drugs" | null;
    drinkType?: "creamer" | "fresh_milk" | "pure_tea" | "fruit" | null;
    hasEditedIngredients?: boolean; // Propagates one-time edit flag through to Results
  };
  ResetPassword: undefined;
  PasswordUpdate: undefined;
  UserQuestionnaire: undefined;
  GeneralFeedback: undefined;
};
