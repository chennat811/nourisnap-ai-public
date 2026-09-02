import React from "react";
import {
  Text,
  TouchableOpacity,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { useLanguage } from "../context/LanguageContext";
import type { DrinkType } from "../utils/drinkType";

type DrinkOptionsProps = {
  sugarLevel: number | null;
  drinkType: DrinkType | null;
  onSugarLevelChange: (level: number | null) => void;
  onDrinkTypeChange: (type: DrinkType) => void;
  titleStyle: StyleProp<TextStyle>;
  labelStyle: StyleProp<TextStyle>;
  chipRowStyle: StyleProp<ViewStyle>;
  chipStyle: StyleProp<ViewStyle>;
  selectedChipStyle: StyleProp<ViewStyle>;
  chipTextStyle: StyleProp<TextStyle>;
  selectedChipTextStyle: StyleProp<TextStyle>;
};

export default function DrinkOptions({
  sugarLevel,
  drinkType,
  onSugarLevelChange,
  onDrinkTypeChange,
  titleStyle,
  labelStyle,
  chipRowStyle,
  chipStyle,
  selectedChipStyle,
  chipTextStyle,
  selectedChipTextStyle,
}: DrinkOptionsProps) {
  const { t } = useLanguage();

  const sugarOptions = [
    { label: t("mealCapture.sugarUnspecified"), value: null },
    { label: t("mealCapture.sugarNone"), value: 0 },
    { label: t("mealCapture.sugarLight"), value: 25 },
    { label: t("mealCapture.sugarHalf"), value: 50 },
    { label: t("mealCapture.sugarRegular"), value: 100 },
  ];
  const drinkTypeOptions: { label: string; value: DrinkType }[] = [
    { label: t("mealCapture.pureTea"), value: "pure_tea" },
    { label: t("mealCapture.creamer"), value: "creamer" },
    { label: t("mealCapture.freshMilk"), value: "fresh_milk" },
    { label: t("mealCapture.fruitTea"), value: "fruit" },
  ];

  return (
    <>
      <Text style={titleStyle}>{t("mealCapture.drinkInfoTitle")}</Text>
      <Text style={labelStyle}>{t("mealCapture.sweetness")}</Text>
      <View style={chipRowStyle}>
        {sugarOptions.map((option) => (
          <TouchableOpacity
            key={String(option.value)}
            style={[chipStyle, sugarLevel === option.value && selectedChipStyle]}
            onPress={() => onSugarLevelChange(option.value)}
          >
            <Text style={[chipTextStyle, sugarLevel === option.value && selectedChipTextStyle]}>
              {option.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={[labelStyle, { marginTop: 10 }]}>{t("mealCapture.drinkType")}</Text>
      <View style={chipRowStyle}>
        {drinkTypeOptions.map((option) => (
          <TouchableOpacity
            key={option.value}
            style={[chipStyle, drinkType === option.value && selectedChipStyle]}
            onPress={() => onDrinkTypeChange(option.value)}
          >
            <Text style={[chipTextStyle, drinkType === option.value && selectedChipTextStyle]}>
              {option.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </>
  );
}
