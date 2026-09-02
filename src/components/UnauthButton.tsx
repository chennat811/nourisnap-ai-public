import React from "react";
import {
  TouchableOpacity,
  Text,
  ActivityIndicator,
  StyleSheet,
  type TouchableOpacityProps,
} from "react-native";
import { useTheme } from "../context/ThemeContext";
import { unauthBrand } from "../styles/unauthBrand";

type ButtonVariant = "primary" | "secondary";

interface UnauthButtonProps extends Omit<TouchableOpacityProps, "children"> {
  title: string;
  variant?: ButtonVariant;
  loading?: boolean;
}

export default function UnauthButton({
  title,
  variant = "primary",
  loading = false,
  disabled,
  style,
  ...rest
}: UnauthButtonProps) {
  const { colors: C } = useTheme();
  const isPrimary = variant === "primary";

  return (
    <TouchableOpacity
      style={[
        styles.base,
        isPrimary
          ? { backgroundColor: C.green, shadowColor: C.green }
          : { backgroundColor: C.track },
        (disabled || loading) && styles.disabled,
        style,
      ]}
      disabled={disabled || loading}
      activeOpacity={0.8}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={isPrimary ? C.cream : C.navy} />
      ) : (
        <Text
          style={[
            styles.text,
            {
              color: isPrimary ? C.cream : C.navy,
              fontFamily: C.fontPrimary,
            },
          ]}
        >
          {title}
        </Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    width: "100%",
    paddingVertical: 14,
    borderRadius: unauthBrand.borderRadius.button,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 5,
  },
  disabled: {
    opacity: 0.6,
  },
  text: {
    fontSize: 16,
    letterSpacing: 0.5,
  },
});
