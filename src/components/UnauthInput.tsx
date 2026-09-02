import React from "react";
import {
  View,
  TextInput,
  StyleSheet,
  type TextInputProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useTheme } from "../context/ThemeContext";
import { unauthBrand } from "../styles/unauthBrand";

interface UnauthInputProps extends Omit<TextInputProps, "style"> {
  icon?: React.ReactNode;
  rightElement?: React.ReactNode;
  containerStyle?: StyleProp<ViewStyle>;
}

export default function UnauthInput({
  icon,
  rightElement,
  containerStyle,
  placeholderTextColor,
  ...textInputProps
}: UnauthInputProps) {
  const { colors: C } = useTheme();

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: C.cardBg,
          borderColor: C.cardBorder,
        },
        containerStyle,
      ]}
    >
      {icon ? <View style={styles.icon}>{icon}</View> : null}
      <TextInput
        style={[
          styles.input,
          {
            color: C.textPrimary,
            fontFamily: C.fontSecondary,
            paddingLeft: icon ? 36 : 16,
            paddingRight: rightElement ? 44 : 16,
          },
        ]}
        placeholderTextColor={placeholderTextColor ?? C.textMuted}
        {...textInputProps}
      />
      {rightElement ? <View style={styles.right}>{rightElement}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "relative",
    width: "100%",
    borderWidth: 2,
    borderRadius: unauthBrand.borderRadius.input,
    paddingVertical: 13,
    paddingHorizontal: 16,
    marginBottom: unauthBrand.spacing.inputGap,
    alignItems: "center",
    flexDirection: "row",
  },
  input: {
    flex: 1,
    fontSize: 15,
    fontWeight: "700",
    minHeight: 24,
    padding: 0,
  },
  icon: {
    position: "absolute",
    left: 16,
    top: 0,
    bottom: 0,
    justifyContent: "center",
    zIndex: 1,
  },
  right: {
    position: "absolute",
    right: 16,
    top: 0,
    bottom: 0,
    justifyContent: "center",
    zIndex: 1,
  },
});
