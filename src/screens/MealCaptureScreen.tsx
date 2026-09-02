import React, { useEffect, useCallback } from "react";
import {
  View,
  StyleSheet,
  Modal,
  Alert,
  Text,
  TouchableOpacity,
  PanResponder,
  GestureResponderEvent,
  PanResponderGestureState,
  Image,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Pressable,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation, useRoute, useFocusEffect, RouteProp } from "@react-navigation/native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Info } from "lucide-react-native";
import * as FileSystem from "expo-file-system/legacy";
import * as ImageManipulator from "expo-image-manipulator";
import { useCameraPermissions } from "expo-camera";
import CameraComponent from "../components/CameraComponent";
import AppIcon from "../components/AppIcon";
import DrinkOptions from "../components/DrinkOptions";
import { supabase } from "../lib/supabase";
import { useLanguage } from "../context/LanguageContext";
import { useTheme } from "../context/ThemeContext";
import type { ThemeColors } from "../context/ThemeContext";
import { useDailyLimit, DAILY_SCAN_LIMIT } from "../hooks/useDailyLimit";
import { classifyTextInput, textRebreakdown } from "../services/api";
import { isAddedSugarIngredient, type DrinkType } from "../utils/drinkType";
import type { AppNavigation, RootStackParamList } from "../types/navigation";

// This screen navigates directly to AnalysisLoading after selecting a portion
// (no separate PortionSelect screen is registered in the navigator)

const staticStyles = StyleSheet.create({
  modalBackdrop: {
    flexGrow: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  sliderLabelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  sliderHitArea: {
    width: "100%",
    height: 44,
    justifyContent: "center",
    marginBottom: 4,
  },
  actionsRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 12,
    gap: 10,
  },
  actionBtn: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 14,
    height: 44,
    flex: 1,
    flexBasis: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  textLinkBtn: {
    alignSelf: "center",
    marginTop: 12,
    paddingVertical: 8,
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  toggleKnobOn: {
    alignSelf: "flex-end",
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 4,
  },
  stepperControls: {
    flexDirection: "row",
    alignItems: "center",
  },
  safeArea: {
    flex: 1,
    backgroundColor: "#000",
  },
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  capturedBg: {
    flex: 1,
    width: "100%",
  },
  tipContainer: {
    position: "absolute",
    bottom: 120,
    left: 20,
    right: 20,
    backgroundColor: "rgba(0,0,0,0.6)",
    borderRadius: 12,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
  },
  classifyingOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.55)",
    zIndex: 10,
  },
  textLoadingWrap: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 20,
    minHeight: 160,
  },
  textSpinnerMascot: {
    position: "absolute",
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  textSpinnerMascotImg: { width: 48, height: 48, resizeMode: "cover", borderRadius: 12 },
  textErrorWrap: { alignItems: "center", paddingVertical: 8 },
});

