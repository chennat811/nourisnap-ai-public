import React from "react";
import { Image, ImageStyle, View, ViewStyle } from "react-native";

// Tiny transparent 1x1 PNG fallback used when the bundled icon is missing.
const TRANSPARENT_PIXEL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

let cachedIconSource: any = null;
let iconLoadAttempted = false;

function getIconSource(): any {
  if (iconLoadAttempted) return cachedIconSource;
  iconLoadAttempted = true;
  try {
    cachedIconSource = require("../../assets/icon.png");
  } catch {
    cachedIconSource = { uri: TRANSPARENT_PIXEL };
  }
  return cachedIconSource;
}

interface AppIconProps {
  style?: ImageStyle | ViewStyle;
  fallbackColor?: string;
}

/**
 * Renders the app icon with a safe fallback if the bundled asset is missing.
 * This prevents EAS/production crashes when the icon path or extension is wrong.
 */
export default function AppIcon({ style, fallbackColor }: AppIconProps) {
  const source = getIconSource();
  const isFallback = source?.uri === TRANSPARENT_PIXEL;

  if (isFallback) {
    return (
      <View
        style={[
          {
            backgroundColor: fallbackColor || "transparent",
            overflow: "hidden",
          },
          style as ViewStyle,
        ]}
      />
    );
  }

  return <Image source={source} style={style as ImageStyle} resizeMode="contain" />;
}
