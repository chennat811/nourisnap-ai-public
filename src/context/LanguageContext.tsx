import React, { createContext, useContext, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { changeLanguage, getCurrentLanguage } from '../i18n/config';

const LANGUAGE_KEY = '@language_preference';

interface LanguageContextType {
  language: string;
  setLanguage: (lang: string) => Promise<void>;
  t: (key: string, options?: any) => string;
}

const LanguageContext = createContext<LanguageContextType | null>(null);

export const LanguageProvider = ({ children }: { children: React.ReactNode }) => {
  const { t, i18n } = useTranslation();
  const [language, setLanguageState] = useState<string>(getCurrentLanguage());
  const [ready, setReady] = useState<boolean>(false);

  useEffect(() => {
    const loadLanguage = async () => {
      try {
        const storedLanguage = await AsyncStorage.getItem(LANGUAGE_KEY);
        if (storedLanguage && storedLanguage !== language) {
          await changeLanguage(storedLanguage);
          setLanguageState(storedLanguage);
        }
      } catch (error) {
        if (__DEV__) console.error('Failed to load language preference:', error);
      } finally {
        setReady(true);
      }
    };
    loadLanguage();
  }, []);

  const setLanguage = async (lang: string) => {
    try {
      await changeLanguage(lang);
      setLanguageState(lang);
    } catch (error) {
      if (__DEV__) console.error('Failed to change language:', error);
      throw error;
    }
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {ready ? children : null}
    </LanguageContext.Provider>
  );
};

export const useLanguage = (): LanguageContextType => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};
