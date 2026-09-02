import React from "react";
import {
  Modal,
  Pressable,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import type { ThemeColors } from "../context/ThemeContext";

export interface SelectionOption<T extends string> {
  value: T;
  label: string;
}

interface SelectionModalProps<T extends string> {
  visible: boolean;
  title: string;
  options: SelectionOption<T>[];
  selectedValue: T;
  onSelect: (value: T) => void;
  onClose: () => void;
  colors: ThemeColors;
  closeLabel: string;
}

export default function SelectionModal<T extends string>({
  visible,
  title,
  options,
  selectedValue,
  onSelect,
  onClose,
  colors: C,
  closeLabel,
}: SelectionModalProps<T>) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <View
          style={[styles.modalContent, { backgroundColor: C.modalBg }]}
          onStartShouldSetResponder={() => true}
        >
          <Text style={[styles.modalTitle, { color: C.modalText, fontFamily: C.fontPrimary }]}>
            {title}
          </Text>
          {options.map((option) => {
            const selected = option.value === selectedValue;
            return (
              <TouchableOpacity
                key={option.value}
                style={[
                  styles.optionBtn,
                  { borderColor: C.cardBorder },
                  selected && { borderColor: C.green, backgroundColor: C.tipBubbleBg },
                ]}
                onPress={() => onSelect(option.value)}
                accessibilityRole="button"
                accessibilityLabel={option.label}
                accessibilityState={{ selected }}
              >
                <Text
                  style={[
                    styles.optionBtnText,
                    { color: C.modalText, fontFamily: C.fontSecondary },
                    selected && { color: C.green, fontWeight: "600" },
                  ]}
                >
                  {option.label}
                </Text>
              </TouchableOpacity>
            );
          })}
          <TouchableOpacity
            style={[styles.modalCloseButton, { backgroundColor: C.track }]}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={closeLabel}
          >
            <Text
              style={[
                styles.modalCloseButtonText,
                { color: C.textSecondary, fontFamily: C.fontPrimary },
              ]}
            >
              {closeLabel}
            </Text>
          </TouchableOpacity>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    borderRadius: 16,
    padding: 24,
    width: "80%",
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "600",
    marginBottom: 20,
    textAlign: "center",
  },
  optionBtn: {
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 12,
  },
  optionBtnText: {
    fontSize: 16,
    textAlign: "center",
  },
  modalCloseButton: {
    marginTop: 8,
    padding: 16,
    borderRadius: 8,
  },
  modalCloseButtonText: {
    fontSize: 16,
    textAlign: "center",
  },
});
