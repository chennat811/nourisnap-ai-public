import React, { useState, useRef, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Modal,
  Pressable,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../context/AuthContext";
import { useNavigation } from "@react-navigation/native";
import type { AppNavigation } from "../types/navigation";
import * as Linking from "expo-linking";
import { MaterialIcons } from "@expo/vector-icons";
import Constants from "expo-constants";
import { useTheme } from "../context/ThemeContext";
import { unauthBrand } from "../styles/unauthBrand";
import AppIcon from "../components/AppIcon";

function getStrength(pw: string) {
  if (!pw) return { pct: 0, color: 'transparent', label: '' };
  let s = 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12) s++;
  if (/[A-Z]/.test(pw)) s++;
  if (/[0-9]/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  return [
    { pct: 20, color: '#D4524A', label: '弱 Weak' },
    { pct: 40, color: '#F4A347', label: '尚可 Fair' },
    { pct: 60, color: '#F4A347', label: '普通 OK' },
    { pct: 80, color: '#C5CA22', label: '強 Strong' },
    { pct: 100, color: unauthBrand.green, label: '極強 Great' },
  ][Math.min(s, 4)];
}

const EMOJI_POS: any[] = [
  { top: 70, left: '6%' }, { top: 150, right: '8%' },
  { top: 420, left: '4%' }, { top: 520, right: '6%' }, { top: 680, left: '8%' },
];

export default function SignUpScreen() {
  const { supabase } = useAuth();
  const navigation = useNavigation<AppNavigation>();
  const { colors: C, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(C, isDark), [C, isDark]);
  const scrollRef = useRef<ScrollView>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [showCpw, setShowCpw] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);

  const PRIVACY_URL =
    (Constants.expoConfig?.extra as any)?.PRIVACY_URL ??
    "https://manzoni-nutrition.vercel.app/privacy";

  const strength = getStrength(password);
  const matchState = !confirm ? 'none' : password === confirm ? 'ok' : 'fail';

  const handleSignUp = async () => {
    if (loading) return;
    setLoading(true);
    setError("");
    if (password.length < 8) {
      setError("密碼至少 8 碼 · Password needs 8+ characters");
      setLoading(false);
      return;
    }
    if (password !== confirm) {
      setError("密碼不相符 · Passwords do not match");
      setLoading(false);
      return;
    }
    const target = Linking.createURL("signin");
    const emailRedirectTo = `https://manzoni-nutrition.vercel.app/auth/callback?target=${encodeURIComponent(target)}`;
    try {
      const { error: err } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo,
          data: { full_name: name.trim() || undefined },
        },
      });
      if (err) setError(err.message);
      else setShowModal(true);
    } catch (e) {
      setError("發生未知錯誤，請稍後再試 · An unknown error occurred, please try again");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
    <Modal
      visible={showModal}
      transparent
      animationType="fade"
      onRequestClose={() => { setShowModal(false); navigation.navigate("SignIn"); }}
    >
      <Pressable
        style={styles.modalOverlay}
        onPress={() => { setShowModal(false); navigation.navigate("SignIn"); }}
      >
        <View
          style={styles.modalCard}
          onStartShouldSetResponder={() => true}
        >
          <Text style={styles.modalEmoji}>📬</Text>
          <Text style={styles.modalTitle}>{'確認電子郵件\nCheck Your Email'}</Text>
          <Text style={styles.modalBody}>
            {'我們已寄出一封確認信。\n請前往收件匣點擊確認連結，完成後即可登入。\n\nWe\'ve sent a confirmation link to your inbox. Click it to activate your account, then sign in.'}
          </Text>
          <TouchableOpacity
            style={styles.modalBtn}
            onPress={() => { setShowModal(false); navigation.navigate("SignIn"); }}
          >
            <Text style={styles.modalBtnTxt}>前往登入 · Go to Sign In</Text>
          </TouchableOpacity>
        </View>
      </Pressable>
    </Modal>
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: C.bg }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        {(['🍱', '📷', '🌿', '🥗', '🍜'] as const).map((emoji, i) => (
          <Text key={i} style={[styles.floatEmoji, EMOJI_POS[i]]}>{emoji}</Text>
        ))}

        <View style={styles.wrap}>
          {/* Mascot */}
          <AppIcon style={styles.mascot} />

          {/* App name */}
          <View style={styles.nameBlock}>
            <Text style={styles.appName}>
              Nouri<Text style={{ color: C.green }}>Snap</Text>
            </Text>
            <Text style={styles.appZh}>拍 食 記</Text>
            <Text style={styles.tagline}>Snap your meal · Know your nutrition</Text>
          </View>

          {/* Form card */}
          <View style={styles.card}>
            <View style={styles.cardHead}>
              <Text style={styles.cardTitle}>建立帳號 · REGISTER</Text>
            </View>

            {/* Name */}
            <View style={styles.inputRow}>
              <Text style={styles.inputIcon}>👤</Text>
              <TextInput
                style={styles.input}
                placeholder="名字 · Your name"
                placeholderTextColor={C.textMuted}
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
              />
            </View>

            {/* Email */}
            <View style={styles.inputRow}>
              <Text style={styles.inputIcon}>✉️</Text>
              <TextInput
                style={styles.input}
                placeholder="電子郵件 · Email"
                placeholderTextColor={C.textMuted}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
              />
            </View>

            {/* Password */}
            <View style={styles.inputRow}>
              <Text style={styles.inputIcon}>🔒</Text>
              <TextInput
                style={[styles.input, { paddingRight: 44 }]}
                placeholder="新密碼（至少 8 碼）· New password"
                placeholderTextColor={C.textMuted}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPw}
              />
              <TouchableOpacity style={styles.eyeBtn} onPress={() => setShowPw(v => !v)}>
                <MaterialIcons name={showPw ? "visibility" : "visibility-off"} size={18} color={C.textMuted} />
              </TouchableOpacity>
            </View>

            {/* Strength bar */}
            {!!password && (
              <View style={styles.strengthRow}>
                <View style={styles.strengthTrack}>
                  <View style={[styles.strengthFill, { width: `${strength.pct}%` as any, backgroundColor: strength.color }]} />
                </View>
                <Text style={[styles.strengthLbl, { color: strength.color }]}>{strength.label}</Text>
              </View>
            )}

            {/* Confirm password */}
            <View style={styles.inputRow}>
              <Text style={styles.inputIcon}>🔒</Text>
              <TextInput
                style={[styles.input, { paddingRight: 44 }]}
                placeholder="確認密碼 · Confirm password"
                placeholderTextColor={C.textMuted}
                value={confirm}
                onChangeText={setConfirm}
                secureTextEntry={!showCpw}
                onFocus={() =>
                  setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100)
                }
              />
              <TouchableOpacity style={styles.eyeBtn} onPress={() => setShowCpw(v => !v)}>
                <MaterialIcons name={showCpw ? "visibility" : "visibility-off"} size={18} color={C.textMuted} />
              </TouchableOpacity>
            </View>

            {/* Match hint */}
            {matchState !== 'none' && (
              <Text style={[styles.matchHint, { color: matchState === 'ok' ? C.green : C.coral }]}>
                {matchState === 'ok'
                  ? '✓ 密碼相符 · Passwords match'
                  : '✕ 密碼不相符 · Passwords do not match'}
              </Text>
            )}

            {!!error && <Text style={styles.errText}>{error}</Text>}

            {/* Register button */}
            <TouchableOpacity style={styles.regBtn} onPress={handleSignUp} disabled={loading}>
              <Text style={styles.regBtnTxt}>
                {loading ? '處理中… · Processing…' : '🐦 註冊 · Create Account'}
              </Text>
            </TouchableOpacity>

            {/* Privacy note */}
            <View style={styles.privacy}>
              <Text style={styles.privIcon}>🔒</Text>
              <Text style={styles.privTxt}>
                {'註冊即表示同意 '}
                <Text style={{ color: C.green }} onPress={() => Linking.openURL(PRIVACY_URL)}>
                  隱私權政策
                </Text>
                {' · By signing up you agree to our '}
                <Text style={{ color: C.green }} onPress={() => Linking.openURL(PRIVACY_URL)}>
                  Privacy Policy
                </Text>
              </Text>
            </View>

          </View>

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={styles.footerSub}>已有帳號？· Already have an account?</Text>
            <TouchableOpacity onPress={() => navigation.navigate("SignIn")}>
              <Text style={styles.footerLink}>登入 · Sign In →</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
    </SafeAreaView>
    </>
  );
}

