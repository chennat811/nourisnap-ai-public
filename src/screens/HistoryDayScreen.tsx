import React, { useEffect, useState, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import BackButton from "../components/BackButton";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  useNavigation,
  useRoute,
  RouteProp,
  useFocusEffect,
} from "@react-navigation/native";
import type { AppNavigation, RootStackParamList } from "../types/navigation";
import { useAuth } from "../context/AuthContext";
import { getLogsForDate, HistoryLogItem, HISTORY_DAY_REFRESH_FLAG } from "../services/api";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useLanguage } from "../context/LanguageContext";
import { useTheme } from "../context/ThemeContext";
import { fmt1 } from "../utils/formatNumber";

function HistoryThumbnail({
  uri,
  style,
  emptyStyle,
  iconColor,
}: {
  uri?: string | null;
  style: any;
  emptyStyle: any;
  iconColor: string;
}) {
  const [failed, setFailed] = useState(false);

  if (!uri || failed) {
    return (
      <View style={[style, emptyStyle, { alignItems: "center", justifyContent: "center" }]}>
        <Ionicons name="image-outline" size={22} color={iconColor} />
      </View>
    );
  }

  return (
    <Image
      source={{ uri }}
      style={style}
      contentFit="cover"
      transition={200}
      onError={() => setFailed(true)}
    />
  );
}

