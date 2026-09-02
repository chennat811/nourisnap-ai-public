import React, { useEffect, useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  Animated,
  Alert,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { useDailyLimit } from "../hooks/useDailyLimit";
import { useRunAnalysis } from "../hooks/useRunAnalysis";
import {
  AnalysisLoadingScreenNavigationProp,
  RootStackParamList,
} from "../types/navigation";
import { useLanguage } from "../context/LanguageContext";
import { useTheme } from "../context/ThemeContext";
import BackButton from "../components/BackButton";
import AppIcon from "../components/AppIcon";

export default function AnalysisLoadingScreen() {
  const navigation = useNavigation<AnalysisLoadingScreenNavigationProp>();
  const route = useRoute<RouteProp<RootStackParamList, "AnalysisLoading">>();
  const { t, language } = useLanguage();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { isAdminBypass, canScan, loading: limitLoading } = useDailyLimit();

  const [currentStep, setCurrentStep] = useState(0);
  const spinValue = useRef(new Animated.Value(0)).current;
  const spinValueOuter = useRef(new Animated.Value(0)).current;
  
  const {
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
  } = route.params ?? {};

  useEffect(() => {
    // Spinner animations
    const innerSpin = Animated.loop(
      Animated.timing(spinValue, {
        toValue: 1,
        duration: 1100,
        useNativeDriver: true,
      })
    );
    innerSpin.start();

    const outerSpin = Animated.loop(
      Animated.timing(spinValueOuter, {
        toValue: 1,
        duration: 2200,
        useNativeDriver: true,
      })
    );
    outerSpin.start();

    // Step progression animation
    const stepTimer = setInterval(() => {
      setCurrentStep((prev) => (prev < 2 ? prev + 1 : prev));
    }, 2000);

    return () => {
      clearInterval(stepTimer);
      innerSpin.stop();
      outerSpin.stop();
    };
  }, []);

  useRunAnalysis({
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
  });

  // Fallback: if the analysis hook silently hangs (e.g., offline with no error
  // reaching the UI), force a user-facing error and navigate away instead of
  // leaving the spinner running forever. Only arm once the daily-limit check has
  // finished and analysis has actually started.
  useEffect(() => {
    if (limitLoading) return;
    const timer = setTimeout(() => {
      Alert.alert(
        t("common.error"),
        t("errors.networkError"),
        [
          {
            text: t("common.ok"),
            onPress: () =>
              navigation.canGoBack()
                ? navigation.goBack()
                : navigation.navigate("Dashboard"),
          },
        ],
      );
    }, 30000); // 30s ceiling above the API 20s timeout
    return () => clearTimeout(timer);
  }, [limitLoading, t, navigation]);

  const spin = spinValue.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const spinReverse = spinValueOuter.interpolate({
    inputRange: [0, 1],
    outputRange: ['360deg', '0deg'],
  });

  const steps = [
    { key: 'identify', label: t('analysis.stepIdentify') || 'Identifying food' },
    { key: 'calculate', label: t('analysis.stepCalculate') || 'Calculating nutrition' },
    { key: 'generate', label: t('analysis.stepGenerate') || 'Generating health tips' },
  ];

  return (
    <SafeAreaView style={[styles.screenSafe, { backgroundColor: colors.bg }]} edges={["top"]}>
      <StatusBar barStyle={colors.statusBar} backgroundColor={colors.bg} />
      
      {/* Back button */}
      <BackButton 
        variant="absolute"
        style={{ top: (insets.top || 0) + 16 }}
      />

      <View style={[styles.loadingWrapper, { backgroundColor: colors.bg }]}>
        {/* Ambient glow */}
        <View style={styles.ambientGlow} />

        {/* Spinner */}
        <View style={styles.spinnerWrap}>
          <Animated.View
            style={[
              styles.spinnerRingOuter,
              { borderTopColor: `${colors.green}4D`, transform: [{ rotate: spinReverse }] },
            ]}
          />
          <Animated.View
            style={[
              styles.spinnerRing,
              {
                borderTopColor: colors.green,
                borderRightColor: colors.lime,
                transform: [{ rotate: spin }],
              },
            ]}
          />
          <View style={[styles.spinnerMascot, { backgroundColor: colors.green }]}>
            <AppIcon style={styles.mascotImage} fallbackColor={colors.green} />
          </View>
        </View>

        {/* Loading title */}
        <Text style={[styles.loadingTitle, { fontFamily: colors.fontPrimary, color: colors.navy }]}>
          {t('analysis.analyzingMeal')}
        </Text>

        {/* Step indicators */}
        <View style={styles.loadingSteps}>
          {steps.map((step, index) => {
            const isDone = index < currentStep;
            const isActive = index === currentStep;
            return (
              <View key={step.key} style={[styles.loadingStep, { backgroundColor: colors.cardBg, borderColor: colors.cardBorder }]}>
                <View
                  style={[
                    styles.stepDot,
                    isDone && { backgroundColor: colors.lime },
                    isActive && { backgroundColor: colors.green },
                    !isDone && !isActive && { backgroundColor: colors.textMuted },
                  ]}
                />
                <Text
                  style={[
                    styles.stepText,
                    { fontFamily: colors.fontPrimary },
                    isDone && { color: colors.lime },
                    isActive && { color: colors.textPrimary },
                    !isDone && !isActive && { color: colors.textMuted },
                  ]}
                >
                  {step.label} {isDone ? '✓' : ''}
                </Text>
              </View>
            );
          })}
        </View>

        {/* Loading subtitle */}
        <Text style={[styles.loadingSub, { fontFamily: colors.fontSecondary, color: colors.textMuted }]}>
          {t('analysis.loadingSubtitle') || 'Usually takes 5–10 seconds'}
          {"\n"}
          {t('analysis.pleaseWait') || 'Please wait a moment 🌿'}
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screenSafe: {
    flex: 1,
  },
  loadingWrapper: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    position: 'relative',
  },
  ambientGlow: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: 'rgba(61,122,90,0.12)',
    opacity: 0.5,
  },
  spinnerWrap: {
    position: 'relative',
    width: 90,
    height: 90,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  spinnerRing: {
    position: 'absolute',
    width: 90,
    height: 90,
    borderRadius: 45,
    borderWidth: 3,
    borderColor: 'transparent',
  },
  spinnerRingOuter: {
    position: 'absolute',
    width: 106,
    height: 106,
    borderRadius: 53,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  spinnerMascot: {
    width: 48,
    height: 48,
    borderRadius: 12,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mascotImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  loadingTitle: {
    fontSize: 18,
    letterSpacing: 0.3,
    marginBottom: 20,
  },
  loadingSteps: {
    width: '100%',
    maxWidth: 220,
    gap: 8,
    marginBottom: 16,
  },
  loadingStep: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  stepDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  stepText: {
    fontSize: 14,
    letterSpacing: 0.3,
  },
  loadingSub: {
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 18,
  },
});
