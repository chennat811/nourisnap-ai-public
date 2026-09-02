import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Check, X } from "lucide-react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import type { AppNavigation, RootStackParamList } from "../types/navigation";
import { useLanguage } from "../context/LanguageContext";
import { useTheme } from "../context/ThemeContext";
import { useDailyLimit, DAILY_SCAN_LIMIT } from "../hooks/useDailyLimit";
import BackButton from "../components/BackButton";
import {
  FoodAnalysis,
  FoodItem,
  DetailedItem,
  LabelNutrition,
} from "../types/analysis";
import {
  getDrinkType,
  isAddedSugarIngredient,
  type DrinkType,
} from "../utils/drinkType";

type ItemDetailed = DetailedItem & { user_specified?: boolean };

type BreakdownRes = {
  dish_name?: string;
  food_breakdown: string;
  items?: string[];
  items_detailed?: ItemDetailed[];
  needs_dish_name?: boolean;
  is_drink?: boolean | null;
  is_nutrition_label?: boolean;
  label_nutrition?: LabelNutrition | null;
  portion_confidence?: string;
};

type MacrosPer100g = {
  calories: number;
  carbs: number;
  protein: number;
  fat: number;
  sodium_mg: number;
  sugar_g: number;
  fiber_g: number;
};

type FoodItemWithNutrition = FoodItem & {
  macros_per_100g?: MacrosPer100g;
  grams_g?: number | null;
  volume_ml?: number | null;
  // Optional top-level nutrition values that may be present on original food item data
  carbs_g?: number;
  protein_g?: number;
  fat_g?: number;
  sodium_mg?: number;
  sugar_g?: number;
  fiber_g?: number;
  original_nutrition?: {
    calories: number;
    carbs: number;
    protein: number;
    fat: number;
    sodium_mg: number;
    sugar_g: number;
    fiber_g: number;
  } | null;
};

const isBreakdownResponse = (res: unknown): res is BreakdownRes => {
  if (!res || typeof res !== "object" || Array.isArray(res)) return false;

  const data = res as Record<string, unknown>;
  return (
    typeof data.food_breakdown === "string" &&
    (data.items === undefined ||
      (Array.isArray(data.items) && data.items.every((item) => typeof item === "string"))) &&
    (data.items_detailed === undefined ||
      (Array.isArray(data.items_detailed) &&
        data.items_detailed.every(
          (item) => item !== null && typeof item === "object" && !Array.isArray(item),
        )))
  );
};

const r1 = (n: number) => Math.round(n * 10) / 10;

const getEffectiveWeight = (it: {
  grams_g?: number | null;
  volume_ml?: number | null;
}): number => {
  if (typeof it.grams_g === "number" && it.grams_g > 0) return it.grams_g;
  if (typeof it.volume_ml === "number" && it.volume_ml > 0) return it.volume_ml;
  return 0;
};

