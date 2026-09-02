export interface FoodItem {
  name: string;
  confidence: number;
  calories: number;
  macros: {
    protein: number;
    carbs: number;
    fat: number;
  };
}

export interface Meal {
  id: string;
  timestamp: Date;
  imageUri: string;
  foodItems: FoodItem[];
  manualEdits: FoodItem[];
  totalCalories: number;
  totalMacros: {
    protein: number;
    carbs: number;
    fat: number;
  };
}

export interface UserGoals {
  dailyCalories: number;
  proteinGoal: number;
  carbsGoal: number;
  fatGoal: number;
}
