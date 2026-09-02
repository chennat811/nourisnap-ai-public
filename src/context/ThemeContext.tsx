import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLanguage } from './LanguageContext';

const THEME_KEY = '@theme_preference';

export type ThemeMode = 'light' | 'dark';

export interface ThemeColors {
  bg: string;
  cardBg: string;
  cardBorder: string;
  navy: string;
  green: string;
  coral: string;
  cream: string;
  lime: string;
  track: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  // Extras for general UI
  screenSafe: string;
  statusBar: 'light-content' | 'dark-content';
  headerBg: string;
  separator: string;
  modalBg: string;
  modalText: string;
  
  refreshText: string;
  expandBorder: string;
  tipBubbleBg: string;
  tipBubbleBorder: string;
  tipTitleColor: string;
  tipTextColor: string;
  feedbackBg: string;
  itemThumbPlaceholder: string;
  white: string;
  // Fonts
  fontPrimary: string;
  fontSecondary: string;
}

const getLightColors = (language: string): ThemeColors => ({
  bg: '#E7E7E7',
  cardBg: '#FFFFFF',
  cardBorder: '#E0E0E0',
  navy: '#1B6B8F',
  green: '#4A9B6F',
  coral: '#D4524A',
  cream: '#FFEBBE',
  lime: '#C5CA22',
  track: '#E5F1EE',
  textPrimary: '#333333',
  textSecondary: '#8C7E6A',
  textMuted: '#B0A695',
  screenSafe: '#FFFFFF',
  statusBar: 'light-content',
  headerBg: '#FFFFFF',
  separator: '#EEE',
  modalBg: '#FFFFFF',
  modalText: '#425466',
  refreshText: '#4A9B6F',
  expandBorder: '#EEE',
  tipBubbleBg: '#4A9B6F14',
  tipBubbleBorder: '#4A9B6F33',
  tipTitleColor: '#4A9B6F',
  tipTextColor: '#8C7E6A',
  feedbackBg: '#FFFFFF',
  itemThumbPlaceholder: '#EEE',
  white: '#FFFFFF',
  fontPrimary: language === 'zh-TW' ? 'MochiyPopOne-Regular' : 'FredokaOne',
  fontSecondary: language === 'zh-TW' ? 'JFOpenHuninn' : 'Nunito',
});

const getDarkColors = (language: string): ThemeColors => ({
  bg: '#121212',
  cardBg: '#1E1E1E',
  cardBorder: '#2C2C2C',
  navy: '#1B6B8F',
  green: '#4A9B6F',
  coral: '#D4524A',
  cream: '#FFEBBE',
  lime: '#C5CA22',
  track: '#2C2C2C',
  textPrimary: '#FFEBBE',
  textSecondary: '#D1C4A3',
  textMuted: '#8B8471',
  screenSafe: '#121212',
  statusBar: 'light-content',
  headerBg: '#1E1E1E',
  separator: '#2C2C2C',
  modalBg: '#1E1E1E',
  modalText: '#FFEBBE',
  refreshText: '#4A9B6F',
  expandBorder: '#2C2C2C',
  tipBubbleBg: '#4A9B6F1F',
  tipBubbleBorder: '#4A9B6F40',
  tipTitleColor: '#4A9B6F',
  tipTextColor: '#D1C4A3',
  feedbackBg: '#1E1E1E',
  itemThumbPlaceholder: '#2C2C2C',
  white: '#FFEBBE',
  fontPrimary: language === 'zh-TW' ? 'NotoSansTC' : 'FredokaOne',
  fontSecondary: language === 'zh-TW' ? 'JFOpenHuninn' : 'Nunito',
});

// Meal icons per theme
const lightMealIcons = {
  breakfast: require('../../assets/breakfast.png'),
  lunch: require('../../assets/lunch.png'),
  dinner: require('../../assets/dinner.png'),
  snack: require('../../assets/snack.png'),
};

const darkMealIcons = {
  breakfast: require('../../assets/breakfast-invert.png'),
  lunch: require('../../assets/lunch-invert.png'),
  dinner: require('../../assets/dinner-invert.png'),
  snack: require('../../assets/snack-invert.png'),
};

interface ThemeContextType {
  mode: ThemeMode;
  colors: ThemeColors;
  isDark: boolean;
  mealIcons: Record<'breakfast' | 'lunch' | 'dinner' | 'snack', any>;
  toggleTheme: () => void;
  setThemeMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextType | null>(null);

export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
  const [mode, setMode] = useState<ThemeMode>('dark');
  const [ready, setReady] = useState(false);
  const languageContext = useLanguage();
  const currentLanguage = languageContext?.language || 'en';

  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(THEME_KEY);
        if (stored === 'light' || stored === 'dark') {
          setMode(stored);
        }
      } catch (e) {
        if (__DEV__) console.error('Failed to load theme preference:', e);
      } finally {
        setReady(true);
      }
    })();
  }, []);

  const setThemeMode = async (newMode: ThemeMode) => {
    setMode(newMode);
    try {
      await AsyncStorage.setItem(THEME_KEY, newMode);
    } catch (e) {
      if (__DEV__) console.error('Failed to save theme preference:', e);
    }
  };

  const toggleTheme = () => {
    setThemeMode(mode === 'dark' ? 'light' : 'dark');
  };

  const isDark = mode === 'dark';
  const colors = isDark ? getDarkColors(currentLanguage) : getLightColors(currentLanguage);
  const mealIcons = isDark ? darkMealIcons : lightMealIcons;

  const value = useMemo(
    () => ({ mode, colors, isDark, mealIcons, toggleTheme, setThemeMode }),
    [mode, currentLanguage],
  );

  return (
    <ThemeContext.Provider value={value}>
      {ready ? children : null}
    </ThemeContext.Provider>
  );
};

export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