const getDynamicStyles = (colors: ThemeColors) => ({
  modalCard: {
    width: "100%" as const,
    maxWidth: 380,
    backgroundColor: colors.modalBg,
    borderRadius: 16,
    padding: 20,
    borderWidth: 2,
    borderColor: colors.cardBorder,
  },
  modalTitle: {
    fontSize: 18,
    fontFamily: colors.fontPrimary,
    fontWeight: "700" as const,
    color: colors.navy,
    marginBottom: 16,
    letterSpacing: 0.3,
  },
  modalSubtitle: { fontSize: 14, color: colors.textSecondary, marginBottom: 12, fontFamily: colors.fontSecondary },
  sliderLabel: {
    fontSize: 13,
    fontFamily: colors.fontPrimary,
    fontWeight: "600" as const,
    color: colors.textMuted,
  },
  sliderValue: {
    fontSize: 14,
    fontFamily: colors.fontPrimary,
    fontWeight: "700" as const,
    color: colors.lime,
  },
  sliderTrack: {
    height: 6,
    backgroundColor: colors.track,
    borderRadius: 4,
    overflow: "hidden" as const,
  },
  sliderFill: { height: 6, backgroundColor: colors.green },
  sliderThumb: {
    position: "absolute" as const,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.white,
    borderWidth: 3,
    borderColor: colors.green,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
  },
  sliderTickLabel: {
    fontSize: 14,
    fontFamily: colors.fontPrimary,
    color: colors.textMuted,
  },
  cancelBtn: {
    backgroundColor: colors.modalBg,
    borderColor: colors.cardBorder,
  },
  confirmBtn: {
    backgroundColor: colors.green,
    shadowColor: colors.green,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
  },
  cancelText: {
    color: colors.textMuted,
    fontFamily: colors.fontPrimary,
    fontWeight: "600" as const,
    fontSize: 15,
  },
  confirmText: {
    color: colors.white,
    fontFamily: colors.fontPrimary,
    fontWeight: "700" as const,
    fontSize: 15,
  },
  textLinkText: {
    color: colors.green,
    fontFamily: colors.fontSecondary,
    fontWeight: "700" as const,
    fontSize: 14,
    textDecorationLine: "underline" as const,
  },
  divider: { height: 1, backgroundColor: colors.separator, marginVertical: 10 },
  hintInput: {
    borderWidth: 1.5,
    borderColor: colors.cardBorder,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 13,
    fontFamily: colors.fontSecondary,
    fontWeight: "700" as const,
    color: colors.textMuted,
    backgroundColor: colors.cardBg,
  },
  hintCaption: {
    fontSize: 14,
    fontFamily: colors.fontSecondary,
    fontWeight: "700" as const,
    color: colors.textMuted,
    marginTop: 4,
    lineHeight: 14,
  },
  toggleLabel: {
    fontSize: 15,
    fontFamily: colors.fontPrimary,
    fontWeight: "600" as const,
    color: colors.navy,
    marginBottom: 2,
  },
  toggleCaption: {
    fontSize: 14,
    fontFamily: colors.fontSecondary,
    color: colors.textMuted,
  },
  toggleTrack: {
    width: 40,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.track,
    justifyContent: "center" as const,
    paddingHorizontal: 2,
    marginLeft: 12,
  },
  toggleTrackOn: {
    backgroundColor: colors.green,
  },
  toggleKnob: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.white,
  },
  stepperRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: colors.separator,
  },
  stepperLabel: {
    fontSize: 14,
    fontFamily: colors.fontPrimary,
    fontWeight: "600" as const,
    color: colors.textSecondary,
  },
  stepperBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.track,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  stepperBtnText: {
    fontSize: 20,
    fontFamily: colors.fontPrimary,
    fontWeight: "700" as const,
    color: colors.green,
    lineHeight: 22,
  },
  stepperValue: {
    fontSize: 18,
    fontFamily: colors.fontPrimary,
    fontWeight: "700" as const,
    color: colors.green,
    minWidth: 40,
    textAlign: "center" as const,
  },
  drinkSectionLabel: {
    fontSize: 14,
    fontFamily: colors.fontPrimary,
    fontWeight: "700" as const,
    color: colors.green,
    marginBottom: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: colors.cardBg,
    borderWidth: 1.5,
    borderColor: colors.cardBorder,
  },
  chipSelected: {
    backgroundColor: colors.green,
    borderColor: colors.green,
  },
  chipText: {
    fontSize: 14,
    fontFamily: colors.fontSecondary,
    fontWeight: "500" as const,
    color: colors.navy,
  },
  chipTextSelected: {
    color: colors.white,
  },
  tipText: {
    color: colors.cream,
    fontFamily: colors.fontPrimary,
    fontSize: 16,
    fontWeight: "500" as const,
    marginLeft: 8,
    flex: 1,
  },
  classifyingText: {
    marginTop: 14,
    fontFamily: colors.fontPrimary,
    color: colors.cream,
    fontSize: 17,
    fontWeight: "600" as const
  },
  textSpinnerRing: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 4,
    borderColor: colors.green + "40",
    alignItems: "center" as const,
    justifyContent: "center" as const,
    marginBottom: 16,
  },
  textLoadingTitle: { fontSize: 16, color: colors.textPrimary, fontFamily: colors.fontPrimary, fontWeight: "700" as const },
  textErrorTitle: { fontSize: 18, color: colors.coral, fontFamily: colors.fontPrimary, fontWeight: "700" as const, marginBottom: 8 },
  textErrorBody: { fontSize: 14, color: colors.textSecondary, fontFamily: colors.fontSecondary, textAlign: "center" as const, marginBottom: 16 },
});

