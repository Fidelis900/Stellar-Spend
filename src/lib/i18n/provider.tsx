'use client';

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { Language } from './types';
import { I18n } from './i18n';

const STORAGE_KEY = 'stellar_language';
const SUPPORTED: Language[] = ['en', 'es', 'fr', 'zh', 'ar', 'pt', 'sw'];

function detectBrowserLanguage(): Language {
  if (typeof navigator === 'undefined') return 'en';
  const lang = navigator.language?.slice(0, 2).toLowerCase();
  return (SUPPORTED.includes(lang as Language) ? lang : 'en') as Language;
}

function getInitialLanguage(defaultLanguage: Language): Language {
  try {
    const stored = localStorage.getItem(STORAGE_KEY) as Language | null;
    if (stored && SUPPORTED.includes(stored)) return stored;
  } catch {
    /* ignore */
  }
  return detectBrowserLanguage() ?? defaultLanguage;
}

interface I18nContextType {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (key: string) => string;
  isRTL: boolean;
}

const I18nContext = createContext<I18nContextType | undefined>(undefined);

export function I18nProvider({
  children,
  defaultLanguage = 'en',
}: {
  children: React.ReactNode;
  defaultLanguage?: Language;
}) {
  const [i18nInstance] = useState(() => new I18n(defaultLanguage));
  const [language, setLanguageState] = useState<Language>(defaultLanguage);

  // Apply browser detection + stored preference after mount
  useEffect(() => {
    const initial = getInitialLanguage(defaultLanguage);
    if (initial !== defaultLanguage) {
      i18nInstance.setLanguage(initial);
      setLanguageState(initial);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setLanguage = useCallback(
    (lang: Language) => {
      i18nInstance.setLanguage(lang);
      setLanguageState(lang);
      try {
        localStorage.setItem(STORAGE_KEY, lang);
      } catch {
        /* ignore */
      }
    },
    [i18nInstance],
  );

  const value: I18nContextType = {
    language,
    setLanguage,
    t: (key: string) => i18nInstance.t(key),
    isRTL: i18nInstance.isRTL(),
  };

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextType {
  const context = useContext(I18nContext);
  if (!context) throw new Error('useI18n must be used within I18nProvider');
  return context;
}
