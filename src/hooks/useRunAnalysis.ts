import { useEffect, useRef } from "react";
import { DAILY_SCAN_LIMIT } from "../hooks/useDailyLimit";
import { Alert } from "react-native";
import {
  sendPhotoBase64ToOpenAI,
  sendTextPromptToOpenAI,
} from "../services/api";
import { supabase } from "../lib/supabase";
import { FoodAnalysis } from "../types/analysis";
import { AnalysisLoadingScreenNavigationProp } from "../types/navigation";

// Validate that the analysis response contains usable nutrition data before
// showing the Results screen.
function hasValidAnalysisData(analysis: FoodAnalysis | null | undefined): boolean {
  if (!analysis || typeof analysis !== "object") return false;
  if (Array.isArray(analysis.foodItems) && analysis.foodItems.length > 0) return true;
  if (typeof analysis.calories === "number" && isFinite(analysis.calories)) return true;
  if (typeof analysis.carbs_g === "number" && isFinite(analysis.carbs_g)) return true;
  if (typeof analysis.protein_g === "number" && isFinite(analysis.protein_g)) return true;
  if (typeof analysis.fat_g === "number" && isFinite(analysis.fat_g)) return true;
  if (typeof analysis.dish_name === "string" && analysis.dish_name.trim().length > 0) return true;
  if (typeof analysis.food_breakdown === "string" && analysis.food_breakdown.trim().length > 0) return true;
  return false;
}

export interface UseRunAnalysisOptions {
  imageUri?: string;
  mealType?: "breakfast" | "lunch" | "dinner" | "snack";
  portion?: number;
  recordedDateISO?: string;
  query?: string;
  servings?: number;
  foodBreakdown?: string;
  sugarLevel?: number | null;
  foodType?: "drink" | "dish" | "packaged";
  confirmedSubstance?: "alcohol" | "drugs" | null;
  drinkType?: "creamer" | "fresh_milk" | "pure_tea" | "fruit" | null;
  hasEditedIngredients?: boolean;
  limitLoading: boolean;
  canScan: boolean;
  isAdminBypass: boolean;
  language: string;
  t: (key: string, options?: any) => string;
  navigation: AnalysisLoadingScreenNavigationProp;
}

