import React, { useState, useMemo } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Dimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../context/AuthContext";
import { useNavigation } from "@react-navigation/native";
import type { AppNavigation } from "../types/navigation";
import { useLanguage } from "../context/LanguageContext";
import { unauthBrand } from "../styles/unauthBrand";
import AppIcon from "../components/AppIcon";

const { width } = Dimensions.get('window');

export default function SignInScreen() {
  const { supabase } = useAuth();
  const navigation = useNavigation<AppNavigation>();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [staySignedIn, setStaySignedIn] = useState(false);
  const { t, language } = useLanguage();
  const { styles, placeholderColor } = useMemo(() => getStyles(language), [language]);

  const handleSignIn = async () => {
    if (loading) return;
    setError("");
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError(t('auth.emailRequired'));
      return;
    }
    if (!password) {
      setError(t('auth.passwordRequired'));
      return;
    }
    setLoading(true);

    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: trimmedEmail,
        password,
      });

      if (signInError) {
        setError(signInError.message);
      } else {
        // Supabase automatically persists the session internally.
        // You can optionally store the user's preference for "stay signed in" here.
        try {
          await AsyncStorage.setItem(
            "stay_signed_in_pref",
            JSON.stringify(staySignedIn),
          );
        } catch (e) {
          if (__DEV__) console.warn("Failed to save stay-signed-in preference:", e);
        }
      }
    } catch (e) {
      setError(t('errors.unknownError'));
    } finally {
      setLoading(false);
    }
  };

  const handleNavigateToSignUp = () => {
    navigation.navigate("SignUp");
  };
  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
    <ScrollView
      contentContainerStyle={styles.scrollContainer}
      keyboardShouldPersistTaps="handled"
    >
      {/* Full-width hero logo in circular container */}
      <View style={styles.hero}>
        <View style={styles.logoCircle}>
          <AppIcon style={styles.heroImage} />
        </View>
      </View>

      <View style={styles.wrap}>
        {/* App Name Block */}
        <View style={styles.appNameBlock}>
          <Text style={styles.appName}>
            Nouri<Text style={styles.appNameSnap}>Snap</Text>
          </Text>
          <Text style={styles.appChinese}>識 食 拍</Text>
        </View>

        {/* Form Card */}
        <View style={styles.formCard}>
          <Text style={styles.formTitle}>{t('auth.signIn')}</Text>

          {/* Email Input */}
          <View style={styles.inputWrap}>
            <Text style={styles.inputIcon}>✉️</Text>
            <TextInput
              style={styles.nouriInput}
              placeholder={t('auth.email')}
              placeholderTextColor={placeholderColor}
              autoCapitalize="none"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
            />
          </View>

          {/* Password Input */}
          <View style={styles.inputWrap}>
            <Text style={styles.inputIcon}>🔒</Text>
            <TextInput
              style={styles.nouriInput}
              placeholder={t('auth.password')}
              placeholderTextColor={placeholderColor}
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />
          </View>

          {/* Forgot Password */}
          <TouchableOpacity
            style={styles.forgot}
            onPress={() => navigation.navigate("ResetPassword")}
          >
            <Text style={styles.forgotText}>
              {t('auth.forgotPassword')}
            </Text>
          </TouchableOpacity>

          {/* Sign In Button */}
          <TouchableOpacity
            style={styles.signinBtn}
            onPress={handleSignIn}
            disabled={loading}
            activeOpacity={0.8}
          >
            <Text style={styles.signinBtnText}>
              {t(loading ? 'auth.signingIn' : 'auth.signIn')}
            </Text>
          </TouchableOpacity>

          {/* Error Message */}
          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          {/* Keep Signed In */}
          <TouchableOpacity 
            style={styles.keepRow}
            onPress={() => setStaySignedIn(!staySignedIn)}
            activeOpacity={0.7}
          >
            <View style={[styles.customCheck, staySignedIn && styles.customCheckChecked]}>
              {staySignedIn && <Text style={styles.checkMark}>✓</Text>}
            </View>
            <Text style={styles.keepLabel}>
              {t('auth.staySignedIn')}
            </Text>
          </TouchableOpacity>
        </View>
        
        {/* Register Link */}
        <View style={styles.registerRow}>
          <TouchableOpacity onPress={handleNavigateToSignUp}>
            <Text style={styles.registerLink}>
              {t('auth.dontHaveAccount')}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
    </SafeAreaView>
  );
}

