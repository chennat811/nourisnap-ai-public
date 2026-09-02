import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Linking from "expo-linking";
import Constants from "expo-constants";
import { useNavigation } from "@react-navigation/native";
import type { AppNavigation } from "../types/navigation";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import { useTheme } from "../context/ThemeContext";
import UnauthButton from "../components/UnauthButton";
import UnauthInput from "../components/UnauthInput";

const isValidEmail = (value: string) => /^\S+@\S+\.\S+$/.test(value);

export default function ResetPasswordScreen() {
  const navigation = useNavigation<AppNavigation>();
  const { supabase } = useAuth();
  const { t } = useLanguage();
  const { colors: C } = useTheme();
  const styles = useMemo(() => makeStyles(C), [C]);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");

  const handleResetPassword = async () => {
    if (loading) return;
    const trimmed = email.trim();
    if (!trimmed) {
      setError(t('auth.emailRequired'));
      return;
    }
    if (!isValidEmail(trimmed)) {
      setError(t('auth.emailInvalid'));
      return;
    }
    setLoading(true);
    setError("");
    setSuccess("");
    const target = Linking.createURL("reset-password");
    const privacyUrl = (Constants.expoConfig?.extra as any)?.PRIVACY_URL || "https://manzoni-nutrition.vercel.app/privacy";
    const baseUrl = (Constants.expoConfig?.extra as any)?.RESET_CALLBACK_URL || privacyUrl.replace(/\/privacy\/?$/, "");
    const redirectTo = `${baseUrl}/auth/callback?type=recovery&target=${encodeURIComponent(target)}`;
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(trimmed, {
        redirectTo,
      });
      if (resetError) {
        setError(resetError.message);
      } else {
        setSuccess(t('auth.resetPasswordSent'));
      }
    } catch (err) {
      setError(t('errors.unknownError'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.card}>
            <Text style={styles.title}>{t('auth.resetPassword')}</Text>
            <UnauthInput
              placeholder={t('auth.email')}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              textContentType="emailAddress"
              autoComplete="email"
              returnKeyType="send"
              onSubmitEditing={handleResetPassword}
              blurOnSubmit={false}
              accessibilityLabel={t('auth.email')}
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            {success ? (
              <>
                <Text style={styles.success}>{success}</Text>
                <Text style={styles.note}>{t('auth.resetPasswordLatestLinkNote')}</Text>
              </>
            ) : null}
            <UnauthButton
              title={loading ? t('auth.sendingResetEmail') : t('auth.sendResetEmail')}
              onPress={handleResetPassword}
              disabled={loading}
              loading={loading}
              accessibilityRole="button"
              accessibilityLabel={t('auth.sendResetEmail')}
              accessibilityHint={t('auth.sendResetEmailHint')}
            />
            <UnauthButton
              title={t('auth.backToSignIn')}
              variant="secondary"
              onPress={() => navigation.navigate("SignIn")}
              accessibilityRole="button"
              accessibilityLabel={t('auth.backToSignIn')}
              accessibilityHint={t('auth.backToSignInHint')}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const makeStyles = (C: any) =>
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: C.bg,
    },
    container: {
      flexGrow: 1,
      justifyContent: "center",
      alignItems: "center",
      padding: 24,
    },
    card: {
      width: "100%",
      maxWidth: 380,
      backgroundColor: C.cardBg,
      borderWidth: 2,
      borderColor: C.cardBorder,
      borderRadius: 28,
      padding: 24,
    },
    title: {
      fontFamily: C.fontPrimary,
      fontSize: 24,
      color: C.textPrimary,
      marginBottom: 24,
      textAlign: "center",
    },
    error: {
      fontFamily: C.fontSecondary,
      fontSize: 13,
      fontWeight: "700",
      color: C.coral,
      textAlign: "center",
      marginBottom: 12,
    },
    success: {
      fontFamily: C.fontSecondary,
      fontSize: 13,
      fontWeight: "700",
      color: C.green,
      textAlign: "center",
      marginBottom: 4,
    },
    note: {
      fontFamily: C.fontSecondary,
      fontSize: 12,
      color: C.textMuted,
      textAlign: "center",
      marginBottom: 12,
    },
  });