export function useRunAnalysis({
  imageUri,
  mealType,
  portion,
  recordedDateISO,
  query,
  servings,
  foodBreakdown,
  sugarLevel,
  foodType,
  confirmedSubstance,
  drinkType,
  hasEditedIngredients,
  limitLoading,
  canScan,
  isAdminBypass,
  language,
  t,
  navigation,
}: UseRunAnalysisOptions): void {
  const hasStartedRef = useRef(false);
  const isMountedRef = useRef(true);
  const abortControllerRef = useRef(new AbortController());

  useEffect(() => {
    isMountedRef.current = true;
    // Reset the controller on mount so a remounted screen gets a fresh signal.
    abortControllerRef.current = new AbortController();
    return () => {
      isMountedRef.current = false;
      abortControllerRef.current.abort();
    };
  }, []);

  useEffect(() => {
    if (limitLoading) return;
    if (hasStartedRef.current) return;
    if (!canScan) {
      if (!isMountedRef.current) return;
      Alert.alert(
        t("dashboard.scanLimitAlertTitle"),
        t("dashboard.scanLimitAlertBody", { limit: DAILY_SCAN_LIMIT }),
        [{ text: t("dashboard.scanLimitAlertBtn"), onPress: () => navigation.navigate("Dashboard") }],
      );
      return;
    }
    hasStartedRef.current = true;

    const analyze = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const accessToken = data?.session?.access_token;
        if (!accessToken) {
          if (!isMountedRef.current) return;
          Alert.alert(
            t("common.error"),
            t("auth.signInRequired"),
            [{ text: t("common.ok"), onPress: () => navigation.navigate("SignIn") }],
          );
          return;
        }

        let analysis: FoodAnalysis;
        if (imageUri) {
          const useMode = foodBreakdown ? "analysis" : "single_pass";
          analysis = await sendPhotoBase64ToOpenAI(imageUri, accessToken, {
            portion,
            query,
            servings,
            mode: useMode,
            foodBreakdown,
            sugarLevel: sugarLevel ?? undefined,
            foodType,
            confirmedSubstance,
            drinkType: drinkType ?? undefined,
            language,
            adminBypass: isAdminBypass,
            signal: abortControllerRef.current.signal,
          });
        } else if (query) {
          analysis = await sendTextPromptToOpenAI(accessToken, {
            query,
            portion,
            servings,
            foodBreakdown,
            sugarLevel: sugarLevel ?? undefined,
            confirmedSubstance,
            drinkType: drinkType ?? undefined,
            language,
            adminBypass: isAdminBypass,
            signal: abortControllerRef.current.signal,
          });
        } else {
          if (!isMountedRef.current) return;
          Alert.alert(
            t("common.error"),
            t("errors.noInputProvided"),
            [
              {
                text: t("common.cancel"),
                onPress: () => navigation.navigate("Dashboard"),
                style: "cancel",
              },
              {
                text: t("common.retake"),
                onPress: () =>
                  navigation.replace("MealCapture", {
                    mealType,
                    portion,
                    recordedDateISO,
                  }),
              },
            ],
          );
          return;
        }

        // Defensive: the edge function may return the payload as a string in some
        // edge cases (raw body, wrapper with `response`, etc.). Parse it here so
        // validation and navigation always receive an object.
        let parsedAnalysis: any = analysis;
        if (typeof parsedAnalysis === "string") {
          try {
            parsedAnalysis = JSON.parse(parsedAnalysis);
          } catch (e) {
            parsedAnalysis = { raw: parsedAnalysis };
          }
        }
        if (parsedAnalysis && typeof parsedAnalysis === "object") {
          if (typeof parsedAnalysis.response === "string") {
            const cleaned = String(parsedAnalysis.response)
              .replace(/^```json\s*/i, "")
              .replace(/^```\s*/i, "")
              .replace(/```\s*$/i, "")
              .replace(/,\s*([}\]])/g, "$1");
            const first = cleaned.indexOf("{");
            const last = cleaned.lastIndexOf("}");
            if (first !== -1 && last !== -1 && last > first) {
              try {
                parsedAnalysis = JSON.parse(cleaned.slice(first, last + 1));
              } catch {
                parsedAnalysis = { raw: parsedAnalysis.response };
              }
            } else {
              parsedAnalysis = { raw: parsedAnalysis.response };
            }
          } else if (typeof parsedAnalysis.analysis === "string") {
            try {
              parsedAnalysis = JSON.parse(parsedAnalysis.analysis);
            } catch {
              parsedAnalysis = { raw: parsedAnalysis.analysis };
            }
          } else if (typeof parsedAnalysis.analysis === "object") {
            parsedAnalysis = parsedAnalysis.analysis;
          }
        }

        const serializable =
          parsedAnalysis && typeof parsedAnalysis === "object"
            ? JSON.parse(JSON.stringify(parsedAnalysis))
            : parsedAnalysis;

        if (!hasValidAnalysisData(parsedAnalysis)) {
          if (__DEV__) {
            console.warn(
              "[AnalysisLoading] Malformed analysis response; not navigating to Results",
              parsedAnalysis,
            );
          }
          if (!isMountedRef.current) return;
          Alert.alert(
            t("errors.analysisInvalidTitle"),
            t("errors.analysisInvalidMessage"),
            imageUri
              ? [
                  {
                    text: t("common.retake"),
                    onPress: () =>
                      navigation.replace("MealCapture", {
                        mealType,
                        portion,
                        recordedDateISO,
                      }),
                  },
                  {
                    text: t("common.cancel"),
                    onPress: () => navigation.navigate("Dashboard"),
                  },
                ]
              : [{ text: t("common.cancel"), onPress: () => navigation.navigate("Dashboard") }],
          );
          return;
        }

        if (!isMountedRef.current) return;
        navigation.replace("Results", {
          analysis: { ...serializable, imageUri: imageUri || null },
          mealType,
          portion,
          servings,
          recordedDateISO,
          query,
          sugarLevel,
          drinkType,
          justEdited: hasEditedIngredients === true,
        });
      } catch (error: any) {
        if (
          error?.name === "AbortError" ||
          error?.message?.includes("aborted")
        ) {
          if (abortControllerRef.current.signal.aborted) {
            // User left the screen; no need to alert
            return;
          }
          // Timeout while the screen was still active
          if (!isMountedRef.current) return;
          Alert.alert(
            t("common.error"),
            t("errors.networkError"),
            [{ text: t("common.ok"), onPress: () => navigation.canGoBack() ? navigation.goBack() : navigation.navigate("Dashboard") }],
          );
          return;
        }
        if (error?.code === "DAILY_LIMIT_REACHED") {
          if (!isMountedRef.current) return;
          Alert.alert(
            t("dashboard.scanLimitAlertTitle"),
            t("dashboard.scanLimitAlertBody", { limit: DAILY_SCAN_LIMIT }),
            [{ text: t("dashboard.scanLimitAlertBtn"), onPress: () => navigation.navigate("Dashboard") }],
          );
          return;
        }
        if (error?.code === "NETWORK_ERROR") {
          if (!isMountedRef.current) return;
          Alert.alert(
            t("common.error"),
            t("errors.networkError"),
            [{ text: t("common.ok"), onPress: () => navigation.canGoBack() ? navigation.goBack() : navigation.navigate("Dashboard") }],
          );
          return;
        }

        if (!isMountedRef.current) return;
        Alert.alert(
          t("common.error"),
          t("errors.analysisFailed"),
          [{ text: t("common.ok"), onPress: () => navigation.canGoBack() ? navigation.goBack() : navigation.navigate("Dashboard") }],
        );
      }
    };

    analyze();
  }, [
    imageUri,
    mealType,
    portion,
    recordedDateISO,
    query,
    servings,
    foodBreakdown,
    sugarLevel,
    foodType,
    confirmedSubstance,
    drinkType,
    hasEditedIngredients,
    limitLoading,
    canScan,
    isAdminBypass,
    language,
    t,
    navigation,
  ]);
}
