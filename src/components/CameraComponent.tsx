import React, { useRef, useState, useEffect, useMemo } from "react";
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Text,
  Image,
  Animated,
  Linking,
  ScrollView,
} from "react-native";
import {
  CameraView,
  CameraType as ExpoCameraType,
  useCameraPermissions,
} from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import AntDesign from "@expo/vector-icons/AntDesign";
import { useTheme } from "../context/ThemeContext";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLanguage } from "../context/LanguageContext";

const MASCOT = require("../../assets/mascot.png");

interface CameraComponentProps {
  onPhotoTaken: (imageUri: string) => Promise<void>;
  onBack?: () => void;
  onTextInstead?: () => void;
  onBeforeCapture?: () => Promise<boolean>;
}

type CameraType = "back" | "front";

const CameraTypeEnum = {
  Back: "back" as CameraType,
  Front: "front" as CameraType,
};

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.bg,
    },
    camera: {
      flex: 1,
    },
    buttonContainer: {
      position: "absolute",
      bottom: 20,
      left: 20,
      right: 20,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    galleryButton: { padding: 10 },
    shutterButton: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: colors.white,
      opacity: 0.5,
      justifyContent: "center",
      alignItems: "center",
    },
    cameraButton: { padding: 10 },
    // ── Permission Request Screen ──
    permBg: {
      position: "absolute",
      inset: 0,
      top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: colors.bg,
    },
    camFade: {
      position: "absolute",
      bottom: 0, left: 0, right: 0,
      height: 420,
      backgroundColor: colors.bg,
      opacity: 0.85,
    },
    permScroll: {
      flex: 1,
    },
    permContent: {
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 22,
      paddingBottom: 32,
      flexGrow: 1,
      minHeight: "100%" as const,
    },
    mascotWrap: {
      marginTop: 8,
      marginBottom: 12,
      width: 110,
      height: 110,
      alignItems: "center",
      justifyContent: "center",
    },
    orbitRing: {
      position: "absolute",
      width: 126,
      height: 126,
      borderRadius: 63,
      borderWidth: 1.5,
      borderColor: "rgba(61,122,90,0.25)",
      borderStyle: "dashed",
    },
    camHalo: {
      position: "absolute",
      width: 90,
      height: 90,
      borderRadius: 45,
      backgroundColor: colors.track,
    },
    mascotImg: {
      width: 78,
      height: 78,
      borderRadius: 20,
    },
    permHeadline: {
      fontFamily: colors.fontPrimary,
      fontSize: 30,
      color: colors.navy,
      textAlign: "center",
      lineHeight: 40,
      marginBottom: 8,
    },
    permSub: {
      fontFamily: colors.fontSecondary,
      fontSize: 18,
      fontWeight: "700" as const,
      color: colors.textMuted,
      textAlign: "center",
      lineHeight: 22,
      marginBottom: 20,
    },
    privacyRow: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      marginBottom: 20,
      gap: 8,
    },
    privacyText: {
      flex: 1,
      fontFamily: colors.fontSecondary,
      fontSize: 18,
      fontWeight: "700" as const,
      textAlign: "center",
      color: colors.textMuted,
      lineHeight: 22,
    },
    allowBtn: {
      width: "100%" as const,
      paddingVertical: 14,
      borderRadius: 16,
      backgroundColor: colors.green,
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "row" as const,
      gap: 8,
      marginBottom: 10,
      shadowColor: colors.green,
      shadowOffset: { width: 0, height: 5 },
      shadowOpacity: 1,
      shadowRadius: 0,
      elevation: 5,
    },
    allowBtnText: {
      fontFamily: colors.fontPrimary,
      fontSize: 16,
      color: colors.white,
      letterSpacing: 0.3,
    },
    laterBtn: {
      width: "100%" as const,
      paddingVertical: 11,
      borderRadius: 14,
      borderWidth: 1.5,
      borderColor: colors.cardBorder,
      alignItems: "center",
      justifyContent: "center",
    },
    laterBtnText: {
      fontFamily: colors.fontPrimary,
      fontSize: 14,
      color: colors.textMuted,
    },
    // ── Denied Screen ──
    backBtn: {
      position: "absolute" as const,
      top: 16,
      left: 16,
      width: 30,
      height: 30,
      borderRadius: 9,
      backgroundColor: colors.cardBg,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: colors.cardBorder,
      zIndex: 10,
    },
    backBtnText: { fontSize: 13, color: colors.textSecondary },
    deniedBody: {
      flexGrow: 1,
      alignItems: "center",
      justifyContent: "center",
      padding: 20,
      gap: 14,
    },
    sadMascotWrap: {
      width: 88,
      height: 88,
      marginTop: 8,
    },
    sadMascotImg: {
      width: 80,
      height: 80,
      borderRadius: 20,
      opacity: 0.8,
    },
    deniedHeadline: {
      fontFamily: colors.fontPrimary,
      fontSize: 20,
      color: colors.coral,
      textAlign: "center",
      lineHeight: 24,
    },
    deniedSub: {
      fontFamily: colors.coral,
      fontSize: 14,
      fontWeight: "700" as const,
      color: colors.textMuted,
      textAlign: "center",
      lineHeight: 18,
    },
    stepsCard: {
      width: "100%" as const,
      backgroundColor: colors.cardBg,
      borderWidth: 2,
      borderColor: colors.cardBorder,
      borderRadius: 18,
      padding: 14,
    },
    stepsTitle: {
      fontFamily: colors.fontPrimary,
      fontSize: 18,
      letterSpacing: 0.3,
      color: colors.green,
      marginBottom: 10,
    },
    stepRow: {
      flexDirection: "row" as const,
      alignItems: "flex-start" as const,
      gap: 10,
      marginBottom: 10,
    },
    stepNum: {
      width: 20,
      height: 20,
      borderRadius: 7,
      backgroundColor: colors.cardBg,
      borderWidth: 1.5,
      borderColor: colors.cardBorder,
      alignItems: "center",
      justifyContent: "center",
    },
    stepNumText: {
      fontFamily: colors.fontPrimary,
      fontSize: 16,
      color: colors.green,
    },
    stepText: {
      flex: 1,
      fontFamily: colors.fontSecondary,
      fontSize: 16,
      fontWeight: "700" as const,
      color: colors.navy,
      lineHeight: 22,
    },
    openSettingsBtn: {
      width: "100%" as const,
      paddingVertical: 14,
      borderRadius: 16,
      backgroundColor: colors.headerBg,
      alignItems: "center",
      justifyContent: "center",
      shadowColor: colors.headerBg,
      shadowOffset: { width: 0, height: 5 },
      shadowOpacity: 1,
      shadowRadius: 0,
      elevation: 5,
    },
    openSettingsBtnText: {
      fontFamily: colors.fontPrimary,
      fontSize: 20,
      color: colors.green,
      letterSpacing: 0.3,
    },
    textInsteadBtn: {
      width: "100%" as const,
      paddingVertical: 10,
      borderRadius: 13,
      borderWidth: 1.5,
      backgroundColor: colors.cardBg,
      borderColor: colors.cardBorder,
      alignItems: "center",
      justifyContent: "center",
    },
    textInsteadBtnText: {
      fontFamily: colors.fontPrimary,
      fontSize: 16,
      color: colors.textMuted,
    },
    topControls: {
      position: "absolute" as const,
      left: 0,
      right: 0,
      flexDirection: "row" as const,
      alignItems: "center" as const,
      justifyContent: "space-between" as const,
      paddingHorizontal: 12,
      zIndex: 30,
    },
    topBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.cardBg,
      borderWidth: 1,
      borderColor: colors.cardBorder,
      alignItems: "center" as const,
      justifyContent: "center" as const,
    },
    topBtnText: {
      fontSize: 13,
      color: colors.textSecondary,
    },
  });

