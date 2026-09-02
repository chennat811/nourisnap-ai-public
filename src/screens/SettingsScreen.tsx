import React, { useState, useMemo, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Linking,
  Switch,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import type { AppNavigation } from "../types/navigation";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import { useTheme, type ThemeColors } from "../context/ThemeContext";
import type { ThemeMode } from "../context/ThemeContext";
import BackButton from "../components/BackButton";
import SelectionModal from "../components/SelectionModal";
import Constants from "expo-constants";
import {
  getUserSettingsCached,
  invalidateUserSettingsCache,
  clearAllInMemoryCaches,
} from "../services/api";

export default function SettingsScreen() {
  const navigation = useNavigation<AppNavigation>();
  const { supabase: authSupabase, session } = useAuth();
  const { language, setLanguage, t } = useLanguage();
  const { colors: C, mode, isDark, setThemeMode } = useTheme();
  const styles = useMemo(() => getStyles(C), [C]);
  const [showLanguageModal, setShowLanguageModal] = useState(false);
  const [showAppearanceModal, setShowAppearanceModal] = useState(false);
  const [dataCollectionConsent, setDataCollectionConsent] = useState<boolean | null>(null);
  const [isLoadingConsent, setIsLoadingConsent] = useState(true);
  const [isUpdatingConsent, setIsUpdatingConsent] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);

  // Fetch user settings on mount to get consent status
  useEffect(() => {
    const fetchConsent = async () => {
      const userId = session?.user?.id;
      if (!userId) {
        setIsLoadingConsent(false);
        return;
      }
      try {
        const settings = await getUserSettingsCached(userId);
        setDataCollectionConsent(settings?.data_collection_consent ?? false);
      } catch (e) {
        if (__DEV__) console.error("Failed to fetch user settings:", e);
      } finally {
        setIsLoadingConsent(false);
      }
    };
    fetchConsent();
  }, [session?.user?.id]);

  const handleLanguageChange = async (lang: string) => {
    try {
      await setLanguage(lang);
      setShowLanguageModal(false);
    } catch (error) {
      Alert.alert(t('common.error'), t('errors.unknownError'));
    }
  };

  const getLanguageDisplayName = (lang: string) => {
    return lang === 'zh-TW' ? '繁體中文' : 'English';
  };

  const handleAppearanceChange = (newMode: ThemeMode) => {
    setThemeMode(newMode);
    setShowAppearanceModal(false);
  };

  const getAppearanceDisplayName = () => {
    return isDark ? t('settings.darkMode') : t('settings.lightMode');
  };

  const handleToggleDataConsent = async (value: boolean) => {
    const userId = session?.user?.id;
    if (!userId || isUpdatingConsent) return;

    setIsUpdatingConsent(true);
    setDataCollectionConsent(value);
    try {
      const { error } = await authSupabase
        .from('user_settings')
        .upsert(
          {
            user_id: userId,
            data_collection_consent: value,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id' }
        );
      if (error) throw error;
      await invalidateUserSettingsCache(userId);
    } catch (e: any) {
      if (__DEV__) console.error("Failed to update consent:", e);
      Alert.alert(t('common.error'), t('errors.tryAgain'));
      setDataCollectionConsent(!value);
    } finally {
      setIsUpdatingConsent(false);
    }
  };

  const handleSignOut = async () => {
    if (isSigningOut) return;
    setIsSigningOut(true);
    try {
      const { error } = await authSupabase.auth.signOut();
      if (error) throw error;
      Alert.alert(t('auth.signOutSuccess'));
      navigation.reset({ index: 0, routes: [{ name: "SignIn" }] });
    } catch (e: any) {
      Alert.alert(t('auth.signOutError'), e?.message || t('errors.tryAgain'));
    } finally {
      setIsSigningOut(false);
    }
  };

  const PRIVACY_URL =
    (Constants.expoConfig?.extra as any)?.PRIVACY_URL ||
    "https://manzoni-nutrition.vercel.app/privacy";

  const handleOpenPrivacy = () => {
    Linking.openURL(PRIVACY_URL).catch(() =>
      Alert.alert(t('settings.cannotOpenLink'), t('errors.tryAgain') + ": " + PRIVACY_URL),
    );
  };

  const handleDeleteAccount = async () => {
    if (isDeletingAccount) return;
    Alert.alert(
      t('settings.deleteAccountTitle'),
      t('settings.deleteAccountMessage'),
      [
        { text: t('common.cancel'), style: "cancel" },
        {
          text: t('common.delete'),
          style: "destructive",
          onPress: async () => {
            if (isDeletingAccount) return;
            setIsDeletingAccount(true);
            try {
              if (!session?.user?.id) {
                throw new Error(t('settings.pleaseSignIn'));
              }
              // Call Edge Function: delete-user via Supabase client
              const { error: delError } = await authSupabase.functions.invoke("delete-user");
              if (delError) {
                throw delError;
              }
              // The auth record is already deleted, so signOut may fail. That is
              // non-blocking: we still clear local caches and redirect.
              try {
                await authSupabase.auth.signOut();
              } catch (signOutErr) {
                if (__DEV__) console.warn("Sign-out after deletion failed:", signOutErr);
              }
              clearAllInMemoryCaches();
              Alert.alert(t('settings.deleteAccountSuccess'));
              navigation.reset({ index: 0, routes: [{ name: "SignIn" }] });
            } catch (e: any) {
              Alert.alert(t('settings.deleteAccountError'), e?.message || t('errors.tryAgain'));
            } finally {
              setIsDeletingAccount(false);
            }
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <View style={styles.header}>
        <BackButton />
        <Text style={styles.headerTitle}>{t('settings.title')}</Text>
      </View>

      <View style={styles.list}>
        <TouchableOpacity
          style={styles.item}
          onPress={() => navigation.navigate("UserQuestionnaire")}
          accessibilityRole="button"
          accessibilityLabel={t('settings.editGoals')}
        >
          <Text style={styles.itemText}>{t('settings.editGoals')}</Text>
        </TouchableOpacity>

        <View style={styles.separator} />

        <TouchableOpacity
          style={styles.item}
          onPress={() => setShowLanguageModal(true)}
          accessibilityRole="button"
          accessibilityLabel={`${t('settings.language')}, ${getLanguageDisplayName(language)}`}
        >
          <Text style={styles.itemText}>{t('settings.language')}</Text>
          <Text style={styles.itemSecondary}>
            {getLanguageDisplayName(language)}
          </Text>
        </TouchableOpacity>

        <View style={styles.separator} />

        <TouchableOpacity
          style={styles.item}
          onPress={() => setShowAppearanceModal(true)}
          accessibilityRole="button"
          accessibilityLabel={`${t('settings.appearance')}, ${getAppearanceDisplayName()}`}
        >
          <Text style={styles.itemText}>{t('settings.appearance')}</Text>
          <Text style={styles.itemSecondary}>
            {getAppearanceDisplayName()}
          </Text>
        </TouchableOpacity>

        <View style={styles.separator} />

        {/* Data Collection Consent Toggle */}
        <View style={[styles.item, styles.consentItem]}>
          <View style={styles.consentTextBlock}>
            <Text style={styles.itemText}>{t('settings.dataCollectionConsent')}</Text>
            <Text style={[styles.itemSecondary, styles.consentDescription]}>
              {t('settings.dataCollectionDescription')}
            </Text>
          </View>
          {isLoadingConsent ? (
            <Text style={[styles.itemSecondary, styles.loadingText]}>...</Text>
          ) : (
            <View style={styles.switchContainer}>
              <Switch
                value={dataCollectionConsent ?? false}
                onValueChange={handleToggleDataConsent}
                disabled={isLoadingConsent || isUpdatingConsent}
                trackColor={{ false: C.track, true: C.green }}
                thumbColor={C.cardBg}
                accessibilityLabel={t('settings.dataCollectionConsent')}
                accessibilityHint={t('settings.dataCollectionDescription')}
                accessibilityValue={{ text: dataCollectionConsent ? t('settings.dataCollectionEnabled') : t('settings.dataCollectionDisabled') }}
                accessibilityState={{ checked: !!dataCollectionConsent, disabled: isLoadingConsent || isUpdatingConsent }}
              />
              <Text style={[styles.itemSecondary, styles.consentStatus]}>
                {dataCollectionConsent ? t('settings.dataCollectionEnabled') : t('settings.dataCollectionDisabled')}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.separator} />

        <TouchableOpacity
          style={styles.item}
          onPress={handleOpenPrivacy}
          accessibilityRole="button"
          accessibilityLabel={t('settings.privacyPolicy')}
        >
          <Text style={styles.itemText}>{t('settings.privacyPolicy')}</Text>
        </TouchableOpacity>

        <View style={styles.separator} />

        <View
          style={[styles.item, styles.disclaimerItem]}
        >
          <Text
            style={[styles.itemSecondary, styles.disclaimerText]}
          >
            {t('settings.disclaimer')}
          </Text>
        </View>

        <View style={styles.separator} />

        <TouchableOpacity
          style={[styles.item, styles.centeredItem, isSigningOut && styles.itemDisabled]}
          onPress={handleSignOut}
          disabled={isSigningOut}
          accessibilityRole="button"
          accessibilityLabel={t('settings.signOut')}
          accessibilityState={{ disabled: isSigningOut }}
        >
          <Text style={styles.dangerText}>
            {isSigningOut ? t('auth.signingOut') : t('settings.signOut')}
          </Text>
        </TouchableOpacity>

        <View style={styles.separator} />

        <TouchableOpacity
          style={[styles.item, styles.centeredItem, isDeletingAccount && styles.itemDisabled]}
          onPress={handleDeleteAccount}
          disabled={isDeletingAccount}
          accessibilityRole="button"
          accessibilityLabel={t('settings.deleteAccount')}
          accessibilityHint={t('settings.deleteAccountHint')}
          accessibilityState={{ disabled: isDeletingAccount }}
        >
          <Text
            style={[styles.dangerText, styles.dangerTextBold]}
          >
            {isDeletingAccount ? t('settings.deletingAccount') : t('settings.deleteAccount')}
          </Text>
        </TouchableOpacity>
      </View>

      <SelectionModal
        visible={showLanguageModal}
        title={t('settings.languageSelection')}
        options={[
          { value: 'en', label: 'English' },
          { value: 'zh-TW', label: '繁體中文' },
        ]}
        selectedValue={language}
        onSelect={handleLanguageChange}
        onClose={() => setShowLanguageModal(false)}
        colors={C}
        closeLabel={t('common.cancel')}
      />

      <SelectionModal
        visible={showAppearanceModal}
        title={t('settings.appearanceSelection')}
        options={[
          { value: 'light', label: t('settings.lightMode') },
          { value: 'dark', label: t('settings.darkMode') },
        ]}
        selectedValue={mode}
        onSelect={handleAppearanceChange}
        onClose={() => setShowAppearanceModal(false)}
        colors={C}
        closeLabel={t('common.cancel')}
      />
    </SafeAreaView>
  );
}

const getStyles = (tc: ThemeColors) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: tc.bg },
  header: {
    backgroundColor: tc.headerBg,
    paddingHorizontal: 24,
    paddingVertical: 16,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  headerTitle: { 
    fontSize: 24, 
    fontWeight: "600", 
    color: tc.navy,
    fontFamily: tc.fontPrimary,
  },
  list: {
    backgroundColor: tc.cardBg,
    borderRadius: 12,
    marginHorizontal: 16,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: tc.cardBorder,
  },
  item: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  itemText: { 
    fontSize: 16, 
    color: tc.navy,
    fontFamily: tc.fontPrimary,
  },
  itemSecondary: { 
    fontSize: 16, 
    color: tc.textSecondary,
    fontFamily: tc.fontSecondary,
  },
  dangerText: { 
    fontSize: 16, 
    color: tc.coral,
    fontFamily: tc.fontPrimary,
  },
  dangerTextBold: { fontWeight: "700" },
  itemDisabled: { opacity: 0.5 },
  centeredItem: { justifyContent: "center" },
  consentItem: { minHeight: 72, paddingVertical: 12 },
  consentTextBlock: { flex: 1, marginRight: 16 },
  consentDescription: { fontSize: 13, marginTop: 4 },
  consentStatus: { fontSize: 12, marginTop: 4 },
  loadingText: { fontSize: 14 },
  switchContainer: { alignItems: "center" },
  disclaimerItem: {
    minHeight: 64,
    alignItems: "flex-start",
    paddingVertical: 12,
    flexDirection: "column",
  },
  disclaimerText: { flexShrink: 1, flexWrap: "wrap", width: "100%" },
  separator: { height: 1, backgroundColor: tc.separator },
});
