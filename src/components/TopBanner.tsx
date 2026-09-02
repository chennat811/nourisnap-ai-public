import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useTheme } from "../context/ThemeContext";
import BackButton from "./BackButton";

interface TopBannerProps {
  title: string;
  onBack?: () => void;
  showBack?: boolean;
  height?: number; // default 40
}

export const TOP_BANNER_HEIGHT = 32;

export default function TopBanner({
  title,
  onBack,
  showBack = true,
  height = TOP_BANNER_HEIGHT,
}: TopBannerProps) {
  const { colors } = useTheme();

  const styles = StyleSheet.create({
    topBannerSafe: { width: "100%", backgroundColor: colors.green },
    topBannerContent: {
      paddingHorizontal: 24,
      flexDirection: "row" as const,
      alignItems: "center" as const,
      justifyContent: "space-between" as const,
    },
    topBannerTitle: { 
      color: colors.white, 
      fontSize: 18, 
      fontWeight: "700" as const,
      fontFamily: colors.fontPrimary,
    },
    backBtn: {
      width: 32,
      height: 32,
      alignItems: "center" as const,
      justifyContent: "center" as const,
    },
    backIconLeft: {
      width: 12,
      height: 12,
      borderLeftWidth: 2,
      borderBottomWidth: 2,
      borderColor: colors.white,
      transform: [{ rotate: "45deg" }],
    },
  });

  return (
    <View style={styles.topBannerSafe}>
      <View style={[styles.topBannerContent, { height }]}>
        {showBack ? (
          <BackButton onPress={onBack} textStyle={{ color: colors.white }} />
        ) : (
          <View style={{ width: 32 }} />
        )}
        <Text style={styles.topBannerTitle}>{title}</Text>
        <View style={{ width: 32 }} />
      </View>
    </View>
  );
}
