import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import type { AppNavigation } from "../types/navigation";
import { supabase } from "../lib/supabase";
import TopBanner from "../components/TopBanner";
import { withAuth, NotAuthError } from "../lib/withAuth";
import { useLanguage } from "../context/LanguageContext";
import { useTheme } from "../context/ThemeContext";

type FeedbackType = "bug" | "feature_request" | "general";

export default function GeneralFeedbackScreen() {
  const navigation = useNavigation<AppNavigation>();
  const { t } = useLanguage();
  const { colors: tc } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = React.useMemo(() => getStyles(tc), [tc]);
  const scrollViewRef = React.useRef<ScrollView>(null);

  const handleTextInputFocus = () => {
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 150);
  };

  const [feedbackType, setFeedbackType] = React.useState<FeedbackType | null>(null);
  const [feedbackText, setFeedbackText] = React.useState<string>("");
  const [submitting, setSubmitting] = React.useState(false);

  const feedbackTypeOptions = React.useMemo<Array<{ key: FeedbackType; label: string; description: string }>>(() => [
    { key: "bug", label: t('generalFeedback.bugLabel'), description: t('generalFeedback.bugDescription') },
    { key: "feature_request", label: t('generalFeedback.featureLabel'), description: t('generalFeedback.featureDescription') },
    { key: "general", label: t('generalFeedback.generalLabel'), description: t('generalFeedback.generalDescription') },
  ], [t]);

  const submit = async () => {
    Keyboard.dismiss();

    if (!feedbackType) {
      Alert.alert(t('generalFeedback.selectTypeTitle'), t('generalFeedback.selectTypeMessage'));
      return;
    }

    if (!feedbackText.trim()) {
      Alert.alert(t('generalFeedback.enterContentTitle'), t('generalFeedback.enterContentMessage'));
      return;
    }

    setSubmitting(true);
    try {
      const { data, error } = await withAuth(() => supabase.auth.getUser());
      if (error || !data?.user?.id) throw new NotAuthError();
      const user_id = data.user.id;

      // Insert into general_feedback table
      const { error: insertError } = await withAuth(async () => {
        return await supabase.from("general_feedback").insert({
          user_id,
          feedback_type: feedbackType,
          feedback_text: feedbackText.trim(),
          submitted_at: new Date().toISOString(),
        });
      });

      if (insertError) throw insertError;

      Alert.alert(t('generalFeedback.thankYouTitle'), t('generalFeedback.thankYouMessage'), [
        {
          text: t('generalFeedback.done'),
          onPress: () => navigation.goBack(),
        },
      ]);
    } catch (error: unknown) {
      if (error instanceof NotAuthError) {
        Alert.alert(t('generalFeedback.sessionExpiredTitle'), t('generalFeedback.sessionExpiredMessage'), [
          { text: t('generalFeedback.goToSignIn'), onPress: () => navigation.navigate("SignIn") },
        ]);
      } else {
        const e = error as Error;
        Alert.alert(t('generalFeedback.submitFailedTitle'), e?.message || t('generalFeedback.submitFailedFallback'));
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <TopBanner title={t('generalFeedback.bannerTitle')} onBack={() => navigation.goBack()} showBack height={40} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={insets.top + 40}
      >
        <ScrollView
          ref={scrollViewRef}
          style={{ flex: 1 }}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.card}>
            <Text style={styles.titleText}>{t('generalFeedback.cardTitle')}</Text>
            <Text style={styles.subtitle}>
              {t('generalFeedback.cardSubtitle')}
            </Text>

            <Text style={styles.label}>{t('generalFeedback.typeLabel')}</Text>
            {feedbackTypeOptions.map((option) => (
              <TouchableOpacity
                key={option.key}
                style={[
                  styles.typeCard,
                  feedbackType === option.key && styles.typeCardActive,
                ]}
                onPress={() => setFeedbackType(option.key)}
              >
                <View style={styles.typeCardHeader}>
                  <Text style={[
                    styles.typeCardLabel,
                    feedbackType === option.key && styles.typeCardLabelActive,
                  ]}>
                    {option.label}
                  </Text>
                  <View style={[
                    styles.radio,
                    feedbackType === option.key && styles.radioActive,
                  ]} />
                </View>
                <Text style={styles.typeCardDescription}>{option.description}</Text>
              </TouchableOpacity>
            ))}

            <Text style={[styles.label, { marginTop: 16 }]}>{t('generalFeedback.detailLabel')}</Text>
            <TextInput
              value={feedbackText}
              onChangeText={setFeedbackText}
              placeholder={
                feedbackType === "bug"
                  ? t('generalFeedback.bugPlaceholder')
                  : feedbackType === "feature_request"
                    ? t('generalFeedback.featurePlaceholder')
                    : t('generalFeedback.generalPlaceholder')
              }
              placeholderTextColor={tc.textMuted}
              style={[styles.textArea, { marginTop: 10 }]}
              multiline
              returnKeyType="done"
              onFocus={handleTextInputFocus}
              blurOnSubmit={true}
              textAlignVertical="top"
            />

            <TouchableOpacity
              style={[styles.submitBtn, submitting && { opacity: 0.7 }]}
              onPress={submit}
              disabled={submitting}
            >
              <Text style={styles.submitBtnText}>{submitting ? t('generalFeedback.submitting') : t('generalFeedback.submit')}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.cancelBtn, submitting && { opacity: 0.7 }]}
              onPress={() => navigation.goBack()}
              disabled={submitting}
            >
              <Text style={styles.cancelBtnText}>{t('generalFeedback.cancel')}</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const getStyles = (tc: any) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: tc.bg },
  content: { padding: 16, flexGrow: 1 },
  card: { backgroundColor: tc.cardBg, borderRadius: 12, padding: 16, flex: 1 },
  titleText: { 
    fontSize: 20, 
    fontWeight: "700", 
    color: tc.green, 
    marginBottom: 8,
    fontFamily: tc.fontPrimary,
  },
  subtitle: { 
    fontSize: 14, 
    color: tc.textSecondary, 
    marginBottom: 20, 
    lineHeight: 20,
    fontFamily: tc.fontSecondary,
  },
  label: { 
    fontSize: 14, 
    fontWeight: "700", 
    color: tc.green, 
    marginBottom: 10,
    fontFamily: tc.fontPrimary,
  },
  typeCard: {
    borderWidth: 2,
    borderColor: tc.cardBorder,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    backgroundColor: tc.cardBg,
  },
  typeCardActive: {
    borderColor: tc.green,
    backgroundColor: tc.tipBubbleBg,
  },
  typeCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  typeCardLabel: {
    fontSize: 16,
    fontWeight: "700",
    color: tc.textPrimary,
    fontFamily: tc.fontPrimary,
  },
  typeCardLabelActive: {
    color: tc.green,
  },
  typeCardDescription: {
    fontSize: 13,
    color: tc.textSecondary,
    lineHeight: 18,
    fontFamily: tc.fontSecondary,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: tc.textMuted,
  },
  radioActive: {
    borderColor: tc.green,
    backgroundColor: tc.green,
  },
  textArea: {
    borderWidth: 1,
    borderColor: tc.cardBorder,
    borderRadius: 10,
    padding: 12,
    minHeight: 150,
    color: tc.textPrimary,
    backgroundColor: tc.cardBg,
    fontSize: 14,
    fontFamily: tc.fontSecondary,
  },
  submitBtn: {
    marginTop: 20,
    backgroundColor: tc.green,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
  },
  submitBtnText: { 
    color: tc.white, 
    fontWeight: "800", 
    fontSize: 16,
    fontFamily: tc.fontPrimary,
  },
  cancelBtn: {
    marginTop: 10,
    backgroundColor: tc.track,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
    borderWidth: 1,
    borderColor: tc.cardBorder,
  },
  cancelBtnText: { 
    color: tc.green, 
    fontWeight: "800", 
    fontSize: 16,
    fontFamily: tc.fontPrimary,
  },
});
