import React from "react";
import { TouchableOpacity, Text, StyleSheet } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useTheme } from "../context/ThemeContext";

interface BackButtonProps {
  variant?: "default" | "absolute";
  onPress?: () => void;
  style?: any;
  textStyle?: any;
  darkBackground?: boolean;
}

export default function BackButton({ variant = "default", onPress, style, textStyle, darkBackground = false }: BackButtonProps) {
  const navigation = useNavigation();
  const { colors, isDark } = useTheme();

  const handlePress = () => {
    if (onPress) {
      onPress();
    } else {
      navigation.goBack();
    }
  };

  const baseStyle = variant === "absolute" ? styles.backBtnAbsolute : styles.backBtn;
  
  let arrowColor = colors.navy;
  if (darkBackground || isDark) {
    arrowColor = isDark ? colors.textPrimary : colors.textMuted;
  }

  const baseTextStyle = variant === "absolute" 
    ? { fontSize: 24, color: arrowColor, fontFamily: colors.fontPrimary }
    : { fontSize: 24, color: arrowColor };

  return (
    <TouchableOpacity
      style={[
        baseStyle, 
        variant === "absolute" && { backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)" },
        style
      ]}
      onPress={handlePress}
    >
      <Text style={[baseTextStyle, textStyle]}>‹</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  backBtn: {
    paddingRight: 12,
    paddingVertical: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  backBtnAbsolute: {
    position: "absolute",
    top: 50,
    left: 16,
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 100,
  },
});
