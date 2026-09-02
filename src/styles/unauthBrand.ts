import { StyleSheet } from "react-native";

/**
 * Brand primitives shared by the unauthenticated-screen stack.
 *
 * These values intentionally mirror the tokens in ThemeContext so that
 * screens which force a light branded look (e.g. SignIn) and screens which
 * respect the active theme (e.g. ResetPassword) stay visually aligned.
 */
export const unauthBrand = {
  green: "#4A9B6F",
  cream: "#FFEBBE",
  navy: "#1B6B8F",
  coral: "#D4524A",
  lime: "#C5CA22",
  borderRadius: {
    card: 28,
    button: 16,
    input: 14,
  },
  spacing: {
    screenPadding: 24,
    cardPadding: 24,
    sectionGap: 24,
    inputGap: 12,
  },
} as const;

export type UnauthBrand = typeof unauthBrand;

/**
 * Reusable StyleSheet fragments for unauth screens.
 * Screens that consume ThemeContext should override `backgroundColor`
 * and `color` values with the active theme tokens (`C.bg`, `C.textPrimary`, etc.).
 */
export const unauthStyles = StyleSheet.create({
  card: {
    width: "100%",
    maxWidth: 380,
    borderWidth: 2,
    borderRadius: unauthBrand.borderRadius.card,
    padding: unauthBrand.spacing.cardPadding,
  },
  title: {
    fontSize: 24,
    textAlign: "center",
    marginBottom: unauthBrand.spacing.sectionGap,
  },
  inputWrap: {
    position: "relative",
    marginBottom: unauthBrand.spacing.inputGap,
  },
  input: {
    width: "100%",
    borderWidth: 2,
    borderRadius: unauthBrand.borderRadius.input,
    paddingVertical: 14,
    paddingHorizontal: 16,
    fontSize: 15,
    fontWeight: "700",
  },
  primaryButton: {
    width: "100%",
    paddingVertical: 14,
    borderRadius: unauthBrand.borderRadius.button,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
    shadowColor: unauthBrand.green,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 5,
  },
  primaryButtonText: {
    fontSize: 16,
    letterSpacing: 0.5,
  },
  secondaryButton: {
    width: "100%",
    paddingVertical: 14,
    borderRadius: unauthBrand.borderRadius.button,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryButtonText: {
    fontSize: 16,
    letterSpacing: 0.5,
  },
  errorText: {
    fontSize: 13,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 12,
  },
  successText: {
    fontSize: 13,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 4,
  },
  noteText: {
    fontSize: 12,
    textAlign: "center",
    marginBottom: 12,
  },
});
