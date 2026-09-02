import React from "react";
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  TextInput,
  Modal,
  Pressable,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  useRoute,
  useNavigation,
  RouteProp,
} from "@react-navigation/native";
import { AppNavigation, RootStackParamList } from "../types/navigation";
import { FoodAnalysis, FoodItem } from "../types/analysis";
import {
  addFoodLogWithDetails,
  historyTotalsKey,
  historyTotalsIncrement,
  saveFoodLogEditTracking,
} from "../services/api";
import { supabase } from "../lib/supabase";
import { withAuth, NotAuthError } from "../lib/withAuth";
import { useLanguage } from "../context/LanguageContext";
import { useTheme } from "../context/ThemeContext";
import BackButton from "../components/BackButton";
import { calculateHealthMetadata } from "../utils/calculateHealthMetadata";

export default function ResultsScreen() {
  const navigation = useNavigation<AppNavigation>();
  const route = useRoute<RouteProp<RootStackParamList, "Results">>();
  const { t, language } = useLanguage();
  const { colors, isDark } = useTheme();
  const params = route.params;
  const analysis = params?.analysis || {
    imageUri: "",
    foodItems: [],
  };
  const mealType = params?.mealType;
  const portion =
    typeof params?.portion === "number" && isFinite(params.portion)
      ? params.portion
      : 1;
  const portionPct = Math.round(portion * 100);
  const recordedDateISO = params?.recordedDateISO;
  const query = params?.query;
  const servings = params?.servings;
  const sugarLevel = params?.sugarLevel;
  const drinkType = params?.drinkType;

  const foodItems = analysis.foodItems || [];
  const hasFoodItems = foodItems.length > 0;

  // Health score popup state
  const healthScore = analysis.health_score;
  const healthRecommendation = analysis.health_recommendation;
  const [showHealthPopup, setShowHealthPopup] = React.useState(false);

  // One-time edit: track if user has already edited ingredients
  // If justEdited flag is passed from BreakdownConfirm, editing was just completed
  const [hasEditedIngredients, setHasEditedIngredients] = React.useState(
    () => params?.justEdited === true
  );

  // Show popup when health score is available (without numerical score)
  React.useEffect(() => {
    if (typeof healthScore === "number" && healthScore > 0) {
      setShowHealthPopup(true);
    }
  }, [healthScore, healthRecommendation]);

  const portionClamped =
    typeof portion === "number" && isFinite(portion)
      ? Math.min(1, Math.max(0, portion))
      : 1;

  const roundInt = (v: unknown): number => {
    const n = Number(v);
    return isFinite(n) ? Math.round(n) : 0;
  };

  const round1 = (v: unknown): number => {
    const n = Number(v);
    return isFinite(n) ? Math.round(n * 10) / 10 : 0;
  };

  const applyPortion = (n: unknown, decimals: 0 | 1): number => {
    const nVal = Number(n);
    if (!isFinite(nVal)) return 0;
    const scaled = nVal * portionClamped;
    return decimals === 0 ? Math.round(scaled) : Math.round(scaled * 10) / 10;
  };

  const defaultCalories =
    typeof analysis.calories === "number"
      ? applyPortion(analysis.calories, 0)
      : hasFoodItems
        ? applyPortion(
            foodItems.reduce((sum, item) => sum + (item.calories ?? 0), 0),
            0,
          )
        : 0;

  const defaultCarbs =
    typeof analysis.carbs_g === "number"
      ? applyPortion(analysis.carbs_g, 1)
      : hasFoodItems
        ? applyPortion(
            foodItems.reduce((sum, item) => sum + (item.macros?.carbs ?? 0), 0),
            1,
          )
        : 0;

  const defaultProtein =
    typeof analysis.protein_g === "number"
      ? applyPortion(analysis.protein_g, 1)
      : hasFoodItems
        ? applyPortion(
            foodItems.reduce((sum, item) => sum + (item.macros?.protein ?? 0), 0),
            1,
          )
        : 0;

  const defaultFat =
    typeof analysis.fat_g === "number"
      ? applyPortion(analysis.fat_g, 1)
      : hasFoodItems
        ? applyPortion(
            foodItems.reduce((sum, item) => sum + (item.macros?.fat ?? 0), 0),
            1,
          )
        : 0;

  const defaultSodium =
    typeof analysis.sodium_mg === "number"
      ? applyPortion(analysis.sodium_mg, 1)
      : hasFoodItems
        ? applyPortion(
            foodItems.reduce(
              (sum, item) => sum + (item.macros?.sodium_mg ?? 0),
              0,
            ),
            1,
          )
        : 0;

  const defaultSugar =
    typeof analysis.sugar_g === "number"
      ? applyPortion(analysis.sugar_g, 1)
      : hasFoodItems
        ? applyPortion(
            foodItems.reduce(
              (sum, item) => sum + (item.macros?.sugar_g ?? 0),
              0,
            ),
            1,
          )
        : 0;

  const defaultFiber =
    typeof analysis.fiber_g === "number"
      ? applyPortion(analysis.fiber_g, 1)
      : hasFoodItems
        ? applyPortion(
            foodItems.reduce(
              (sum, item) => sum + (item.macros?.fiber_g ?? 0),
              0,
            ),
            1,
          )
        : 0;

  const foodBreakdown = analysis.food_breakdown ?? "";
  const tipOrFact = analysis.tip_or_fact ?? "";
  const suggestion = analysis.suggestion ?? "";

  // Derive a human-friendly title to store with the log
  const derivedBreakdown =
    (language === 'zh-TW' ? analysis.breakdown_zh : analysis.breakdown_en) ||
    foodBreakdown;

  const derivedTitle =
    (language === 'zh-TW' ? analysis.title_zh : analysis.title_en) ||
    (analysis.title && String(analysis.title)) ||
    (hasFoodItems && foodItems[0]?.name) ||
    (derivedBreakdown ? derivedBreakdown.split(/[。\.]/)[0] : "") ||
    t('results.unnamedFood');

  // Controlled disclaimer: only show when portion confidence is medium/low and
  // the user has not just manually edited the ingredients/amounts.
  const portionConfidence = analysis.portion_confidence;
  const showPortionDisclaimer =
    !params?.justEdited &&
    derivedBreakdown.length > 0 &&
    (portionConfidence === "medium" || portionConfidence === "low");
  const portionDisclaimerText =
    portionConfidence === "low"
      ? t('results.portionConfidenceLow')
      : t('results.portionConfidenceMedium');

  // Calculate health metadata using advanced nutrition logic
  // Follows NouriQuest branding and Taiwan HPA/USDA guidelines
  const healthMetadata = React.useMemo(() => {
    return calculateHealthMetadata(
      healthScore ?? 0,
      {
        calories: defaultCalories,
        protein: defaultProtein,
        carbs: defaultCarbs,
        fat: defaultFat,
        fiber: defaultFiber,
        sodium: defaultSodium,
      },
      colors,
      analysis.health_tags
    );
  }, [healthScore, defaultCalories, defaultProtein, defaultCarbs, defaultFat, defaultFiber, defaultSodium, colors, analysis.health_tags]);

  // Extract score metadata and tags
  const { scoreMetadata, tags: healthTags } = healthMetadata;

  const [saving, setSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = React.useState(false);
  const [logId, setLogId] = React.useState<string | null>(null);
  const [lastLoggedMeal, setLastLoggedMeal] = React.useState<
    | {
        mealType: "breakfast" | "lunch" | "dinner" | "snack";
        calories: number;
      }
    | null
  >(null);
  const [imageAspectRatio, setImageAspectRatio] = React.useState<number | null>(
    null,
  );
  const autoSavedOnceRef = React.useRef(false);
  const isMountedRef = React.useRef(true);

  React.useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Editable nutrition values (allow up to one decimal place)
  const clampDecimal = (v: unknown, min = 0, max = 100000, decimals = 1) => {
    const num = parseFloat(String(v).replace(/[^0-9.]/g, ""));
    if (!isFinite(num)) return 0;
    const clipped = Math.min(max, Math.max(min, num));
    const factor = 10 ** decimals;
    return Math.round(clipped * factor) / factor;
  };

  const [calories, setCalories] = React.useState<number>(
    clampDecimal(defaultCalories, 0, 100000, 0),
  );
  const [carbs, setCarbs] = React.useState<number>(clampDecimal(defaultCarbs));
  const [protein, setProtein] = React.useState<number>(
    clampDecimal(defaultProtein),
  );
  const [fat, setFat] = React.useState<number>(clampDecimal(defaultFat));
  const [sodium, setSodium] = React.useState<number>(
    clampDecimal(defaultSodium),
  );
  const [sugar, setSugar] = React.useState<number>(clampDecimal(defaultSugar));
  const [fiber, setFiber] = React.useState<number>(clampDecimal(defaultFiber));

  const [editingField, setEditingField] = React.useState<
    null | "calories" | "protein" | "carbs" | "fat" | "sodium" | "sugar" | "fiber"
  >(null);
  const initialNutritionRef = React.useRef({
    calories: roundInt(defaultCalories),
    protein_g: round1(defaultProtein),
    carbs_g: round1(defaultCarbs),
    fat_g: round1(defaultFat),
    sodium_mg: round1(defaultSodium),
    sugar_g: round1(defaultSugar),
    fiber_g: round1(defaultFiber),
  });

  React.useEffect(() => {
    if (analysis.imageUri) {
      Image.getSize(
        analysis.imageUri,
        (w, h) => {
          if (!isMountedRef.current) return;
          if (w > 0 && h > 0) setImageAspectRatio(w / h);
        },
        () => {
          if (!isMountedRef.current) return;
          setImageAspectRatio(null);
        },
      );
    } else {
      setImageAspectRatio(null);
    }
  }, [analysis.imageUri]);

  const upsertLog = async (): Promise<string | null> => {
    if (logId) return logId;
    if (saving) return null;
    setSaving(true);
    setSaveError(null);
    try {
      const image_url = analysis.imageUri ?? null;
      const original = initialNutritionRef.current;
      const edited = {
        calories: clampDecimal(calories, 0, 100000, 0),
        carbs_g: clampDecimal(carbs, 0, 100000, 1),
        protein_g: clampDecimal(protein, 0, 100000, 1),
        fat_g: clampDecimal(fat, 0, 100000, 1),
        sodium_mg: clampDecimal(sodium, 0, 100000, 1),
        sugar_g: clampDecimal(sugar, 0, 100000, 1),
        fiber_g: clampDecimal(fiber, 0, 100000, 1),
        food_breakdown: analysis.food_breakdown ?? "",
        tip_or_fact: analysis.tip_or_fact ?? "",
        suggestion: analysis.suggestion ?? "",
        title: derivedTitle,
        health_score: healthScore,
        health_recommendation: healthRecommendation,
      };

      const nutritionEdited =
        edited.calories !== original.calories ||
        edited.protein_g !== original.protein_g ||
        edited.carbs_g !== original.carbs_g ||
        edited.fat_g !== original.fat_g ||
        edited.sodium_mg !== original.sodium_mg ||
        edited.sugar_g !== original.sugar_g ||
        edited.fiber_g !== original.fiber_g;

      const { data, error } = await withAuth(() => supabase.auth.getUser());
      if (error || !data?.user?.id) throw new NotAuthError();
      const user_id = data.user.id;

      const inserted = await withAuth(() =>
        addFoodLogWithDetails({
          user_id,
          image_url,
          foodItem: edited,
          meal_type: mealType,
          recordedDateISO,
          title_en: analysis.title_en ?? null,
          title_zh: analysis.title_zh ?? null,
          breakdown_en: analysis.breakdown_en ?? null,
          breakdown_zh: analysis.breakdown_zh ?? null,
        }),
      );

      // Update UI only if still mounted; keep persistence running either way
      // so a save that is in-flight when the user navigates away still completes.
      if (isMountedRef.current) {
        setSaveSuccess(true);
        if (inserted?.id) setLogId(inserted.id);
      }

      // Persist edit tracking (once we have a log id)
      if (inserted?.id) {
        try {
          await withAuth(() =>
            saveFoodLogEditTracking({
              user_id,
              log_id: inserted.id,
              edit_tracking: {
                nutrition_edited: nutritionEdited,
                nutrition_original: original,
                nutrition_edited_values: {
                  calories: edited.calories,
                  protein_g: edited.protein_g,
                  carbs_g: edited.carbs_g,
                  fat_g: edited.fat_g,
                  sodium_mg: edited.sodium_mg,
                  sugar_g: edited.sugar_g,
                  fiber_g: edited.fiber_g,
                },
                edited_at: nutritionEdited ? new Date().toISOString() : null,
              },
            }),
          );
        } catch (e) {
          // non-fatal
        }
      }

      if (isMountedRef.current && mealType) {
        setLastLoggedMeal({ mealType, calories: edited.calories });
      }

      // Keep existing optimistic history cache increment behavior, but only do it once.
      if (!autoSavedOnceRef.current) {
        try {
          const dateISO =
            recordedDateISO ||
            (() => {
              const createdAt = inserted?.created_at
                ? new Date(inserted.created_at)
                : new Date();
              const yyyy = createdAt.getFullYear();
              const mm = String(createdAt.getMonth() + 1).padStart(2, "0");
              const dd = String(createdAt.getDate()).padStart(2, "0");
              return `${yyyy}-${mm}-${dd}`;
            })();
          const key = historyTotalsKey(user_id, dateISO);
          historyTotalsIncrement(key, edited.calories);
        } catch {
          // non-fatal
        }
        autoSavedOnceRef.current = true;
      }

      return inserted?.id ?? null;
    } catch (err: any) {
      if (isMountedRef.current) {
        if (err instanceof NotAuthError) {
          setSaveError(t('results.sessionExpired'));
          navigation.navigate("SignIn");
        } else {
          setSaveError(err?.message || t('results.saveFailed'));
        }
      }
      if (__DEV__) console.error("[ResultsScreen] Error logging meal:", err);
      return null;
    } finally {
      if (isMountedRef.current) setSaving(false);
    }
  };

  // Removed auto-save - now only saves when user clicks "確認並儲存" button

  const handleNext = async () => {
    if (logId) {
      navigation.navigate("Dashboard", {
        lastLoggedMeal: lastLoggedMeal ?? undefined,
      } as any);
      return;
    }
    const id = await upsertLog();
    if (!id) return;
    navigation.navigate("Dashboard", {
      lastLoggedMeal: lastLoggedMeal ?? undefined,
    } as any);
  };

  const styles = React.useMemo(() => getStyles(colors, isDark), [colors, isDark]);

  return (
    <SafeAreaView style={styles.screenSafe} edges={["top"]}>
      <StatusBar barStyle={colors.statusBar} backgroundColor={colors.bg} />
      
      {/* Back button */}
      <BackButton 
        variant="absolute"
        darkBackground={isDark}
        onPress={() =>
          navigation.navigate(
            "Dashboard",
            lastLoggedMeal ? ({ lastLoggedMeal } as any) : undefined,
          )
        }
      />

      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.contentWrap}>
          {/* Dish name above photo */}
          <Text style={styles.dishNameTitle}>
            {derivedTitle}
          </Text>
        </View>

        {/* Food Hero Image */}
        {analysis.imageUri && imageAspectRatio ? (
          <View style={styles.foodHero}>
            <Image
              source={{ uri: analysis.imageUri }}
              style={styles.foodHeroImage}
              resizeMode="cover"
            />
          </View>
        ) : null}

        <View style={styles.contentWrap}>
          {/* Health score below photo (card only) */}
          {typeof healthScore === 'number' && healthScore > 0 && (
            <View style={[styles.healthScoreCard, { borderColor: `${scoreMetadata.color}` }]}>
              <Text style={[styles.scoreLabelText, { color: scoreMetadata.color }]}>
                {t('results.healthScoreTitle')}: {t(scoreMetadata.translationKey)}
              </Text>
            </View>
          )}

          {/* Action buttons */}
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[styles.btnReanalyse, hasEditedIngredients && { opacity: 0.5 }]}
              disabled={hasEditedIngredients}
              onPress={() => {
              // Use items_detailed from single_pass if available, otherwise reconstruct from foodItems
              const baseItemsDetailed = Array.isArray(analysis.items_detailed) && analysis.items_detailed.length > 0
                ? [...analysis.items_detailed]
                : Array.isArray(foodItems)
                  ? foodItems.map((fi: any) => ({
                      name: fi.name,
                      grams_g: null,
                      volume_ml: null,
                      confidence: 0.8,
                      is_garnish: false,
                      is_base: false,
                    }))
                  : [];
              // Reconcile: add any foodItems not already in items_detailed (e.g. Sauce)
              const existingNames = new Set(
                baseItemsDetailed.map((it: any) => (it.name || "").toLowerCase().trim())
              );
              const reconciledItems = Array.isArray(foodItems)
                ? foodItems
                    .filter((fi: any) => {
                      const key = (fi.name || "").toLowerCase().trim();
                      return key && !existingNames.has(key);
                    })
                    .map((fi: any) => ({
                      name: fi.name,
                      grams_g: null,
                      volume_ml: null,
                      confidence: 0.7,
                      is_garnish: false,
                      is_base: false,
                    }))
                : [];
              const itemsDetailed = [...baseItemsDetailed, ...reconciledItems];

              // Build originalFoodItems so every item in items_detailed has a matching
              // anchor. Items without a matching foodItem get a synthetic zero entry
              // so the name lists align; BreakdownConfirm then falls back to whole-meal
              // proportional scaling when per-item macros are missing.
              const foodItemByName = new Map<string, FoodItem>();
              if (Array.isArray(foodItems)) {
                for (const fi of foodItems) {
                  const key = (fi.name || "").toLowerCase().trim();
                  if (key && !foodItemByName.has(key)) {
                    foodItemByName.set(key, fi);
                  }
                }
              }
              const originalFoodItems: FoodItem[] = itemsDetailed.map((it: any) => {
                const key = (it.name || "").toLowerCase().trim();
                const matched = key ? foodItemByName.get(key) : undefined;
                if (matched) return matched;
                return {
                  name: it.name || "",
                  confidence: (it.confidence as number | undefined) ?? 0.8,
                  calories: 0,
                  macros: {
                    protein: 0,
                    carbs: 0,
                    fat: 0,
                  },
                } as FoodItem;
              });

              const cachedBreakdown = {
                dish_name: analysis.title || "",
                food_breakdown: analysis.food_breakdown || "",
                items_detailed: itemsDetailed,
                is_drink: analysis.is_drink ?? false,
                portion_confidence: analysis.portion_confidence || "medium",
                originalFoodItems,
                // Static fields + original totals preserved for AI-bypass when only amounts change
                originalAnalysis: {
                  imageUri: analysis.imageUri,
                  title: analysis.title,
                  title_en: analysis.title_en,
                  title_zh: analysis.title_zh,
                  food_breakdown: analysis.food_breakdown,
                  breakdown_en: analysis.breakdown_en,
                  breakdown_zh: analysis.breakdown_zh,
                  tip_or_fact: analysis.tip_or_fact,
                  suggestion: analysis.suggestion,
                  health_recommendation: analysis.health_recommendation,
                  health_score: analysis.health_score,
                  health_tags: analysis.health_tags,
                  is_drink: analysis.is_drink,
                  food_type: analysis.food_type,
                  calories: analysis.calories,
                  carbs_g: analysis.carbs_g,
                  protein_g: analysis.protein_g,
                  fat_g: analysis.fat_g,
                  sodium_mg: analysis.sodium_mg,
                  sugar_g: analysis.sugar_g,
                  fiber_g: analysis.fiber_g,
                },
              };
              navigation.navigate("BreakdownConfirm", {
                imageUri: analysis.imageUri ?? "",
                mealType,
                portion,
                servings,
                recordedDateISO,
                query,
                cachedBreakdown,
                foodType: analysis.food_type || undefined,
                sugarLevel,
                drinkType,
                hasEditedIngredients,
              });
            }}
          >
              <Text style={styles.btnReanalyseText}>
                {t('results.editIngredients')}
              </Text>
            </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.btnSave,
              (!!logId || saving) && { opacity: 0.7 }
            ]}
            onPress={handleNext}
            disabled={saving || !!logId}
          >
            <Text style={styles.btnSaveText}>
              {saving ? t('results.saving') : logId ? t('results.savedMessage') : t('results.confirmSave')} →
            </Text>
          </TouchableOpacity>
          </View>
          <Text style={styles.saveHint}>
            {saveError
              ? t('results.saveErrorMessage')
              : saveSuccess
                ? t('results.savedMessage')
                : saving
                  ? t('results.savingMessage')
                  : t('results.savePrompt')}
          </Text>

          {/* Food ID Card */}
          {derivedBreakdown ? (
            <View style={styles.nsCard}>
              <Text style={styles.cardTitle}>
                {t('results.identifiedFood')}
              </Text>
              <Text style={styles.cardBodyText}>
                {derivedBreakdown}
              </Text>
              {showPortionDisclaimer && (
                <Text style={styles.portionDisclaimerText}>
                  {portionDisclaimerText}
                </Text>
              )}
              {healthTags.length > 0 && (
                <View style={styles.healthTags}>
                  {healthTags.map((tag, idx) => (
                    <View
                      key={idx}
                      style={[
                        styles.htag,
                        tag.type === 'warn' && styles.htagWarn,
                        tag.type === 'good' && styles.htagGood,
                        tag.type === 'info' && styles.htagInfo,
                      ]}
                    >
                      <Text
                        style={[
                          styles.htagText,
                          tag.type === 'warn' && styles.htagTextWarn,
                          tag.type === 'good' && styles.htagTextGood,
                          tag.type === 'info' && styles.htagTextInfo,
                        ]}
                      >
                        {t(tag.translationKey)}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          ) : null}
        </View>

        <View style={styles.contentWrap}>
          {/* Nutrition Card */}
          <View style={styles.nsCard}>
            <View style={styles.nutritionHeader}>
              <Text style={[styles.cardTitle, { marginBottom: 0 }]}>
                {t('results.nutritionAnalysis')}
              </Text>
              {portionPct !== 100 ? (
                <View style={styles.portionBadge}>
                  <Text style={styles.portionBadgeText}>
                    {t('results.portionBadge', { percent: portionPct })}
                  </Text>
                </View>
              ) : null}
            </View>

          {analysis.calories == null &&
            analysis.carbs_g == null &&
            analysis.protein_g == null &&
            analysis.fat_g == null && (
              <Text style={{ color: "#B45309", fontSize: 12, marginBottom: 8 }}>
                {t('results.noPortionWarning')}
              </Text>
            )}

          {/* Editable rows with pen icon */}
          {(
            [
              { key: "calories", label: t('macros.calories'), unit: t('macros.kcal') },
              { key: "protein", label: t('macros.protein'), unit: "g" },
              { key: "carbs", label: t('macros.carbs'), unit: "g" },
              { key: "fat", label: t('macros.fat'), unit: "g" },
              { key: "sodium", label: t('macros.sodium'), unit: "mg" },
              { key: "sugar", label: t('macros.sugar'), unit: "g" },
              { key: "fiber", label: t('macros.fiber'), unit: "g" },
            ] as const
          ).map((field) => {
            const value =
              field.key === "calories" ? calories :
              field.key === "protein" ? protein :
              field.key === "carbs" ? carbs :
              field.key === "fat" ? fat :
              field.key === "sodium" ? sodium :
              field.key === "sugar" ? sugar :
              fiber;
            const setValue =
              field.key === "calories" ? setCalories :
              field.key === "protein" ? setProtein :
              field.key === "carbs" ? setCarbs :
              field.key === "fat" ? setFat :
              field.key === "sodium" ? setSodium :
              field.key === "sugar" ? setSugar :
              setFiber;
            return (
              <View style={styles.editRow} key={field.key}>
                <Text style={styles.nutritionLabel}>{field.label}</Text>
                <View style={styles.valueGroup}>
                  {editingField === field.key ? (
                    <TextInput
                      style={styles.inputInline}
                      keyboardType="decimal-pad"
                      value={String(value)}
                      onChangeText={(v) => setValue(clampDecimal(v))}
                      onBlur={() => setEditingField(null)}
                      autoFocus
                    />
                  ) : (
                    <Text style={styles.valueText}>{value}</Text>
                  )}
                  <Text style={styles.unitText}>{field.unit}</Text>
                  <TouchableOpacity onPress={() => setEditingField(field.key)}>
                    <Text style={styles.editIcon}>✎</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
        </View>

          {/* Health Tip Card */}
          {tipOrFact ? (
            <View style={styles.tipCardNavy}>
              <View style={styles.tipContent}>
                <Text style={[styles.tipLabel, styles.tipLabelNavy]}>
                  {t('results.healthTip')}
                </Text>
                <Text style={styles.tipText}>
                  {tipOrFact}
                </Text>
              </View>
            </View>
          ) : null}

          {/* Suggestion Card */}
          {suggestion ? (
            <View style={styles.tipCardLime}>
              <View style={styles.tipContent}>
                <Text style={[styles.tipLabel, styles.tipLabelLime]}>
                  {t('results.suggestion')}
                </Text>
                <Text style={styles.tipText}>
                  {suggestion}
                </Text>
              </View>
            </View>
          ) : null}

          {/* Bottom spacer to indicate end of page */}
          <View style={{ height: 40 }} />
        </View>
      </ScrollView>

      {/* Health Score Modal */}
      <Modal
        transparent
        visible={showHealthPopup}
        animationType="fade"
        onRequestClose={() => setShowHealthPopup(false)}
      >
        <Pressable
          style={styles.healthPopupBackdrop}
          onPress={() => setShowHealthPopup(false)}
        >
          <View
            style={styles.healthPopupCard}
            onStartShouldSetResponder={() => true}
          >

            {/* Stage label (no numerical score) */}
            <Text style={[styles.scoreLabelLarge, { color: scoreMetadata.color }]}>
              {t(scoreMetadata.translationKey)}
            </Text>

            {healthRecommendation ? (
              <Text style={styles.scoreDesc}>
                {healthRecommendation}
              </Text>
            ) : null}

            {/* Health tags in modal */}
            {healthTags.length > 0 && (
              <View style={[styles.healthTags, { marginBottom: 14 }]}>
                {healthTags.slice(0, 4).map((tag, idx) => (
                  <View
                    key={idx}
                    style={[
                      styles.htag,
                      tag.type === 'warn' && styles.htagWarn,
                      tag.type === 'good' && styles.htagGood,
                      tag.type === 'info' && styles.htagInfo,
                    ]}
                  >
                    <Text
                      style={[
                        styles.htagText,
                        tag.type === 'warn' && styles.htagTextWarn,
                        tag.type === 'good' && styles.htagTextGood,
                        tag.type === 'info' && styles.htagTextInfo,
                      ]}
                    >
                      {t(tag.translationKey)}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            <TouchableOpacity
              style={styles.scoreConfirm}
              onPress={() => setShowHealthPopup(false)}
            >
              <Text style={styles.scoreConfirmText}>
                {t('results.healthScoreDismiss')}
              </Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const getStyles = (tc: any, isDark: boolean) => StyleSheet.create({
  screenSafe: { flex: 1, backgroundColor: tc.bg },
  
  // Food hero image
  foodHero: {
    width: '100%',
    height: 280,
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1,
    borderColor: tc.cardBorder,
    marginHorizontal: 14,
    marginTop: 14,
    alignSelf: 'center',
    maxWidth: 420,
  },
  foodHeroImage: { width: '100%', height: '100%' },
  scoreLabelText: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.5,
    fontFamily: tc.fontPrimary,
  },
  dishNameTitle: {
    fontSize: 30,
    fontWeight: '700',
    letterSpacing: 0.3,
    marginTop: 50,
    marginBottom: 12,
    fontFamily: tc.fontPrimary,
    color: isDark ? tc.cream : tc.navy,
  },
  healthScoreCard: {
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 14,
    gap: 6,
    alignItems: 'flex-start',
    marginTop: 14,
    marginBottom: 10,
    backgroundColor: tc.cardBg,
  },

  // Content wrapper
  contentWrap: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: 380,
    paddingHorizontal: 14,
  },

  // Action buttons
  actionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  btnReanalyse: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tc.cardBg,
  },
  btnReanalyseText: {
    fontSize: 14,
    letterSpacing: 0.3,
    fontWeight: '700',
    fontFamily: tc.fontPrimary,
    color: tc.textMuted,
  },
  btnSave: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tc.green,
    shadowColor: tc.green,
  },
  btnSaveText: {
    fontSize: 14,
    letterSpacing: 0.3,
    fontWeight: '700',
    color: tc.white,
    fontFamily: tc.fontPrimary,
  },
  saveHint: {
    fontSize: 10,
    fontWeight: '800',
    marginTop: 8,
    marginBottom: 8,
    fontFamily: tc.fontSecondary,
    color: tc.textMuted,
  },

  // NS Card
  nsCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 18,
    marginTop: 12,
    backgroundColor: tc.cardBg,
    borderColor: tc.cardBorder,
  },
  cardTitle: {
    fontSize: 14,
    letterSpacing: 1.5,
    fontWeight: '800',
    marginBottom: 12,
    textTransform: 'uppercase',
    fontFamily: tc.fontPrimary,
    color: tc.textMuted,
  },
  cardBodyText: {
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 21,
    fontFamily: tc.fontSecondary,
    color: tc.textSecondary,
  },
  portionDisclaimerText: {
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 18,
    fontFamily: tc.fontSecondary,
    color: tc.navy,
    marginTop: 10,
  },

  // Health tags
  healthTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 12,
  },
  htag: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  htagWarn: {
    backgroundColor: `${tc.coral}1F`,
    borderColor: `${tc.coral}33`,
  },
  htagGood: {
    backgroundColor: `${tc.green}1F`,
    borderColor: `${tc.green}33`,
  },
  htagInfo: {
    backgroundColor: `${tc.navy}1F`,
    borderColor: `${tc.navy}33`,
  },
  htagText: {
    fontSize: 14,
    letterSpacing: 0.5,
    fontWeight: '700',
    fontFamily: tc.fontPrimary,
  },
  htagTextWarn: {
    color: tc.coral,
  },
  htagTextGood: {
    color: tc.green,
  },
  htagTextInfo: {
    color: tc.navy,
  },

  // Nutrition
  nutritionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  portionBadge: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    backgroundColor: `${tc.navy}1F`,
    borderColor: `${tc.navy}40`,
  },
  portionBadgeText: {
    fontSize: 10,
    letterSpacing: 0.5,
    fontWeight: '700',
    fontFamily: tc.fontPrimary,
    color: tc.navy,
  },
  editRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: tc.separator,
  },
  nutritionLabel: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: tc.navy,
    fontFamily: tc.fontPrimary,
  },
  valueGroup: { flexDirection: 'row', alignItems: 'center', gap: 2, marginRight: 5 },
  valueText: {
    fontSize: 16,
    fontWeight: '700',
    color: tc.green,
    textAlign: 'right',
    fontFamily: tc.fontPrimary,
    minWidth: 30,
  },
  inputInline: {
    width: 90,
    height: 36,
    backgroundColor: tc.track,
    borderRadius: 8,
    paddingHorizontal: 10,
    color: tc.textPrimary,
    textAlign: 'center',
    fontWeight: '700',
    fontFamily: tc.fontPrimary,
  },
  unitText: {
    fontSize: 10,
    color: tc.textMuted,
    width: 28,
    fontFamily: tc.fontPrimary,
  },
  editIcon: {
    fontSize: 12,
    color: tc.textMuted,
    paddingHorizontal: 6,
    fontFamily: tc.fontPrimary,
  },

  // Tip/Suggestion cards
  tipCardNavy: {
    borderRadius: 16,
    borderWidth: 1,
    borderLeftWidth: 3,
    padding: 16,
    marginTop: 12,
    gap: 10,
    backgroundColor: tc.cardBg,
    borderColor: `${tc.navy}33`,
    borderLeftColor: tc.navy,
  },
  tipCardLime: {
    borderRadius: 16,
    borderWidth: 1,
    borderLeftWidth: 3,
    padding: 16,
    marginTop: 12,
    gap: 10,
    backgroundColor: tc.cardBg,
    borderColor: `${tc.lime}33`,
    borderLeftColor: tc.lime,
  },
  tipContent: { flex: 1 },
  tipLabel: {
    fontSize: 10,
    letterSpacing: 1.5,
    fontWeight: '800',
    textTransform: 'uppercase',
    marginBottom: 6,
    fontFamily: tc.fontPrimary,
  },
  tipLabelNavy: {
    color: tc.navy,
  },
  tipLabelLime: {
    color: tc.lime,
  },
  tipText: {
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 21,
    fontFamily: tc.fontSecondary,
    color: tc.textSecondary,
  },

  // Health Score Modal
  healthPopupBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  healthPopupCard: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: tc.cardBg,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: `${tc.green}4D`,
    padding: 24,
    alignItems: 'center',
  },
  scoreLabelLarge: {
    fontSize: 28,
    letterSpacing: 0.5,
    fontWeight: '700',
    marginBottom: 14,
    textAlign: 'center',
  },
  scoreDesc: {
    fontSize: 16,
    fontWeight: '700',
    color: tc.textSecondary,
    lineHeight: 18,
    textAlign: 'center',
    marginBottom: 14,
    paddingHorizontal: 8,
  },
  scoreConfirm: {
    width: '100%',
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: tc.green,
    alignItems: 'center',
    shadowColor: tc.green,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 0,
  },
  scoreConfirmText: {
    color: tc.white,
    fontSize: 14,
    letterSpacing: 0.3,
    fontWeight: '700',
  },
});