export default function BreakdownConfirmScreen() {
  const navigation = useNavigation<AppNavigation>();
  const route = useRoute<RouteProp<RootStackParamList, "BreakdownConfirm">>();
  const { t } = useLanguage();
  const { colors } = useTheme();
  const { canScan, scansRemaining, consumeScan } = useDailyLimit();
  const styles = React.useMemo(() => getStyles(colors), [colors]);
  const { imageUri, mealType, portion, servings, recordedDateISO, query, cachedBreakdown, foodType,
    sugarLevel: initSugarLevel, drinkType: initDrinkType, hasEditedIngredients, isTextAnalysis,
    confirmedSubstance } = route.params;

  // ── Core state ──
  const [loading, setLoading] = React.useState(true);
  const [breakdown, setBreakdown] = React.useState<string>("");
  const [dishName, setDishName] = React.useState<string>("");

  // Hidden from user — managed by AI
  const [itemsDetailed, setItemsDetailed] = React.useState<ItemDetailed[]>([]);

  // User-visible component names (editable chips)
  const [componentNames, setComponentNames] = React.useState<string[]>([]);

  // Dish name inline editing state
  const [isEditingDishName, setIsEditingDishName] = React.useState(false);

  // Drink-specific (initialised from nav params when pre-collected on MealCaptureScreen)
  const [sugarLevel, setSugarLevel] = React.useState<number | null>(initSugarLevel ?? 100);
  const [drinkType, setDrinkType] = React.useState<DrinkType | null>(
    initDrinkType ?? null,
  );
  const [isDrink, setIsDrink] = React.useState<boolean | null>(null);

  const [userEdited, setUserEdited] = React.useState<boolean>(false);
  const [originalPortionConfidence, setOriginalPortionConfidence] =
    React.useState<string | undefined>(undefined);
  const [isNutritionLabel, setIsNutritionLabel] = React.useState(false);

  // Original per-item nutrition from single_pass (used to anchor unchanged items in refine flow)
  const originalFoodItemsRef = React.useRef<FoodItemWithNutrition[]>(
    Array.isArray(cachedBreakdown?.originalFoodItems)
      ? cachedBreakdown.originalFoodItems
      : []
  );
  // Snapshot of initial item weights (set once on first load) — used to compute scale factors
  const initialItemsRef = React.useRef<ItemDetailed[]>([]);
  // ScrollView ref for scrolling to add ingredient section
  const scrollViewRef = React.useRef<ScrollView | null>(null);
  const [labelNutrition, setLabelNutrition] = React.useState<LabelNutrition | null>(null);

  // Chip editing state: index of the chip currently being edited, or null
  const [editingChipIdx, setEditingChipIdx] = React.useState<number | null>(null);
  const [editingChipValue, setEditingChipValue] = React.useState<string>("");
  const [editingChipAmount, setEditingChipAmount] = React.useState<string>("");
  const [editingChipUnit, setEditingChipUnit] = React.useState<"g" | "ml" | "">("");

  // New component input
  const [newComponentName, setNewComponentName] = React.useState<string>("");
  const [newComponentAmount, setNewComponentAmount] = React.useState<string>("");
  const [newComponentUnit, setNewComponentUnit] = React.useState<"g" | "ml">("g");
  const [isAddingIngredient, setIsAddingIngredient] = React.useState<boolean>(false);
  const [submitting, setSubmitting] = React.useState<boolean>(false);

  // Shared helper: for drinks with other components, skip the base item whose
  // name matches the dish name (e.g. 珍珠奶茶 summary item) to avoid double counting.
  const isSummaryBaseItem = (
    it: ItemDetailed,
    dishNameNorm: string,
    drinkFlag: boolean | null,
    hasOtherComponents: boolean,
  ): boolean =>
    it.is_base === true &&
    (it.name || "").toLowerCase().trim() === dishNameNorm &&
    drinkFlag === true &&
    hasOtherComponents;

  // Returns itemsDetailed indices that are visible as chips.
  // This mirrors the filter logic in applyBreakdown so chip index ↔ itemsDetailed index stays correct.
  const getVisibleItemIndices = (): number[] => {
    const dishNameNorm = (dishName || "").toLowerCase().trim();
    const hasOtherComponents = itemsDetailed.some((it) => {
      if (it.is_garnish) return false;
      return (it.name || "").toLowerCase().trim() !== dishNameNorm;
    });
    return itemsDetailed
      .map((it, idx) => ({ it, idx }))
      .filter(({ it }) => {
        if (it.is_base !== true) return true;
        return !isSummaryBaseItem(it, dishNameNorm, isDrink, hasOtherComponents);
      })
      .map(({ idx }) => idx);
  };

  // Build name -> index lists so duplicate names and deletions/reorders map to
  // the correct original nutrition anchor.
  const buildNameIndexMap = (items: { name?: string }[]) => {
    const map = new Map<string, number[]>();
    items.forEach((it, i) => {
      const key = (it.name || "").toLowerCase().trim();
      if (!key) return;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(i);
    });
    return map;
  };

  const createOriginalPickers = () => {
    const origByName = buildNameIndexMap(originalFoodItemsRef.current);
    const initialByName = buildNameIndexMap(initialItemsRef.current);
    const usedOrig = new Set<number>();
    const usedInitial = new Set<number>();
    return {
      pickOriginal: (name?: string): FoodItemWithNutrition | null => {
        const key = (name || "").toLowerCase().trim();
        if (!key) return null;
        const indices = origByName.get(key);
        if (!indices) return null;
        for (const idx of indices) {
          if (!usedOrig.has(idx)) {
            usedOrig.add(idx);
            return originalFoodItemsRef.current[idx];
          }
        }
        return null;
      },
      pickInitial: (name?: string): ItemDetailed | null => {
        const key = (name || "").toLowerCase().trim();
        if (!key) return null;
        const indices = initialByName.get(key);
        if (!indices) return null;
        for (const idx of indices) {
          if (!usedInitial.has(idx)) {
            usedInitial.add(idx);
            return initialItemsRef.current[idx];
          }
        }
        return null;
      },
    };
  };

  // Compute total weight from itemsDetailed for display
  // For DRINKS: skip base items that match dish_name (summary items like 珍珠奶茶)
  // For DISHES: include all items including base items (炒飯 IS the rice base)
  const computeTotalFromItems = (
    items: ItemDetailed[],
    dn: string,
    isDrinkFlag: boolean | null,
  ): { g: number; ml: number } => {
    const dishNameNorm = (dn || "").toLowerCase().trim();
    // Check if there are other non-garnish items besides the dish_name item
    const hasOtherComponents = items.some((it) => {
      if (it.is_garnish) return false;
      return (it.name || "").toLowerCase().trim() !== dishNameNorm;
    });
    let g = 0;
    let ml = 0;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.is_garnish) continue;
      // Skip base items ONLY for drinks with other components (to avoid double-counting 珍珠奶茶 + 奶茶)
      if (isSummaryBaseItem(it, dishNameNorm, isDrinkFlag, hasOtherComponents)) continue;
      if (typeof it.grams_g === "number" && it.grams_g > 0) g += it.grams_g;
      if (typeof it.volume_ml === "number" && it.volume_ml > 0) ml += it.volume_ml;
    }
    return { g: Math.round(g), ml: Math.round(ml) };
  };

  const { visibleItemIndices, visibleItems, totals, hasVolumeItems } = React.useMemo(() => {
    const indices = getVisibleItemIndices();
    const items = indices.map((i) => itemsDetailed[i]);
    const computedTotals = computeTotalFromItems(items, dishName, isDrink);
    const hasVolumes = items.some(
      (item) =>
        typeof item.volume_ml === "number" &&
        item.volume_ml > 0 &&
        (item.grams_g == null || item.grams_g === 0),
    );

    return {
      visibleItemIndices: indices,
      visibleItems: items,
      totals: computedTotals,
      hasVolumeItems: hasVolumes,
    };
  }, [itemsDetailed, dishName, isDrink]);

  // Guard against raw JSON leaking into the breakdown description text.
  // If the text looks like a JSON object/array, try to extract food_breakdown,
  // otherwise hide it entirely so the user never sees raw JSON.
  const sanitizeBreakdownText = (text: string | undefined | null): string => {
    if (!text) return "";
    const trimmed = text.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed && typeof parsed.food_breakdown === "string") {
          return parsed.food_breakdown;
        }
      } catch {
        /* truncated/invalid JSON — fall through to hide it */
      }
      return "";
    }
    return text;
  };

  // ── Apply initial breakdown result to state ──
  const applyBreakdown = (res: unknown) => {
    if (!isBreakdownResponse(res)) {
      throw new Error(t("breakdown.invalidCached"));
    }

    setDishName(res.dish_name || "");
    setBreakdown(sanitizeBreakdownText(res.food_breakdown));

    // ── Nutrition label mode ──
    const labelMode = res.is_nutrition_label === true;
    setIsNutritionLabel(labelMode);
    setLabelNutrition(labelMode && res.label_nutrition ? res.label_nutrition : null);

    if (labelMode) {
      setItemsDetailed([]);
      setComponentNames([]);
      setOriginalPortionConfidence("high");
      setIsDrink(null);
      setDrinkType(null);
      return;
    }

    const parsedDetails: ItemDetailed[] = Array.isArray(res.items_detailed)
      ? res.items_detailed.map((it) => ({
          ...it,
          name: typeof it.name === "string" ? it.name : "",
          grams_g:
            typeof it.grams_g === "number" && Number.isFinite(it.grams_g)
              ? it.grams_g
              : null,
          volume_ml:
            typeof it.volume_ml === "number" && Number.isFinite(it.volume_ml)
              ? it.volume_ml
              : null,
          confidence:
            typeof it.confidence === "number" && Number.isFinite(it.confidence)
              ? it.confidence
              : 0.8,
          is_garnish: it.is_garnish === true,
          is_base: it.is_base === true,
          user_specified: it.user_specified === true,
        }))
      : [];
    const details = initSugarLevel === 0
      ? parsedDetails.filter((item) => !isAddedSugarIngredient(item.name || ""))
      : parsedDetails;
    // Derive component names for display
    // For DRINKS: exclude base items that match dish_name (to avoid 珍珠奶茶 + 奶茶 duplication)
    // For DISHES: keep all items including base items (炒飯 IS the rice base)
    const drinkFlag = typeof res.is_drink === "boolean" ? res.is_drink : null;
    const dishNameNorm = (res.dish_name || "").toLowerCase().trim();
    // Check if there are other non-garnish items besides the dish_name item
    const hasOtherComponents = details.some((it) => {
      if (it.is_garnish) return false;
      return (it.name || "").toLowerCase().trim() !== dishNameNorm;
    });
    const names = details
      .filter((it) => {
        // Always show non-base items
        if (it.is_base !== true) return true;
        // For base items that match dish_name:
        // - DRINKS with other components: exclude (avoid 珍珠奶茶 + 奶茶 duplication)
        // - DISHES or drinks without other components: keep (炒飯 IS the rice base)
        return !isSummaryBaseItem(it, dishNameNorm, drinkFlag, hasOtherComponents);
      })
      .map((it) => it.name)
      .filter((n) => n.trim().length > 0);
    // Sync drink sugar so the UI shows grams and the AI/fast-path can scale it.
    const { items: syncedDetails, names: syncedNames } = syncSugarItem(
      details,
      names,
      initSugarLevel ?? null,
    );
    setItemsDetailed(syncedDetails);
    // Capture initial weights once (used for proportional nutrition scaling in handleContinue)
    if (initialItemsRef.current.length === 0) {
      initialItemsRef.current = syncedDetails;
    }
    setComponentNames(syncedNames);
    // Totals are now auto-calculated from items in the UI
    setOriginalPortionConfidence(res.portion_confidence || undefined);
    setIsDrink(drinkFlag);
    if (drinkFlag) {
      const haystack = [
        res.dish_name,
        res.food_breakdown,
        ...(res.items || []),
      ]
        .filter(Boolean)
        .join(" ");
      setDrinkType(initDrinkType ?? getDrinkType(haystack));
    } else {
      setDrinkType(null);
    }
  };

  // ── Initial load: use cached breakdown passed by the caller ──
  React.useEffect(() => {
    if (cachedBreakdown) {
      try {
        applyBreakdown(cachedBreakdown);
      } catch (e: any) {
        Alert.alert(t("common.error"), e?.message || t("breakdown.loadCachedFailed"));
      } finally {
        setLoading(false);
      }
      return;
    }
    // No cached breakdown and no network calls inside this screen — show empty state
    setLoading(false);
  }, [cachedBreakdown]);

  // ── Handlers ──
  const handleDishNameChange = (text: string) => {
    setDishName(text);
    setUserEdited(true);
    // No immediate AI rebreakdown — user finishes all edits first, then Continue runs analysis once
  };

  const getSugarGrams = (level: number | null): number => {
    const pct = typeof level === "number" ? level : 100;
    return Math.round((pct / 100) * 45 * 10) / 10;
  };

  const syncSugarItem = (
    currentItems: ItemDetailed[],
    currentNames: string[],
    level: number | null,
  ): { items: ItemDetailed[]; names: string[] } => {
    const isSugar = (name: string) => isAddedSugarIngredient(name);
    const withoutSugarItems = currentItems.filter(
      (it) => !isSugar(it.name || ""),
    );
    const withoutSugarNames = currentNames.filter((n) => !isSugar(n));
    if (level === null || level === 0) {
      return { items: withoutSugarItems, names: withoutSugarNames };
    }
    const sugarG = getSugarGrams(level);
    const newName = "糖漿";
    const newItem: ItemDetailed = {
      name: newName,
      grams_g: sugarG,
      volume_ml: null,
      confidence: 0.8,
      is_garnish: false,
      is_base: false,
      user_specified: true,
    };
    return {
      items: [...withoutSugarItems, newItem],
      names: [...withoutSugarNames, newName],
    };
  };

  const handleSugarLevelChange = (level: number | null) => {
    setSugarLevel(level);
    const next = syncSugarItem(itemsDetailed, componentNames, level);
    setItemsDetailed(next.items);
    setComponentNames(next.names);
    setUserEdited(true);
  };

  const handleRemoveComponent = (idx: number) => {
    const visibleIndices = visibleItemIndices;
    const detailedIdx = visibleIndices[idx];
    const next = componentNames.filter((_, i) => i !== idx);
    setComponentNames(next);

    // Sync itemsDetailed so the deleted item is not sent in the analysis prompt
    const nextDetails = itemsDetailed.filter((_, i) => i !== detailedIdx);
    setItemsDetailed(nextDetails);
    setUserEdited(true);

    if (editingChipIdx === idx) setEditingChipIdx(null);
    // No immediate AI rebreakdown — user finishes all edits first
  };

  const handleStartEditChip = (idx: number) => {
    setEditingChipIdx(idx);
    const name = componentNames[idx];
    setEditingChipValue(name);

    // Map visible chip index to itemsDetailed index so duplicate names and drink base filtering don't collide
    const visibleIndices = visibleItemIndices;
    const item = itemsDetailed[visibleIndices[idx]];
    if (item) {
      if (item.grams_g != null) {
        setEditingChipAmount(String(item.grams_g));
        setEditingChipUnit("g");
      } else if (item.volume_ml != null) {
        setEditingChipAmount(String(item.volume_ml));
        setEditingChipUnit("ml");
      } else {
        setEditingChipAmount("");
        setEditingChipUnit("");
      }
    } else {
      setEditingChipAmount("");
      setEditingChipUnit("");
    }
  };

  // Returns the committed itemsDetailed so callers (e.g. handleContinue) can use it
  // synchronously without relying on a React state flush.
  const handleConfirmEditChip = (): ItemDetailed[] => {
    if (editingChipIdx === null) return itemsDetailed;
    const trimmed = editingChipValue.trim();
    const visibleIndices = visibleItemIndices;
    if (!trimmed) {
      // Empty name → treat as delete; handleRemoveComponent clears editingChipIdx when idx matches
      handleRemoveComponent(editingChipIdx);
      return itemsDetailed.filter((_, i) => i !== visibleIndices[editingChipIdx]);
    }
    const detailedIdx = visibleIndices[editingChipIdx];
    const next = componentNames.slice();
    next[editingChipIdx] = trimmed;
    setComponentNames(next);

    // Parse the new amount
    const amtNum = Number(editingChipAmount.trim());
    const hasAmt = editingChipAmount.trim().length > 0 && Number.isFinite(amtNum) && amtNum >= 0;

    // Update itemsDetailed by mapped index so duplicate names don't collide
    const updatedDetails = itemsDetailed.map((it, i) => {
      if (i === detailedIdx) {
        const updated = { ...it, name: trimmed, user_specified: true };
        if (hasAmt) {
          if (editingChipUnit === "ml") {
            return { ...updated, volume_ml: amtNum, grams_g: null };
          } else {
            return { ...updated, grams_g: amtNum, volume_ml: null };
          }
        }
        return updated;
      }
      return it;
    });

    setItemsDetailed(updatedDetails);

    setUserEdited(true);
    setEditingChipIdx(null);
    // No immediate AI rebreakdown — user finishes all edits first
    return updatedDetails;
  };

  const handleAddComponent = () => {
    const name = newComponentName.trim();
    if (!name) return;
    const next = [...componentNames, name];
    setComponentNames(next);

    // Parse amount and add to itemsDetailed
    const amtNum = parseFloat(newComponentAmount.trim());
    const hasAmt = Number.isFinite(amtNum) && amtNum > 0;

    const newItem: ItemDetailed = {
      name,
      grams_g: newComponentUnit === "g" && hasAmt ? amtNum : null,
      volume_ml: newComponentUnit === "ml" && hasAmt ? amtNum : null,
      confidence: 0.8,
      is_garnish: false,
      is_base: false,
      user_specified: true,
    };
    const nextDetails = [...itemsDetailed, newItem];
    setItemsDetailed(nextDetails);
    // Reset inputs
    setNewComponentName("");
    setNewComponentAmount("");
    setNewComponentUnit("g");
    setIsAddingIngredient(false); // Re-enable Continue button after adding

    setUserEdited(true);
    // No immediate AI rebreakdown — user finishes all edits first
  };

  const computeClientSideNutrition = (
    latestItems: ItemDetailed[],
  ): FoodAnalysis & { imageUri?: string | null; items_detailed: ItemDetailed[]; portion_confidence: string } => {
    const { pickOriginal, pickInitial } = createOriginalPickers();

    // Non-consuming lookup used to decide whether every item has usable anchor macros.
    const lookupOriginalByName = (name?: string): FoodItemWithNutrition | null => {
      const key = (name || "").toLowerCase().trim();
      if (!key) return null;
      return originalFoodItemsRef.current.find(
        (fi) => (fi.name || "").toLowerCase().trim() === key,
      ) ?? null;
    };

    const hasUsableMacros = (orig: FoodItemWithNutrition | null): boolean => {
      if (!orig) return false;
      if (orig.macros_per_100g) return true;
      const hasCals = typeof orig.calories === "number" && orig.calories > 0;
      const hasMacros =
        (orig.macros?.carbs ?? 0) > 0 ||
        (orig.macros?.protein ?? 0) > 0 ||
        (orig.macros?.fat ?? 0) > 0;
      return hasCals || hasMacros;
    };

    const canScalePerItem = latestItems.every((it) =>
      hasUsableMacros(lookupOriginalByName(it.name)),
    );

    let computedFoodItems: FoodItemWithNutrition[];

    if (canScalePerItem) {
      // Per-item scaling: prefer macros_per_100g, otherwise scale by weight ratio.
      computedFoodItems = latestItems.map((it) => {
        const orig = pickOriginal(it.name);
        const initial = pickInitial(it.name);
        const newW = getEffectiveWeight(it);

        if (orig?.macros_per_100g && newW > 0) {
          const p = orig.macros_per_100g;
          return {
            name: it.name,
            confidence: orig.confidence ?? 0.9,
            calories: Math.round((p.calories * newW) / 100),
            macros: {
              carbs: r1((p.carbs * newW) / 100),
              protein: r1((p.protein * newW) / 100),
              fat: r1((p.fat * newW) / 100),
              sodium_mg: r1((p.sodium_mg * newW) / 100),
              sugar_g: r1((p.sugar_g * newW) / 100),
              fiber_g: r1((p.fiber_g * newW) / 100),
            },
            macros_per_100g: p,
            grams_g: it.grams_g,
            volume_ml: it.volume_ml,
          };
        }

        const origW = initial ? getEffectiveWeight(initial) : 0;
        const scale = origW > 0 && newW > 0 ? newW / origW : 1;
        return {
          name: it.name,
          confidence: orig?.confidence ?? 0.8,
          calories: Math.round((orig?.calories ?? 0) * scale),
          macros: {
            carbs: r1((orig?.macros?.carbs ?? 0) * scale),
            protein: r1((orig?.macros?.protein ?? 0) * scale),
            fat: r1((orig?.macros?.fat ?? 0) * scale),
            sodium_mg: r1((orig?.macros?.sodium_mg ?? 0) * scale),
            sugar_g: r1((orig?.macros?.sugar_g ?? 0) * scale),
            fiber_g: r1((orig?.macros?.fiber_g ?? 0) * scale),
          },
          macros_per_100g: orig?.macros_per_100g,
          grams_g: it.grams_g,
          volume_ml: it.volume_ml,
        };
      });
    } else {
      // Whole-meal proportional fallback: scale the original totals by the
      // change in total weight and allocate to each item by its new weight share.
      // This covers cases where items_detailed includes components (e.g. sauce/oil)
      // that don't have per-item macros in the original foodItems list.
      const origAnalysis = cachedBreakdown?.originalAnalysis ?? {};
      const origTotalWeight = initialItemsRef.current.reduce(
        (s, it) => s + getEffectiveWeight(it),
        0,
      );
      const newTotalWeight = latestItems.reduce(
        (s, it) => s + getEffectiveWeight(it),
        0,
      );
      const weightScale =
        origTotalWeight > 0 && newTotalWeight > 0
          ? newTotalWeight / origTotalWeight
          : 1;

      const totalCalories = Math.round((origAnalysis.calories ?? 0) * weightScale);
      const totalCarbs = r1((origAnalysis.carbs_g ?? 0) * weightScale);
      const totalProtein = r1((origAnalysis.protein_g ?? 0) * weightScale);
      const totalFat = r1((origAnalysis.fat_g ?? 0) * weightScale);
      const totalSodium = r1((origAnalysis.sodium_mg ?? 0) * weightScale);
      const totalSugar = r1((origAnalysis.sugar_g ?? 0) * weightScale);
      const totalFiber = r1((origAnalysis.fiber_g ?? 0) * weightScale);

      computedFoodItems = latestItems.map((it) => {
        const newW = getEffectiveWeight(it);
        const share =
          newTotalWeight > 0 ? newW / newTotalWeight : 1 / latestItems.length;
        return {
          name: it.name,
          confidence: 0.8,
          calories: Math.round(totalCalories * share),
          macros: {
            carbs: r1(totalCarbs * share),
            protein: r1(totalProtein * share),
            fat: r1(totalFat * share),
            sodium_mg: r1(totalSodium * share),
            sugar_g: r1(totalSugar * share),
            fiber_g: r1(totalFiber * share),
          },
          grams_g: it.grams_g,
          volume_ml: it.volume_ml,
        } as FoodItemWithNutrition;
      });
    }

    const totalCalories = computedFoodItems.reduce((s, fi) => s + fi.calories, 0);
    const totalCarbs = r1(computedFoodItems.reduce((s, fi) => s + (fi.macros?.carbs ?? 0), 0));
    const totalProtein = r1(computedFoodItems.reduce((s, fi) => s + (fi.macros?.protein ?? 0), 0));
    const totalFat = r1(computedFoodItems.reduce((s, fi) => s + (fi.macros?.fat ?? 0), 0));
    const totalSodium = r1(computedFoodItems.reduce((s, fi) => s + (fi.macros?.sodium_mg ?? 0), 0));
    const totalSugar = r1(computedFoodItems.reduce((s, fi) => s + (fi.macros?.sugar_g ?? 0), 0));
    const totalFiber = r1(computedFoodItems.reduce((s, fi) => s + (fi.macros?.fiber_g ?? 0), 0));

    const origAnalysis = cachedBreakdown?.originalAnalysis ?? {};
    return {
      ...origAnalysis,
      imageUri,
      foodItems: computedFoodItems,
      calories: totalCalories,
      carbs_g: totalCarbs,
      protein_g: totalProtein,
      fat_g: totalFat,
      sodium_mg: totalSodium,
      sugar_g: totalSugar,
      fiber_g: totalFiber,
      items_detailed: latestItems,
      portion_confidence: "high",
    };
  };

  const handleContinue = async () => {
    if (submitting) return;
    setSubmitting(true);

    try {
      // Step 1: Commit any pending chip edit so we operate on fresh item data.
      const latestItems = editingChipIdx !== null
        ? handleConfirmEditChip()
        : itemsDetailed;

      // Step 2: Determine whether ingredient names are unchanged.
      // If only amounts changed, we can skip AI and scale nutrition client-side.
      // Use a multiset check so reordering with identical names still qualifies.
      const namesUnchanged = (() => {
        if (originalFoodItemsRef.current.length === 0) return false;
        if (latestItems.length !== originalFoodItemsRef.current.length) return false;
        const nameCounts = new Map<string, number>();
        for (const fi of originalFoodItemsRef.current) {
          const key = (fi.name || "").toLowerCase().trim();
          if (!key) continue;
          nameCounts.set(key, (nameCounts.get(key) ?? 0) + 1);
        }
        for (const it of latestItems) {
          const key = (it.name || "").toLowerCase().trim();
          if (!key) return false;
          const count = nameCounts.get(key) ?? 0;
          if (count === 0) return false;
          nameCounts.set(key, count - 1);
        }
        return true;
      })();
      // If a chip is currently being edited, committing it is itself an edit,
      // but the userEdited state flush is not synchronous in that path.
      const isActuallyEdited = userEdited || editingChipIdx !== null;
      const hasAnchors =
        originalFoodItemsRef.current.length > 0 &&
        Object.keys(cachedBreakdown?.originalAnalysis ?? {}).length > 0;
      const initialSugar = initSugarLevel ?? null;
      const sugarChanged =
        isDrink === true && sugarLevel !== initialSugar;

      // Step 3: Names-unchanged fast path — compute nutrition locally and go to Results.
      // Only safe when we have per-item or whole-meal baseline data and the user has not
      // changed the drink sugar level (which the client-side scaling cannot re-estimate).
      if (namesUnchanged && isActuallyEdited && hasAnchors && !sugarChanged) {
        const scaledAnalysis = computeClientSideNutrition(latestItems);
        navigation.replace("Results", {
          analysis: scaledAnalysis,
          mealType,
          portion,
          servings,
          recordedDateISO,
          query: query || undefined,
          sugarLevel,
          drinkType,
          justEdited: true,
        });
        return;
      }

      // Step 4: Full AI path — attach original nutrition anchors for unchanged items.
      const currentItems = latestItems
        .map((it) => it.name)
        .filter((n) => n.trim().length > 0);
      const { pickOriginal, pickInitial } = createOriginalPickers();
      const itemsWithAnchors = latestItems.map((it) => {
        const orig = pickOriginal(it.name);
        if (orig) {
          const newW = getEffectiveWeight(it);
          if (orig.macros_per_100g && newW > 0) {
            const p = orig.macros_per_100g;
            return {
              ...it,
              original_nutrition: {
                calories: Math.round(p.calories * newW / 100),
                carbs: r1(p.carbs * newW / 100),
                protein: r1(p.protein * newW / 100),
                fat: r1(p.fat * newW / 100),
                sodium_mg: r1(p.sodium_mg * newW / 100),
                sugar_g: r1(p.sugar_g * newW / 100),
                fiber_g: r1(p.fiber_g * newW / 100),
              },
            };
          }
          const initial = pickInitial(it.name);
          const origW = initial ? getEffectiveWeight(initial) : 0;
          const scale = origW > 0 && newW > 0 ? newW / origW : 1;
          return {
            ...it,
            original_nutrition: {
              calories: Math.round((orig.calories ?? 0) * scale),
              carbs: r1((orig.macros?.carbs ?? orig.carbs_g ?? 0) * scale),
              protein: r1((orig.macros?.protein ?? orig.protein_g ?? 0) * scale),
              fat: r1((orig.macros?.fat ?? orig.fat_g ?? 0) * scale),
              sodium_mg: r1((orig.macros?.sodium_mg ?? orig.sodium_mg ?? 0) * scale),
              sugar_g: r1((orig.macros?.sugar_g ?? orig.sugar_g ?? 0) * scale),
              fiber_g: r1((orig.macros?.fiber_g ?? orig.fiber_g ?? 0) * scale),
            },
          };
        }
        return it; // Changed item (renamed/added) — no anchor, AI will estimate fresh
      });


      // Step 6: Assemble breakdown JSON for the AI prompt.
      const breakdownJson: Record<string, unknown> = {
        dish_name: dishName,
        food_breakdown: breakdown,
        items: currentItems,
        items_detailed: itemsWithAnchors,
        portion_confidence: isActuallyEdited
          ? "high"
          : originalPortionConfidence || undefined,
        portion_assumption: isActuallyEdited
          ? t("breakdown.userEdited")
          : undefined,
        user_edited: isActuallyEdited,
      };
      if (isNutritionLabel) {
        breakdownJson.is_nutrition_label = true;
        breakdownJson.label_nutrition = labelNutrition;
      }

      // Step 7: Enforce daily scan limit before consuming a scan.
      if (!canScan) {
        Alert.alert(
          t('dashboard.scanLimitAlertTitle'),
          t('dashboard.scanLimitAlertBody', { limit: DAILY_SCAN_LIMIT }),
          [{ text: t('dashboard.scanLimitAlertBtn') }],
        );
        return;
      }

      // Step 8: Build navigation params for AnalysisLoading.
      const buildAnalysisParams = () => {
        const effectiveSugarLevel = isDrink ? (sugarLevel ?? 100) : undefined;
        const drinkTypeText =
          isDrink && drinkType ? `\nDrink Type (model input): ${drinkType}` : "";
        const sugarText =
          isDrink && typeof effectiveSugarLevel === "number"
            ? `\nSugar Level: ${effectiveSugarLevel}% (${getSugarGrams(effectiveSugarLevel).toFixed(1)}g syrup)`
            : "";
        return {
          imageUri,
          mealType,
          portion,
          servings,
          recordedDateISO,
          query: `${query || ""}${drinkTypeText}${sugarText}`.trim() || undefined,
          sugarLevel: effectiveSugarLevel,
          drinkType: drinkType || undefined,
          confirmedSubstance,
          foodBreakdown: JSON.stringify(breakdownJson),
          foodType,
          hasEditedIngredients: true, // Lock further ingredient edits after this session
        };
      };
      const analysisParams = buildAnalysisParams();

      // Step 9: Route to analysis. Consume the scan right before navigating so
      // the local counter matches the server-side limit check.
      const handleAnalysisNavigation = async () => {
        const allowed = await consumeScan();
        if (!allowed) {
          Alert.alert(
            t('dashboard.scanLimitAlertTitle'),
            t('dashboard.scanLimitAlertBody', { limit: DAILY_SCAN_LIMIT }),
            [{ text: t('dashboard.scanLimitAlertBtn') }],
          );
          return;
        }
        navigation.replace("AnalysisLoading", analysisParams);
      };

      if (isTextAnalysis) {
        await handleAnalysisNavigation();
        return;
      }

      Alert.alert(
        t('breakdown.confirmAnalysisTitle'),
        t('breakdown.confirmAnalysisBody', { remaining: scansRemaining, limit: DAILY_SCAN_LIMIT }),
        [
          { text: t('breakdown.confirmAnalysisCancel'), style: 'cancel', onPress: () => navigation.goBack() },
          { text: t('breakdown.confirmAnalysisContinue'), onPress: handleAnalysisNavigation },
        ],
      );
    } catch (err: any) {
      Alert.alert(t("common.error"), err?.message || t("breakdown.continueFailed"));
    } finally {
      setSubmitting(false);
    }
  };

  // ── Render ──
  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <StatusBar barStyle="light-content" backgroundColor={colors.navy} />

      <BackButton variant="absolute" />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
      >
        <ScrollView
          ref={scrollViewRef}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {loading ? (
            <View style={styles.loaderWrap}>
              <ActivityIndicator size="large" color={colors.green} />
              <Text style={styles.loaderText}>{t('analysis.analyzingMeal')}</Text>
            </View>
          ) : (
            <>
              {/* Page Title */}
              <Text style={styles.pageTitle}>{t("breakdown.title")}</Text>

              {/* Dish name - directly below the page title */}
              {!isNutritionLabel && (
                <View style={styles.dishNameRowTop}>
                  {isEditingDishName && !hasEditedIngredients ? (
                    <View style={styles.inputWrap}>
                      <TextInput
                        value={dishName}
                        onChangeText={handleDishNameChange}
                        onBlur={() => setIsEditingDishName(false)}
                        onSubmitEditing={() => setIsEditingDishName(false)}
                        placeholder={t('breakdown.dishNamePlaceholder')}
                        placeholderTextColor={`${colors.cream}33`}
                        style={styles.nsInput}
                        autoFocus
                      />
                      <Text style={styles.inputPencil}>✎</Text>
                    </View>
                  ) : (
                    hasEditedIngredients ? (
                      <View style={styles.dishNameTouchable}>
                        <Text style={styles.dishNameTitleText}>
                          {dishName || t('breakdown.dishNamePlaceholder')}
                        </Text>
                      </View>
                    ) : (
                      <TouchableOpacity
                        style={styles.dishNameTouchable}
                        onPress={() => setIsEditingDishName(true)}
                        activeOpacity={0.6}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      >
                        <Text style={styles.dishNameTitleText}>
                          {dishName || t('breakdown.dishNamePlaceholder')}
                        </Text>
                        <Text style={styles.dishNameEditIcon}>✎</Text>
                      </TouchableOpacity>
                    )
                  )}
                </View>
              )}

              {/* Description card */}
              {breakdown ? (
                <View style={styles.descCard}>
                  <Text style={styles.descText}>{breakdown}</Text>
                </View>
              ) : null}

              {/* Label nutrition */}
              {isNutritionLabel && labelNutrition && (
                <View style={{ marginTop: 12 }}>
                  {labelNutrition.serving_size && (
                    <Text style={styles.labelInfoText}>
                      {t('breakdown.perServing', { size: String(labelNutrition.serving_size) })}
                      {labelNutrition.servings_per_container
                        ? `　${t('breakdown.servingsPerContainer', { count: String(labelNutrition.servings_per_container) })}`
                        : ""}
                    </Text>
                  )}
                  <View style={styles.nutritionTable}>
                    {[
                      { key: t('macros.calories'), val: labelNutrition.calories, unit: "kcal" },
                      { key: t('macros.carbs'), val: labelNutrition.carbs_g, unit: "g" },
                      { key: t('macros.protein'), val: labelNutrition.protein_g, unit: "g" },
                      { key: t('macros.fat'), val: labelNutrition.fat_g, unit: "g" },
                      { key: t('macros.sodium'), val: labelNutrition.sodium_mg, unit: "mg" },
                      { key: t('macros.sugar'), val: labelNutrition.sugar_g, unit: "g" },
                      { key: t('macros.fiber'), val: labelNutrition.fiber_g, unit: "g" },
                    ]
                      .filter((r) => r.val != null && r.val !== undefined)
                      .map((r) => (
                        <View key={r.key} style={styles.nutritionRow}>
                          <Text style={styles.nutritionKey}>{r.key}</Text>
                          <Text style={styles.nutritionVal}>{r.val} {r.unit}</Text>
                        </View>
                      ))}
                  </View>
                  <Text style={styles.hintText}>{t('breakdown.nutritionLabelHint')}</Text>
                </View>
              )}

              {/* Drink options */}
              {!isNutritionLabel && isDrink && (
                <>
                  <Text style={[styles.fieldLabel, { marginTop: 12 }]}>
                    {t('breakdown.drinkSugar')}
                  </Text>
                  <View style={styles.chipRow}>
                    {[
                      { label: t('breakdown.sugarUnspecified'), value: null },
                      { label: t('breakdown.sugarNone'), value: 0 },
                      { label: t('breakdown.sugarLight'), value: 25 },
                      { label: t('breakdown.sugarHalf'), value: 50 },
                      { label: t('breakdown.sugarRegular'), value: 100 },
                    ].map((option) => (
                      <TouchableOpacity
                        key={String(option.value)}
                        style={[styles.chip, sugarLevel === option.value && styles.chipSelected]}
                        onPress={() => handleSugarLevelChange(option.value)}
                      >
                        <Text style={[styles.chipText, sugarLevel === option.value && styles.chipTextSelected]}>
                          {option.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <Text style={[styles.fieldLabel, { marginTop: 10 }]}>
                    {t('breakdown.drinkTypeLabel')}
                  </Text>
                  <View style={styles.chipRow}>
                    {[
                      { label: t('breakdown.drinkType.pure_tea'), value: "pure_tea" as const },
                      { label: t('breakdown.drinkType.creamer'), value: "creamer" as const },
                      { label: t('breakdown.drinkType.fresh_milk'), value: "fresh_milk" as const },
                      { label: t('breakdown.drinkType.fruit'), value: "fruit" as const },
                    ].map((option) => (
                      <TouchableOpacity
                        key={option.value}
                        style={[styles.chip, drinkType === option.value && styles.chipSelected]}
                        onPress={() => setDrinkType(option.value)}
                      >
                        <Text style={[styles.chipText, drinkType === option.value && styles.chipTextSelected]}>
                          {option.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}

              {/* Divider */}
              {!isNutritionLabel && <View style={styles.divider} />}

              {/* Ingredients section */}
              {!isNutritionLabel && (
                <>
                  <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>{t("breakdown.componentsLabel")}</Text>
                    <View style={styles.ingredientCountBadge}>
                      <Text style={styles.ingredientCountText}>
                        {t("breakdown.itemCount", { count: componentNames.length })}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.hintBox}>
                    <View style={styles.hintIconWrap}>
                      <Text style={styles.hintIconText}>i</Text>
                    </View>
                    <Text style={styles.hintBoxText}>{t("breakdown.componentsInstruction")}</Text>
                  </View>

                  {/* Auto-calculated Total Display - below the hint box */}
                  {(() => {
                    // Only sum items that are actually shown as chips. Use the same
                    // visible-to-detailed mapping used by the chip list so totals
                    // never drift out of sync, even with duplicate names or filtered
                    // drink base items.
                    const totalWeight = totals.g;
                    const totalVolume = totals.ml;
                    // If items only have volume (no grams), show volume total
                    const showVolume = hasVolumeItems && totalWeight === 0 && totalVolume > 0;
                    return (
                      <View style={styles.totalDisplayRow}>
                        <Text style={styles.totalDisplayLabel}>
                          {showVolume ? t('breakdown.totalVolumeShort') : t('breakdown.totalWeightShort')}
                        </Text>
                        <Text style={[styles.totalDisplayValue, componentNames.length === 0 && styles.totalDisplayWarning]}>
                          {componentNames.length === 0 ? '0g' : (showVolume ? `${totalVolume}ml` : `${totalWeight}g`)}
                        </Text>
                      </View>
                    );
                  })()}

                  <View style={styles.ingredientList}>
                    {componentNames.map((name, idx) => {
                      const item = visibleItems[idx];
                      const weightStr = item?.grams_g ? `${item.grams_g}g` : item?.volume_ml ? `${item.volume_ml}ml` : '';
                      const isEditing = editingChipIdx === idx;
                      const isDimmed = editingChipIdx !== null && !isEditing;
                      return (
                        <View
                          key={`ing-${idx}`}
                          style={[
                            styles.ingredientRow,
                            isEditing && styles.ingredientRowEditing,
                            isDimmed && styles.ingredientRowDimmed,
                          ]}
                        >
                          {isEditing ? (
                            <View style={{ gap: 8 }}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                <View style={styles.ingIconWrap}>
                                  <Text style={styles.ingIconText}>✎</Text>
                                </View>
                                <Text style={styles.editingLabel}>{t("breakdown.editing")}</Text>
                              </View>
                              <View style={{ flexDirection: "row", gap: 8 }}>
                                <View style={[styles.inputWrap, { flex: 2 }]}>
                                  <TextInput
                                    value={editingChipValue}
                                    onChangeText={setEditingChipValue}
                                    onSubmitEditing={handleConfirmEditChip}
                                    autoFocus
                                    placeholder={t("breakdown.componentNamePlaceholder")}
                                    placeholderTextColor={`${colors.cream}33`}
                                    returnKeyType="next"
                                    style={styles.nsInput}
                                  />
                                  <Text style={styles.inputPencil}>✎</Text>
                                </View>
                                <View style={[styles.inputWrap, { flex: 1, position: "relative" }]}>
                                  <TextInput
                                    value={editingChipAmount}
                                    onChangeText={(val) => setEditingChipAmount(val.replace(/[^0-9.]/g, ""))}
                                    onSubmitEditing={handleConfirmEditChip}
                                    placeholder={t("breakdown.amount")}
                                    placeholderTextColor={`${colors.cream}33`}
                                    keyboardType="decimal-pad"
                                    returnKeyType="done"
                                    style={[styles.nsInput, { paddingRight: 32 }]}
                                  />
                                  <Text style={{
                                    position: "absolute",
                                    right: 12,
                                    fontSize: 14,
                                    fontWeight: "700",
                                    color: colors.green,
                                    fontFamily: colors.fontPrimary,
                                  }}>
                                    {editingChipUnit || "g"}
                                  </Text>
                                </View>
                              </View>
                              <View style={styles.editingBtnsRow}>
                                <TouchableOpacity
                                  style={styles.ingDeleteBtn}
                                  onPress={() => handleRemoveComponent(idx)}
                                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                >
                                  <View style={styles.buttonContent}>
                                    <X size={16} color={colors.coral} strokeWidth={3} />
                                    <Text style={styles.ingDeleteText}>{t("breakdown.remove")}</Text>
                                  </View>
                                </TouchableOpacity>
                                <TouchableOpacity style={styles.doneBtn} onPress={handleConfirmEditChip}>
                                  <View style={styles.buttonContent}>
                                    <Check size={16} color={colors.white} strokeWidth={3} />
                                    <Text style={styles.doneBtnText}>{t("breakdown.done")}</Text>
                                  </View>
                                </TouchableOpacity>
                              </View>
                            </View>
                          ) : (
                            hasEditedIngredients ? (
                              <View style={styles.ingRowInner}>
                                <View style={styles.ingIconWrap}>
                                  <Text style={styles.ingIconText}>•</Text>
                                </View>
                                <View style={{ flex: 1 }}>
                                  <Text style={styles.ingName}>{name}</Text>
                                </View>
                                {weightStr ? <Text style={styles.ingWeight}>{weightStr}</Text> : null}
                              </View>
                            ) : (
                              <TouchableOpacity
                                style={styles.ingRowInner}
                                onPress={() => handleStartEditChip(idx)}
                                activeOpacity={0.6}
                              >
                                <View style={styles.ingIconWrap}>
                                  <Text style={styles.ingIconText}>✎</Text>
                                </View>
                                <View style={{ flex: 1 }}>
                                  <Text style={styles.ingName}>{name}</Text>
                                </View>
                                {weightStr ? <Text style={styles.ingWeight}>{weightStr}</Text> : null}
                              </TouchableOpacity>
                            )
                          )}
                        </View>
                      );
                    })}

                    {!hasEditedIngredients && (
                      <View style={styles.addRowExpanded}>
                        {/* Label row for clarity */}
                        <View style={styles.addRowLabels}>
                          <Text style={[styles.addLabel, { flex: 2 }]}>{t("breakdown.ingredientName")}</Text>
                          <Text style={[styles.addLabel, { flex: 1, textAlign: "center" }]}>{t("breakdown.amount")}</Text>
                          <Text style={[styles.addLabel, { width: 60, textAlign: "center" }]}>{t("breakdown.unit")}</Text>
                        </View>
                        <View style={styles.addRowInputs}>
                          <TextInput
                            value={newComponentName}
                            onChangeText={setNewComponentName}
                            onFocus={() => {
                              setIsAddingIngredient(true);
                              setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);
                            }}
                            placeholder={t("breakdown.addComponentPlaceholder")}
                            placeholderTextColor={`${colors.green}80`}
                            style={[styles.addInput, { flex: 2 }]}
                            returnKeyType="next"
                          />
                          <TextInput
                            value={newComponentAmount}
                            onChangeText={(val) => setNewComponentAmount(val.replace(/[^0-9.]/g, ""))}
                            onFocus={() => {
                              setIsAddingIngredient(true);
                              setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);
                            }}
                            placeholder={t("breakdown.amountPlaceholder")}
                            placeholderTextColor={`${colors.green}80`}
                            style={[styles.addInput, { flex: 1, textAlign: "center" }]}
                            keyboardType="decimal-pad"
                            returnKeyType="done"
                            onSubmitEditing={handleAddComponent}
                          />
                          {/* Unit toggle */}
                          <View style={styles.unitToggle}>
                            <TouchableOpacity
                              style={[
                                styles.unitBtn,
                                newComponentUnit === "g" && styles.unitBtnActive
                              ]}
                              onPress={() => setNewComponentUnit("g")}
                            >
                              <Text style={[
                                styles.unitBtnText,
                                newComponentUnit === "g" && styles.unitBtnTextActive
                              ]}>g</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[
                                styles.unitBtn,
                                newComponentUnit === "ml" && styles.unitBtnActive
                              ]}
                              onPress={() => setNewComponentUnit("ml")}
                            >
                              <Text style={[
                                styles.unitBtnText,
                                newComponentUnit === "ml" && styles.unitBtnTextActive
                              ]}>ml</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                        {/* Always-visible Add button — disabled when no name entered */}
                        <TouchableOpacity
                          style={[
                            styles.addConfirmBtnFull,
                            newComponentName.trim().length === 0 && styles.addConfirmBtnDisabled
                          ]}
                          onPress={handleAddComponent}
                          disabled={newComponentName.trim().length === 0}
                        >
                          <Text style={[
                            styles.addConfirmBtnText,
                            newComponentName.trim().length === 0 && styles.addConfirmBtnTextDisabled
                          ]}>＋ {t("breakdown.add")}</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                </>
              )}
            </>
          )}
        </ScrollView>

        {!loading && !isAddingIngredient && (
          <View style={styles.bottomBtns}>
            <TouchableOpacity
              style={[
                styles.btnContinue,
                submitting && { opacity: 0.6 },
              ]}
              onPress={handleContinue}
              disabled={submitting}
            >
              <Text style={styles.btnContinueText}>
                {t("breakdown.continueAnalysis")}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const getStyles = (tc: any) => StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: tc.bg,
  },
  scrollContent: {
    padding: 14,
    paddingTop: 40,
    paddingBottom: 24,
    gap: 12,
  },
  pageTitle: {
    fontFamily: tc.fontPrimary,
    fontSize: 23,
    fontWeight: '700' as const,
    color: tc.navy,
    marginBottom: 4,
  },
  loaderWrap: {
    backgroundColor: tc.cardBg,
    borderWidth: 1,
    borderColor: tc.cardBorder,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center' as const,
    marginTop: 20,
  },
  loaderText: {
    marginTop: 10,
    fontFamily: tc.fontPrimary,
    color: tc.green,
    fontWeight: '600' as const,
    fontSize: 15,
  },
  descCard: {
    backgroundColor: tc.cardBg,
    borderWidth: 1,
    borderColor: tc.cardBorder,
    borderLeftWidth: 3,
    borderLeftColor: tc.green,
    borderRadius: 16,
    padding: 14,
  },
  descText: {
    fontFamily: tc.fontSecondary,
    fontSize: 15,
    fontWeight: '700' as const,
    color: tc.textSecondary,
    lineHeight: 20,
  },
  fieldLabel: {
    fontFamily: tc.fontPrimary,
    fontSize: 13,
    letterSpacing: 2,
    color: tc.green,
    fontWeight: '700' as const,
    textTransform: 'uppercase' as const,
  },
  nsInput: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: tc.fontPrimary,
    fontSize: 16,
    color: tc.navy,
  },
  inputWrap: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: tc.cardBg,
    borderWidth: 1,
    borderColor: tc.cardBorder,
    borderRadius: 13,
    overflow: 'hidden' as const,
  },
  inputPencil: {
    fontSize: 15,
    color: tc.green,
    marginRight: 12,
  },
  divider: {
    height: 1,
    backgroundColor: tc.cardBorder,
    marginVertical: 4,
  },
  chipRow: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 6,
    marginBottom: 4,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: tc.cardBorder,
    backgroundColor: tc.cardBg,
  },
  chipSelected: {
    backgroundColor: tc.green,
    borderColor: tc.green,
  },
  chipText: {
    fontFamily: tc.fontPrimary,
    fontSize: 15,
    color: tc.textSecondary,
  },
  chipTextSelected: {
    color: tc.white,
    fontWeight: '700' as const,
  },
  sectionHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    marginBottom: 6,
  },
  sectionTitle: {
    fontFamily: tc.fontPrimary,
    fontSize: 13,
    letterSpacing: 2,
    color: tc.navy,
    fontWeight: '700' as const,
    textTransform: 'uppercase' as const,
  },
  ingredientCountBadge: {
    backgroundColor: tc.cardBg,
    borderWidth: 1,
    borderColor: tc.green,
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  ingredientCountText: {
    fontFamily: tc.fontPrimary,
    fontSize: 13,
    letterSpacing: 0.5,
    color: tc.green,
    fontWeight: '700' as const,
  },
  hintBox: {
    backgroundColor: tc.cream,
    borderWidth: 1,
    borderColor: tc.coral,
    borderRadius: 12,
    padding: 10,
    marginBottom: 4,
    flexDirection: 'row' as const,
    gap: 7,
    alignItems: 'flex-start' as const,
  },
  hintIconWrap: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: 'rgba(74,141,189,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(74,141,189,0.35)',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginTop: 1,
  },
  hintIconText: {
    fontSize: 10,
    color: '#4A8DBD',
    fontWeight: '900' as const,
  },
  hintBoxText: {
    flex: 1,
    fontFamily: tc.fontSecondary,
    fontSize: 15,
    fontWeight: '700' as const,
    color: tc.coral,
    lineHeight: 16,
  },
  ingredientList: {
    gap: 6,
  },
  ingredientRow: {
    backgroundColor: tc.cardBg,
    borderWidth: 1,
    borderColor: tc.cardBorder,
    borderRadius: 13,
    padding: 10,
  },
  ingredientRowEditing: {
    borderColor: 'rgba(61,122,90,0.5)',
    backgroundColor: 'rgba(61,122,90,0.1)',
  },
  ingredientRowDimmed: {
    opacity: 0.45,
  },
  ingRowInner: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
  },
  ingIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: 'rgba(58,140,126,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(58,140,126,0.2)',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  ingIconText: {
    fontSize: 17,
    color: tc.green,
    fontWeight: '700' as const,
  },
  ingName: {
    fontFamily: tc.fontPrimary,
    fontSize: 15,
    color: tc.navy,
  },
  ingWeight: {
    fontFamily: tc.fontPrimary,
    fontSize: 13,
    color: tc.navy,
    marginRight: 4,
  },
  ingDeleteBtn: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: `${tc.coral}1F`,
    borderWidth: 1,
    borderColor: `${tc.coral}38`,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  ingDeleteText: {
    fontSize: 14,
    color: tc.coral,
    fontWeight: '700' as const,
    fontFamily: tc.fontPrimary,
  },
  editingBtnsRow: {
    flexDirection: 'row' as const,
    gap: 8,
  },
  buttonContent: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
  },
  editingLabel: {
    fontFamily: tc.fontPrimary,
    fontSize: 11,
    letterSpacing: 1.5,
    color: tc.green,
    fontWeight: '700' as const,
  },
  doneBtn: {
    flex: 1,
    backgroundColor: tc.green,
    borderRadius: 10,
    paddingVertical: 9,
    alignItems: 'center' as const,
  },
  doneBtnText: {
    fontFamily: tc.fontPrimary,
    fontSize: 14,
    color: tc.white,
    fontWeight: '700' as const,
  },
  addInput: {
    flex: 1,
    fontFamily: tc.fontPrimary,
    fontSize: 15,
    color: tc.navy,
    padding: 0,
    margin: 0,
  },
  addConfirmBtnText: {
    fontFamily: tc.fontPrimary,
    fontSize: 14,
    fontWeight: '700' as const,
    color: tc.white,
  },
  addConfirmBtnTextDisabled: {
    color: `${tc.white}80`,
  },
  addRowExpanded: {
    gap: 10,
    borderWidth: 1,
    borderColor: 'rgba(61,122,90,0.3)',
    borderStyle: 'dashed' as const,
    borderRadius: 13,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(61,122,90,0.04)',
  },
  addRowInputs: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
  },
  addRowLabels: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
    marginBottom: 2,
  },
  addLabel: {
    fontFamily: tc.fontPrimary,
    fontSize: 12,
    fontWeight: '600' as const,
    color: tc.green,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  unitToggle: {
    flexDirection: 'row' as const,
    borderRadius: 8,
    backgroundColor: 'rgba(61,122,90,0.15)',
    padding: 2,
    gap: 2,
  },
  unitBtn: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  unitBtnActive: {
    backgroundColor: tc.white,
  },
  unitBtnText: {
    fontSize: 12,
    fontWeight: '700' as const,
    color: tc.green,
  },
  unitBtnTextActive: {
    color: tc.navy,
  },
  addConfirmBtnFull: {
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: tc.green,
    alignItems: 'center' as const,
  },
  addConfirmBtnDisabled: {
    backgroundColor: `${tc.green}40`,
  },
  hintText: {
    marginTop: 10,
    fontFamily: tc.fontSecondary,
    fontSize: 13,
    color: tc.textMuted,
  },
  labelInfoText: {
    fontFamily: tc.fontPrimary,
    fontSize: 15,
    color: tc.textSecondary,
    fontWeight: '600' as const,
    marginBottom: 12,
  },
  nutritionTable: {
    backgroundColor: tc.cardBg,
    borderWidth: 1,
    borderColor: tc.cardBorder,
    borderRadius: 10,
    paddingVertical: 4,
    paddingHorizontal: 12,
  },
  nutritionRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: tc.separator,
  },
  nutritionKey: {
    fontFamily: tc.fontPrimary,
    fontSize: 15,
    color: tc.textSecondary,
  },
  nutritionVal: {
    fontFamily: tc.fontPrimary,
    fontSize: 15,
    fontWeight: '700' as const,
    color: tc.green,
  },
  bottomBtns: {
    padding: 14,
    gap: 7,
    backgroundColor: tc.bg,
  },
  btnContinue: {
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: tc.green,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  btnContinueText: {
    fontFamily: tc.fontPrimary,
    fontSize: 17,
    letterSpacing: 0.3,
    color: tc.white,
    fontWeight: '700' as const,
  },
  // Total display styles
  totalDisplayRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    backgroundColor: `${tc.green}15`,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginTop: 8,
  },
  totalDisplayLabel: {
    fontFamily: tc.fontPrimary,
    fontSize: 14,
    fontWeight: '600' as const,
    color: tc.green,
    letterSpacing: 1,
  },
  totalDisplayValue: {
    fontFamily: tc.fontPrimary,
    fontSize: 20,
    fontWeight: '700' as const,
    color: tc.navy,
  },
  totalDisplayWarning: {
    color: tc.coral,
  },
  // Dish name directly under the page title
  dishNameRowTop: {
    marginTop: -4,
    marginBottom: 4,
  },
  dishNameTouchable: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingVertical: 6,
  },
  dishNameTitleText: {
    fontFamily: tc.fontPrimary,
    fontSize: 18,
    fontWeight: '700' as const,
    color: tc.navy,
    flex: 1,
  },
  dishNameEditIcon: {
    fontSize: 18,
    color: tc.green,
    marginLeft: 8,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
});
