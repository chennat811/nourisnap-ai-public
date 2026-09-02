import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';
import AsyncStorage from '@react-native-async-storage/async-storage';

import en from './locales/en.json';
import zh from './locales/zh-TW.json';

const LANGUAGE_KEY = '@language_preference';

const resources = {
  en: { translation: en },
  'zh-TW': { translation: zh },
};

// Get stored language or use device language
const getInitialLanguage = async () => {
  try {
    const storedLanguage = await AsyncStorage.getItem(LANGUAGE_KEY);
    if (storedLanguage) {
      return storedLanguage;
    }
    // Default to device locale if available, otherwise English
    const deviceLocale = Localization.getLocales()[0]?.languageTag || 'en';
    return deviceLocale.startsWith('zh') ? 'zh-TW' : 'en';
  } catch {
    return 'en';
  }
};

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: 'en', // Will be updated by getInitialLanguage
    fallbackLng: 'en',
    compatibilityJSON: 'v4',
    interpolation: {
      escapeValue: false,
    },
  });

// Initialize with stored or device language
getInitialLanguage().then((language) => {
  i18n.changeLanguage(language);
});

export const changeLanguage = async (language: string) => {
  try {
    await AsyncStorage.setItem(LANGUAGE_KEY, language);
    await i18n.changeLanguage(language);
  } catch (error) {
    if (__DEV__) console.error('Failed to change language:', error);
  }
};

export const getCurrentLanguage = () => i18n.language;

export default i18n;