export default function CameraComponent({
  onPhotoTaken,
  onBack,
  onTextInstead,
  onBeforeCapture,
}: CameraComponentProps) {
  const { colors: C, isDark, mealIcons } = useTheme();
  const colors = C;
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [cameraType, setCameraType] = useState<CameraType>(CameraTypeEnum.Back);
  const [permission, requestPermission] = useCameraPermissions();
  const [error, setError] = useState<string | null>(null);
  const cameraRef = useRef<CameraView>(null);

  const floatAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, { toValue: -6, duration: 1500, useNativeDriver: true }),
        Animated.timing(floatAnim, { toValue: 0, duration: 1500, useNativeDriver: true }),
      ])
    );
    animation.start();

    return () => {
      animation.stop();
    };
  }, []);

  useEffect(() => {
    if (permission?.granted) {
      setError(null);
    }
  }, [permission]);

  const toggleFacing = () => {
    setCameraType((current) =>
      current === CameraTypeEnum.Back ? CameraTypeEnum.Front : CameraTypeEnum.Back
    );
  };

  const takePicture = async () => {
    if (!permission?.granted) {
      setError("Camera permission not granted");
      return;
    }
    if (!cameraRef.current) {
      setError("Camera not initialized");
      return;
    }

    if (onBeforeCapture) {
      const allowed = await onBeforeCapture();
      if (!allowed) return;
    }

    try {
      const photo = await cameraRef.current.takePictureAsync();
      await onPhotoTaken(photo.uri);
    } catch (err) {
      setError(`Error taking picture: ${err}`);
      if (__DEV__) console.error("Error taking picture:", err);
    }
  };

  const selectFromGallery = async () => {
    if (onBeforeCapture) {
      const allowed = await onBeforeCapture();
      if (!allowed) return;
    }

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [4, 3],
        quality: 1,
      });
      if (!result.canceled) {
        await onPhotoTaken(result.assets[0].uri);
      }
    } catch (err) {
      setError(`Error selecting from gallery: ${err}`);
      if (__DEV__) console.error("Error selecting from gallery:", err);
    }
  };

  // Show denied screen if permission was explicitly denied
  if (permission && !permission.granted && !permission.canAskAgain) {
    return (
      <View style={[styles.container, { backgroundColor: colors.bg }]}>
        {onBack && (
          <TouchableOpacity style={[styles.backBtn, { top: (insets.top || 0) + 16 }]} onPress={onBack}>
            <Text style={styles.backBtnText}>←</Text>
          </TouchableOpacity>
        )}

        <ScrollView contentContainerStyle={styles.deniedBody} showsVerticalScrollIndicator={false}>
          <View style={styles.sadMascotWrap}>
            <Image source={MASCOT} style={styles.sadMascotImg} resizeMode="cover" />
          </View>

          <Text style={styles.deniedHeadline}>
            {t("camera.deniedHeadline")}
          </Text>
          <Text style={styles.deniedSub}>
            {t("camera.deniedSub")}
          </Text>

          <View style={styles.stepsCard}>
            <Text style={styles.stepsTitle}>
              {t("camera.stepsTitle")}
            </Text>
            {[
              t("camera.step1"),
              t("camera.step2"),
              t("camera.step3"),
            ].map((step, i) => (
              <View key={i} style={[styles.stepRow, i === 2 && { marginBottom: 0 }]}>
                <View style={styles.stepNum}>
                  <Text style={styles.stepNumText}>{i + 1}</Text>
                </View>
                <Text style={styles.stepText}>{step}</Text>
              </View>
            ))}
          </View>

          <TouchableOpacity style={styles.openSettingsBtn} onPress={() => Linking.openSettings()} activeOpacity={0.85}>
            <Text style={styles.openSettingsBtnText}>
              {t("camera.openSettings", { defaultValue: "Open Settings" })}
            </Text>
          </TouchableOpacity>

          {onTextInstead && (
            <TouchableOpacity 
              style={styles.textInsteadBtn} 
              onPress={async () => {
                if (onBeforeCapture) {
                  const allowed = await onBeforeCapture();
                  if (!allowed) return;
                }
                onTextInstead();
              }} 
              activeOpacity={0.7}
            >
              <Text style={styles.textInsteadBtnText}>
                {t("camera.useText", { defaultValue: "Continue with Text Instead" })}
              </Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </View>
    );
  }

  // Show permission request screen if not asked yet or can ask again
  if (!permission || (permission && !permission.granted)) {
    const canAskAgain = !permission || permission.canAskAgain;
    return (
      <View style={[styles.container, { position: "relative" as const }]}>
        {/* Camera-like dark background */}
        <View style={styles.permBg} />
        {/* Bottom gradient fade */}
        <View style={styles.camFade} />

        {/* Top controls: back only (safe-area aware) */}
        <View style={[styles.topControls, { top: (insets.top || 0) + 8 }]}>
          <View style={{ width: 36 }}>
            {onBack && (
              <TouchableOpacity style={styles.topBtn} onPress={onBack}>
                <Text style={styles.topBtnText}>←</Text>
              </TouchableOpacity>
            )}
          </View>
          <View style={{ width: 36 }} />
        </View>

        <ScrollView
          style={styles.permScroll}
          contentContainerStyle={styles.permContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Mascot */}
          <View style={styles.mascotWrap}>
            <View style={styles.orbitRing} />
            <View style={styles.camHalo} />
            <Animated.Image
              source={MASCOT}
              style={[styles.mascotImg, { transform: [{ translateY: floatAnim }] }]}
              resizeMode="cover"
            />
          </View>

          <Text style={styles.permHeadline}>
            {t("camera.requestHeadline", { defaultValue: "Let Nori See Your Meal" })}
          </Text>
          <Text style={styles.permSub}>
            {t("camera.requestSub", { defaultValue: "Enable camera access so NouriSnap can instantly analyse your nutrition" })}
          </Text>

          {/* Privacy note */}
          <View style={styles.privacyRow}>
            <Text style={styles.privacyText}>
              {t("camera.privacyNote", { defaultValue: "Photos are never stored on our servers — used only for this analysis, then deleted." })}
            </Text>
          </View>

          {/* Buttons */}
          {canAskAgain ? (
            <TouchableOpacity style={styles.allowBtn} onPress={requestPermission} activeOpacity={0.85}>
              <Text style={styles.allowBtnText}>
                📷  {t("camera.allowBtn", { defaultValue: "Allow Camera Access" })}
              </Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.allowBtn} onPress={() => Linking.openSettings()} activeOpacity={0.85}>
              <Text style={styles.allowBtnText}>
                {t("camera.openSettings", { defaultValue: "Open Settings" })}
              </Text>
            </TouchableOpacity>
          )}
          {onBack && (
            <TouchableOpacity style={styles.laterBtn} onPress={onBack} activeOpacity={0.7}>
              <Text style={styles.laterBtnText}>
                {t("camera.laterBtn", { defaultValue: "Not Now" })}
              </Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <Text style={{ textAlign: "center", color: colors.coral, marginTop: 20, paddingHorizontal: 24 }}>{error}</Text>
        <TouchableOpacity
          style={[styles.allowBtn, { marginHorizontal: 22, marginTop: 16 }]}
          onPress={() => setError(null)}
        >
          <Text style={styles.allowBtnText}>{t("common.retry", { defaultValue: "Retry" })}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView
        style={styles.camera}
        facing={cameraType as "back" | "front"}
        ref={cameraRef}
      />
      <View style={styles.buttonContainer}>
        <TouchableOpacity style={styles.galleryButton} onPress={selectFromGallery}>
          <AntDesign name="picture" size={32} color={colors.white} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.shutterButton} onPress={takePicture}>
          <AntDesign name="camera" size={32} color="black" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.cameraButton} onPress={toggleFacing}>
          <AntDesign name="retweet" size={32} color={colors.white} />
        </TouchableOpacity>
      </View>
    </View>
  );
}
