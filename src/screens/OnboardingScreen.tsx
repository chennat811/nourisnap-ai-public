import React, { useCallback, useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { AppNavigation } from "../types/navigation";
import { useLanguage } from "../context/LanguageContext";
import { useTheme } from "../context/ThemeContext";
import type { ThemeColors } from "../context/ThemeContext";

export default function OnboardingScreen() {
  const navigation = useNavigation<AppNavigation>();
  const { t } = useLanguage();
  const { colors: C } = useTheme();

  const styles = useMemo(() => getStyles(C), [C]);

  const handleGetStarted = useCallback(() => {
    navigation.navigate("MealCapture");
  }, [navigation]);

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.content}>
          <Text style={styles.title}>{t('onboarding.welcome')}</Text>
          <Text style={styles.subtitle}>
            {t('onboarding.subtitle')}
          </Text>
          <TouchableOpacity
            style={styles.button}
            onPress={handleGetStarted}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={t('onboarding.getStarted')}
            accessibilityHint={t('onboarding.subtitle')}
          >
            <Text style={styles.buttonText}>{t('onboarding.getStarted')}</Text>
          </TouchableOpacity>
          <Text style={styles.disclaimer}>
            {t('onboarding.disclaimer')}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const getStyles = (C: ThemeColors) =>
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: C.bg,
    },
    scrollContent: {
      flexGrow: 1,
      justifyContent: "center",
    },
    content: {
      alignItems: "center",
      padding: 20,
      backgroundColor: C.bg,
    },
    title: {
      fontSize: 28,
      fontWeight: "bold",
      marginBottom: 20,
      textAlign: "center",
      color: C.textPrimary,
      fontFamily: C.fontPrimary,
    },
    subtitle: {
      fontSize: 16,
      color: C.textSecondary,
      marginBottom: 40,
      textAlign: "center",
      fontFamily: C.fontSecondary,
    },
    button: {
      backgroundColor: C.green,
      paddingVertical: 15,
      paddingHorizontal: 24,
      borderRadius: 8,
      minWidth: "80%",
      alignItems: "center",
    },
    buttonText: {
      color: C.cream,
      fontSize: 18,
      fontWeight: "bold",
      fontFamily: C.fontPrimary,
    },
    disclaimer: {
      marginTop: 16,
      color: C.textMuted,
      fontSize: 12,
      lineHeight: 18,
      textAlign: "center",
      fontFamily: C.fontSecondary,
    },
  });