export default function MealCaptureScreen() {
  const navigation = useNavigation<AppNavigation>();
  const route = useRoute<RouteProp<RootStackParamList, "MealCapture">>();
  const { t, language } = useLanguage();
  const { colors } = useTheme();
  const [permission] = useCameraPermissions();
  const mealType = route.params?.mealType;
  const recordedDateISO = route.params?.recordedDateISO;

  const trackRef = React.useRef<View | null>(null);
  const [trackWidth, setTrackWidth] = React.useState(0);

  const [pendingImageUri, setPendingImageUri] = React.useState<string | null>(
    null,
  );
  const [portion, setPortion] = React.useState<number>(1); // 0.1–1.0
  const [showPortionModal, setShowPortionModal] = React.useState(false);
  const [peopleCount, setPeopleCount] = React.useState<number>(1);
  const [isPackaged, setIsPackaged] = React.useState(false);
  const [servingsCount, setServingsCount] = React.useState<number>(1);
  const [showTextModal, setShowTextModal] = React.useState(false);
  const [textPrompt, setTextPrompt] = React.useState("");
  const [textPhase, setTextPhaseState] = React.useState<"input" | "loading" | "drink" | "error">("input");
  const textPhaseRef = React.useRef<"input" | "loading" | "drink" | "error">("input");

  const setTextPhase = (phase: "input" | "loading" | "drink" | "error") => {
    textPhaseRef.current = phase;
    setTextPhaseState(phase);
  };
  const [textError, setTextError] = React.useState("");
  const [pendingTextBreakdown, setPendingTextBreakdown] = React.useState<{
    query: string;
    cachedBreakdown: any;
    confirmedSubstance: "alcohol" | "drugs" | null;
  } | null>(null);
  const [foodHint, setFoodHint] = React.useState("");
  const [foodType, setFoodType] = React.useState<"drink" | "dish" | "packaged" | null>(null);
  const [isDraggingSlider, setIsDraggingSlider] = React.useState(false);
  const [drinkSugarLevel, setDrinkSugarLevel] = React.useState<number | null>(100);
  const [drinkBaseType, setDrinkBaseType] = React.useState<"creamer" | "fresh_milk" | "pure_tea" | "fruit" | null>(null);
  const [isClassifying, setIsClassifying] = React.useState(false);
  const [confirmedSubstance, setConfirmedSubstance] = React.useState<"alcohol" | "drugs" | null>(null);
  const textAbortControllerRef = React.useRef<AbortController | null>(null);
  const photoAbortControllerRef = React.useRef<AbortController | null>(null);

  React.useEffect(() => {
    return () => {
      textAbortControllerRef.current?.abort();
      photoAbortControllerRef.current?.abort();
    };
  }, []);

  // Load last used portion for this meal type
  React.useEffect(() => {
    (async () => {
      try {
        if (!mealType) {
          setPortion(1);
          return;
        }
        const saved = await AsyncStorage.getItem(`portion:last:${mealType}`);
        if (saved) {
          const v = Number(saved);
          if (isFinite(v) && v >= 0.1 && v <= 1) setPortion(v);
          else setPortion(1);
        } else {
          setPortion(1);
        }
      } catch {
        setPortion(1);
      }
    })();
  }, [mealType]);

  const { consumeScan, canScan, refresh, isAdminBypass } = useDailyLimit();

  // Refresh scan count when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const handleBeforeCapture = async () => {
    if (!canScan) {
      Alert.alert(
        t('dashboard.scanLimitAlertTitle'),
        t('dashboard.scanLimitAlertBody', { limit: DAILY_SCAN_LIMIT }),
        [{ text: t('dashboard.scanLimitAlertBtn') }],
      );
      return false;
    }
    return true;
  };

  const resetCaptureForm = React.useCallback(() => {
    setFoodHint("");
    setIsPackaged(false);
    setServingsCount(1);
    setFoodType(null);
    setDrinkSugarLevel(100);
    setDrinkBaseType(null);
    setConfirmedSubstance(null);
    setPeopleCount(1);
    // Note: do NOT reset portion here; it is persisted per mealType via AsyncStorage.
  }, []);

  // Reset all transient capture state whenever no capture modal is open and
  // we aren't classifying. This covers cancel, backdrop/back-button, and
  // completed flows in one place.
  React.useEffect(() => {
    if (!showPortionModal && !showTextModal && !isClassifying) {
      resetCaptureForm();
      setPendingImageUri(null);
      setTextPrompt("");
      setTextPhase("input");
      setTextError("");
      setPendingTextBreakdown(null);
    }
  }, [showPortionModal, showTextModal, isClassifying, resetCaptureForm]);

  // Reset everything when the user leaves this screen (system back, swipe,
  // or navigating away), so the next visit starts clean.
  React.useEffect(() => {
    const unsubscribe = navigation.addListener("blur", () => {
      resetCaptureForm();
      setPendingImageUri(null);
      setTextPrompt("");
      setTextPhase("input");
      setTextError("");
      setPendingTextBreakdown(null);
    });
    return unsubscribe;
  }, [navigation, resetCaptureForm]);

  const handleConfirmPortion = async () => {
    if (!pendingImageUri) return;
    const allowed = await consumeScan();
    if (!allowed) {
      // Should already be caught by onBeforeCapture, but extra safety
      Alert.alert(
        t('dashboard.scanLimitAlertTitle'),
        t('dashboard.scanLimitAlertBody', { limit: DAILY_SCAN_LIMIT }),
        [{ text: t('dashboard.scanLimitAlertBtn') }],
      );
      return;
    }
    const chosen = Math.max(0.1, Math.min(1, Number(portion) || 1));
    // persist last portion per meal type
    try {
      if (mealType)
        await AsyncStorage.setItem(`portion:last:${mealType}`, String(chosen));
    } catch {}
    setShowPortionModal(false);
    const effectiveFoodType = isPackaged ? "packaged" : foodType || undefined;
    const effectiveServings = isPackaged ? servingsCount : undefined;
    const hintText = foodHint.trim() || undefined;

    // Go directly to AnalysisLoading — single_pass mode handles all food types
    navigation.navigate("AnalysisLoading", {
      imageUri: pendingImageUri,
      mealType,
      portion: chosen,
      recordedDateISO,
      servings: effectiveServings,
      query: hintText,
      sugarLevel: foodType === "drink" ? drinkSugarLevel : undefined,
      drinkType: foodType === "drink" ? drinkBaseType : undefined,
      foodType: effectiveFoodType,
      confirmedSubstance,
    });
  };

  const handleCancelPortion = () => {
    setShowPortionModal(false);
  };

  const handleOpenTextModal = () => {
    setTextPrompt("");
    setTextPhase("input");
    setTextError("");
    setPendingTextBreakdown(null);
    resetCaptureForm();
    setShowTextModal(true);
  };

  const handleCloseTextModal = () => {
    if (textPhaseRef.current === "loading") return;

    // Safety check with state updater to prevent race conditions
    setShowTextModal(prev => {
      if (textPhaseRef.current === "loading") return prev;
      return false;
    });
  };

  const handleContinueTextDrink = () => {
    if (!pendingTextBreakdown) return;

    const { query, cachedBreakdown, confirmedSubstance: textConfirmedSubstance } = pendingTextBreakdown;
    const itemsDetailed = drinkSugarLevel === 0
      ? (cachedBreakdown.items_detailed || []).filter(
          (item: { name?: string }) => !isAddedSugarIngredient(item.name || ""),
        )
      : cachedBreakdown.items_detailed;
    const items = drinkSugarLevel === 0
      ? (cachedBreakdown.items || []).filter(
          (item: string) => !isAddedSugarIngredient(item),
        )
      : cachedBreakdown.items;

    setShowTextModal(false);
    navigation.navigate("BreakdownConfirm", {
      imageUri: "",
      mealType,
      recordedDateISO,
      query,
      cachedBreakdown: { ...cachedBreakdown, items, items_detailed: itemsDetailed },
      foodType: "drink",
      sugarLevel: drinkSugarLevel,
      drinkType: drinkBaseType as DrinkType | null,
      hasEditedIngredients: false,
      isTextAnalysis: true,
      confirmedSubstance: textConfirmedSubstance,
    });
  };

  const handleTextNotADrink = () => {
    if (!pendingTextBreakdown) return;
    const { query, cachedBreakdown, confirmedSubstance: textConfirmedSubstance } = pendingTextBreakdown;
    setShowTextModal(false);
    navigation.navigate("BreakdownConfirm", {
      imageUri: "",
      mealType,
      recordedDateISO,
      query,
      cachedBreakdown,
      foodType: "dish",
      sugarLevel: null,
      drinkType: null,
      hasEditedIngredients: false,
      isTextAnalysis: true,
      confirmedSubstance: textConfirmedSubstance,
    });
  };

  const confirmSuspectedSubstance = (
    substance: "alcohol" | "drugs",
  ): Promise<"alcohol" | "drugs" | null> =>
    new Promise((resolve) => {
      let settled = false;
      const finish = (value: "alcohol" | "drugs" | null) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };
      Alert.alert(
        t(`mealCapture.${substance}ConfirmationTitle`),
        t(`mealCapture.${substance}ConfirmationBody`),
        [
          { text: t("mealCapture.substanceNo"), style: "cancel", onPress: () => finish(null) },
          { text: t("mealCapture.substanceYes"), onPress: () => finish(substance) },
        ],
        { cancelable: true, onDismiss: () => finish(null) },
      );
    });

  const handleConfirmText = async () => {
    const q = textPrompt.trim();
    if (!q) return;

    // Cancel any previous text request before starting a new one.
    textAbortControllerRef.current?.abort();

    const controller = new AbortController();
    textAbortControllerRef.current = controller;

    setTextPhase("loading");
    setTextError("");

    try {
      const { data } = await supabase.auth.getSession();
      if (controller.signal.aborted) return;

      const accessToken = data?.session?.access_token;

      const classification = await classifyTextInput(accessToken, q);
      if (controller.signal.aborted) return;
      const suspectedSubstance = classification.suspected_substance;
      const shouldConfirm =
        (suspectedSubstance === "alcohol" || suspectedSubstance === "drugs") &&
        (classification.substance_confidence === "medium" ||
          classification.substance_confidence === "high");
      const textConfirmation = shouldConfirm
        ? await confirmSuspectedSubstance(suspectedSubstance)
        : null;

      const res = await textRebreakdown(accessToken, {
        dish_name: q,
        components: [],
        is_drink: classification.food_type === "drink",
        confirmed_substance: textConfirmation || undefined,
        excluded_substance: shouldConfirm && !textConfirmation ? suspectedSubstance : undefined,
        language,
        adminBypass: isAdminBypass,
        signal: controller.signal,
      });

      if (controller.signal.aborted) return;

      const itemsDetailed = (res.items_detailed || []).filter(
        (it) => (it.name || "").trim().length > 0,
      );
      const cachedBreakdown = {
        dish_name: res.dish_name || q,
        food_breakdown: res.food_breakdown || "",
        items: res.items || itemsDetailed.map((it) => it.name),
        items_detailed: itemsDetailed,
        is_drink: res.is_drink ?? false,
        portion_confidence: res.portion_confidence || "medium",
        originalFoodItems: [],
        originalAnalysis: {},
      };

      if (cachedBreakdown.is_drink) {
        setPendingTextBreakdown({
          query: q,
          cachedBreakdown,
          confirmedSubstance: textConfirmation,
        });
        setTextPhase("drink");
        return;
      }

      setShowTextModal(false);
      navigation.navigate("BreakdownConfirm", {
        imageUri: "",
        mealType,
        recordedDateISO,
        query: q,
        foodType: classification.food_type,
        cachedBreakdown,
        confirmedSubstance: textConfirmation,
        hasEditedIngredients: false,
        isTextAnalysis: true,
      });
    } catch (e: any) {
      if (controller.signal.aborted) return;
      setTextPhase("error");
      setTextError(e?.message || t("common.error"));
    }
  };

  const handlePhotoCaptured = async (imageUri: string) => {
    // Cancel any previous classification before starting a new one.
    photoAbortControllerRef.current?.abort();

    const controller = new AbortController();
    photoAbortControllerRef.current = controller;

    setPendingImageUri(imageUri);
    setIsClassifying(true);
    resetCaptureForm();
    let confirmation: "alcohol" | "drugs" | null = null;

    // Run lightweight classification BEFORE showing modal so UI is ready
    try {
      // Resize to 512px for classify (no need to send full-res for a 3-word answer).
      // If resizing fails, skip classification entirely rather than base64-encoding
      // the full-resolution photo (can OOM on low-memory devices).
      let classifyUri: string;
      try {
        const resized = await ImageManipulator.manipulateAsync(
          imageUri,
          [{ resize: { width: 512 } }],
          { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG },
        );
        classifyUri = resized.uri || imageUri;
      } catch (resizeError) {
        if (controller.signal.aborted) return;
        if (__DEV__)
          console.warn(
            "[MealCapture] Resize failed, skipping classification:",
            resizeError,
          );
        setIsClassifying(false);
        setShowPortionModal(true);
        return;
      }

      if (controller.signal.aborted) return;

      const base64 = await FileSystem.readAsStringAsync(classifyUri, {
        encoding: "base64",
      });

      if (controller.signal.aborted) return;

      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;

      const { data, error } = await supabase.functions.invoke("openai/classify", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: { image_base64: base64, mimetype: "image/jpeg" },
        signal: controller.signal,
      });

      if (controller.signal.aborted) return;

      if (!error && data?.food_type) {
        setFoodType(data.food_type);
        if (data.food_type === "packaged") setIsPackaged(true);
        const substance = data.suspected_substance;
        const confidence = data.substance_confidence;
        if (
          (substance === "alcohol" || substance === "drugs") &&
          (confidence === "medium" || confidence === "high")
        ) {
          confirmation = await confirmSuspectedSubstance(substance);
        }
      }
    } catch (e) {
      if (controller.signal.aborted) return;
      if (__DEV__)
        console.warn("[MealCapture] Classification failed, continuing without:", e);
    }

    if (controller.signal.aborted) return;

    setConfirmedSubstance(confirmation);
    setIsClassifying(false);
    // Show modal after classification completes
    setShowPortionModal(true);
  };

  // ── Portion slider ──
  const portionTrackPageX = React.useRef(0);

  const updatePortionFromX = (x: number) => {
    if (trackWidth <= 0) return;
    const clamped = Math.max(0, Math.min(trackWidth, x));
    const p = 0.1 + (clamped / trackWidth) * 0.9;
    setPortion(Number(p.toFixed(2)));
    setPeopleCount(1); // manual portion override resets the people shortcut
  };

  const panResponder = React.useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (evt: GestureResponderEvent) => {
          setIsDraggingSlider(true);
          portionTrackPageX.current = evt.nativeEvent.pageX - evt.nativeEvent.locationX;
          updatePortionFromX(evt.nativeEvent.locationX);
        },
        onPanResponderMove: (
          evt: GestureResponderEvent,
          _gesture: PanResponderGestureState,
        ) => {
          const relX = evt.nativeEvent.pageX - portionTrackPageX.current;
          updatePortionFromX(relX);
        },
        onPanResponderRelease: () => {
          setIsDraggingSlider(false);
        },
        onPanResponderTerminate: () => {
          setIsDraggingSlider(false);
        },
      }),
    [trackWidth],
  );

  // ── People slider ──
  const peopleTrackRef = React.useRef<View | null>(null);
  const [peopleTrackWidth, setPeopleTrackWidth] = React.useState(0);
  const peopleTrackPageX = React.useRef(0);
  const MIN_PEOPLE = 1;
  const MAX_PEOPLE = 10;

  const updatePeopleFromX = (x: number) => {
    if (peopleTrackWidth <= 0) return;
    const clamped = Math.max(0, Math.min(peopleTrackWidth, x));
    const raw = MIN_PEOPLE + (clamped / peopleTrackWidth) * (MAX_PEOPLE - MIN_PEOPLE);
    const snapped = Math.round(raw);
    setPeopleCount(Math.max(MIN_PEOPLE, Math.min(MAX_PEOPLE, snapped)));
    if (snapped > 1) {
      setPortion(Math.max(0.1, Math.min(1, Number((1 / snapped).toFixed(2)))));
    } else {
      setPortion(1);
    }
  };

  const peoplePanResponder = React.useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (evt: GestureResponderEvent) => {
          setIsDraggingSlider(true);
          peopleTrackPageX.current = evt.nativeEvent.pageX - evt.nativeEvent.locationX;
          updatePeopleFromX(evt.nativeEvent.locationX);
        },
        onPanResponderMove: (
          evt: GestureResponderEvent,
          _gesture: PanResponderGestureState,
        ) => {
          const relX = evt.nativeEvent.pageX - peopleTrackPageX.current;
          updatePeopleFromX(relX);
        },
        onPanResponderRelease: () => {
          setIsDraggingSlider(false);
        },
        onPanResponderTerminate: () => {
          setIsDraggingSlider(false);
        },
      }),
    [peopleTrackWidth],
  );

  const percent = Math.round(portion * 100);
  const fillWidth = trackWidth * ((portion - 0.1) / 0.9);
  const thumbLeft = Math.max(0, Math.min(trackWidth - 28, fillWidth));

  const peopleFrac = (peopleCount - MIN_PEOPLE) / (MAX_PEOPLE - MIN_PEOPLE);
  const peopleFillWidth = peopleTrackWidth * peopleFrac;
  const peopleThumbLeft = Math.max(0, Math.min(peopleTrackWidth - 28, peopleFillWidth));

  const dynamicStyles = React.useMemo(
    () => ({ ...staticStyles, ...getDynamicStyles(colors) }),
    [colors],
  );

  return (
    <SafeAreaView style={dynamicStyles.safeArea} edges={["top"]}>
    <View style={dynamicStyles.container}>
      {(isClassifying || showPortionModal) && pendingImageUri ? (
        <Image
          source={{ uri: pendingImageUri }}
          style={dynamicStyles.capturedBg}
          resizeMode="contain"
        />
      ) : (
        <>
          <CameraComponent
            onPhotoTaken={handlePhotoCaptured}
            onBack={() => (navigation as any).goBack()}
            onTextInstead={handleOpenTextModal}
            onBeforeCapture={handleBeforeCapture}
          />
          {!showPortionModal && !showTextModal && permission?.granted && (
            <View style={dynamicStyles.tipContainer} pointerEvents="none">
              <Info size={18} color={colors.white} />
              <Text style={dynamicStyles.tipText}>
                {t('mealCapture.tip')}
              </Text>
            </View>
          )}
        </>
      )}

      {isClassifying && (
        <View style={dynamicStyles.classifyingOverlay}>
          <ActivityIndicator size="large" color={colors.white} />
          <Text style={dynamicStyles.classifyingText}>{t('mealCapture.classifying')}</Text>
        </View>
      )}

      {/* Text upload will be triggered from Dashboard (Upload selection) */}

      <Modal
        transparent
        visible={showPortionModal}
        animationType="fade"
        onRequestClose={handleCancelPortion}
      >
        <Pressable
          style={{ flex: 1 }}
          onPress={handleCancelPortion}
        >
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={0}
        >
          <ScrollView
            contentContainerStyle={dynamicStyles.modalBackdrop}
            keyboardShouldPersistTaps="handled"
            scrollEnabled={!isDraggingSlider}
          >
            <View onStartShouldSetResponder={() => true} style={{ width: "100%", alignItems: "center" }}>
            {/* ── Drink: drink info card at top ── */}
            {foodType === "drink" && !isPackaged && (
              <View style={dynamicStyles.modalCard}>
                <DrinkOptions
                  sugarLevel={drinkSugarLevel}
                  drinkType={drinkBaseType}
                  onSugarLevelChange={setDrinkSugarLevel}
                  onDrinkTypeChange={setDrinkBaseType}
                  titleStyle={dynamicStyles.modalTitle}
                  labelStyle={dynamicStyles.drinkSectionLabel}
                  chipRowStyle={dynamicStyles.chipRow}
                  chipStyle={dynamicStyles.chip}
                  selectedChipStyle={dynamicStyles.chipSelected}
                  chipTextStyle={dynamicStyles.chipText}
                  selectedChipTextStyle={dynamicStyles.chipTextSelected}
                />
              </View>
            )}

            {/* ── Packaged: packaging card at top ── */}
            {isPackaged && (
              <View style={dynamicStyles.modalCard}>
                <TouchableOpacity
                  style={dynamicStyles.toggleRow}
                  onPress={() => {
                    setFoodType("dish");
                    setIsPackaged(false);
                  }}
                  activeOpacity={0.7}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={dynamicStyles.toggleLabel}>{t('mealCapture.isPackaged')}</Text>
                    <Text style={dynamicStyles.toggleCaption}>
                      {t('mealCapture.packagedHint')}
                    </Text>
                  </View>
                  <View style={[dynamicStyles.toggleTrack, isPackaged && dynamicStyles.toggleTrackOn]}>
                    <View style={[dynamicStyles.toggleKnob, isPackaged && dynamicStyles.toggleKnobOn]} />
                  </View>
                </TouchableOpacity>
                {isPackaged && (
                  <View style={dynamicStyles.stepperRow}>
                    <Text style={dynamicStyles.stepperLabel}>{t('mealCapture.servingsEaten')}</Text>
                    <View style={dynamicStyles.stepperControls}>
                      <TouchableOpacity
                        style={dynamicStyles.stepperBtn}
                        onPress={() => setServingsCount((c) => Math.max(0.5, c - 0.5))}
                      >
                        <Text style={dynamicStyles.stepperBtnText}>−</Text>
                      </TouchableOpacity>
                      <Text style={dynamicStyles.stepperValue}>{servingsCount}</Text>
                      <TouchableOpacity
                        style={dynamicStyles.stepperBtn}
                        onPress={() => setServingsCount((c) => Math.min(10, c + 0.5))}
                      >
                        <Text style={dynamicStyles.stepperBtnText}>+</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </View>
            )}

            {/* ── Card 1: Portion & People (hidden for packaged, people slider hidden for drinks) ── */}
            {!isPackaged && (
              <View style={[dynamicStyles.modalCard, { marginTop: 12 }]}>
                <Text style={dynamicStyles.modalTitle}>{t('mealCapture.selectPortion')}</Text>

                {/* Portion slider */}
                <View style={dynamicStyles.sliderLabelRow}>
                  <Text style={dynamicStyles.sliderLabel}>{t('mealCapture.portionRatio')}</Text>
                  <Text style={dynamicStyles.sliderValue}>{percent}%</Text>
                </View>
                <View style={dynamicStyles.sliderHitArea} {...panResponder.panHandlers}>
                  <View
                    style={dynamicStyles.sliderTrack}
                    ref={(r) => { trackRef.current = r; }}
                    onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
                  >
                    <View style={[dynamicStyles.sliderFill, { width: Math.max(0, fillWidth) }]} />
                  </View>
                  <View
                    style={[dynamicStyles.sliderThumb, { left: thumbLeft, top: 10 }]}
                    pointerEvents="none"
                  />
                </View>

                {/* People slider (hidden for drinks) */}
                {foodType !== "drink" && (
                  <>
                    <View style={dynamicStyles.divider} />
                    <Text style={dynamicStyles.modalTitle}>{t('mealCapture.sharingTitle')}</Text>
                    <View style={dynamicStyles.sliderLabelRow}>
                      <Text style={dynamicStyles.sliderLabel}>{t('mealCapture.noSharing')}</Text>
                      <Text style={dynamicStyles.sliderValue}>
                        {peopleCount === 1 ? t('mealCapture.multiPersonSharing') : t('mealCapture.sharingPeople', { count: peopleCount, percent: Math.max(10, Math.round(100 / peopleCount)) })}
                      </Text>
                    </View>
                    <View style={dynamicStyles.sliderHitArea} {...peoplePanResponder.panHandlers}>
                      <View
                        style={dynamicStyles.sliderTrack}
                        ref={(r) => { peopleTrackRef.current = r; }}
                        onLayout={(e) => setPeopleTrackWidth(e.nativeEvent.layout.width)}
                      >
                        <View style={[dynamicStyles.sliderFill, { width: Math.max(0, peopleFillWidth) }]} />
                      </View>
                      <View
                        style={[dynamicStyles.sliderThumb, { left: peopleThumbLeft, top: 10 }]}
                        pointerEvents="none"
                      />
                    </View>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 2 }}>
                      <Text style={dynamicStyles.sliderTickLabel}>1</Text>
                      <Text style={dynamicStyles.sliderTickLabel}>5</Text>
                      <Text style={dynamicStyles.sliderTickLabel}>10</Text>
                    </View>
                  </>
                )}
              </View>
            )}

            {/* ── Card 2: 補充描述 (always shown) ── */}
            <View style={[dynamicStyles.modalCard, { marginTop: 12 }]}>
              <Text style={dynamicStyles.modalTitle}>{t('mealCapture.descriptionTitle')}</Text>
              <TextInput
                value={foodHint}
                onChangeText={setFoodHint}
                placeholder={t('mealCapture.descriptionPlaceholder')}
                placeholderTextColor={colors.textMuted}
                style={dynamicStyles.hintInput}
                maxLength={1000}
              />
              <Text style={dynamicStyles.hintCaption}>
                {t('mealCapture.descriptionCaption')}
              </Text>
            </View>


            {/* ── Packaging toggle (dish / unclassified) ── */}
            {!isPackaged && foodType !== "drink" && (
              <View style={[dynamicStyles.modalCard, { marginTop: 12 }]}>
                <TouchableOpacity
                  style={dynamicStyles.toggleRow}
                  onPress={() => {
                    setFoodType("packaged");
                    setIsPackaged(true);
                  }}
                  activeOpacity={0.7}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={dynamicStyles.toggleLabel}>{t('mealCapture.isPackaged')}</Text>
                    <Text style={dynamicStyles.toggleCaption}>
                      {t('mealCapture.packagedHint')}
                    </Text>
                  </View>
                  <View style={[dynamicStyles.toggleTrack, isPackaged && dynamicStyles.toggleTrackOn]}>
                    <View style={[dynamicStyles.toggleKnob, isPackaged && dynamicStyles.toggleKnobOn]} />
                  </View>
                </TouchableOpacity>
                {isPackaged && (
                  <View style={dynamicStyles.stepperRow}>
                    <Text style={dynamicStyles.stepperLabel}>{t('mealCapture.servingsEaten')}</Text>
                    <View style={dynamicStyles.stepperControls}>
                      <TouchableOpacity
                        style={dynamicStyles.stepperBtn}
                        onPress={() => setServingsCount((c) => Math.max(0.5, c - 0.5))}
                      >
                        <Text style={dynamicStyles.stepperBtnText}>−</Text>
                      </TouchableOpacity>
                      <Text style={dynamicStyles.stepperValue}>{servingsCount}</Text>
                      <TouchableOpacity
                        style={dynamicStyles.stepperBtn}
                        onPress={() => setServingsCount((c) => Math.min(10, c + 0.5))}
                      >
                        <Text style={dynamicStyles.stepperBtnText}>+</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </View>
            )}

            {/* ── Actions ── */}
            <View style={[dynamicStyles.actionsRow, { marginTop: 16, paddingHorizontal: 4 }]}>
              <TouchableOpacity
                style={[dynamicStyles.actionBtn, dynamicStyles.cancelBtn]}
                onPress={handleCancelPortion}
              >
                <Text style={dynamicStyles.cancelText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[dynamicStyles.actionBtn, dynamicStyles.confirmBtn]}
                onPress={handleConfirmPortion}
              >
                <Text style={dynamicStyles.confirmText}>{t('common.confirm')} →</Text>
              </TouchableOpacity>
            </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Pressable>
      </Modal>

      {/* Text prompt modal */}
      <Modal
        transparent
        visible={showTextModal}
        animationType="fade"
        onRequestClose={() => {
          if (textPhaseRef.current !== "loading") handleCloseTextModal();
        }}
      >
        <Pressable
          style={dynamicStyles.modalBackdrop}
          onPress={() => {
            if (textPhaseRef.current !== "loading") handleCloseTextModal();
          }}
          disabled={textPhase === "loading"}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={{ width: "100%", alignItems: "center" }}
            keyboardVerticalOffset={64}
          >
            <View
              style={dynamicStyles.modalCard}
              onStartShouldSetResponder={() => true}
            >
              {textPhase === "loading" ? (
                <View style={dynamicStyles.textLoadingWrap}>
                  <View style={dynamicStyles.textSpinnerRing}>
                    <ActivityIndicator size="large" color={colors.green} />
                    <View style={[dynamicStyles.textSpinnerMascot, { backgroundColor: colors.green }]}>
                      <AppIcon style={dynamicStyles.textSpinnerMascotImg} fallbackColor={colors.green} />
                    </View>
                  </View>
                  <Text style={dynamicStyles.textLoadingTitle}>{t("dashboard.textLoadingTitle")}</Text>
                </View>
              ) : textPhase === "drink" ? (
                <>
                  <DrinkOptions
                    sugarLevel={drinkSugarLevel}
                    drinkType={drinkBaseType}
                    onSugarLevelChange={setDrinkSugarLevel}
                    onDrinkTypeChange={setDrinkBaseType}
                    titleStyle={dynamicStyles.modalTitle}
                    labelStyle={dynamicStyles.drinkSectionLabel}
                    chipRowStyle={dynamicStyles.chipRow}
                    chipStyle={dynamicStyles.chip}
                    selectedChipStyle={dynamicStyles.chipSelected}
                    chipTextStyle={dynamicStyles.chipText}
                    selectedChipTextStyle={dynamicStyles.chipTextSelected}
                  />
                  <View style={dynamicStyles.actionsRow}>
                    <TouchableOpacity
                      style={[dynamicStyles.actionBtn, dynamicStyles.cancelBtn]}
                      onPress={handleCloseTextModal}
                    >
                      <Text style={dynamicStyles.cancelText}>{t('common.cancel')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[dynamicStyles.actionBtn, dynamicStyles.confirmBtn]}
                      onPress={handleContinueTextDrink}
                    >
                      <Text style={dynamicStyles.confirmText}>{t('common.confirm')} →</Text>
                    </TouchableOpacity>
                  </View>
                  <TouchableOpacity
                    style={dynamicStyles.textLinkBtn}
                    onPress={handleTextNotADrink}
                  >
                    <Text style={dynamicStyles.textLinkText}>Not a drink? Treat as food</Text>
                  </TouchableOpacity>
                </>
              ) : textPhase === "error" ? (
                <View style={dynamicStyles.textErrorWrap}>
                  <Text style={dynamicStyles.textErrorTitle}>{t("common.error")}</Text>
                  <Text style={dynamicStyles.textErrorBody}>{textError || t("dashboard.textErrorFallback")}</Text>
                  <View style={dynamicStyles.actionsRow}>
                    <TouchableOpacity
                      style={[dynamicStyles.actionBtn, dynamicStyles.cancelBtn]}
                      onPress={handleCloseTextModal}
                    >
                      <Text style={dynamicStyles.cancelText}>{t('common.cancel')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[dynamicStyles.actionBtn, dynamicStyles.confirmBtn]}
                      onPress={handleConfirmText}
                    >
                      <Text style={dynamicStyles.confirmText}>{t('common.retry')}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <>
                  <Text style={dynamicStyles.modalTitle}>{t('mealCapture.textUploadTitle')}</Text>
                  <Text style={dynamicStyles.modalSubtitle}>
                    {t('mealCapture.textUploadSubtitle')}
                  </Text>
                  <TextInput
                    value={textPrompt}
                    onChangeText={setTextPrompt}
                    placeholder={t('mealCapture.textUploadPlaceholder')}
                    placeholderTextColor={colors.textMuted}
                    style={dynamicStyles.hintInput}
                    multiline
                    returnKeyType="done"
                    blurOnSubmit={true}
                    maxLength={1000}
                  />
                  <View style={dynamicStyles.actionsRow}>
                    <TouchableOpacity
                      style={[dynamicStyles.actionBtn, dynamicStyles.cancelBtn]}
                      onPress={handleCloseTextModal}
                    >
                      <Text style={dynamicStyles.cancelText}>{t('common.cancel')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[dynamicStyles.actionBtn, dynamicStyles.confirmBtn]}
                      onPress={handleConfirmText}
                    >
                      <Text style={dynamicStyles.confirmText}>{t('mealCapture.startAnalysis')}</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </View>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>
    </View>
    </SafeAreaView>
  );
}