const getStyles = (language: string) => {
  // Always use light mode colors for SignInScreen
  const tc = {
    bg: '#E7E7E7',
    cardBg: '#FFFFFF',
    cardBorder: '#E0E0E0',
    navy: unauthBrand.navy,
    green: unauthBrand.green,
    coral: unauthBrand.coral,
    cream: unauthBrand.cream,
    tipBubbleBorder: 'rgba(74,155,111,0.2)',
    textMuted: '#9CA3AF',
    red: unauthBrand.coral,
    fontPrimary: language === 'zh-TW' ? 'MochiyPopOne-Regular' : 'FredokaOne',
    fontSecondary: language === 'zh-TW' ? 'JFOpenHuninn' : 'Nunito',
  };
  
  return {
    placeholderColor: tc.navy,
    styles: StyleSheet.create({
      safeArea: {
        flex: 1,
        backgroundColor: tc.green,
      },
      scrollContainer: {
        flexGrow: 1,
        minHeight: '100%',
        paddingVertical: 32,
        paddingHorizontal: 20,
        position: 'relative',
        backgroundColor: tc.green,
      },
      hero: {
        width: '100%',
        marginBottom: 16,
        alignItems: 'center',
        paddingTop: 20,
      },
      logoCircle: {
        width: Math.min(Dimensions.get('window').width * 0.65, 280),
        height: Math.min(Dimensions.get('window').width * 0.65, 280),
        borderRadius: Math.min(Dimensions.get('window').width * 0.65, 280) / 2,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        overflow: 'hidden',
        backgroundColor: tc.bg,
      },
      heroImage: {
        width: '100%',
        height: '100%',
        resizeMode: 'contain',
      },
      floatingEmoji: {
        position: 'absolute',
        fontSize: 22,
        opacity: 0.07,
        zIndex: 0,
      },
      wrap: {
        width: '100%',
        maxWidth: 380,
        alignSelf: 'center',
        alignItems: 'center',
        zIndex: 1,
      },
      appNameBlock: {
        alignItems: 'center',
        marginBottom: 32,
      },
      appName: {
        fontFamily: tc.fontPrimary,
        fontSize: 35,
        letterSpacing: 1,
        lineHeight: 40,
        color: tc.navy,
      },
      appNameSnap: {
        color: tc.coral,
      },
      appChinese: {
        fontFamily: tc.fontPrimary,
        fontSize: 18,
        letterSpacing: 4,
        color: tc.cream,
        marginTop: 5,
      },
      formCard: {
        width: '100%',
        borderWidth: 2,
        borderRadius: 28,
        paddingVertical: 26,
        paddingHorizontal: 24,
        backgroundColor: tc.cardBg,
        borderColor: tc.cardBorder,
      },
      formTitle: {
        fontFamily: tc.fontPrimary,
        fontSize: 18,
        color: tc.navy,
        letterSpacing: 2,
        marginBottom: 18,
      },
      inputWrap: {
        position: 'relative',
        marginBottom: 12,
      },
      inputIcon: {
        position: 'absolute',
        left: 14,
        top: 14,
        fontSize: 15,
        zIndex: 1,
      },
      nouriInput: {
        width: '100%',
        backgroundColor: tc.cardBg,
        borderWidth: 2,
        borderColor: tc.tipBubbleBorder,
        borderRadius: 14,
        paddingVertical: 14,
        paddingLeft: 44,
        paddingRight: 14,
        fontFamily: tc.fontSecondary,
        fontSize: 15,
        fontWeight: '700',
        color: tc.navy,
      },
      forgot: {
        alignSelf: 'flex-end',
        marginBottom: 20
      },
      forgotText: {
        fontFamily: tc.fontPrimary,
        fontSize: 12.5,
        color: tc.coral,
        letterSpacing: 0.3
      },
      signinBtn: {
        width: '100%',
        paddingVertical: 8,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 16,
        backgroundColor: tc.green,
        shadowColor: tc.green,
        shadowOffset: { width: 0, height: 5 },
        shadowOpacity: 1,
        shadowRadius: 0,
        elevation: 5,
      },
      signinBtnText: {
        color: tc.cream,
        fontFamily: tc.fontPrimary,
        fontSize: 18.5,
        letterSpacing: 0.5,
      },
      keepRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
      },
      customCheck: {
        width: 20,
        height: 20,
        borderRadius: 6,
        borderWidth: 2,
        borderColor: tc.tipBubbleBorder,
        backgroundColor: tc.cardBg,
        alignItems: 'center',
        justifyContent: 'center',
      },
      customCheckChecked: {
        backgroundColor: tc.green,
        borderColor: tc.green,
      },
      checkMark: {
        fontSize: 11,
        color: tc.green,
      },
      keepLabel: {
        fontFamily: tc.fontPrimary,
        fontSize: 13,
        color: tc.navy,
      },
      errorText: {
        color: tc.red,
        fontFamily: tc.fontSecondary,
        fontWeight: '700',
        fontSize: 13,
        textAlign: 'center',
        marginTop: 15,
        marginBottom: 15,
      },
      orDivider: {
        flexDirection: 'row',
        alignItems: 'center',
        width: '100%',
        marginTop: 22,
        marginBottom: 18,
        gap: 12,
      },
      registerRow: {
        alignItems: 'center',
        marginTop: 18,
        marginBottom: 22
      },
      registerQuestion: {
        fontSize: 14,
        fontWeight: '800',
        color: tc.cream,
        marginBottom: 15,
      },
      registerLink: {
        fontFamily: tc.fontPrimary,
        fontSize: 14,
        letterSpacing: 0.3,
        borderBottomWidth: 1.5,
        borderBottomColor: tc.textMuted,
        paddingBottom: 10,
        color: tc.cream,
      }
    })
  }
}
