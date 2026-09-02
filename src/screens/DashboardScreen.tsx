import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  Image,
  ActivityIndicator,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Alert,
} from "react-native";
import {
  useNavigation,
  useRoute,
  useFocusEffect,
} from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import type { AppNavigation, RootStackParamList } from "../types/navigation";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  getMealCaloriesForDate,
  historyTotalsKey,
  historyTotalsSet,
  getUserSettingsCached,
  UserSettingsRecord,
  getLogsForDate,
  classifyTextInput,
  textRebreakdown,
  DASHBOARD_REFRESH_FLAG,
} from "../services/api";
import type { HistoryLogItem } from "../services/api";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useLanguage } from "../context/LanguageContext";
import { useTheme } from "../context/ThemeContext";
import { useDailyLimit, DAILY_SCAN_LIMIT } from "../hooks/useDailyLimit";
import AppIcon from "../components/AppIcon";
import DrinkOptions from "../components/DrinkOptions";
import { isAddedSugarIngredient, type DrinkType } from "../utils/drinkType";

const CALORIE_GOAL = 2200;
const PROTEIN_GOAL = 120;
const CARBS_GOAL = 300;
const FAT_GOAL = 60;
const SODIUM_GOAL = 2300;
const SUGAR_GOAL = 50;
const FIBER_GOAL = 30;
const OFFLINE_UPLOADS_ENABLED = false;

interface FoodLogRow {
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  sodium_mg: number | null;
  sugar_g: number | null;
  fiber_g: number | null;
}

const fmtComma = (n: number) => {
  if (!Number.isFinite(n)) return "0";
  return Math.round(n).toLocaleString();
};