export default function HistoryDayScreen() {
  const navigation = useNavigation<AppNavigation>();
  const route = useRoute<RouteProp<RootStackParamList, "HistoryDay">>();
  const { dateISO } = route.params;
  const { session } = useAuth();
  const { t, language } = useLanguage();
  const { colors: C } = useTheme();
  const styles = useMemo(() => getStyles(C), [C]);
  const [logs, setLogs] = useState<HistoryLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (!session?.user?.id) {
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const ls = await getLogsForDate(session.user.id, dateISO);
        setLogs(ls);
      } catch (e) {
        setError(t("history.loadError"));
        if (__DEV__) console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, [session?.user?.id, dateISO, t]);

  // If a background import happened, refresh when focusing this screen
  useFocusEffect(
    React.useCallback(() => {
      (async () => {
        try {
          const flag = await AsyncStorage.getItem(HISTORY_DAY_REFRESH_FLAG);
          if (flag === "1") {
            await AsyncStorage.removeItem(HISTORY_DAY_REFRESH_FLAG);
            if (!session?.user?.id) return;
            setLoading(true);
            setError(null);
            try {
              const ls = await getLogsForDate(session.user.id, dateISO);
              setLogs(ls);
            } catch (e) {
              setError(t("history.loadError"));
              if (__DEV__) console.error(e);
            } finally {
              setLoading(false);
            }
          }
        } catch {}
      })();
    }, [session?.user?.id, dateISO, t]),
  );

  const daySummary = useMemo(() => {
    const totals = logs.reduce(
      (acc, log) => ({
        calories: acc.calories + (log.calories || 0),
        protein: acc.protein + (log.protein_g || 0),
        carbs: acc.carbs + (log.carbs_g || 0),
        fat: acc.fat + (log.fat_g || 0),
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0 }
    );
    return totals;
  }, [logs]);

  const sections = useMemo(() => {
    const order: Array<NonNullable<HistoryLogItem["meal_type"]>> = [
      "breakfast",
      "lunch",
      "dinner",
      "snack",
    ];
    const label: Record<string, string> = {
      breakfast: t('dashboard.breakfast'),
      lunch: t('dashboard.lunch'),
      dinner: t('dashboard.dinner'),
      snack: t('dashboard.snack'),
    };
    const buckets: Record<string, HistoryLogItem[]> = {
      breakfast: [],
      lunch: [],
      dinner: [],
      snack: [],
    } as any;
    for (const l of logs) {
      const key = l.meal_type && buckets[l.meal_type] ? l.meal_type : "snack";
      buckets[key].push(l);
    }
    return order
      .map((k) => ({ title: label[k], data: buckets[k] }))
      .filter((s) => s.data.length > 0);
  }, [logs, t]);

  const renderItem = ({ item }: { item: HistoryLogItem }) => (
    <TouchableOpacity
      style={styles.row}
      onPress={() =>
        navigation.navigate("HistoryDetail", { logId: item.id })
      }
    >
      <HistoryThumbnail
        uri={item.image_url}
        style={styles.thumb}
        emptyStyle={{ backgroundColor: C.track }}
        iconColor={C.textMuted}
      />
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Text style={[styles.title, { flex: 1 }]} numberOfLines={1}>
            {(language === 'zh-TW' ? (item.title_zh || item.title) : (item.title_en || item.title)) || t('history.unnamedFood')}
          </Text>
          {item.nutrition_edited ? (
            <View style={styles.editedPill}>
              <Text style={styles.editedPillText}>{t('history.editedPill')}</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.meta}>
          {fmt1(item.calories)} {t('history.kcal')} · P {fmt1(item.protein_g)}g · C{" "}
          {fmt1(item.carbs_g)}g · F {fmt1(item.fat_g)}g
        </Text>
        <Text style={styles.meta}>
          Na {fmt1(item.sodium_mg)}mg · {t('history.sugar')} {fmt1(item.sugar_g)}g · {t('history.fiber')}{" "}
          {fmt1(item.fiber_g)}g
        </Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <View style={styles.card}>
        <View style={styles.topbar}>
          <BackButton />
          <View style={styles.topbarTitleWrap}>
            <Text style={styles.topbarTitle}>{dateISO}</Text>
          </View>
        </View>
        {!loading && logs.length > 0 && (
          <View>
            <Text style={styles.daySummaryTitle}>{t('history.nutritionSummary')}</Text>
            <View style={styles.daySummary}>
              <View style={styles.daySumPill}>
                <Text style={[styles.daySumVal, { color: C.navy }]}>{fmt1(daySummary.calories)}</Text>
                <Text style={styles.daySumLabel}>{t('history.kcal')}</Text>
              </View>
              <View style={styles.daySumPill}>
                <Text style={[styles.daySumVal, { color: C.green }]}>{fmt1(daySummary.protein)}g</Text>
                <Text style={styles.daySumLabel}>{t('dashboard.protein')}</Text>
              </View>
              <View style={styles.daySumPill}>
                <Text style={[styles.daySumVal, { color: C.green }]}>{fmt1(daySummary.carbs)}g</Text>
                <Text style={styles.daySumLabel}>{t('dashboard.carbs')}</Text>
              </View>
              <View style={styles.daySumPill}>
                <Text style={[styles.daySumVal, { color: C.green }]}>{fmt1(daySummary.fat)}g</Text>
                <Text style={styles.daySumLabel}>{t('dashboard.fat')}</Text>
              </View>
            </View>
            <View style={styles.daySummarySeparator} />
          </View>
        )}
        {loading ? (
          <ActivityIndicator style={{ marginTop: 24 }} color={C.green} />
        ) : error ? (
          <Text style={styles.errorText}>{error}</Text>
        ) : logs.length === 0 ? (
          <Text style={styles.emptyText}>{t('history.noRecordForDay')}</Text>
        ) : (
          <SectionList
            sections={sections}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            renderSectionHeader={({ section }) => (
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionHeaderText}>{section.title}</Text>
              </View>
            )}
            ItemSeparatorComponent={() => <View style={styles.itemDivider} />}
            SectionSeparatorComponent={() => (
              <View style={styles.sectionDivider} />
            )}
            contentContainerStyle={{ paddingBottom: 20 }}
            showsVerticalScrollIndicator={false}
          />
        )}
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
  },
  topbarTitle: {
    fontFamily: tc.fontPrimary,
    fontSize: 25,
    color: tc.coral,
    letterSpacing: 0.3,
    lineHeight: 36,
  },
  sectionHeader: {
    paddingVertical: 2,
    paddingHorizontal: 2
    },
  sectionHeaderText: {
    fontFamily: tc.fontPrimary,
    fontSize: 16,
    letterSpacing: 0.5,
    color: tc.lime,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: tc.track,
    borderWidth: 2,
    borderColor: tc.cardBorder,
    marginBottom: 8,
  },
  thumb: {
    width: 52,
    height: 52,
    borderRadius: 12,
    backgroundColor: tc.separator,
  },
  title: {
    fontFamily: tc.fontPrimary,
    fontSize: 15,
    color: tc.navy,
    fontWeight: "600",
  },
  editedPill: {
    backgroundColor: tc.tipBubbleBg,
    borderColor: tc.green,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 9999,
    marginLeft: 8,
  },
  editedPillText: {
    fontFamily: tc.fontPrimary,
    color: tc.green,
    fontSize: 12,
    fontWeight: "800",
  },
  meta: {
    fontFamily: tc.fontSecondary,
    fontSize: 12,
    fontWeight: "700",
    color: tc.textMuted,
    marginTop: 4,
    lineHeight: 18,
  },
  chevron: {
    fontSize: 12,
    color: tc.textMuted + "33",
  },
  itemDivider: { height: 0 },
  sectionDivider: { height: 18 },
  emptyText: {
    padding: 24,
    color: tc.textPrimary,
    fontFamily: tc.fontSecondary,
    fontSize: 14,
    textAlign: "center",
  },
  errorText: {
    padding: 24,
    color: tc.coral,
    fontFamily: tc.fontSecondary,
    fontSize: 14,
    textAlign: "center",
  },
  daySummary: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  daySumPill: {
    flex: 1,
    backgroundColor: tc.cardBg,
    borderWidth: 2,
    borderColor: tc.cardBg,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 0,
    alignItems: "center",
  },
  daySumVal: {
    fontFamily: tc.fontPrimary,
    fontSize: 16,
    lineHeight: 20,
    marginBottom: 3,
  },
  daySumLabel: {
    fontFamily: tc.fontSecondary,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.5,
    color: tc.textMuted,
  },
  daySummaryTitle: {
    fontFamily: tc.fontPrimary,
    fontSize: 16,
    color: tc.lime,
    fontWeight: "600",
    marginBottom: 10,
  },
  daySummarySeparator: {
    height: 1,
    backgroundColor: tc.separator,
    opacity: 0.3,
    marginBottom: 12,
  },
});
