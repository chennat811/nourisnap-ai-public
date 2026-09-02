import React, { useMemo, useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { AppNavigation } from "../types/navigation";
import { useAuth } from "../context/AuthContext";
import { MaterialIcons } from "@expo/vector-icons";
import { useLanguage } from "../context/LanguageContext";
import { useTheme } from "../context/ThemeContext";
import UnauthButton from "../components/UnauthButton";
import UnauthInput from "../components/UnauthInput";

export default function PasswordUpdateScreen() {
  const navigation = useNavigation<AppNavigation>();
  const { supabase } = useAuth();
  const { t } = useLanguage();
  const { colors: C } = useTheme();
  const styles = useMemo(() => makeStyles(C), [C]);
  const scrollRef = useRef<ScrollView>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const navTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // This flag's only purpose is to survive an app relaunch mid-recovery-flow
    // (see App.tsx's deep link handler). Once we've actually reached this
    // screen it's served its purpose — clear it so a stale "1" can't force a
    // later, unrelated session back into the password-update flow.
    AsyncStorage.removeItem("pending_password_update").catch(() => {});
    return () => {
      if (navTimeoutRef.current) clearTimeout(navTimeoutRef.current);
    };
  }, []);

  const handleBackToSignIn = async () => {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      if (__DEV__) console.log("[PasswordUpdateScreen] signOut error:", err);
    }
    navigation.reset({ index: 0, routes: [{ name: "SignIn" }] });
  };

  const handleUpdatePassword = async () => {
    if (!password || password.length < 8) {
      setError(t('auth.passwordMinLength'));
      return;
    }
    if (password !== confirmPassword) {
      setError(t('auth.passwordMismatch'));
      return;
    }
    setLoading(true);
    setError("");
    setSuccess("");
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        // A missing/expired auth session here almost always means the
        // recovery link was stale (e.g. an older email when more than one
        // reset was requested) or was already used. Surface something the
        // user can act on instead of the raw Supabase error string.
        const isSessionMissing = /session/i.test(updateError.message);
        setError(
          isSessionMissing
            ? t('auth.passwordUpdateSessionExpired')
            : updateError.message,
        );
        return;
      }
      setSuccess(t('auth.passwordUpdated'));
      try {
        await supabase.auth.signOut();
      } catch (signOutErr) {
        if (__DEV__) console.log("[PasswordUpdateScreen] signOut error:", signOutErr);
      }
      // Reset navigation to SignIn so user signs in again
      navTimeoutRef.current = setTimeout(
        () => navigation.reset({ index: 0, routes: [{ name: "SignIn" }] }),
        800,
      );
    } catch (err) {
      if (__DEV__) console.log("[PasswordUpdateScreen] updateUser threw:", err);
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
        keyboardVerticalOffset={Platform.OS === "ios" ? 64 : 0}
      >
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.card}>
            {/* Back arrow to return to Sign In */}
            <TouchableOpacity
              onPress={handleBackToSignIn}
              accessibilityRole="button"
              accessibilityLabel={t('auth.backToSignIn')}
              style={styles.backBtn}
            >
              <MaterialIcons name="arrow-back-ios" size={22} color={C.navy} />
            </TouchableOpacity>

            <Text style={styles.title}>{t('auth.setNewPassword')}</Text>
            {/* New password */}
            <UnauthInput
              icon={<MaterialIcons name="lock" size={24} color={C.navy} />}
              rightElement={(
                <TouchableOpacity
                  onPress={() => setShowPassword((s) => !s)}
                  accessibilityRole="button"
                  accessibilityLabel={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
                >
                  <MaterialIcons
                    name={showPassword ? "visibility" : "visibility-off"}
                    size={22}
                    color={C.textMuted}
                  />
                </TouchableOpacity>
              )}
              placeholder={t('auth.newPasswordPlaceholder')}
              secureTextEntry={!showPassword}
              value={password}
              onChangeText={setPassword}
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="newPassword"
              autoComplete="password-new"
            />

            {/* Confirm new password */}
            <UnauthInput
              icon={<MaterialIcons name="lock" size={24} color={C.navy} />}
              rightElement={(
                <TouchableOpacity
                  onPress={() => setShowConfirmPassword((s) => !s)}
                  accessibilityRole="button"
                  accessibilityLabel={showConfirmPassword ? t('auth.hidePassword') : t('auth.showPassword')}
                >
                  <MaterialIcons
                    name={showConfirmPassword ? "visibility" : "visibility-off"}
                    size={22}
                    color={C.textMuted}
                  />
                </TouchableOpacity>
              )}
              placeholder={t('auth.confirmNewPassword')}
              secureTextEntry={!showConfirmPassword}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="newPassword"
              autoComplete="password-new"
              onFocus={() =>
                setTimeout(
                  () => scrollRef.current?.scrollToEnd({ animated: true }),
                  100,
                )
              }
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            {success ? <Text style={styles.success}>{success}</Text> : null}
            <UnauthButton
              title={loading ? t('auth.updating') : t('auth.updatePassword')}
              onPress={handleUpdatePassword}
              disabled={loading || !!success}
              loading={loading}
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
    backBtn: {
      alignSelf: "flex-start",
      padding: 4,
      marginBottom: 8,
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
      marginBottom: 12,
    },
  });