const toLocalDateISO = (date: Date) => {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

export default function DashboardScreen() {
  const navigation = useNavigation<AppNavigation>();
  const route = useRoute<RouteProp<RootStackParamList, 'Dashboard'>>();
  const { session } = useAuth();
  const { t, language } = useLanguage();
  const { colors: C, isDark, mealIcons } = useTheme();
  const styles = useMemo(() => getStyles(C), [C]);
  const { scansToday, scansRemaining, canScan, isAdminBypass, toggleAdminBypass, refresh: refreshDailyLimit } = useDailyLimit();

  useFocusEffect(
    React.useCallback(() => {
      refreshDailyLimit();
    }, [refreshDailyLimit])
  );

  const fetchAuthoritativeTotals = React.useCallback(async (date: Date, userId: string) => {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    const dateISO = `${yyyy}-${mm}-${dd}`;
    
    const { data, error } = await supabase
      .from("food_logs")
      .select("calories, protein_g, carbs_g, fat_g, sodium_mg, sugar_g, fiber_g")
      .eq("user_id", userId)
      .eq("recorded_for_date", dateISO);

    if (error) {
      if (__DEV__) console.warn("[Dashboard] fetchAuthoritativeTotals error", error);
      throw error;
    }

    let calories = 0, protein = 0, carbs = 0, fat = 0, sodium = 0, sugar = 0, fiber = 0;
    for (const row of (data || []) as FoodLogRow[]) {
      calories += Number(row.calories) || 0;
      protein += Number(row.protein_g) || 0;
      carbs += Number(row.carbs_g) || 0;
      fat += Number(row.fat_g) || 0;
      sodium += Number(row.sodium_mg) || 0;
      sugar += Number(row.sugar_g) || 0;
      fiber += Number(row.fiber_g) || 0;
    }
    const result = { calories, protein, carbs, fat, sodium, sugar, fiber };
    
    // update HistoryDates in-memory cache for the same date
    const key = historyTotalsKey(userId, dateISO);
    historyTotalsSet(key, calories);
    
    return result;
  }, []);

  const [totals, setTotals] = useState({
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
    sodium: 0,
    sugar: 0,
    fiber: 0,
  });
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const selectedDateISO = toLocalDateISO(selectedDate);
  const currentDashboardScopeRef = useRef({
    userId: session?.user?.id ?? null,
    dateISO: selectedDateISO,
  });
  currentDashboardScopeRef.current = {
    userId: session?.user?.id ?? null,
    dateISO: selectedDateISO,
  };
  const mealItemsRequestIdsRef = useRef<Record<"breakfast" | "lunch" | "dinner" | "snack", number>>({
    breakfast: 0,
    lunch: 0,
    dinner: 0,
    snack: 0,
  });
  const [mealCalories, setMealCalories] = useState<
    Record<"breakfast" | "lunch" | "dinner" | "snack", number | undefined>
  >({
    breakfast: undefined,
    lunch: undefined,
    dinner: undefined,
    snack: undefined,
  });
  const [refreshState, setRefreshState] = useState<
    "idle" | "loading" | "done" | "error"
  >("idle");
  const [settings, setSettings] = useState<UserSettingsRecord | null>(null);
  const [showSetupBanner, setShowSetupBanner] = useState(false);
  const [offlinePhotos, setOfflinePhotos] = useState<
    Array<{
      imageUri: string;
      mealType?: string | null;
      recordedDateISO?: string | null;
    }>
  >([]);
  const [analyzingIdx, setAnalyzingIdx] = useState<number | null>(null);
  const [expanded, setExpanded] = useState<
    Partial<Record<"breakfast" | "lunch" | "dinner" | "snack", boolean>>
  >({});
  const [mealItems, setMealItems] = useState<
    Record<"breakfast" | "lunch" | "dinner" | "snack", HistoryLogItem[]>
  >({ breakfast: [], lunch: [], dinner: [], snack: [] });
  const [mealItemsLoading, setMealItemsLoading] = useState<
    Partial<Record<"breakfast" | "lunch" | "dinner" | "snack", boolean>>
  >({});
  const [showUploadChoice, setShowUploadChoice] = useState<{
    meal: "breakfast" | "lunch" | "dinner" | "snack";
    visible: boolean;
    recordedDateISO: string;
  } | null>(null);
  const [pendingUploadCtx, setPendingUploadCtx] = useState<{
    meal?: "breakfast" | "lunch" | "dinner" | "snack";
    recordedDateISO?: string;
  } | null>(null);
  const [showTextModal, setShowTextModal] = useState(false);
  const [textPrompt, setTextPrompt] = useState("");
  const [textPhase, setTextPhase] = useState<"input" | "loading" | "drink" | "error">("input");
  const [textError, setTextError] = useState("");
  const [drinkSugarLevel, setDrinkSugarLevel] = useState<number | null>(null);
  const [drinkBaseType, setDrinkBaseType] = useState<DrinkType | null>(null);
  const textAbortControllerRef = useRef<AbortController | null>(null);
  const textPhaseRef = useRef<"input" | "loading" | "drink" | "error">("input");

  useEffect(() => {
    return () => {
      textAbortControllerRef.current?.abort();
    };
  }, []);
  const [pendingTextBreakdown, setPendingTextBreakdown] = useState<{
    query: string;
    cachedBreakdown: any;
  } | null>(null);

  const adminTapCountRef = useRef(0);
  const adminTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (adminTapTimerRef.current) clearTimeout(adminTapTimerRef.current);
    };
  }, []);

  const setPhaseAndRef = (phase: "input" | "loading" | "drink" | "error") => {
    textPhaseRef.current = phase;
    setTextPhase(phase);
  };

  const handleCloseTextModal = () => {
    if (textPhaseRef.current === "loading") return;
    setShowTextModal(prev => {
      if (textPhaseRef.current === "loading") return prev;
      return false;
    });
  };

  useEffect(() => {
    setTotals({ calories: 0, protein: 0, carbs: 0, fat: 0, sodium: 0, sugar: 0, fiber: 0 });
    setLoading(false);
    setMealCalories({ breakfast: undefined, lunch: undefined, dinner: undefined, snack: undefined });
    setRefreshState("idle");
    setSettings(null);
    setShowSetupBanner(false);
    setMealItems({ breakfast: [], lunch: [], dinner: [], snack: [] });
    setMealItemsLoading({});
    setExpanded({});
    setOfflinePhotos([]);
    setAnalyzingIdx(null);
    setShowUploadChoice(null);
    setPendingUploadCtx(null);
    setShowTextModal(false);
    setTextPrompt("");
    setPhaseAndRef("input");
    setTextError("");
    setDrinkSugarLevel(null);
    setDrinkBaseType(null);
    setPendingTextBreakdown(null);
    for (const meal of ["breakfast", "lunch", "dinner", "snack"] as const) {
      mealItemsRequestIdsRef.current[meal] += 1;
    }
  }, [session?.user?.id]);

  const confirmSuspectedSubstance = (
    substance: "alcohol" | "drugs",
  ): Promise<"alcohol" | "drugs" | null> =>
    new Promise((resolve) => {
      let settled = false;
      const finish = (value: "alcohol" | "drugs" | null) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };
      Alert.alert(
        t(`mealCapture.${substance}ConfirmationTitle`),
        t(`mealCapture.${substance}ConfirmationBody`),
        [
          { text: t("mealCapture.substanceNo"), style: "cancel", onPress: () => finish(null) },
          { text: t("mealCapture.substanceYes"), onPress: () => finish(substance) },
        ],
        { cancelable: true, onDismiss: () => finish(null) },
      );
    });

  const runTextBreakdown = async () => {
    const q = textPrompt.trim();
    const userId = session?.user?.id;
    if (!q || !userId) return;
    const isCurrentUser = () => currentDashboardScopeRef.current.userId === userId;
    setPhaseAndRef("loading");
    setTextError("");
    const controller = new AbortController();
    textAbortControllerRef.current = controller;
    try {
      const { data } = await supabase.auth.getSession();
      const accessToken = data?.session?.access_token;
      const classification = await classifyTextInput(accessToken, q);
      const suspectedSubstance = classification.suspected_substance;
      const substanceConfidence = classification.substance_confidence;
      const shouldConfirm =
        (suspectedSubstance === "alcohol" || suspectedSubstance === "drugs") &&
        (substanceConfidence === "medium" || substanceConfidence === "high");
      const confirmedSubstance = shouldConfirm
        ? await confirmSuspectedSubstance(suspectedSubstance)
        : null;
      const res = await textRebreakdown(accessToken, {
        dish_name: q,
        components: [],
        is_drink: classification.food_type === "drink",
        confirmed_substance: confirmedSubstance || undefined,
        excluded_substance: shouldConfirm && !confirmedSubstance ? suspectedSubstance : undefined,
        language,
        adminBypass: isAdminBypass,
        signal: controller.signal,
      });
      const itemsDetailed = (res.items_detailed || []).filter(
        (it) => (it.name || "").trim().length > 0,
      );
      if (__DEV__) {
        console.log("[Dashboard] Text substance classification:", {
          suspectedSubstance,
          substanceConfidence,
          confirmedSubstance,
        });
      }
      const cachedBreakdown = {
        dish_name: res.dish_name || q,
        food_breakdown: res.food_breakdown || "",
        items: res.items || itemsDetailed.map((it) => it.name),
        items_detailed: itemsDetailed,
        is_drink: res.is_drink ?? false,
        portion_confidence: res.portion_confidence || "medium",
        originalFoodItems: [],
        originalAnalysis: {},
      };
      if (controller.signal.aborted) return;
      if (!isCurrentUser()) return;
      if (cachedBreakdown.is_drink) {
        setPendingTextBreakdown({ query: q, cachedBreakdown });
        setPhaseAndRef("drink");
        return;
      }
      setShowTextModal(false);
      setTextPrompt("");
      setPhaseAndRef("input");
      setTextError("");
      setPendingUploadCtx(null);
      setPendingTextBreakdown(null);
      navigation.navigate("BreakdownConfirm", {
        imageUri: "",
        mealType: pendingUploadCtx?.meal,
        recordedDateISO: pendingUploadCtx?.recordedDateISO,
        query: q,
        foodType: classification.food_type,
        cachedBreakdown,
        hasEditedIngredients: false,
        isTextAnalysis: true,
        confirmedSubstance,
      });
    } catch (e: any) {
      if (controller.signal.aborted) return;
      if (!isCurrentUser()) return;
      setPhaseAndRef("error");
      setTextError(e?.message || t("common.error"));
    }
  };

  const handleContinueTextDrink = () => {
    if (!session?.user?.id || !pendingTextBreakdown) return;
    const { query, cachedBreakdown } = pendingTextBreakdown;
    const itemsDetailed = drinkSugarLevel === 0
      ? (cachedBreakdown.items_detailed || []).filter(
          (item: { name?: string }) => !isAddedSugarIngredient(item.name || ""),
        )
      : cachedBreakdown.items_detailed;
    const items = drinkSugarLevel === 0
      ? (cachedBreakdown.items || []).filter(
          (item: string) => !isAddedSugarIngredient(item),
        )
      : cachedBreakdown.items;

    setShowTextModal(false);
    setTextPrompt("");
    setPhaseAndRef("input");
    setTextError("");
    setPendingTextBreakdown(null);
    setPendingUploadCtx(null);
    navigation.navigate("BreakdownConfirm", {
      imageUri: "",
      mealType: pendingUploadCtx?.meal,
      recordedDateISO: pendingUploadCtx?.recordedDateISO,
      query,
      cachedBreakdown: { ...cachedBreakdown, items, items_detailed: itemsDetailed },
      foodType: "drink",
      sugarLevel: drinkSugarLevel,
      drinkType: drinkBaseType as DrinkType | null,
      hasEditedIngredients: false,
      isTextAnalysis: true,
    });
  };


  // One-tap refresh: refetch today's totals and per-meal, and update HistoryDates cache
  const handleRefreshToday = React.useCallback(async () => {
    if (refreshState === "loading") return;
    const userId = session?.user?.id;
    const dateISO = selectedDateISO;
    if (!userId) return;

    const isActiveScope = () =>
      currentDashboardScopeRef.current.userId === userId &&
      currentDashboardScopeRef.current.dateISO === dateISO;

    setRefreshState("loading");
    try {
      const result = await fetchAuthoritativeTotals(selectedDate, userId);
      if (!isActiveScope()) return;
      setTotals(result);

      const perMeal = await getMealCaloriesForDate(userId, selectedDate);
      if (!isActiveScope()) return;
      setMealCalories(perMeal);

      setRefreshState("done");
      setTimeout(() => {
        if (isActiveScope()) setRefreshState("idle");
      }, 1200);
    } catch (e) {
      if (__DEV__) console.warn("[Dashboard] handleRefreshToday failed", e);
      if (isActiveScope()) setRefreshState("error");
    }
  }, [session?.user?.id, selectedDate, selectedDateISO, refreshState, fetchAuthoritativeTotals]);

  // When coming back from Results, apply the just-logged meal calories
  useFocusEffect(
    React.useCallback(() => {
      const params = route.params;
      if (
        params?.lastLoggedMeal?.mealType &&
        typeof params?.lastLoggedMeal?.calories === "number"
      ) {
        const { mealType, calories } = params.lastLoggedMeal;
        // Optimistic UI
        setMealCalories((prev) => ({
          ...prev,
          [mealType]: (prev[mealType] ?? 0) + calories,
        }));
        setTotals((prev) => ({
          ...prev,
          calories: (prev.calories ?? 0) + calories,
        }));
        // Fetch authoritative totals/per-meal
        handleRefreshToday();
        // Clear the param so it doesn't re-apply
        navigation.setParams({ lastLoggedMeal: undefined });
      }
      return () => {};
    }, [route.params, navigation, handleRefreshToday]),
  );

  // When coming back from HistoryDetail after edit/delete/analyze, refresh totals
  useFocusEffect(
    React.useCallback(() => {
      (async () => {
        try {
          const flag = await AsyncStorage.getItem(DASHBOARD_REFRESH_FLAG);
          if (flag === "1") {
            await AsyncStorage.removeItem(DASHBOARD_REFRESH_FLAG);
            handleRefreshToday();
          }
        } catch (e) {
          if (__DEV__) console.warn("[Dashboard] Failed to read refresh flag", e);
        }
      })();
      return () => {};
    }, [handleRefreshToday]),
  );

  // Load offline photos on focus
  useFocusEffect(
    React.useCallback(() => {
      if (!OFFLINE_UPLOADS_ENABLED) return () => {};
      (async () => {
        try {
          const raw = await AsyncStorage.getItem("manual_pending_photos");
          const arr: Array<{
            imageUri: string;
            mealType?: string | null;
            recordedDateISO?: string | null;
          }> = raw ? JSON.parse(raw) : [];
          setOfflinePhotos(Array.isArray(arr) ? arr : []);
        } catch (e) {
          if (__DEV__)
            console.warn("[Dashboard] Failed to load offline photos", e);
          setOfflinePhotos([]);
        }
      })();
      return () => {};
    }, []),
  );

  // Build date scroller: 7 days before today to today (local timezone, normalized to local midnight)
  const dateItems = useMemo(() => {
    const items: Date[] = [];
    const base = new Date();
    base.setHours(0, 0, 0, 0);
    for (let i = -7; i <= 0; i++) {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      d.setHours(0, 0, 0, 0);
      items.push(d);
    }
    return items;
  }, []);

  // Ref for date scroller to snap to the rightmost (today)
  const dateScrollRef = useRef<ScrollView | null>(null);

  useEffect(() => {
    const userId = session?.user?.id;
    const dateISO = selectedDateISO;
    let isCurrent = true;
    const isActiveScope = () =>
      isCurrent &&
      currentDashboardScopeRef.current.userId === userId &&
      currentDashboardScopeRef.current.dateISO === dateISO;

    if (!userId) {
      setTotals({ calories: 0, protein: 0, carbs: 0, fat: 0, sodium: 0, sugar: 0, fiber: 0 });
      setLoading(false);
      return () => {
        isCurrent = false;
      };
    }

    setLoading(true);
    (async () => {
      try {
        const result = await fetchAuthoritativeTotals(selectedDate, userId);
        if (isActiveScope()) setTotals(result);
      } catch (e) {
        if (__DEV__)
          console.warn("[Dashboard] Failed to load authoritative totals", e);
        // Preserve existing totals rather than overwriting with potentially stale zeros.
      } finally {
        if (isActiveScope()) setLoading(false);
      }
    })();

    return () => {
      isCurrent = false;
    };
  }, [session?.user?.id, selectedDate, selectedDateISO, fetchAuthoritativeTotals]);

  useEffect(() => {
    setMealItems({ breakfast: [], lunch: [], dinner: [], snack: [] });
    setExpanded({});
    setMealItemsLoading({});
    for (const meal of ["breakfast", "lunch", "dinner", "snack"] as const) {
      mealItemsRequestIdsRef.current[meal] += 1;
    }
  }, [session?.user?.id, selectedDateISO]);

  useEffect(() => {
    const userId = session?.user?.id;
    const dateISO = selectedDateISO;
    let isCurrent = true;
    const isActiveScope = () =>
      isCurrent &&
      currentDashboardScopeRef.current.userId === userId &&
      currentDashboardScopeRef.current.dateISO === dateISO;

    if (!userId) {
      setSettings(null);
      setShowSetupBanner(false);
      setMealCalories({ breakfast: undefined, lunch: undefined, dinner: undefined, snack: undefined });
      return () => {
        isCurrent = false;
      };
    }

    (async () => {
      try {
        const s = await getUserSettingsCached(userId, { refresh: true });
        const deferStr = await AsyncStorage.getItem(
          "defer_user_questionnaire_until",
        );
        if (isActiveScope()) {
          const now = Date.now();
          const deferUntil = deferStr ? Date.parse(deferStr) : 0;
          setSettings(s);
          setShowSetupBanner(!s && (!deferUntil || now >= deferUntil));
        }
      } catch (e) {
        if (__DEV__) console.warn("[Dashboard] Failed to load user settings", e);
      }
      try {
        const perMeal = await getMealCaloriesForDate(userId, selectedDate);
        if (isActiveScope()) setMealCalories(perMeal);
      } catch (e) {
        if (__DEV__) console.warn("[Dashboard] Failed to load per-meal calories", e);
      }
    })();

    return () => {
      isCurrent = false;
    };
  }, [session?.user?.id, selectedDate, selectedDateISO]);

  // Progress vs user targets
  const targets = useMemo(
    () => ({
      calories: settings?.calorie_target || CALORIE_GOAL,
      protein: settings?.protein_target_g || PROTEIN_GOAL,
      carbs: settings?.carb_target_g || CARBS_GOAL,
      fat: settings?.fat_target_g || FAT_GOAL,
      sodium: settings?.sodium_target_mg || SODIUM_GOAL,
      sugar: settings?.sugar_target_g || SUGAR_GOAL,
      fiber: settings?.fiber_target_g || FIBER_GOAL,
    }),
    [settings],
  );

  const calPct = targets.calories > 0 ? Math.round((totals.calories / targets.calories) * 100) : 0;
  const calBarColor = calPct >= 100 ? C.coral : calPct >= 85 ? C.lime : C.navy;

  const macroItems = useMemo(() => [
    { key: 'carbs', label: t('dashboard.carbs'), value: totals.carbs, goal: targets.carbs, color: C.green, unit: 'g' },
    { key: 'protein', label: t('dashboard.protein'), value: totals.protein, goal: targets.protein, color: C.lime, unit: 'g' },
    { key: 'fat', label: t('dashboard.fat'), value: totals.fat, goal: targets.fat, color: C.navy, unit: 'g' },
    { key: 'fiber', label: t('dashboard.fiber'), value: totals.fiber, goal: targets.fiber, color: C.green, unit: 'g' },
  ], [totals, targets, t, C]);

  const microItems = useMemo(() => [
    { key: 'sodium', label: t('dashboard.sodium'), value: totals.sodium, goal: targets.sodium, color: C.lime, unit: 'mg' },
    { key: 'sugar', label: t('dashboard.sugar'), value: totals.sugar, goal: targets.sugar, color: C.navy, unit: 'g' },
  ], [totals, targets, t, C]);

  const dateLabel = useMemo(() => {
    const isToday = selectedDate.toDateString() === new Date().toDateString();
    const dayName = selectedDate.toLocaleString(language, { weekday: "long" });
    const monthName = selectedDate.toLocaleString(language, { month: "long" });
    const dayNum = selectedDate.getDate();
    return `${isToday ? t('dashboard.today') + ', ' : ""}${dayName}, ${monthName} ${dayNum}`;
  }, [selectedDate, language, t]);

  const dailyTip = useMemo(() => {
    const sodPct = targets.sodium > 0 ? (totals.sodium / targets.sodium) * 100 : 0;
    const protPct = targets.protein > 0 ? (totals.protein / targets.protein) * 100 : 0;
    const fibPct = targets.fiber > 0 ? (totals.fiber / targets.fiber) * 100 : 0;
    if (totals.calories === 0) return t('dashboard.tipNoMeals');
    if (sodPct >= 100) return t('dashboard.tipSodiumHigh', { sodium: fmtComma(Math.round(totals.sodium)) });
    if (protPct >= 90) return t('dashboard.tipProteinGreat', { protein: String(Math.round(totals.protein)) });
    if (totals.calories < targets.calories * 0.4) return t('dashboard.tipLightDay');
    if (fibPct >= 80) return t('dashboard.tipFiberGood', { fiber: String(Math.round(totals.fiber)) });
    if (sodPct >= 85) return t('dashboard.tipSodiumWarning', { sodium: fmtComma(Math.round(totals.sodium)) });
    return t('dashboard.tipDefault');
  }, [totals, targets, t]);

  const handleAnalyzeOffline = React.useCallback(
    async (idx: number) => {
      if (analyzingIdx !== null) return;
      const item = offlinePhotos[idx];
      if (!item) return;
      setAnalyzingIdx(idx);
      try {
        // Navigate to loading screen which will handle analysis & routing to Results
        const yyyy = selectedDate.getFullYear();
        const mm = String(selectedDate.getMonth() + 1).padStart(2, "0");
        const dd = String(selectedDate.getDate()).padStart(2, "0");
        const recordedDateISO = item.recordedDateISO || `${yyyy}-${mm}-${dd}`;
        navigation.navigate("AnalysisLoading", {
          imageUri: item.imageUri,
          mealType: (item.mealType as "breakfast" | "lunch" | "dinner" | "snack") || undefined,
          recordedDateISO,
        });

        // Remove the analyzed item from the offline queue only AFTER navigation succeeds
        // This prevents data loss in case the app drops data or navigation fails
        const next = offlinePhotos.slice();
        next.splice(idx, 1);
        setOfflinePhotos(next);
        try {
          await AsyncStorage.setItem(
            "manual_pending_photos",
            JSON.stringify(next),
          );
        } catch {}
      } catch (e) {
        if (__DEV__)
          console.error("[Dashboard] navigate to AnalysisLoading failed", e);
      } finally {
        setAnalyzingIdx(null);
      }
    },
    [offlinePhotos, analyzingIdx, selectedDate, navigation],
  );

  const toggleMealExpand = React.useCallback(
    async (meal: "breakfast" | "lunch" | "dinner" | "snack") => {
      const isExpanding = !expanded[meal];
      setExpanded((prev) => ({ ...prev, [meal]: isExpanding }));
      const requestId = ++mealItemsRequestIdsRef.current[meal];
      if (!isExpanding) {
        setMealItemsLoading((prev) => ({ ...prev, [meal]: false }));
        return;
      }

      const userId = session?.user?.id;
      const dateISO = selectedDateISO;
      if (!userId || (mealItems[meal] && mealItems[meal].length > 0)) return;

      const isActiveRequest = () =>
        mealItemsRequestIdsRef.current[meal] === requestId &&
        currentDashboardScopeRef.current.userId === userId &&
        currentDashboardScopeRef.current.dateISO === dateISO;

      setMealItemsLoading((prev) => ({ ...prev, [meal]: true }));
      try {
        const logs = await getLogsForDate(userId, dateISO);
        const filtered = logs.filter((l) => (l.meal_type || "snack") === meal);
        if (isActiveRequest()) {
          setMealItems((prev) => ({ ...prev, [meal]: filtered }));
        }
      } catch (e) {
        if (__DEV__) console.warn("[Dashboard] Failed to load meal items", e);
      } finally {
        if (isActiveRequest()) {
          setMealItemsLoading((prev) => ({ ...prev, [meal]: false }));
        }
      }
    },
    [session?.user?.id, selectedDateISO, expanded, mealItems],
  );

  return (
    <SafeAreaView style={styles.screenSafe} edges={["top"]}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.headerTitle}>{t('dashboard.todaysNutrition')}</Text>
            <Text style={styles.headerDate}>{dateLabel}</Text>
          </View>
          <View style={styles.headerIcons}>
            <TouchableOpacity
              onPress={() => navigation.navigate("HistoryDates")}
              accessibilityLabel={t('history.title')}
              style={styles.headerIconBtn}
            >
              <Image
                source={require("../../assets/history.png")}
                style={styles.headerIconImg}
              />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => navigation.navigate("Settings")}
              accessibilityLabel={t('settings.title')}
              style={styles.headerIconBtn}
            >
              <Image
                source={require("../../assets/settings.png")}
                style={styles.headerIconImg}
              />
            </TouchableOpacity>
          </View>
        </View>

        {/* Date strip */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.dateStrip}
          ref={dateScrollRef}
          onLayout={() =>
            dateScrollRef.current?.scrollToEnd({ animated: false })
          }
        >
          {dateItems.map((d) => {
            const active =
              d.toDateString() === new Date(selectedDate).toDateString();
            const dow = d.toLocaleString(language, { weekday: "short" });
            const dom = String(d.getDate());
            const yyyy = d.getFullYear();
            const mm = String(d.getMonth() + 1).padStart(2, "0");
            const dd = String(d.getDate()).padStart(2, "0");
            const localKey = `${yyyy}-${mm}-${dd}`;
            return (
              <TouchableOpacity
                key={localKey}
                onPress={() => {
                  const nd = new Date(d);
                  nd.setHours(0, 0, 0, 0);
                  setSelectedDate(nd);
                }}
              >
                <View
                  style={[styles.datePill, active && styles.datePillActive]}
                >
                  <Text
                    style={[styles.dateDow, active && styles.dateDowActive]}
                  >
                    {dow}
                  </Text>
                  <Text
                    style={[styles.dateDom, active && styles.dateDomActive]}
                  >
                    {dom}
                  </Text>
                  <View
                    style={[styles.dateDot, active && styles.dateDotActive]}
                  />
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Daily Scan Counter */}
        <TouchableOpacity
          style={styles.scanCounterCard}
          onPress={() => {
            // Triple tap to toggle admin bypass (dev only)
            if (!__DEV__) return;

            adminTapCountRef.current += 1;
            if (adminTapTimerRef.current) {
              clearTimeout(adminTapTimerRef.current);
            }

            if (adminTapCountRef.current >= 3) {
              adminTapCountRef.current = 0;
              toggleAdminBypass();
            } else {
              adminTapTimerRef.current = setTimeout(() => {
                adminTapCountRef.current = 0;
              }, 1000);
            }
          }}
          activeOpacity={0.8}
        >
          <View style={styles.scanCounterLeft}>
            <Text style={styles.scanCounterTitle}>
              {t('dashboard.dailyScans')}
              {isAdminBypass && __DEV__ && ' (ADMIN)'}
            </Text>
            <View style={[styles.scanBadge, isAdminBypass && __DEV__ && styles.scanBadgeAdmin]}>
              <Text style={styles.scanBadgeText}>{scansToday} / {DAILY_SCAN_LIMIT}</Text>
            </View>
          </View>
          <View style={styles.scanCounterRight}>
            <Text style={styles.scanRemainingText}>
              {isAdminBypass && __DEV__ 
                ? 'Unlimited (Admin Mode)' 
                : scansRemaining > 0 
                  ? t('dashboard.scansLeft', { count: scansRemaining })
                  : t('dashboard.limitReached')}
            </Text>
          </View>
        </TouchableOpacity>

        {/* Setup banner */}
        {showSetupBanner && (
          <View style={styles.setupBanner}>
            <Text style={styles.setupBannerText}>
              {t('dashboard.completeGoalsMessage')}
            </Text>
            <View style={styles.bannerBtnRow}>
              <TouchableOpacity
                style={styles.bannerBtnCard}
                onPress={() => navigation.navigate("UserQuestionnaire")}
              >
                <Text style={styles.bannerBtnCardText}>
                  {t('dashboard.completeGoals')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.bannerBtnLater}
                onPress={async () => {
                  const d = new Date();
                  d.setDate(d.getDate() + 7);
                  try {
                    await AsyncStorage.setItem(
                      "defer_user_questionnaire_until",
                      d.toISOString(),
                    );
                  } catch (e) {
                    if (__DEV__) console.warn("[Dashboard] Failed to defer questionnaire", e);
                  }
                  setShowSetupBanner(false);
                }}
              >
                <Text style={styles.bannerBtnLaterText}>
                  {t('dashboard.later')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Calories card */}
        <View style={styles.calCard}>
          <View style={styles.calHeader}>
            <Text style={styles.sectionLabel}>{t('macros.calories').toUpperCase()}</Text>
            <TouchableOpacity
              onPress={handleRefreshToday}
              disabled={refreshState === "loading"}
            >
              {refreshState === "loading" ? (
                <ActivityIndicator size="small" color={C.lime} />
              ) : refreshState === "error" ? (
                <Text style={styles.refreshErrorText}>{t('dashboard.retry')}</Text>
              ) : refreshState === "done" ? (
                <Text style={styles.refreshDoneText}>✓</Text>
              ) : (
                <Text style={styles.refreshText}>{t('dashboard.refresh')}</Text>
              )}
            </TouchableOpacity>
          </View>
          <View style={styles.calRow}>
            <Text style={[styles.calNum, calPct >= 100 && { color: C.coral }]}>
              {fmtComma(Math.round(totals.calories))}
            </Text>
            <View style={styles.calRemainCol}>
              <Text style={styles.calRemainNum}>
                {fmtComma(Math.max(0, Math.round(targets.calories - totals.calories)))}
              </Text>
              <Text style={styles.calRemainLabel}>{t('dashboard.remaining')}</Text>
            </View>
          </View>
          <View style={styles.barTrack}>
            <View
              style={[
                styles.barFill,
                {
                  width: `${Math.min(calPct, 100)}%`,
                  backgroundColor: calBarColor,
                },
              ]}
            />
          </View>
          <View style={styles.calFoot}>
            <Text style={styles.calFootText}>0</Text>
            <Text style={styles.calFootText}>
              {t('dashboard.goalLabel', { goal: fmtComma(targets.calories) })}
            </Text>
          </View>
        </View>

        {/* Macros grid (2×2) */}
        <View style={styles.macrosGrid}>
          {macroItems.map((m) => {
            const val = Math.round(m.value);
            const goalVal = Math.round(m.goal);
            const pctVal = goalVal > 0 ? Math.round((m.value / m.goal) * 100) : 0;
            const exceeded = pctVal > 100;
            const barColor = exceeded ? C.coral : m.color;
            return (
              <View key={m.key} style={styles.macroCard}>
                <View style={styles.macroTop}>
                  <Text style={styles.macroName}>{m.label.toUpperCase()}</Text>
                  <Text style={[styles.macroPct, exceeded && { color: C.coral }]}>
                    {pctVal}%
                  </Text>
                </View>
                <Text style={[styles.macroVal, { color: exceeded ? C.coral : m.color }]}>
                  {val}{m.unit}
                </Text>
                <Text style={styles.macroGoal}>of {goalVal}{m.unit}</Text>
                <View style={styles.macroBarTrack}>
                  <View
                    style={[
                      styles.macroBarFill,
                      {
                        width: `${Math.min(pctVal, 100)}%`,
                        backgroundColor: barColor,
                      },
                    ]}
                  />
                </View>
              </View>
            );
          })}
        </View>

        {/* Micronutrients card */}
        <View style={styles.microsCard}>
          <Text style={styles.sectionLabel}>{t('dashboard.micronutrients').toUpperCase()}</Text>
          {microItems.map((m) => {
            const val = Math.round(m.value);
            const pctVal = m.goal > 0 ? Math.round((m.value / m.goal) * 100) : 0;
            const exceeded = pctVal > 100;
            const barColor = exceeded ? C.coral : m.color;
            return (
              <View key={m.key} style={styles.microRow}>
                <Text style={styles.microLabel}>{m.label}</Text>
                <View style={styles.microBarWrap}>
                  <View style={styles.microTrack}>
                    <View
                      style={[
                        styles.microFill,
                        {
                          width: `${Math.min(pctVal, 100)}%`,
                          backgroundColor: barColor,
                        },
                      ]}
                    />
                  </View>
                </View>
                <View style={styles.microValWrap}>
                  <Text style={[styles.microValText, exceeded && { color: C.coral }]}>
                    {fmtComma(val)}{m.unit}
                  </Text>
                  {pctVal >= 90 && <Text style={styles.microWarnIcon}>⚠</Text>}
                </View>
              </View>
            );
          })}
        </View>

        {/* Feedback banner */}
        <TouchableOpacity
          style={styles.feedbackBanner}
          onPress={() => navigation.navigate("GeneralFeedback")}
          activeOpacity={0.7}
        >
          <View style={styles.feedbackTextContainer}>
            <Text style={styles.refreshText}>{t('dashboard.feedback')}</Text>
            <Text style={styles.feedbackSubtitle}>{t('dashboard.feedbackMessage')}</Text>
          </View>
          <Text style={styles.feedbackChevron}>›</Text>
        </TouchableOpacity>

        {/* Meals card */}
        <View style={styles.mealsCard}>
          <View style={styles.mealsHeaderRow}>
            <Text style={styles.mealsHeaderText}>{t('dashboard.todaysMeals').toUpperCase()}</Text>
          </View>
          {[
            { key: "breakfast" as const, label: t('dashboard.breakfast') },
            { key: "lunch" as const, label: t('dashboard.lunch') },
            { key: "dinner" as const, label: t('dashboard.dinner') },
            { key: "snack" as const, label: t('dashboard.snack') },
          ].map((m) => (
            <View key={m.key} style={{ width: "100%" }}>
              <View style={styles.mealRow}>
                <TouchableOpacity
                  style={styles.mealRowPressable}
                  onPress={() => toggleMealExpand(m.key)}
                >
                  <Image
                    source={mealIcons[m.key]}
                    style={styles.mealIconImg}
                  />
                  <View style={styles.mealTextContainer}>
                    <View style={styles.mealLabelRow}>
                      <Text style={styles.mealLabel}>{m.label}</Text>
                      {typeof mealCalories[m.key] === "number" ? (
                        <Text style={styles.mealCaloriesRow}>
                          {mealCalories[m.key]} {t('macros.calories')}
                        </Text>
                      ) : (
                        <Text style={styles.mealCaloriesRow}>
                          {t('dashboard.notUploaded')}
                        </Text>
                      )}
                      <TouchableOpacity
                        onPress={() => toggleMealExpand(m.key)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Text style={styles.chevronOffset}>
                          {expanded[m.key] ? "⌄" : "›"}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.uploadBtn}
                  onPress={() => {
                    if (!canScan) {
                      Alert.alert(
                        t('dashboard.scanLimitAlertTitle'),
                        t('dashboard.scanLimitAlertBody', { limit: DAILY_SCAN_LIMIT }),
                        [{ text: t('dashboard.scanLimitAlertBtn') }],
                      );
                      return;
                    }
                    const yyyy = selectedDate.getFullYear();
                    const mm = String(selectedDate.getMonth() + 1).padStart(2, "0");
                    const dd = String(selectedDate.getDate()).padStart(2, "0");
                    const recordedDateISO = `${yyyy}-${mm}-${dd}`;
                    setShowUploadChoice({ meal: m.key, visible: true, recordedDateISO });
                  }}
                >
                  <Text style={styles.uploadText}>{t('dashboard.upload')}</Text>
                </TouchableOpacity>
              </View>
              {expanded[m.key] && (
                <View style={styles.expandSection}>
                  {mealItemsLoading[m.key] ? (
                    <ActivityIndicator
                      size="small"
                      color={C.cream}
                      style={styles.listLoader}
                    />
                  ) : mealItems[m.key] && mealItems[m.key].length > 0 ? (
                    mealItems[m.key].map((item) => (
                      <TouchableOpacity
                        key={item.id}
                        style={styles.itemRow}
                        onPress={() =>
                          navigation.navigate("HistoryDetail", { logId: item.id })
                        }
                      >
                        {item.image_url ? (
                          <Image source={{ uri: item.image_url }} style={styles.itemThumb} />
                        ) : (
                          <View style={styles.itemThumbFallback} />
                        )}
                        <View style={styles.itemInfo}>
                          <Text style={styles.itemTitle} numberOfLines={1}>
                            {item.title || t('dashboard.unidentifiedFood')}
                          </Text>
                          <Text style={styles.itemMeta}>
                            {Math.round(item.calories)} {t('macros.calories')}
                          </Text>
                        </View>
                        <Text style={styles.chevron}>›</Text>
                      </TouchableOpacity>
                    ))
                  ) : (
                    <Text style={styles.emptyText}>{t('dashboard.noRecord')}</Text>
                  )}
                </View>
              )}
            </View>
          ))}
        </View>

        {/* Daily insight tip — Nori bubble */}
        <View style={styles.tipBubble}>
          <Image source={require("../../assets/mascot.png")} style={styles.tipAvatar} />
          <View style={styles.tipContent}>
            <Text style={styles.tipTitle}>{t('dashboard.dailyInsight')}</Text>
            <Text style={styles.tipText}>{dailyTip}</Text>
          </View>
        </View>

        {OFFLINE_UPLOADS_ENABLED && (
          <View style={styles.mealsCard}>
            <View style={styles.mealsHeaderRow}>
              <Text style={styles.mealsHeaderText}>{t('dashboard.offlineUpload').toUpperCase()}</Text>
            </View>
            {offlinePhotos.length === 0 ? (
              <Text style={styles.offlineEmptyText}>
                {t('dashboard.noOfflineUploads')}
              </Text>
            ) : (
              offlinePhotos.map((p, idx) => (
                <View
                  key={`${p.imageUri}-${idx}`}
                  style={styles.mealRow}
                >
                  {p.imageUri ? (
                    <Image source={{ uri: p.imageUri }} style={styles.offlineThumb} />
                  ) : (
                    <View style={styles.offlineThumbFallback} />
                  )}
                  <View style={styles.offlineItemInfo}>
                    <Text style={styles.mealLabel} numberOfLines={1}>
                      {`${p.recordedDateISO || t('dashboard.noDate')} · ${
                        p.mealType === "breakfast"
                          ? t("dashboard.breakfast")
                          : p.mealType === "lunch"
                            ? t("dashboard.lunch")
                            : p.mealType === "dinner"
                              ? t("dashboard.dinner")
                              : p.mealType === "snack"
                                ? t("dashboard.snack")
                                : t("dashboard.unspecifiedMeal")
                      }`}
                    </Text>
                    <Text style={styles.mealCalories} numberOfLines={1}>
                      {t("dashboard.offlinePhoto")}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.uploadBtn, analyzingIdx === idx && { opacity: 0.7 }]}
                    onPress={() => handleAnalyzeOffline(idx)}
                    disabled={analyzingIdx === idx}
                  >
                    {analyzingIdx === idx ? (
                      <ActivityIndicator size="small" color={C.cream} />
                    ) : (
                      <Text style={styles.uploadText}>{t("dashboard.analyze")}</Text>
                    )}
                  </TouchableOpacity>
                </View>
              ))
            )}
          </View>
        )}
      </ScrollView>

      {/* Upload choice modal */}
      <Modal
        transparent
        visible={!!showUploadChoice?.visible}
        animationType="fade"
        onRequestClose={() => setShowUploadChoice(null)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setShowUploadChoice(null)}
        >
          <View
            style={styles.modalCard}
            onStartShouldSetResponder={() => true}
          >
            <View style={styles.modalCardHeader}>
              <Text style={styles.modalTitle}>{t("dashboard.uploadMethod")}</Text>
              <Text style={styles.modalSubtitle}>{t("dashboard.uploadMethodQuestion")}</Text>
            </View>

            <View style={styles.uploadOptionsRow}>
              <Pressable
                style={({ pressed }) => [
                  styles.uploadOptionBtn,
                  {
                    flex: 1,
                    backgroundColor: C.cardBg,
                    borderColor: pressed ? C.lime : C.cardBorder,
                  },
                ]}
                onPress={() => {
                  if (showUploadChoice)
                    setPendingUploadCtx({
                      meal: showUploadChoice.meal,
                      recordedDateISO: showUploadChoice.recordedDateISO,
                    });
                  setShowUploadChoice(null);
                  setTextPrompt("");
                  setPhaseAndRef("input");
                  setTextError("");
                  setPendingTextBreakdown(null);
                  setDrinkSugarLevel(null);
                  setDrinkBaseType(null);
                  setShowTextModal(true);
                }}
              >
                {({ pressed }) => (
                  <>
                    <View style={styles.uploadOptionIcon}>
                      <Text style={styles.uploadOptionEmoji}>✏️</Text>
                    </View>
                    <Text style={[styles.uploadOptionLabel, { color: pressed ? C.lime : C.navy }]}>
                      {t("dashboard.textUpload")}
                    </Text>
                    <Text style={styles.uploadOptionSub}>
                      {t("dashboard.textUploadSub")}
                    </Text>
                  </>
                )}
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  styles.uploadOptionBtn,
                  {
                    flex: 1,
                    backgroundColor: C.cardBg,
                    borderColor: pressed ? C.lime : C.cardBorder,
                  },
                ]}
                onPress={() => {
                  if (!showUploadChoice) return;
                  const { meal, recordedDateISO } = showUploadChoice;
                  setShowUploadChoice(null);
                  navigation.navigate("MealCapture", {
                    mealType: meal,
                    recordedDateISO,
                  });
                }}
              >
                {({ pressed }) => (
                  <>
                    <View style={styles.uploadOptionIcon}>
                      <Text style={styles.uploadOptionEmoji}>📷</Text>
                    </View>
                    <Text style={[styles.uploadOptionLabel, { color: pressed ? C.lime : C.navy }]}>
                      {t("dashboard.photoUpload")}
                    </Text>
                    <Text style={styles.uploadOptionSub}>
                      {t("dashboard.photoUploadSub")}
                    </Text>
                  </>
                )}
              </Pressable>
            </View>

            <TouchableOpacity
              style={styles.modalCancelBtn}
              onPress={() => setShowUploadChoice(null)}
            >
              <Text style={styles.modalCancelText}>
                {t("common.cancel")}
              </Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      {/* Text upload modal on dashboard */}
      <Modal
        transparent
        visible={showTextModal}
        animationType="fade"
        onRequestClose={() => {
          if (textPhaseRef.current !== "loading") handleCloseTextModal();
        }}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => {
            if (textPhaseRef.current !== "loading") handleCloseTextModal();
          }}
          disabled={textPhase === "loading"}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={styles.keyboardAvoidWrapper}
            keyboardVerticalOffset={64}
          >
            <View
              style={[styles.modalCard, styles.textModalCardBorder]}
              onStartShouldSetResponder={() => true}
            >
              {textPhase === "loading" ? (
                <View style={styles.textLoadingWrap}>
                  <View style={styles.textSpinnerRing}>
                    <ActivityIndicator size="large" color={C.green} />
                    <View style={[styles.textSpinnerMascot, { backgroundColor: C.green }]}>
                      <AppIcon style={styles.textSpinnerMascotImg} fallbackColor={C.green} />
                    </View>
                  </View>
                  <Text style={styles.textLoadingTitle}>{t("dashboard.textLoadingTitle")}</Text>
                </View>
              ) : textPhase === "drink" ? (
                <>
                  <DrinkOptions
                    sugarLevel={drinkSugarLevel}
                    drinkType={drinkBaseType}
                    onSugarLevelChange={setDrinkSugarLevel}
                    onDrinkTypeChange={setDrinkBaseType}
                    titleStyle={styles.modalTitle}
                    labelStyle={styles.drinkSectionLabel}
                    chipRowStyle={styles.chipRow}
                    chipStyle={styles.chip}
                    selectedChipStyle={styles.chipSelected}
                    chipTextStyle={styles.chipText}
                    selectedChipTextStyle={styles.chipTextSelected}
                  />
                  <View style={styles.textModalBtnRow}>
                    <TouchableOpacity
                      style={styles.textModalCancelBtn}
                      onPress={() => {
                        setPendingTextBreakdown(null);
                        setPhaseAndRef("input");
                      }}
                    >
                      <Text style={styles.textModalCancelText}>{t("common.cancel")}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.textModalConfirmBtn}
                      onPress={handleContinueTextDrink}
                    >
                      <Text style={styles.textModalConfirmText}>{t("common.confirm")} →</Text>
                    </TouchableOpacity>
                  </View>
                </>
              ) : textPhase === "error" ? (
                <View style={styles.textErrorWrap}>
                  <Text style={styles.textErrorTitle}>{t("common.error")}</Text>
                  <Text style={styles.textErrorBody}>{textError || t("dashboard.textErrorFallback")}</Text>
                  <View style={styles.textModalBtnRow}>
                    <TouchableOpacity
                      style={styles.textModalCancelBtn}
                      onPress={() => {
                        handleCloseTextModal();
                        setShowUploadChoice(null);
                        setPendingUploadCtx(null);
                        setPhaseAndRef("input");
                      }}
                    >
                      <Text style={styles.textModalCancelText}>{t("common.cancel")}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.textModalConfirmBtn}
                      onPress={runTextBreakdown}
                    >
                      <Text style={styles.textModalConfirmText}>{t("common.retry")}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <>
                  <Text style={styles.modalTitle}>{t("dashboard.uploadTextDescription")}</Text>
                  <Text style={styles.modalSubtitle}>
                    {t("dashboard.uploadTextMessage")}
                  </Text>
                  <TextInput
                    value={textPrompt}
                    onChangeText={setTextPrompt}
                    placeholder={t("dashboard.uploadTextExample")}
                    placeholderTextColor={C.textMuted}
                    style={styles.textInputStyle}
                    multiline
                    returnKeyType="done"
                    blurOnSubmit={true}
                    maxLength={1000}
                  />
                  <View style={styles.textModalBtnRow}>
                    <TouchableOpacity
                      style={styles.textModalCancelBtn}
                      onPress={() => {
                        handleCloseTextModal();
                        setShowUploadChoice(null);
                        setPendingUploadCtx(null);
                      }}
                    >
                      <Text style={styles.textModalCancelText}>{t("common.cancel")}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.textModalConfirmBtn}
                      onPress={runTextBreakdown}
                    >
                      <Text style={styles.textModalConfirmText}>
                        {t("dashboard.startAnalysis")}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </View>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const getStyles = (tc: any) => StyleSheet.create({
  screenSafe: { flex: 1, backgroundColor: tc.bg },
  scroll: { flex: 1, backgroundColor: tc.bg },
  scrollContent: { paddingHorizontal: 16, paddingBottom: 32 },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingTop: 20,
    paddingBottom: 12,
  },
  headerLeft: { flex: 1 },
  headerTitle: { fontSize: 36, fontWeight: '900', color: tc.coral, fontFamily: tc.fontPrimary },
  headerDate: { fontSize: 16, color: tc.textSecondary, marginTop: 2, fontFamily: tc.fontSecondary },
  headerIcons: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingTop: 4 },
  headerIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: tc.cardBg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: tc.cardBorder,
  },
  headerIconImg: { width: 20, height: 20, resizeMode: 'contain', tintColor: tc.green },

  // Date strip
  dateStrip: { paddingRight: 16, gap: 10, marginBottom: 16, marginTop: 4 },
  datePill: {
    width: 52,
    height: 72,
    borderRadius: 26, 
    backgroundColor: tc.cardBg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  datePillActive: {
    backgroundColor: tc.coral,
    borderWidth: 2,
    borderColor: tc.coral,
  },
  dateDow: { fontSize: 14, fontWeight: '600', color: tc.textMuted, textTransform: 'uppercase', fontFamily: tc.fontPrimary },
  dateDowActive: { color: tc.textPrimary },
  dateDom: { fontSize: 18, fontWeight: '800', color: tc.textMuted, fontFamily: tc.fontPrimary },
  dateDomActive: { color: tc.textPrimary },
  dateDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: 'transparent', marginTop: 2 },
  dateDotActive: { backgroundColor: tc.cream },

  // Scan counter
  scanCounterCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: tc.cardBg,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: tc.cardBorder,
    padding: 16,
    marginBottom: 12,
  },
  scanCounterLeft: {
    flexDirection: 'column',
    gap: 4,
  },
  scanCounterTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: tc.textSecondary,
    fontFamily: tc.fontPrimary,
    letterSpacing: 1,
  },
  scanBadge: {
    backgroundColor: tc.track,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    alignSelf: 'flex-start',
  },
  scanBadgeAdmin: {
    backgroundColor: '#FFD700',
  },
  scanBadgeText: {
    fontSize: 16,
    fontWeight: '900',
    color: tc.green,
    fontFamily: tc.fontPrimary,
  },
  scanCounterRight: {
    alignItems: 'flex-end',
  },
  scanRemainingText: {
    fontSize: 14,
    fontWeight: '700',
    color: tc.textMuted,
    fontFamily: tc.fontSecondary,
  },

  // Setup banner
  setupBanner: {
    backgroundColor: tc.track,
    borderWidth: 1,
    borderColor: tc.cardBorder,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  setupBannerText: { color: tc.navy, fontWeight: '700', fontSize: 16, fontFamily: tc.fontSecondary },
  bannerBtnRow: { flexDirection: 'row', marginTop: 8 },
  bannerBtnCard: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tc.cardBg,
  },
  bannerBtnCardText: { color: tc.green, fontWeight: '700', fontFamily: tc.fontPrimary, fontSize: 14 },
  bannerBtnLater: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tc.bg,
    marginLeft: 8,
  },
  bannerBtnLaterText: { color: tc.navy, fontWeight: '600', fontFamily: tc.fontPrimary, fontSize: 14 },

  // Calories card
  calCard: {
    backgroundColor: tc.cardBg,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: tc.cardBorder,
    padding: 20,
    marginBottom: 12,
  },
  calHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sectionLabel: { fontSize: 16, fontWeight: '800', color: tc.textSecondary, letterSpacing: 1.5, fontFamily: tc.fontPrimary },
  refreshText: { fontSize: 16, fontWeight: '700', color: tc.green, fontFamily: tc.fontPrimary },
  refreshErrorText: { fontSize: 16, fontWeight: '700', color: tc.coral, fontFamily: tc.fontPrimary },
  refreshDoneText: { color: tc.lime, fontWeight: '700', fontSize: 14, fontFamily: tc.fontPrimary },
  calRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 12,
  },
  calNum: { fontSize: 44, fontWeight: '900', color: tc.navy, lineHeight: 48, fontFamily: tc.fontPrimary },
  calRemainNum: { fontSize: 24, fontWeight: '800', color: tc.textSecondary, fontFamily: tc.fontPrimary },
  calRemainLabel: { fontSize: 14, color: tc.textMuted, marginTop: 1, fontFamily: tc.fontSecondary },
  calRemainCol: { alignItems: 'flex-end' },
  barTrack: {
    height: 10,
    borderRadius: 5,
    backgroundColor: tc.track,
    overflow: 'hidden',
  },
  barFill: { height: 10, borderRadius: 5 },
  calFoot: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  calFootText: { fontSize: 13, color: tc.textMuted, fontFamily: tc.fontSecondary },

  // Macros grid
  macrosGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 12,
  },
  macroCard: {
    width: '48%',
    backgroundColor: tc.cardBg,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: tc.cardBorder,
    padding: 14,
  },
  macroTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  macroName: { fontSize: 14, fontWeight: '800', color: tc.textSecondary, letterSpacing: 1.2, fontFamily: tc.fontPrimary },
  macroPct: { fontSize: 16, fontWeight: '700', color: tc.textMuted, fontFamily: tc.fontPrimary },
  macroVal: { fontSize: 30, fontWeight: '900', lineHeight: 32, fontFamily: tc.fontPrimary },
  macroGoal: { fontSize: 14, color: tc.textMuted, marginTop: 1, marginBottom: 8, fontFamily: tc.fontSecondary },
  macroBarTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: tc.track,
    overflow: 'hidden',
  },
  macroBarFill: { height: 6, borderRadius: 3 },

  // Micronutrients card
  microsCard: {
    backgroundColor: tc.cardBg,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: tc.cardBorder,
    padding: 18,
    marginBottom: 12,
  },
  microRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
  },
  microLabel: { width: 70, fontSize: 16, fontWeight: '600', color: tc.navy, fontFamily: tc.fontPrimary },
  microBarWrap: { flex: 1, marginHorizontal: 10 },
  microTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: tc.track,
    overflow: 'hidden',
  },
  microFill: { height: 8, borderRadius: 4 },
  microValWrap: { flexDirection: 'row', alignItems: 'center', minWidth: 70, justifyContent: 'flex-end' },
  microValText: { fontSize: 16, fontWeight: '700', color: tc.textSecondary, fontFamily: tc.fontPrimary },
  microWarnIcon: { color: tc.coral, fontSize: 12, marginLeft: 4 },

  // Meals card
  mealsCard: {
    backgroundColor: tc.cardBg,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: tc.cardBorder,
    paddingVertical: 18,
    paddingHorizontal: 18,
    marginBottom: 12,
  },
  mealsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  mealsHeaderText: { fontSize: 16, fontWeight: '800', color: tc.textSecondary, letterSpacing: 1.5, fontFamily: tc.fontPrimary },
  mealRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  mealRowPressable: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  mealIconImg: {
    width: 28,
    height: 28,
    borderRadius: 6,
    marginRight: 12,
    resizeMode: 'contain',
  },
  mealLabel: { fontSize: 16, fontWeight: '600', color: tc.navy, fontFamily: tc.fontPrimary },
  mealCaloriesRow: { fontSize: 14, color: tc.textMuted, fontFamily: tc.fontSecondary, marginLeft: 8 },
  listLoader: { paddingVertical: 8 },
  itemThumbFallback: { width: 40, height: 40, borderRadius: 8, marginRight: 8, backgroundColor: 'rgba(255,255,255,0.08)' },
  itemInfo: { flex: 1 },
  mealLabelRow: { flexDirection: 'row', alignItems: 'center' },
  mealCalories: { fontSize: 14, color: tc.textMuted, fontFamily: tc.fontSecondary },
  mealTextContainer: {
    flex: 1,
    flexDirection: 'column',
    justifyContent: 'center',
  },
  chevron: { marginLeft: 20, marginBottom: 2, fontSize: 22, color: tc.green },
  chevronOffset: { marginLeft: 8, marginBottom: 2, fontSize: 22, color: tc.green },
  expandSection: {
    marginLeft: 40,
    paddingLeft: 4,
    borderLeftWidth: 1,
    borderLeftColor: tc.expandBorder,
    marginBottom: 8,
  },
  itemRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  itemThumb: { width: 40, height: 40, borderRadius: 8, marginRight: 8 },
  itemTitle: { fontSize: 16, color: tc.textPrimary, fontWeight: '600', fontFamily: tc.fontSecondary },
  itemMeta: { fontSize: 14, color: tc.textMuted, marginTop: 2, fontFamily: tc.fontSecondary },
  emptyText: {
    fontSize: 14,
    color: tc.textMuted,
    paddingVertical: 4,
    paddingLeft: 40,
    fontFamily: tc.fontSecondary,
  },
  uploadBtn: {
    backgroundColor: tc.track,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  uploadText: { color: tc.green, fontSize: 16, fontWeight: '700', fontFamily: tc.fontSecondary },
  offlineThumb: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: tc.itemThumbPlaceholder,
  },
  offlineThumbFallback: { width: 44, height: 44, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.08)' },
  offlineItemInfo: { flex: 1, marginLeft: 8 },
  offlineEmptyText: { fontSize: 14, color: tc.textMuted, paddingVertical: 4, fontFamily: tc.fontSecondary },

  // Daily tip bubble
  tipBubble: {
    flexDirection: 'row',
    backgroundColor: tc.tipBubbleBg,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: tc.tipBubbleBorder,
    padding: 14,
    marginBottom: 12,
    alignItems: 'flex-start',
  },
  tipAvatar: { width: 38, height: 38, marginRight: 12 },
  tipContent: { flex: 1 },
  tipTitle: { fontSize: 14, fontWeight: '800', color: tc.green, marginBottom: 4, letterSpacing: 0.5, fontFamily: tc.fontPrimary },
  tipText: { fontSize: 15, color: tc.tipTextColor, lineHeight: 19, fontFamily: tc.fontSecondary },

  // Feedback banner
  feedbackBanner: {
    backgroundColor: tc.feedbackBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: tc.cardBorder,
    padding: 14,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  feedbackTextContainer: { flex: 1 },
  feedbackSubtitle: { fontSize: 16, color: tc.textMuted, fontFamily: tc.fontSecondary },
  feedbackChevron: { fontSize: 24, color: tc.textMuted, marginLeft: 8 },

  // Modal shared styles (kept light for overlay clarity)
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    width: '90%',
    maxWidth: 380,
    backgroundColor: tc.modalBg,
    borderRadius: 16,
    padding: 20,
  },
  modalCardHeader: { marginBottom: 4 },
  textModalCardBorder: { borderWidth: 2, borderColor: tc.cardBorder },
  keyboardAvoidWrapper: { width: '100%', alignItems: 'center' },
  uploadOptionsRow: { flexDirection: 'row', gap: 10, marginTop: 8 },
  modalCancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tc.bg,
    borderWidth: 1.5,
    borderColor: tc.cardBorder,
    marginTop: 10,
  },
  modalCancelText: { color: tc.navy, fontWeight: '600', fontFamily: tc.fontPrimary },
  textInputStyle: {
    borderWidth: 1.5,
    borderColor: tc.cardBorder,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    minHeight: 80,
    textAlignVertical: 'top',
    fontFamily: tc.fontSecondary,
    fontSize: 13,
    fontWeight: '700',
    color: tc.textPrimary,
    backgroundColor: tc.cardBg,
  },
  textModalBtnRow: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 12, gap: 10 },
  textModalCancelBtn: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tc.cardBg,
    borderWidth: 1.5,
    borderColor: tc.cardBorder,
  },
  textModalCancelText: { color: tc.textMuted, fontWeight: '600', fontFamily: tc.fontPrimary, fontSize: 15 },
  textModalConfirmBtn: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tc.green,
    shadowColor: tc.green,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 0,
  },
  textModalConfirmText: { color: tc.white, fontWeight: '700', fontFamily: tc.fontPrimary, fontSize: 15 },
  textLoadingWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    minHeight: 160,
  },
  textSpinnerRing: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 4,
    borderColor: tc.green + "40",
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  textSpinnerMascot: {
    position: 'absolute',
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textSpinnerMascotImg: { width: '100%', height: '100%', resizeMode: 'cover', borderRadius: 12 },
  textLoadingTitle: { fontSize: 16, color: tc.textPrimary, fontFamily: tc.fontPrimary, fontWeight: '700' },
  textErrorWrap: { alignItems: 'center', paddingVertical: 8 },
  textErrorTitle: { fontSize: 18, color: tc.coral, fontFamily: tc.fontPrimary, fontWeight: '700', marginBottom: 8 },
  textErrorBody: { fontSize: 14, color: tc.textSecondary, fontFamily: tc.fontSecondary, textAlign: 'center', marginBottom: 16 },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: tc.green,
    marginBottom: 12,
    fontFamily: tc.fontPrimary,
  },
  modalSubtitle: { fontSize: 16, color: tc.textMuted, marginBottom: 12, fontFamily: tc.fontSecondary },
  drinkSectionLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: tc.green,
    marginBottom: 8,
    fontFamily: tc.fontPrimary,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: tc.cardBg,
    borderWidth: 1.5,
    borderColor: tc.cardBorder,
  },
  chipSelected: { backgroundColor: tc.green, borderColor: tc.green },
  chipText: { fontSize: 14, fontWeight: '500', color: tc.navy, fontFamily: tc.fontSecondary },
  chipTextSelected: { color: tc.white },
  bannerBtn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadOptionBtn: {
    paddingVertical: 14,
    paddingHorizontal: 10,
    borderRadius: 16,
    borderWidth: 2,
    alignItems: 'center',
    gap: 8,
  },
  uploadOptionIcon: {
    width: 32,
    height:32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadOptionEmoji: { fontSize: 26 },
  uploadOptionLabel: {
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: 0.3,
    fontFamily: tc.fontPrimary,
  },
  uploadOptionSub: {
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 15,
    fontFamily: tc.fontSecondary,
    color: tc.textMuted,
  },
});
