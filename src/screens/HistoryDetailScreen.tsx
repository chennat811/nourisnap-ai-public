import React, { useEffect, useState, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  TouchableOpacity,
  Alert,
  TextInput,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import BackButton from "../components/BackButton";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import type { AppNavigation, RootStackParamList } from "../types/navigation";
import { useAuth } from "../context/AuthContext";
import {
  getLogById,
  HistoryLogItem,
  analyzeLogWithAI,
  deleteFoodLog,
  saveFoodLogEditTracking,
  updateFoodLog,
  refreshFoodJson,
  HISTORY_DAY_REFRESH_FLAG,
  HISTORY_DATES_REFRESH_FLAG,
  DASHBOARD_REFRESH_FLAG,
} from "../services/api";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useLanguage } from "../context/LanguageContext";
import { calculateHealthMetadata, HealthTag } from "../utils/calculateHealthMetadata";
import { useTheme } from "../context/ThemeContext";
import { fmt1 } from "../utils/formatNumber";

type NutritionKey = "calories" | "protein_g" | "carbs_g" | "fat_g" | "sodium_mg" | "sugar_g" | "fiber_g";

export default function HistoryDetailScreen() {
  const navigation = useNavigation<AppNavigation>();
  const route = useRoute<RouteProp<RootStackParamList, "HistoryDetail">>();
  const { logId } = route.params;
  const { session } = useAuth();
  const { t, language } = useLanguage();
  const { colors: C } = useTheme();
  const styles = useMemo(() => getStyles(C), [C]);
  const [log, setLog] = useState<HistoryLogItem | null>(null);
  const [editing, setEditing] = useState<{
    calories: string;
    protein_g: string;
    carbs_g: string;
    fat_g: string;
    sodium_mg: string;
    sugar_g: string;
    fiber_g: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [foodJson, setFoodJson] = useState<any | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);

  const parseNonNegativeNumber = (value: string): number | null => {
    const trimmed = value.trim();
    if (trimmed === "") return null;
    const parsed = parseFloat(trimmed);
    if (Number.isNaN(parsed) || !Number.isFinite(parsed) || parsed < 0) {
      return null;
    }
    return Math.round(parsed * 10) / 10;
  };

  useEffect(() => {
    (async () => {
      if (!session?.user?.id) {
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      setImageFailed(false);
      try {
        const l = await getLogById(session.user.id, logId);
        setLog(l);
      } catch (e) {
        setError(t("history.loadError"));
        if (__DEV__) console.error(e);
        setLoading(false);
        return;
      }
      // Also fetch food_json to know if pending and show tips later if desired.
      // This is non-fatal: the record is still usable without it.
      try {
        const json = await refreshFoodJson(session.user.id, logId);
        if (json) setFoodJson(json);
      } catch (e) {
        if (__DEV__) console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, [session?.user?.id, logId, t]);

  const handleAnalyzeNow = async () => {
    if (!log) return;
    try {
      setAnalyzing(true);
      await analyzeLogWithAI(log.id);
      // Refresh both the summary log and food_json
      if (session?.user?.id) {
        const refreshed = await getLogById(session.user.id, log.id);
        setLog(refreshed);
        const refreshedJson = await refreshFoodJson(session.user.id, log.id);
        setFoodJson(refreshedJson);
      }
      try {
        await AsyncStorage.setItem(HISTORY_DAY_REFRESH_FLAG, "1");
        await AsyncStorage.setItem(HISTORY_DATES_REFRESH_FLAG, "1");
        await AsyncStorage.setItem(DASHBOARD_REFRESH_FLAG, "1");
      } catch {}
      Alert.alert(t('historyDetail.analysisDoneTitle'), t('historyDetail.analysisDoneMessage'));
    } catch (e: any) {
      Alert.alert(t('historyDetail.analysisFailedTitle'), e?.message || t('historyDetail.analysisFailedFallback'));
    } finally {
      setAnalyzing(false);
    }
  };

  const confirmDelete = () => {
    if (!log || !session?.user?.id) return;
    Alert.alert(t('historyDetail.deleteTitle'), t('historyDetail.deleteMessage'), [
      { text: t('historyDetail.cancel'), style: "cancel" },
      { text: t('historyDetail.deleteConfirmBtn'), style: "destructive", onPress: handleDelete },
    ]);
  };

  const handleDelete = async () => {
    if (!log || !session?.user?.id) return;
    try {
      setDeleting(true);
      await deleteFoodLog(session.user.id, log.id);
      try {
        await AsyncStorage.setItem(HISTORY_DAY_REFRESH_FLAG, "1");
        await AsyncStorage.setItem(HISTORY_DATES_REFRESH_FLAG, "1");
        await AsyncStorage.setItem(DASHBOARD_REFRESH_FLAG, "1");
      } catch {}
      Alert.alert(t('historyDetail.deletedTitle'), t('historyDetail.deletedMessage'));
      navigation.goBack();
    } catch (e: any) {
      Alert.alert(t('historyDetail.deleteFailedTitle'), e?.message || t('historyDetail.deleteFailedFallback'));
    } finally {
      setDeleting(false);
    }
  };

  // Compute health tags from stored macros + health_score (if any)
  const healthMeta = useMemo(() => {
    if (!log) return { scoreMetadata: null, tags: [] as HealthTag[] };
    return calculateHealthMetadata(
      log.health_score ?? 0,
      {
        calories: Number(log.calories) || 0,
        protein: Number(log.protein_g) || 0,
        carbs: Number(log.carbs_g) || 0,
        fat: Number(log.fat_g) || 0,
        fiber: Number(log.fiber_g) || 0,
        sodium: Number(log.sodium_mg) || 0,
      },
      C,
    );
  }, [log?.health_score, log?.calories, log?.protein_g, log?.carbs_g, log?.fat_g, log?.fiber_g, log?.sodium_mg, C, log]);
  const healthTags = healthMeta.tags;

  if (loading) return <ActivityIndicator style={{ marginTop: 24 }} />;
  if (error) {
    return (
      <SafeAreaView style={styles.screen} edges={["top"]}>
        <View style={styles.card}>
          <View style={styles.topbar}>
            <BackButton />
          </View>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      </SafeAreaView>
    );
  }
  if (!log) return <Text style={{ padding: 24 }}>{t('historyDetail.notFound')}</Text>;

  const startEditing = () => {
    setEditing({
      calories: log.calories.toString(),
      protein_g: log.protein_g.toString(),
      carbs_g: log.carbs_g.toString(),
      fat_g: log.fat_g.toString(),
      sodium_mg: (log.sodium_mg || 0).toString(),
      sugar_g: (log.sugar_g || 0).toString(),
      fiber_g: (log.fiber_g || 0).toString(),
    });
  };

  const saveChanges = async () => {
    if (!editing || !session?.user?.id) return;

    try {
      setSaving(true);
      const before = log
        ? {
            calories: Number(log.calories) || 0,
            protein_g: Number(log.protein_g) || 0,
            carbs_g: Number(log.carbs_g) || 0,
            fat_g: Number(log.fat_g) || 0,
          }
        : null;
      const fieldLabels: Record<NutritionKey, string> = {
        calories: t("historyDetail.calories"),
        protein_g: t("historyDetail.protein"),
        carbs_g: t("historyDetail.carbs"),
        fat_g: t("historyDetail.fat"),
        sodium_mg: t("historyDetail.sodium"),
        sugar_g: t("historyDetail.sugar"),
        fiber_g: t("historyDetail.fiber"),
      };

      const parsedUpdates: Partial<Record<NutritionKey, number>> = {};
      for (const key of Object.keys(editing) as NutritionKey[]) {
        const parsed = parseNonNegativeNumber(editing[key]);
        if (parsed === null) {
          Alert.alert(
            t("historyDetail.invalidValueTitle"),
            t("historyDetail.invalidValueMessage", { field: fieldLabels[key] }),
          );
          setSaving(false);
          return;
        }
        parsedUpdates[key] = parsed;
      }

      const updates = parsedUpdates as Record<NutritionKey, number>;

      await updateFoodLog(session.user.id, log.id, updates);

      try {
        await saveFoodLogEditTracking({
          user_id: session.user.id,
          log_id: log.id,
          edit_tracking: {
            nutrition_edited: true,
            ...(before && !foodJson?.edit_tracking?.nutrition_original
              ? { nutrition_original: before }
              : {}),
            nutrition_edited_values: updates,
            edited_at: new Date().toISOString(),
            edited_source: "history_detail",
          },
        });
        setFoodJson((prev: any | null) => {
          const base = prev || {};
          const existingEdit = (base as any)?.edit_tracking || {};
          return {
            ...base,
            edit_tracking: {
              ...existingEdit,
              nutrition_edited: true,
              ...(before && !existingEdit?.nutrition_original
                ? { nutrition_original: before }
                : {}),
              nutrition_edited_values: updates,
              edited_at: new Date().toISOString(),
              edited_source: "history_detail",
            },
          };
        });
      } catch (e) {
        // non-fatal
      }

      setLog((prev) => (prev ? { ...prev, ...updates } : null));
      setEditing(null);
      try {
        await AsyncStorage.setItem(HISTORY_DAY_REFRESH_FLAG, "1");
        await AsyncStorage.setItem(HISTORY_DATES_REFRESH_FLAG, "1");
        await AsyncStorage.setItem(DASHBOARD_REFRESH_FLAG, "1");
      } catch {}
      Alert.alert(t('historyDetail.updatedTitle'), t('historyDetail.updatedMessage'));
    } catch (error) {
      if (__DEV__) console.error("Error updating food log:", error);
      Alert.alert(t('historyDetail.updateFailedTitle'), t('historyDetail.updateFailedMessage'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <View style={styles.card}>
        <View style={styles.topbar}>
          <BackButton />
          <View style={styles.topbarTitleWrap}>
            <Text style={styles.topbarTitle} numberOfLines={1}>
              {(language === 'zh-TW' ? (log.title_zh || log.title) : (log.title_en || log.title)) || t('historyDetail.unnamedFood')}
            </Text>
          </View>
          {foodJson?.pending ? (
            <View style={styles.pendingPill}>
              <Text style={styles.pendingPillText}>{t('historyDetail.pendingPill')}</Text>
            </View>
          ) : null}
        </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 20 }} showsVerticalScrollIndicator={false}>
        {log.image_url && !imageFailed ? (
          <Image
            source={{ uri: log.image_url }}
            style={styles.image}
            contentFit="cover"
            transition={200}
            onError={() => setImageFailed(true)}
          />
        ) : (
          <View
            style={[
              styles.image,
              { backgroundColor: C.track, alignItems: "center", justifyContent: "center" },
            ]}
          >
            <Ionicons name="image-outline" size={32} color={C.textMuted} />
          </View>
        )}

        {(foodJson?.food_breakdown || foodJson?.food_json?.food_breakdown) && (
          <View style={styles.detailSectionPlain}>
            <Text style={styles.sectionTitle}>{t('historyDetail.foodAnalysis')}</Text>
            <Text style={styles.breakdownText}>
              {(language === 'zh-TW' ? (log.breakdown_zh || foodJson.food_breakdown || foodJson.food_json?.food_breakdown) : (log.breakdown_en || foodJson.food_breakdown || foodJson.food_json?.food_breakdown))}
            </Text>
            {healthTags && healthTags.length > 0 && (
              <View style={[styles.healthTags, { marginTop: 10 }]}>
                {healthTags.map((tag, idx) => (
                  <View
                    key={idx}
                    style={[
                      styles.htag,
                      tag.type === 'warn' && { backgroundColor: `${C.coral}1F`, borderColor: `${C.coral}33` },
                      tag.type === 'good' && { backgroundColor: `${C.green}1F`, borderColor: `${C.green}33` },
                      tag.type === 'info' && { backgroundColor: `${C.navy}1F`, borderColor: `${C.navy}33` },
                    ]}
                  >
                    <Text
                      style={[
                        styles.htagText,
                        tag.type === 'warn' && { color: C.coral },
                        tag.type === 'good' && { color: C.green },
                        tag.type === 'info' && { color: C.navy },
                      ]}
                    >
                      {t(tag.translationKey)}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {foodJson?.edit_tracking?.nutrition_edited ? (
          <View style={styles.detailSection}> 
            <Text style={styles.sectionTitle}>{t('historyDetail.editedNutrition')}</Text>
            <Text style={styles.breakdownText}>
              {foodJson?.edit_tracking?.edited_at
                ? t('historyDetail.editedAt', { time: String(foodJson.edit_tracking.edited_at) })
                : ""}
            </Text>
            <View style={styles.breakdownSeparator} />
            <View style={{ height: 8 }} />
            <Text style={styles.breakdownText}>
              {t('historyDetail.original')}
              {` ${fmt1(
                foodJson?.edit_tracking?.nutrition_original?.calories ?? 0,
              )} 大卡 / P ${fmt1(
                foodJson?.edit_tracking?.nutrition_original?.protein_g ?? 0,
              )}g / C ${fmt1(
                foodJson?.edit_tracking?.nutrition_original?.carbs_g ?? 0,
              )}g / F ${fmt1(
                foodJson?.edit_tracking?.nutrition_original?.fat_g ?? 0,
              )}g`}
            </Text>
            <Text style={styles.breakdownText}>
              {t('historyDetail.edited')}
              {` ${fmt1(
                foodJson?.edit_tracking?.nutrition_edited_values?.calories ?? 0,
              )} 大卡 / P ${fmt1(
                foodJson?.edit_tracking?.nutrition_edited_values?.protein_g ?? 0,
              )}g / C ${fmt1(
                foodJson?.edit_tracking?.nutrition_edited_values?.carbs_g ?? 0,
              )}g / F ${fmt1(
                foodJson?.edit_tracking?.nutrition_edited_values?.fat_g ?? 0,
              )}g`}
            </Text>
          </View>
        ) : null}

        <View style={styles.detailSection}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardHeaderText}>{t('historyDetail.nutritionAnalysis')}</Text>
            {!editing ? (
              <TouchableOpacity onPress={startEditing}>
                <Text style={styles.editButton}>{t('historyDetail.edit')}</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity onPress={saveChanges} disabled={saving}>
                <Text style={[styles.editButton, saving && { opacity: 0.5 }]}>
                  {saving ? t('historyDetail.saving') : t('historyDetail.save')}
                </Text>
              </TouchableOpacity>
            )}
          </View>
          <View style={styles.nutritionContainer}>
            {[
              { label: t('historyDetail.calories'), key: "calories", unit: t('historyDetail.caloriesUnit') },
              { label: t('historyDetail.protein'), key: "protein_g" },
              { label: t('historyDetail.carbs'), key: "carbs_g" },
              { label: t('historyDetail.fat'), key: "fat_g" },
              { label: t('historyDetail.sodium'), key: "sodium_mg" },
              { label: t('historyDetail.sugar'), key: "sugar_g" },
              { label: t('historyDetail.fiber'), key: "fiber_g" },
            ].map((item) => (
              <View key={item.key} style={styles.nutritionRow}>
                <Text style={styles.nutritionLabel}>{item.label}</Text>

                {editing ? (
                  <TextInput
                    style={styles.input}
                    value={editing[item.key as NutritionKey]}
                    onChangeText={(text) =>
                      setEditing((prev) =>
                        prev ? { ...prev, [item.key as NutritionKey]: text } : null,
                      )
                    }
                    keyboardType="decimal-pad"
                  />
                ) : (
                  <Text style={styles.nutritionValue}>
                    {fmt1(log[item.key as NutritionKey])} {item.unit || ""}
                  </Text>
                )}
              </View>
            ))}
          </View>

          {editing && (
            <TouchableOpacity
              onPress={() => setEditing(null)}
              style={styles.cancelButton}
            >
              <Text style={styles.cancelButtonText}>{t('historyDetail.cancel')}</Text>
            </TouchableOpacity>
          )}
        </View>

        {foodJson?.pending ? (
          <TouchableOpacity
            style={[styles.analyzeBtn, analyzing && { opacity: 0.7 }]}
            onPress={handleAnalyzeNow}
            disabled={analyzing}
          >
            <Text style={styles.analyzeBtnText}>
              {analyzing ? t('historyDetail.analyzing') : t('historyDetail.analyzeNow')}
            </Text>
          </TouchableOpacity>
        ) : null}

        <TouchableOpacity
          style={[
            styles.deleteBtn,
            (deleting || analyzing) && { opacity: 0.7 },
          ]}
          onPress={confirmDelete}
          disabled={deleting || analyzing}
        >
          <Text style={styles.deleteBtnText}>
            {deleting ? t('historyDetail.deleting') : t('historyDetail.deleteRecord')}
          </Text>
        </TouchableOpacity>
      </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const getStyles = (tc: any) => StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: tc.bg,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  card: {
    flex: 1,
    backgroundColor: tc.cardBg,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: tc.cardBorder,
    padding: 22,
  },
  topbar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 22,
  },
  topbarTitleWrap: {
    flex: 1,
    minWidth: 0,
  },
  topbarTitle: {
    fontFamily: tc.fontPrimary,
    fontSize: 20,
    color: tc.coral,
    letterSpacing: 0.5,
    lineHeight: 24,
  },
  topbarSub: {
    fontFamily: tc.fontPrimary,
    fontSize: 11,
    letterSpacing: 1.5,
    color: tc.textMuted,
    marginTop: 3,
  },
  image: {
    width: "100%",
    height: 180,
    borderRadius: 18,
    marginBottom: 18,
    borderWidth: 2,
    borderColor: tc.cardBorder,
  },
  detailSection: {
    backgroundColor: tc.track,
    borderWidth: 2,
    borderColor: tc.cardBorder,
    borderRadius: 18,
    padding: 16,
    marginBottom: 18,
  },
  detailSectionPlain: {
    marginBottom: 18,
  },
  sectionTitle: {
    fontFamily: tc.fontPrimary,
    fontSize: 16,
    letterSpacing: 0.5,
    color: tc.lime,
    marginBottom: 12,
  },
  breakdownText: {
    fontFamily: tc.fontSecondary,
    fontSize: 14,
    fontWeight: "700",
    color: tc.navy,
    lineHeight: 20,
  },
  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    marginBottom: 12,
  },
  cardHeaderText: {
    fontFamily: tc.fontPrimary,
    fontSize: 16,
    letterSpacing: 0.5,
    color: tc.lime,
  },
  editButton: {
    fontFamily: tc.fontPrimary,
    color: tc.coral,
    fontSize: 14,
    letterSpacing: 1,
    fontWeight: "600",
  },
  nutritionContainer: {
    marginTop: 8,
  },
  nutritionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: tc.separator,
  },
  nutritionLabel: {
    fontFamily: tc.fontPrimary,
    fontSize: 14,
    color: tc.navy,
  },
  nutritionValue: {
    fontFamily: tc.fontPrimary,
    fontSize: 14,
    color: tc.green,
  },
  input: {
    borderWidth: 1,
    borderColor: tc.cardBorder,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
    width: 80,
    textAlign: "right",
    fontSize: 14,
    color: tc.green,
    backgroundColor: tc.headerBg,
    fontFamily: tc.fontPrimary,
  },
  cancelButton: {
    marginTop: 12,
    padding: 8,
    alignItems: "center",
  },
  cancelButtonText: {
    fontFamily: tc.fontPrimary,
    color: tc.green,
    fontWeight: "600",
  },
  pendingPill: {
    backgroundColor: "#FEF3C7",
    borderRadius: 9999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  pendingPillText: {
    fontFamily: tc.fontPrimary,
    color: "#92400E",
    fontSize: 12,
    fontWeight: "700",
  },
  analyzeBtn: {
    marginTop: 16,
    backgroundColor: tc.green,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
  },
  analyzeBtnText: {
    fontFamily: tc.fontPrimary,
    color: tc.white,
    fontSize: 16,
    fontWeight: "700",
  },
  deleteBtn: {
    width: "100%",
    padding: 14,
    borderRadius: 16,
    backgroundColor: tc.coral + "1A",
    borderWidth: 2,
    borderColor: tc.coral + "40",
    marginTop: 4,
    alignItems: "center",
  },
  deleteBtnText: {
    fontFamily: tc.fontPrimary,
    color: tc.coral,
    fontSize: 16,
    letterSpacing: 0.3,
    fontWeight: "700",
  },
  // Health tags (shared look with ResultsScreen)
  healthTags: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 8,
  },
  htag: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: tc.cardBorder,
  },
  htagText: {
    fontFamily: tc.fontPrimary,
    fontSize: 14,
    fontWeight: "700",
  },
  breakdownSeparator: {
    height: 1,
    backgroundColor: tc.cardBorder,
    alignSelf: "stretch",
    marginTop: 8,
    marginBottom: 12,
  },
  errorText: {
    padding: 24,
    color: tc.coral,
    fontFamily: tc.fontSecondary,
    fontSize: 14,
    textAlign: "center",
  },
});
