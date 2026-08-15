"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import de from "./locales/de.json";
import en from "./locales/en.json";
import es from "./locales/es.json";
import fr from "./locales/fr.json";
import km from "./locales/km.json";
import lo from "./locales/lo.json";
import my from "./locales/my.json";
import th from "./locales/th.json";
import zh from "./locales/zh.json";
import glossaryIndex from "./locales/glossary-index.json";

export const LANGUAGES = [
  { code: "en", label: "English", flag: "🇬🇧" },
  { code: "my", label: "မြန်မာ", flag: "🇲🇲" },
  { code: "th", label: "ไทย", flag: "🇹🇭" },
  { code: "zh", label: "中文", flag: "🇨🇳" },
  { code: "km", label: "ខ្មែរ", flag: "🇰🇭" },
  { code: "lo", label: "ລາວ", flag: "🇱🇦" },
  { code: "fr", label: "Français", flag: "🇫🇷" },
  { code: "de", label: "Deutsch", flag: "🇩🇪" },
  { code: "es", label: "Español", flag: "🇪🇸" },
] as const;

export type LanguageCode = (typeof LANGUAGES)[number]["code"];
export type TranslationVariables = Record<string, unknown>;
export type TranslationKey = keyof typeof en;

const resources: Record<LanguageCode, Record<string, string>> = { en, my, th, zh, km, lo, fr, de, es };
const localeNames: Record<LanguageCode, string> = {
  en: "en-US", my: "my-MM", th: "th-TH", zh: "zh-CN", km: "km-KH", lo: "lo-LA", fr: "fr-FR", de: "de-DE", es: "es-ES",
};

// Existing Profile/navigation callers retain these aliases. New code should
// always reference the permanent glossary key (for example, t("UI_0039")).
const legacyKeyAliases: Record<string, TranslationKey> = {
  home: "UI_0039", explore: "UI_0040", store: "UI_0037", chats: "UI_0036", profile: "UI_0038",
  language: "I18N_language", appLanguage: "I18N_appLanguage", general: "I18N_general", system: "I18N_system", promotion: "I18N_promotion",
  save: "I18N_save", points: "I18N_points", gems: "I18N_gems", settings: "I18N_settings", darkAppearance: "I18N_darkAppearance",
  soundEffects: "I18N_soundEffects", hapticFeedback: "I18N_hapticFeedback", pushNotifications: "I18N_pushNotifications", logout: "I18N_logout",
  profileActivity: "I18N_profileActivity", recentWalletActivities: "I18N_recentWalletActivities", appPreferences: "I18N_appPreferences",
  adjustAppearance: "I18N_adjustAppearance", inGameAudio: "I18N_inGameAudio", vibrationInteractions: "I18N_vibrationInteractions",
  adminAlerts: "I18N_adminAlerts", accountLegal: "I18N_accountLegal", cosmetics: "UI_1692", manageAccount: "UI_1651",
  helpSupport: "UI_1653", privacyPolicy: "UI_1595", termsService: "UI_1597", editNamePhoto: "UI_1604",
};

const warned = new Set<string>();
const isDevelopment = process.env.NODE_ENV !== "production";
const warnOnce = (message: string) => {
  if (!isDevelopment || warned.has(message)) return;
  warned.add(message);
  console.warn(`[i18n] ${message}`);
};
const resolveKey = (key: string) => legacyKeyAliases[key] || key;
const getVariable = (variables: TranslationVariables, variablePath: string) =>
  variablePath.split(".").reduce<unknown>((value, part) => {
    if (value && typeof value === "object" && part in value) return (value as Record<string, unknown>)[part];
    return undefined;
  }, variables);
const interpolate = (template: string, variables: TranslationVariables, key: string) =>
  template.replace(/\{\{\s*([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\s*\}\}/g, (_match, variablePath: string) => {
    const value = getVariable(variables, variablePath);
    if (value === undefined || value === null) {
      warnOnce(`Missing variable "${variablePath}" for ${key}.`);
      return `{{${variablePath}}}`;
    }
    return String(value);
  });

export function translate(language: LanguageCode, requestedKey: string, variables: TranslationVariables = {}) {
  const key = resolveKey(requestedKey);
  const english = resources.en[key];
  if (!english) {
    warnOnce(`Missing glossary key "${requestedKey}".`);
    return requestedKey;
  }
  const localized = resources[language][key];
  if (!localized) warnOnce(`Missing ${language} translation for ${key}; using English.`);
  let template = localized || english;
  const expected = (glossaryIndex as Record<string, { placeholders?: string[] }>)[key]?.placeholders || [];
  if (expected.length && language !== "en") {
    const found = [...template.matchAll(/\{\{\s*([^{}\s]+)\s*\}\}/g)].map((match) => match[1]);
    if ([...expected].sort().join("|") !== [...found].sort().join("|")) {
      warnOnce(`Placeholder mismatch in ${language} translation for ${key}; verify the glossary entry.`);
      // A translated template that drops a dynamic value is less accurate than
      // the English fallback. Never hide gameplay, price, account, or score
      // values merely because a spreadsheet cell omitted its placeholder.
      template = english;
    }
  }
  return interpolate(template, variables, key);
}

type TranslationContextValue = {
  language: LanguageCode;
  setLanguage: (code: LanguageCode) => void;
  t: (key: string, variables?: TranslationVariables) => string;
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
};
const LanguageContext = createContext<TranslationContextValue>({
  language: "en",
  setLanguage: () => undefined,
  t: (key, variables) => translate("en", key, variables),
  formatNumber: (value, options) => new Intl.NumberFormat(localeNames.en, options).format(value),
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<LanguageCode>("en");
  useEffect(() => {
    const saved = window.localStorage.getItem("app_language");
    if (LANGUAGES.some((item) => item.code === saved)) setLanguageState(saved as LanguageCode);
  }, []);
  useEffect(() => { document.documentElement.lang = language; }, [language]);
  const setLanguage = useCallback((code: LanguageCode) => {
    setLanguageState(code);
    window.localStorage.setItem("app_language", code);
  }, []);
  const value = useMemo<TranslationContextValue>(() => ({
    language,
    setLanguage,
    t: (key, variables) => translate(language, key, variables),
    formatNumber: (number, options) => new Intl.NumberFormat(localeNames[language], options).format(number),
  }), [language, setLanguage]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export const useTranslation = () => useContext(LanguageContext);
