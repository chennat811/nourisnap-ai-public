import React, { useMemo, useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  Dimensions,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { AppNavigation } from "../types/navigation";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import BackButton from "../components/BackButton";
import AppIcon from "../components/AppIcon";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  computeTargetsFromProfile,
  upsertUserSettings,
  SexType,
  ActivityLevel,
  GoalType,
  getUserSettingsCached,
  DASHBOARD_REFRESH_FLAG,
} from "../services/api";
import { useLanguage } from "../context/LanguageContext";

export default function UserQuestionnaireScreen() {
  const navigation = useNavigation<AppNavigation>();
  const { session } = useAuth();
  const { t } = useLanguage();
  const { colors: C, isDark } = useTheme();
  const styles = useMemo(() => getStyles(C), [C]);
  const insets = useSafeAreaInsets();

  const [step, setStep] = useState(0);

  // Profile inputs
  const [age, setAge] = useState<string>("30");
  const [sex, setSex] = useState<SexType>("female");
  const [weightKg, setWeightKg] = useState<string>("70");
  const [heightCm, setHeightCm] = useState<string>("175");
  const [weightUnit, setWeightUnit] = useState<"kg" | "lb">("kg");
  const [heightUnit, setHeightUnit] = useState<"cm" | "in">("cm");

  // Activity & goal
  const [activity, setActivity] = useState<ActivityLevel>("light");
  const [goal, setGoal] = useState<GoalType>("maintain");

  // Helpers: unit conversion to metric
  const toMetric = useMemo(
    () => ({
      weight_kg:
        weightUnit === "kg"
          ? Number(weightKg) || 0
          : Math.round((Number(weightKg) || 0) * 0.453592 * 10) / 10,
      height_cm:
        heightUnit === "cm"
          ? Number(heightCm) || 0
          : Math.round((Number(heightCm) || 0) * 2.54 * 10) / 10,
    }),
    [weightKg, heightCm, weightUnit, heightUnit],
  );

  // Overrides
  const computed = useMemo(() => {
    const a = Number(age) || 0;
    const w = toMetric.weight_kg;
    const h = toMetric.height_cm;
    if (!a || !w || !h)
      return {
        calories: 0,
        protein_g: 0,
        carbs_g: 0,
        fat_g: 0,
        sodium_mg: 0,
        sugar_g: 0,
        fiber_g: 0,
      };
    return computeTargetsFromProfile({
      age: a,
      sex,
      weight_kg: w,
      height_cm: h,
      activity_level: activity,
      goal,
    });
  }, [age, sex, toMetric, activity, goal]);

  const [calories, setCalories] = useState<string>("");
  const [protein, setProtein] = useState<string>("");
  const [carbs, setCarbs] = useState<string>("");
  const [fat, setFat] = useState<string>("");
  const [sodium, setSodium] = useState<string>("");
  const [sugar, setSugar] = useState<string>("");
  const [fiber, setFiber] = useState<string>("");

  // Refs to move focus between inputs on the overrides step
  const caloriesRef = useRef<TextInput>(null);
  const proteinRef = useRef<TextInput>(null);
  const carbsRef = useRef<TextInput>(null);
  const fatRef = useRef<TextInput>(null);
  const sodiumRef = useRef<TextInput>(null);
  const sugarRef = useRef<TextInput>(null);
  const fiberRef = useRef<TextInput>(null);
  const ageRef = useRef<TextInput>(null);
  const weightRef = useRef<TextInput>(null);
  const heightRef = useRef<TextInput>(null);

  // Keep track of previous (saved) targets to show old -> new comparison
  const [prevCalories, setPrevCalories] = useState<number | null>(null);
  const [prevProtein, setPrevProtein] = useState<number | null>(null);
  const [prevCarbs, setPrevCarbs] = useState<number | null>(null);
  const [prevFat, setPrevFat] = useState<number | null>(null);
  const [prevSodium, setPrevSodium] = useState<number | null>(null);
  const [prevSugar, setPrevSugar] = useState<number | null>(null);
  const [prevFiber, setPrevFiber] = useState<number | null>(null);

  const [isSaving, setIsSaving] = useState(false);

  // When entering overrides step, always update inputs with freshly computed values
  useEffect(() => {
    if (step === 2 && computed.calories > 0) {
      setCalories(String(computed.calories));
      setProtein(String(computed.protein_g));
      setCarbs(String(computed.carbs_g));
      setFat(String(computed.fat_g));
      setSodium(String(computed.sodium_mg));
      setSugar(String(computed.sugar_g));
      setFiber(String(computed.fiber_g));
    }
  }, [step, computed]);

  // Prefill from existing user_settings if available
  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        if (!session?.user?.id) return;
        const s = await getUserSettingsCached(session.user.id, {
          refresh: true,
        });
        if (!s || !mounted) return;
        if (typeof s.age === "number") setAge(String(s.age));
        if (s.sex === "male" || s.sex === "female") setSex(s.sex);
        if (typeof s.weight_kg === "number") setWeightKg(String(s.weight_kg));
        if (typeof s.height_cm === "number") setHeightCm(String(s.height_cm));
        if (s.activity_level) setActivity(s.activity_level as ActivityLevel);
        if (s.goal) setGoal(s.goal as GoalType);
        // Prefill overrides from saved targets
        setCalories(
          s.calorie_target ? String(Math.round(s.calorie_target)) : "",
        );
        setProtein(
          s.protein_target_g ? String(Math.round(s.protein_target_g)) : "",
        );
        setCarbs(s.carb_target_g ? String(Math.round(s.carb_target_g)) : "");
        setFat(s.fat_target_g ? String(Math.round(s.fat_target_g)) : "");
        setSodium(
          s.sodium_target_mg ? String(Math.round(s.sodium_target_mg)) : "",
        );
        setSugar(s.sugar_target_g ? String(Math.round(s.sugar_target_g)) : "");
        setFiber(s.fiber_target_g ? String(Math.round(s.fiber_target_g)) : "");
        // Store previous values for comparison display
        setPrevCalories(
          typeof s.calorie_target === "number"
            ? Math.round(s.calorie_target)
            : null,
        );
        setPrevProtein(
          typeof s.protein_target_g === "number"
            ? Math.round(s.protein_target_g)
            : null,
        );
        setPrevCarbs(
          typeof s.carb_target_g === "number"
            ? Math.round(s.carb_target_g)
            : null,
        );
        setPrevFat(
          typeof s.fat_target_g === "number"
            ? Math.round(s.fat_target_g)
            : null,
        );
        setPrevSodium(
          typeof s.sodium_target_mg === "number"
            ? Math.round(s.sodium_target_mg)
            : null,
        );
        setPrevSugar(
          typeof s.sugar_target_g === "number"
            ? Math.round(s.sugar_target_g)
            : null,
        );
        setPrevFiber(
          typeof s.fiber_target_g === "number"
            ? Math.round(s.fiber_target_g)
            : null,
        );
      } catch (e) {
        if (__DEV__) console.warn("[UserQuestionnaire] Failed to load settings:", e);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [session?.user?.id]);

  const handleSkip = async () => {
    try {
      const deferUntil = new Date();
      deferUntil.setDate(deferUntil.getDate() + 7); // remind in ~7 days
      await AsyncStorage.setItem(
        "defer_user_questionnaire_until",
        deferUntil.toISOString(),
      );
    } catch {}
    navigation.reset({ index: 0, routes: [{ name: "Dashboard" }] });
  };

  const onNext = () => {
    Keyboard.dismiss();
    setStep((s) => Math.min(2, s + 1));
  };
  const onBack = () => setStep((s) => Math.max(0, s - 1));

  const handleSave = async () => {
    if (isSaving) return;
    setIsSaving(true);

    const payload = {
      age: Number(age) || 0,
      sex,
      weight_kg: toMetric.weight_kg,
      height_cm: toMetric.height_cm,
      activity_level: activity,
      goal,
      calorie_target: calories ? Number(calories) : undefined,
      protein_target_g: protein ? Number(protein) : undefined,
      carb_target_g: carbs ? Number(carbs) : undefined,
      fat_target_g: fat ? Number(fat) : undefined,
      sodium_target_mg: sodium ? Number(sodium) : undefined,
      sugar_target_g: sugar ? Number(sugar) : undefined,
      fiber_target_g: fiber ? Number(fiber) : undefined,
    };

    if (!session?.user?.id) {
      Alert.alert(t('common.error'), t('auth.pleaseSignIn'));
      navigation.navigate("SignIn");
      return;
    }

    try {
      await upsertUserSettings(session.user.id, payload);
      await AsyncStorage.removeItem("pending_user_settings");
      await AsyncStorage.setItem(DASHBOARD_REFRESH_FLAG, "1");
      Alert.alert(t('questionnaire.savedTitle'), t('questionnaire.savedMessage'));
      navigation.reset({ index: 0, routes: [{ name: "Dashboard" }] });
    } catch (e: any) {
      const message = String(e?.message || "");
      const isNetworkError =
        /network request failed/i.test(message) ||
        /network error/i.test(message) ||
        /net::err/i.test(message) ||
        /failed to fetch/i.test(message);
      Alert.alert(
        t('questionnaire.saveFailedTitle'),
        isNetworkError ? t('errors.networkError') : (e?.message || t('questionnaire.saveFailedFallback')),
      );
    } finally {
      setIsSaving(false);
    }
  };

  const sexLabel: Record<SexType, string> = {
    male: t('questionnaire.male'),
    female: t('questionnaire.female'),
  };

  const activityLabel: Record<ActivityLevel, string> = {
    sedentary: t('questionnaire.sedentary'),
    light: t('questionnaire.light'),
    moderate: t('questionnaire.moderate'),
    active: t('questionnaire.active'),
    very_active: t('questionnaire.veryActive'),
  };

  const goalLabel: Record<GoalType, string> = {
    maintain: t('questionnaire.maintain'),
    lose: t('questionnaire.lose'),
    gain: t('questionnaire.gain'),
  };

  const renderProfileCard = () => (
    <View style={styles.cardInner}>
      <View style={styles.stepPill}>
        <Text style={styles.stepText}>{t('questionnaire.stepOne')}</Text>
      </View>
      <Text style={styles.title}>{t('questionnaire.basicInfo')}</Text>
      <Text style={styles.helper}>{t('questionnaire.stepOneInstructions')}</Text>
      <View style={styles.row}>
        <Text style={styles.label}>{t('questionnaire.age')}</Text>
          <TextInput
            ref={ageRef}
            style={styles.goalInputField}
            keyboardType="number-pad"
            returnKeyType="next"
            blurOnSubmit={false}
            placeholder={t('questionnaire.agePlaceholder')}
            placeholderTextColor="rgba(255,255,255,0.25)"
            value={age}
            onChangeText={setAge}
            onSubmitEditing={() => weightRef.current?.focus()}
          />
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>{t('questionnaire.sex')}</Text>
          <View style={styles.fieldRight}>
            <View style={styles.chips}>
            {(["male", "female"] as const).map((s) => (
              <TouchableOpacity
                key={s}
                style={[styles.chip, sex === s && styles.chipActive]}
                onPress={() => setSex(s)}
              >
                <Text
                  style={[styles.chipText, sex === s && styles.chipTextActive]}
                >
                  {sexLabel[s]}
                </Text>
              </TouchableOpacity>
            ))}
            </View>
          </View>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>{t('questionnaire.weight')}</Text>
          <TextInput
            ref={weightRef}
            style={styles.goalInputField}
            keyboardType="decimal-pad"
            returnKeyType="next"
            blurOnSubmit={false}
            placeholder={t('questionnaire.weightPlaceholder')}
            placeholderTextColor="rgba(255,255,255,0.25)"
            value={weightKg}
            onChangeText={setWeightKg}
            onSubmitEditing={() => heightRef.current?.focus()}
          />
          <View style={styles.unitsRow}>
            {(["kg", "lb"] as const).map((u) => (
              <TouchableOpacity
                key={u}
                style={[
                  styles.chip,
                  styles.chipSmall,
                  weightUnit === u && styles.chipActive,
                ]}
                onPress={() => setWeightUnit(u)}
              >
                <Text
                  style={[
                    styles.chipText,
                    weightUnit === u && styles.chipTextActive,
                  ]}
                >
                  {u.toUpperCase()}
                </Text>
              </TouchableOpacity>
            ))}
        </View>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>{t('questionnaire.height')}</Text>
          <TextInput
            ref={heightRef}
            style={styles.goalInputField}
            keyboardType="decimal-pad"
            returnKeyType="done"
            blurOnSubmit
            placeholder={t('questionnaire.heightPlaceholder')}
            placeholderTextColor="rgba(255,255,255,0.25)"
            value={heightCm}
            onChangeText={setHeightCm}
            onSubmitEditing={() => {
              Keyboard.dismiss();
            }}
          />
          <View style={styles.unitsRow}>
            {(["cm", "in"] as const).map((u) => (
              <TouchableOpacity
                key={u}
                style={[
                  styles.chip,
                  styles.chipSmall,
                  heightUnit === u && styles.chipActive,
                ]}
                onPress={() => setHeightUnit(u)}
              >
                <Text
                  style={[
                    styles.chipText,
                    heightUnit === u && styles.chipTextActive,
                  ]}
                >
                  {u.toUpperCase()}
                </Text>
              </TouchableOpacity>
            ))}
        </View>
      </View>
      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.btn, styles.secondary]}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.btnTextSecondary}>{t('common.cancel')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.btn, styles.primary]} onPress={onNext}>
          <Text style={styles.btnTextPrimary}>{t('questionnaire.next')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderActivityGoalCard = () => (
    <View style={styles.cardInner}>
      <View style={styles.stepPill}>
        <Text style={styles.stepText}>{t('questionnaire.stepTwo')}</Text>
      </View>
      <Text style={styles.title}>{t('questionnaire.activityGoalTitle')}</Text>
      <Text style={styles.helper}>{t('questionnaire.activityLevel')}</Text>
      <View style={styles.chips}>
        {(
          ["sedentary", "light", "moderate", "active", "very_active"] as const
        ).map((lvl) => (
          <TouchableOpacity
            key={lvl}
            style={[styles.chip, activity === lvl && styles.chipActive]}
            onPress={() => setActivity(lvl)}
          >
            <Text
              style={[
                styles.chipText,
                activity === lvl && styles.chipTextActive,
              ]}
            >
              {activityLabel[lvl]}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={[styles.helper, { marginTop: 8 }]}>{t('questionnaire.goal')}</Text>
      <View style={styles.chips}>
        {(["maintain", "lose", "gain"] as const).map((g) => (
          <TouchableOpacity
            key={g}
            style={[styles.chip, goal === g && styles.chipActive]}
            onPress={() => setGoal(g)}
          >
            <Text
              style={[styles.chipText, goal === g && styles.chipTextActive]}
            >
              {goalLabel[g]}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.btn, styles.secondary]}
          onPress={onBack}
        >
          <Text style={styles.btnTextSecondary}>{t('questionnaire.previous')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.btn, styles.primary]} onPress={onNext}>
          <Text style={styles.btnTextPrimary}>{t('questionnaire.next')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderOverrideCard = () => (
    <ScrollView
      style={styles.cardInner}
      contentContainerStyle={{ paddingBottom: 40 }}
      keyboardShouldPersistTaps="handled"
      nestedScrollEnabled
      showsVerticalScrollIndicator
    >
      <View style={styles.stepPill}>
        <Text style={styles.stepText}>{t('questionnaire.stepThree')}</Text>
      </View>
      <Text style={styles.title}>{t('questionnaire.suggestedGoals')}</Text>
      <Text style={styles.helper}>
        {t('questionnaire.suggestedGoalsSubtitle')}
      </Text>

      {/* Editable Goals */}
      <View style={styles.editableGoalRow}>
        <Text style={styles.editableGoalLabel}>{t('macros.calories')}</Text>
        <View style={styles.goalArrow}>
          <Text style={styles.goalFrom}>{prevCalories ?? "—"}</Text>
          <Text style={styles.goalSep}>→</Text>
          <TextInput
            ref={caloriesRef}
            style={styles.editableGoalInput}
            keyboardType="number-pad"
            returnKeyType="next"
            blurOnSubmit={false}
            placeholder={String(computed.calories || "")}
            placeholderTextColor="rgba(255,255,255,0.25)"
            value={calories}
            onChangeText={setCalories}
            onSubmitEditing={() => proteinRef.current?.focus()}
          />
          <Text style={styles.editableGoalUnit}>kcal</Text>
        </View>
      </View>
      <View style={styles.editableGoalRow}>
        <Text style={styles.editableGoalLabel}>{t('macros.protein')}</Text>
        <View style={styles.goalArrow}>
          <Text style={styles.goalFrom}>{prevProtein ? `${prevProtein}g` : "—"}</Text>
          <Text style={styles.goalSep}>→</Text>
          <TextInput
            ref={proteinRef}
            style={styles.editableGoalInput}
            keyboardType="number-pad"
            returnKeyType="next"
            blurOnSubmit={false}
            placeholder={String(computed.protein_g || "")}
            placeholderTextColor="rgba(255,255,255,0.25)"
            value={protein}
            onChangeText={setProtein}
            onSubmitEditing={() => carbsRef.current?.focus()}
          />
          <Text style={styles.editableGoalUnit}>g</Text>
        </View>
      </View>
      <View style={styles.editableGoalRow}>
        <Text style={styles.editableGoalLabel}>{t('macros.carbs')}</Text>
        <View style={styles.goalArrow}>
          <Text style={styles.goalFrom}>{prevCarbs ? `${prevCarbs}g` : "—"}</Text>
          <Text style={styles.goalSep}>→</Text>
          <TextInput
            ref={carbsRef}
            style={styles.editableGoalInput}
            keyboardType="number-pad"
            returnKeyType="next"
            blurOnSubmit={false}
            placeholder={String(computed.carbs_g || "")}
            placeholderTextColor="rgba(255,255,255,0.25)"
            value={carbs}
            onChangeText={setCarbs}
            onSubmitEditing={() => fatRef.current?.focus()}
          />
          <Text style={styles.editableGoalUnit}>g</Text>
        </View>
      </View>
      <View style={styles.editableGoalRow}>
        <Text style={styles.editableGoalLabel}>{t('macros.fat')}</Text>
        <View style={styles.goalArrow}>
          <Text style={styles.goalFrom}>{prevFat ? `${prevFat}g` : "—"}</Text>
          <Text style={styles.goalSep}>→</Text>
          <TextInput
            ref={fatRef}
            style={styles.editableGoalInput}
            keyboardType="number-pad"
            returnKeyType="next"
            blurOnSubmit={false}
            placeholder={String(computed.fat_g || "")}
            placeholderTextColor="rgba(255,255,255,0.25)"
            value={fat}
            onChangeText={setFat}
            onSubmitEditing={() => sodiumRef.current?.focus()}
          />
          <Text style={styles.editableGoalUnit}>g</Text>
        </View>
      </View>
      <View style={styles.editableGoalRow}>
        <Text style={styles.editableGoalLabel}>{t('macros.sodium')}</Text>
        <View style={styles.goalArrow}>
          <Text style={styles.goalFrom}>{prevSodium ? `${prevSodium}mg` : "—"}</Text>
          <Text style={styles.goalSep}>→</Text>
          <TextInput
            ref={sodiumRef}
            style={styles.editableGoalInput}
            keyboardType="number-pad"
            returnKeyType="next"
            blurOnSubmit={false}
            placeholder={String(computed.sodium_mg || "")}
            placeholderTextColor="rgba(255,255,255,0.25)"
            value={sodium}
            onChangeText={setSodium}
            onSubmitEditing={() => sugarRef.current?.focus()}
          />
          <Text style={styles.editableGoalUnit}>mg</Text>
        </View>
      </View>
      <View style={styles.editableGoalRow}>
        <Text style={styles.editableGoalLabel}>{t('macros.sugar')}</Text>
        <View style={styles.goalArrow}>
          <Text style={styles.goalFrom}>{prevSugar ? `${prevSugar}g` : "—"}</Text>
          <Text style={styles.goalSep}>→</Text>
          <TextInput
            ref={sugarRef}
            style={styles.editableGoalInput}
            keyboardType="number-pad"
            returnKeyType="next"
            blurOnSubmit={false}
            placeholder={String(computed.sugar_g || "")}
            placeholderTextColor="rgba(255,255,255,0.25)"
            value={sugar}
            onChangeText={setSugar}
            onSubmitEditing={() => fiberRef.current?.focus()}
          />
          <Text style={styles.editableGoalUnit}>g</Text>
        </View>
      </View>
      <View style={styles.editableGoalRow}>
        <Text style={styles.editableGoalLabel}>{t('macros.fiber')}</Text>
        <View style={styles.goalArrow}>
          <Text style={styles.goalFrom}>{prevFiber ? `${prevFiber}g` : "—"}</Text>
          <Text style={styles.goalSep}>→</Text>
          <TextInput
            ref={fiberRef}
            style={styles.editableGoalInput}
            keyboardType="number-pad"
            returnKeyType="done"
            blurOnSubmit
            placeholder={String(computed.fiber_g || "")}
            placeholderTextColor="rgba(255,255,255,0.25)"
            value={fiber}
            onChangeText={setFiber}
            onSubmitEditing={() => {
              Keyboard.dismiss();
            }}
          />
          <Text style={styles.editableGoalUnit}>g</Text>
        </View>
      </View>

      {/* Mascot Tip */}
      <View style={styles.mascotTip}>
        <View style={styles.mascotThumb}>
          <AppIcon style={styles.mascotImage} fallbackColor={C.green} />
        </View>
        <Text style={styles.tipText}>
          {t('questionnaire.fineTuneTip')}
        </Text>
      </View>

      {/* Navigation */}
      <View style={styles.finalNavigation}>
        <View style={styles.navRow}>
          <TouchableOpacity
            style={[styles.btn, styles.secondary]}
            onPress={onBack}
          >
            <Text style={styles.btnTextSecondary}>{t('questionnaire.previous')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.btn, styles.secondary]}
            onPress={handleSkip}
          >
            <Text style={styles.btnTextSecondary}>{t('questionnaire.skipForNow')}</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity
          style={[styles.navBtnNext, isSaving && { opacity: 0.6 }]}
          onPress={handleSave}
          disabled={isSaving}
        >
          <Text style={styles.navBtnNextText}>
            {isSaving ? t('common.pleaseWait') : `${t('questionnaire.letsGo')} 🎉`}
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
  const windowHeight = Dimensions.get('window').height;
  const maxCardHeight = windowHeight - insets.top - insets.bottom - 48;

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <BackButton variant="absolute" style={{ top: insets.top + 16 }} />
      <ScrollView
        style={{ alignSelf: "stretch" }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentInset={{ bottom: insets.bottom }}
        contentContainerStyle={[styles.centerWrap, { paddingBottom: insets.bottom + 24 }]}
      >
        <View style={[styles.card, { maxHeight: maxCardHeight }]}>
          {step === 0 && renderProfileCard()}
          {step === 1 && renderActivityGoalCard()}
          {step === 2 && renderOverrideCard()}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const getStyles = (C: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.bg,
    justifyContent: "center",
    alignItems: "center",
  },
  centerWrap: {
    flexGrow: 1,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  card: {
    backgroundColor: C.cardBg,
    borderRadius: 28,
    borderWidth: 2,
    borderColor: C.cardBorder,
    width: "100%",
    maxWidth: 400,
    alignSelf: "center",
    overflow: "hidden",
  },
  cardInner: {
    padding: 28,
  },
  stepPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(74,155,111,0.15)",
    borderWidth: 1.5,
    borderColor: "rgba(74,155,111,0.3)",
    borderRadius: 20,
    paddingVertical: 4,
    paddingHorizontal: 12,
    marginBottom: 14,
    alignSelf: "flex-start",
  },
  stepText: {
    fontFamily: C.fontPrimary,
    fontSize: 11,
    letterSpacing: 1.5,
    color: C.green,
  },
  title: {
    fontFamily: C.fontPrimary,
    fontSize: 25,
    fontWeight: "400",
    color: C.textPrimary,
    letterSpacing: 0.3,
    lineHeight: 28,
    marginBottom: 6,
  },
  helper: { 
    fontFamily: C.fontSecondary,
    fontSize: 12, 
    fontWeight: "700",
    color: C.textMuted, 
    marginBottom: 24,
    lineHeight: 18,
  },
  row: { 
    flexDirection: "row", 
    alignItems: "flex-start", 
    justifyContent: "space-between", 
    marginBottom: 16, gap: 12 },
  label: { 
    fontFamily: C.fontSecondary,
    fontSize: 14,
    color: C.textSecondary,
    letterSpacing: 0.3,
    width: 80,
    flexShrink: 0,
  },
  fieldRight: {
    flex: 1,
    flexDirection: "column",
    gap: 8,
  },
  chips: { 
    flexDirection: "row", 
    flexWrap: "wrap", 
    gap: 7, 
    marginTop: 0 
  },
  unitsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: C.track,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: C.cardBorder,
  },
  chipSmall: {
    paddingVertical: 11,
    paddingHorizontal: 12,
  },
  chipActive: { 
    backgroundColor: C.green, 
    borderColor: C.green,
  },
  chipText: { 
    fontFamily: C.fontSecondary,
    fontSize: 13,
    letterSpacing: 0.5,
    color: C.navy,
  },
  chipTextActive: { color: C.cream },
  btn: {
    paddingVertical: 12,
    paddingHorizontal: 26,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: "transparent",
  },
  primary: { 
    backgroundColor: C.cream,
    flex: 1,
  },
  secondary: { 
    backgroundColor: C.track,
    borderColor: C.cardBorder,
  },
  btnTextPrimary: { 
    fontFamily: C.fontPrimary,
    fontSize: 15,
    letterSpacing: 0.3,
    color: C.navy,
    textAlign: "center",
  },
  btnTextSecondary: { 
    fontFamily: C.fontPrimary,
    fontSize: 15,
    letterSpacing: 0.3,
    color: C.textSecondary,
    textAlign: "center",
  },
  goalArrow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
    justifyContent: "flex-end",
  },
  goalFrom: {
    fontFamily: C.fontSecondary,
    fontSize: 14,
    color: C.textMuted,
  },
  goalSep: {
    fontSize: 14,
    color: C.textMuted,
  },
  goalInputField: {
    flex: 1,
    minWidth: 0,
    borderWidth: 2,
    borderColor: C.cardBorder,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 10,
    backgroundColor: C.track,
    fontFamily: C.fontSecondary,
    fontWeight: "600",
    fontSize: 16,
    color: C.textPrimary,
  },
  mascotTip: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    backgroundColor: C.tipBubbleBg,
    borderWidth: 1.5,
    borderColor: C.tipBubbleBorder,
    borderRadius: 16,
    padding: 14,
    marginTop: 20,
    marginBottom: 20,
  },
  mascotThumb: {
    width: 36,
    height: 36,
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: C.track,
  },
  mascotImage: {
    width: 36,
    height: 36,
  },
  tipText: {
    flex: 1,
    fontFamily: C.fontSecondary,
    fontSize: 13,
    lineHeight: 18,
    color: C.tipTextColor,
  },
  navRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 8,
  },
  navBtnNext: {
    flex: 1,
    backgroundColor: C.green,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 14,
    alignItems: "center",
    shadowColor: "#2d6b48",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 0,
  },
  navBtnNextText: {
    fontFamily: "FredokaOne",
    fontSize: 15,
    color: "#FFFFFF",
    letterSpacing: 0.3,
  },
  actions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 20,
  },
  finalNavigation: {
    flexDirection: "column",
    gap: 12,
    marginTop: 20,
  },
  editableGoalRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.separator,
  },
  editableGoalLabel: {
    fontFamily: C.fontPrimary,
    fontSize: 16,
    color: C.textSecondary,
    width: 90,
    flexShrink: 0,
  },
  editableGoalInput: {
    minWidth: 0,
    width: 80,
    borderWidth: 2,
    borderColor: C.cardBorder,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: C.track,
    fontFamily: C.fontSecondary,
    fontWeight: "700",
    fontSize: 19,
    color: C.textPrimary,
    textAlign: "right",
  },
  editableGoalUnit: {
    fontFamily: C.fontSecondary,
    fontSize: 16,
    color: C.textMuted,
    width: 50,
    textAlign: "right",
    marginLeft: 8,
  },
});