const makeStyles = (C: any, isDark: boolean) =>
  StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: C.bg },
    scroll: { flexGrow: 1, alignItems: 'center', paddingVertical: 40, paddingHorizontal: 20, backgroundColor: C.bg },
    floatEmoji: { position: 'absolute', fontSize: 20, opacity: 0.07 },
    wrap: { width: '100%', maxWidth: 380, alignItems: 'center', zIndex: 1 },
    mascot: { width: 200, height: 170, resizeMode: 'contain', marginBottom: 8 },
    nameBlock: { alignItems: 'center', marginBottom: 24 },
    appName: { fontFamily: 'FredokaOne', fontSize: 32, color: C.textPrimary, letterSpacing: 1 },
    appZh: { fontFamily: 'FredokaOne', fontSize: 12, letterSpacing: 4, color: isDark ? 'rgba(255,235,190,0.3)' : 'rgba(0,0,0,0.25)', marginTop: 4 },
    tagline: { fontFamily: C.fontSecondary, fontSize: 11, fontWeight: '700', color: C.textMuted, marginTop: 4, letterSpacing: 0.3 },
    card: { width: '100%', backgroundColor: C.cardBg, borderWidth: 2, borderColor: C.cardBorder, borderRadius: 28, padding: 22, marginBottom: 20 },
    cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 },
    cardTitle: { fontFamily: C.fontPrimary, fontSize: 11, letterSpacing: 2, color: isDark ? 'rgba(255,235,190,0.35)' : C.textMuted },
    headLink: { fontFamily: C.fontPrimary, fontSize: 11, color: C.green, borderBottomWidth: 1, borderBottomColor: 'rgba(58,140,126,0.3)', paddingBottom: 1 },
    inputRow: { position: 'relative', marginBottom: 10 },
    inputIcon: { position: 'absolute', left: 14, top: 14, fontSize: 14, zIndex: 1 },
    input: { width: '100%', backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : C.track, borderWidth: 2, borderColor: isDark ? 'rgba(255,255,255,0.08)' : C.cardBorder, borderRadius: 14, paddingVertical: 13, paddingLeft: 44, paddingRight: 14, fontFamily: C.fontSecondary, fontSize: 14, fontWeight: '700', color: C.textPrimary },
    eyeBtn: { position: 'absolute', right: 14, top: 14, zIndex: 1 },
    strengthRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: -4, marginBottom: 10, paddingHorizontal: 4 },
    strengthTrack: { flex: 1, height: 3, backgroundColor: isDark ? 'rgba(255,255,255,0.07)' : C.cardBorder, borderRadius: 2, overflow: 'hidden' },
    strengthFill: { height: '100%' as any, borderRadius: 2 },
    strengthLbl: { fontFamily: C.fontPrimary, fontSize: 9, letterSpacing: 0.5, width: 56, textAlign: 'right' },
    matchHint: { fontFamily: C.fontSecondary, fontSize: 10, fontWeight: '800', marginTop: -4, marginBottom: 10, paddingLeft: 4 },
    errText: { color: C.coral, fontFamily: C.fontSecondary, fontWeight: '700', fontSize: 12, textAlign: 'center', marginBottom: 8 },
    dots: { flexDirection: 'row', gap: 5, justifyContent: 'center', marginBottom: 14 },
    dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: isDark ? 'rgba(255,255,255,0.12)' : C.cardBorder },
    dotOn: { width: 18, borderRadius: 3, backgroundColor: C.lime },
    regBtn: { width: '100%', paddingVertical: 14, borderRadius: 16, backgroundColor: C.green, alignItems: 'center', marginBottom: 14, shadowColor: C.green, shadowOffset: { width: 0, height: 5 }, shadowOpacity: 1, shadowRadius: 0, elevation: 5 },
    regBtnTxt: { color: C.cream, fontFamily: C.fontPrimary, fontSize: 17, letterSpacing: 0.5 },
    privacy: { flexDirection: 'row', alignItems: 'flex-start', gap: 7, backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : C.track, borderWidth: 1.5, borderColor: isDark ? 'rgba(255,255,255,0.06)' : C.cardBorder, borderRadius: 12, padding: 9, marginBottom: 14 },
    privIcon: { fontSize: 12, marginTop: 1 },
    privTxt: { flex: 1, fontFamily: C.fontSecondary, fontSize: 10, fontWeight: '700', color: C.textMuted, lineHeight: 15 },
    orRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
    orLine: { flex: 1, height: 1, backgroundColor: isDark ? 'rgba(255,255,255,0.07)' : C.cardBorder },
    orTxt: { fontFamily: C.fontPrimary, fontSize: 10, letterSpacing: 2, color: C.textMuted },
    socialRow: { flexDirection: 'row', gap: 8 },
    socialBtn: { flex: 1, paddingVertical: 12, borderRadius: 13, backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : C.track, borderWidth: 2, borderColor: C.cardBorder, alignItems: 'center', justifyContent: 'center' },
    socialTxt: { fontFamily: C.fontPrimary, fontSize: 12, color: C.textSecondary, letterSpacing: 0.3 },
    footer: { alignItems: 'center', marginBottom: 32 },
    footerSub: { fontFamily: C.fontSecondary, fontSize: 12, fontWeight: '800', color: C.textMuted, marginBottom: 4 },
    footerLink: { fontFamily: C.fontPrimary, fontSize: 14, color: C.textPrimary, borderBottomWidth: 1.5, borderBottomColor: isDark ? 'rgba(255,235,190,0.2)' : C.cardBorder, paddingBottom: 1 },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 24 },
    modalCard: { width: '100%', maxWidth: 340, backgroundColor: C.cardBg, borderWidth: 2, borderColor: C.cardBorder, borderRadius: 28, padding: 28, alignItems: 'center' },
    modalEmoji: { fontSize: 40, marginBottom: 12 },
    modalTitle: { fontFamily: C.fontPrimary, fontSize: 18, color: C.textPrimary, textAlign: 'center', marginBottom: 12, lineHeight: 26 },
    modalBody: { fontFamily: C.fontSecondary, fontSize: 13, fontWeight: '700', color: C.textMuted, textAlign: 'center', lineHeight: 20, marginBottom: 24 },
    modalBtn: { width: '100%', paddingVertical: 14, borderRadius: 16, backgroundColor: C.green, alignItems: 'center', shadowColor: C.green, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.8, shadowRadius: 0, elevation: 4 },
    modalBtnTxt: { color: C.cream, fontFamily: C.fontPrimary, fontSize: 15, letterSpacing: 0.5 },
  });
