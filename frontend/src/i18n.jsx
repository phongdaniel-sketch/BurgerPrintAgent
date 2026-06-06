import { createContext, useCallback, useContext, useState } from 'react';
import vi from './locales/vi';
import en from './locales/en';

const locales = { vi, en };

const I18nContext = createContext();

/**
 * Resolve a dot-notation key against a locale object.
 * e.g. resolve('sidebar.newChat', viObj) → "Cuộc trò chuyện mới"
 */
function resolve(key, obj) {
  return key.split('.').reduce((o, k) => (o && o[k] !== undefined ? o[k] : key), obj);
}

export function LanguageProvider({ children }) {
  const [locale, setLocale] = useState(() => {
    try {
      return localStorage.getItem('bp_lang') || 'vi';
    } catch {
      return 'vi';
    }
  });

  const changeLocale = useCallback((l) => {
    setLocale(l);
    try { localStorage.setItem('bp_lang', l); } catch { /* noop */ }
  }, []);

  const t = useCallback((key) => resolve(key, locales[locale] || locales.vi), [locale]);

  return (
    <I18nContext.Provider value={{ t, locale, setLocale: changeLocale }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useTranslation() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useTranslation must be used within <LanguageProvider>');
  return ctx;
}
