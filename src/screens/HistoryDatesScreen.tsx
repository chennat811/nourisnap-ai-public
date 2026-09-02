import React, { useEffect, useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import BackButton from "../components/BackButton";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import type { AppNavigation } from "../types/navigation";
import { useAuth } from "../context/AuthContext";
import {
  getHistoryDates,
  getMealCaloriesForDateISO,
  historyTotalsKey,
  historyTotalsGet,
  historyTotalsSet,
  historyTotalsClearAll,
  getUserSettingsCached,
  HISTORY_DATES_REFRESH_FLAG,
} from "../services/api";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useLanguage } from "../context/LanguageContext";
import { useTheme } from "../context/ThemeContext";

// Use shared cache from api.ts helpers instead of a local module cache

export default function HistoryDatesScreen() {
  const navigation = useNavigation<AppNavigation>();
  const { session } = useAuth();
  const { t, language } = useLanguage();
  const { colors: C } = useTheme();
  const styles = useMemo(() => getStyles(C), [C]);
  const [dates, setDates] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [totals, setTotals] = useState<Record<string, number>>({});
  const [calorieTarget, setCalorieTarget] = useState<number>(2000);
  const [error, setError] = useState<string | null>(null);
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    if (!session?.user?.id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      // Load user's calorie target
      const settings = await getUserSettingsCached(session.user.id, { refresh: false });
      if (settings?.calorie_target) {
        setCalorieTarget(settings.calorie_target);
      }

      const ds = await getHistoryDates(session.user.id);
      setDates(ds);

      // Build from shared cache first
      const base: Record<string, number> = {};
      const missing: string[] = [];
      for (const d of ds) {
        const key = historyTotalsKey(session.user.id, d);
        const cached = historyTotalsGet(key);
        if (typeof cached === "number") base[d] = cached;
        else missing.push(d);
      }

      // Fetch only missing totals in parallel
      const fetchedEntries = await Promise.all(
        missing.map(async (d) => {
          try {
            const perMeal = await getMealCaloriesForDateISO(session.user.id, d);
            const total = Object.values(perMeal).reduce(
              (a, b) => a + (b ?? 0),
              0,
            );
            historyTotalsSet(historyTotalsKey(session.user.id, d), total); // update shared cache
            return [d, total] as const;
          } catch {
            historyTotalsSet(historyTotalsKey(session.user.id, d), 0);
            return [d, 0] as const;
          }
        }),
      );

      const merged = {
        ...base,
        ...Object.fromEntries(fetchedEntries),
      } as Record<string, number>;
      setTotals(merged);
    } catch (e) {
      setError(t("history.loadError"));
      if (__DEV__) console.error(e);
    } finally {
      setLoading(false);
    }
  }, [session?.user?.id, t]);

  useEffect(() => {
    load();
  }, [load]);

  // If a background import happened, refresh when focusing this screen
  useFocusEffect(
    useCallback(() => {
      (async () => {
        try {
          const flag = await AsyncStorage.getItem(HISTORY_DATES_REFRESH_FLAG);
          if (flag === "1") {
            await AsyncStorage.removeItem(HISTORY_DATES_REFRESH_FLAG);
            historyTotalsClearAll(); // discard stale in-memory totals so load() re-fetches from DB
            await load();
          }
        } catch {}
      })();
    }, [load]),
  );

  const getTodayISO = () => {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  };

  const groupDatesByMonth = (dates: string[]) => {
    const groups: Record<string, string[]> = {};
    dates.forEach((date) => {
      const [year, month] = date.split("-");
      const key = `${year}-${month}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(date);
    });
    return groups;
  };

  const formatMonthYear = (monthKey: string, locale = language) => {
    const [year, month] = monthKey.split("-");
    const date = new Date(Number(year), Number(month) - 1);
    return date.toLocaleDateString(locale, { month: "long", year: "numeric" });
  };

  const toggleMonth = (monthKey: string) => {
    setExpandedMonths((prev) => {
      const next = new Set(prev);
      if (next.has(monthKey)) {
        next.delete(monthKey);
      } else {
        next.add(monthKey);
      }
      return next;
    });
  };

  const monthGroups = useMemo(() => groupDatesByMonth(dates), [dates]);
  const sortedMonthKeys = useMemo(
    () => Object.keys(monthGroups).sort().reverse(),
    [monthGroups]
  );

  // Auto-expand current month
  useEffect(() => {
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    setExpandedMonths(new Set([currentMonth]));
  }, []);

  const renderItem = ({ item }: { item: string }) => {
    const isToday = item === getTodayISO();
    const calories = totals[item] ?? 0;
    const progress = calorieTarget > 0 ? Math.min(calories / calorieTarget, 1) : 0;
    const progressColor = C.navy;

    return (
      <TouchableOpacity
        style={[styles.dateItem, isToday && styles.dateItemToday]}
        onPress={() =>
          navigation.navigate("HistoryDay", { dateISO: item })
        }
      >
        <View style={styles.historyLeft}>
          <Text style={styles.dateText}>{item}</Text>
          <View style={styles.barWrap}>
            <View style={styles.miniBar}>
              <View
                style={[
                  styles.miniFill,
                  { width: `${progress * 100}%`, backgroundColor: progressColor },
                ]}
              />
            </View>
          </View>
        </View>
        <View style={styles.historyRight}>
          {isToday && <View style={styles.todayBadge}><Text style={styles.todayBadgeText}>{t("history.today")}</Text></View>}
          <View style={styles.calWrap}>
            <Text style={styles.totalText}>{calories}</Text>
            <Text style={styles.totalUnit}> kcal</Text>
          </View>
          <Text style={styles.chevron}>›</Text>
        </View>
      </TouchableOpacity>
    );
  };

  // On screen focus, refresh today's total so new logs are reflected immediately
  useFocusEffect(
    useCallback(() => {
      if (!session?.user?.id) return;
      const now = new Date();
      const yyyy = now.getFullYear();
      const mm = String(now.getMonth() + 1).padStart(2, "0");
      const dd = String(now.getDate()).padStart(2, "0");
      const todayISO = `${yyyy}-${mm}-${dd}`;
      if (!dates.includes(todayISO)) return;

      (async () => {
        try {
          const perMeal = await getMealCaloriesForDateISO(
            session.user.id,
            todayISO,
          );
          const total = Object.values(perMeal).reduce(
            (a, b) => a + (b ?? 0),
            0,
          );
          historyTotalsSet(historyTotalsKey(session.user.id, todayISO), total);
          setTotals((prev) => ({ ...prev, [todayISO]: total }));
        } catch (_) {
          // noop
        }
      })();
    }, [session?.user?.id, dates]),
  );

  const sections = useMemo(
    () =>
      sortedMonthKeys.map((monthKey) => ({
        title: monthKey,
        data: expandedMonths.has(monthKey) ? monthGroups[monthKey] : [],
      })),
    [sortedMonthKeys, monthGroups, expandedMonths]
  );

  const extraData = useMemo(
    () => ({ totals, calorieTarget }),
    [totals, calorieTarget]
  );

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <View style={styles.card}>
        <View style={styles.topbar}>
          <BackButton />
          <View style={styles.topbarTitleWrap}>
            <Text style={styles.topbarTitle}>{t('history.title')}</Text>
          </View>
        </View>
        {loading ? (
          <ActivityIndicator style={{ marginTop: 24 }} color={C.green} />
        ) : error ? (
          <Text style={styles.errorText}>{error}</Text>
        ) : dates.length === 0 ? (
          <Text style={styles.emptyText}>{t('history.noHistory')}</Text>
        ) : (
          <SectionList
            sections={sections}
            keyExtractor={(item) => item}
            renderSectionHeader={({ section: { title: monthKey } }) => {
              const isExpanded = expandedMonths.has(monthKey);
              const monthDates = monthGroups[monthKey];
              const totalCals = monthDates.reduce(
                (sum, d) => sum + (totals[d] ?? 0),
                0,
              );
              return (
                <View style={styles.monthSection}>
                  <TouchableOpacity
                    style={styles.monthHeader}
                    onPress={() => toggleMonth(monthKey)}
                  >
                    <View style={styles.monthHeaderLeft}>
                      <Text style={styles.monthChevron}>
                        {isExpanded ? "▼" : "▶"}
                      </Text>
                      <Text style={styles.monthTitle}>
                        {formatMonthYear(monthKey)}
                      </Text>
                    </View>
                    <Text style={styles.monthTotal}>{totalCals} kcal</Text>
                  </TouchableOpacity>
                </View>
              );
            }}
            renderItem={renderItem}
            contentContainerStyle={{ paddingBottom: 20 }}
            showsVerticalScrollIndicator={false}
            extraData={extraData}
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
  dateItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 0,
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: tc.separator,
  },
  dateItemToday: {
    borderBottomColor: tc.separator,
  },
  historyLeft: {
    flex: 1,
    gap: 5,
  },
  dateText: {
    fontFamily: tc.fontPrimary,
    fontSize: 18,
    color: tc.lime,
    letterSpacing: 0.3,
  },
  barWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  miniBar: {
    width: 80,
    height: 4,
    backgroundColor: tc.separator,
    borderRadius: 3,
    overflow: "hidden",
  },
  miniFill: {
    height: "100%",
    borderRadius: 3,
  },
  historyRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  todayBadge: {
    backgroundColor: tc.green + "26",
    borderWidth: 1,
    borderColor: tc.green + "4D",
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  todayBadgeText: {
    fontFamily: tc.fontPrimary,
    fontSize: 12,
    letterSpacing: 1,
    color: tc.green,
  },
  calWrap: {
    flexDirection: "row",
    alignItems: "baseline",
  },
  totalText: {
    fontFamily: tc.fontSecondary,
    fontSize: 16,
    color: tc.textSecondary,
  },
  totalUnit: {
    fontFamily: tc.fontPrimary,
    fontSize: 10,
    color: tc.textMuted,
    letterSpacing: 0.5,
  },
  chevron: {
    fontSize: 18,
    color: tc.textMuted,
    marginLeft: 8,
  },
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
  monthSection: {
    marginBottom: 16,
  },
  monthHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: tc.track,
    borderWidth: 2,
    borderColor: tc.cardBorder,
    marginBottom: 8,
  },
  monthHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  monthChevron: {
    fontSize: 10,
    color: tc.textMuted,
  },
  monthTitle: {
    fontFamily: tc.fontPrimary,
    fontSize: 18,
    color: tc.navy,
    letterSpacing: 0.3,
  },
  monthTotal: {
    fontFamily: tc.fontSecondary,
    fontSize: 14,
    color: tc.textSecondary,
    fontWeight: "600",
  },
});
