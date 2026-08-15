"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import bootstrap from "./locales/bootstrap.json";
import englishResource from "./locales/en.json";
import placeholderIndex from "./locales/placeholder-index.json";

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
export type TranslationKey = string;

// English is the guaranteed runtime fallback.  It must be available before a
// user can change language: most screens contain glossary keys beyond the
// small navigation bootstrap set, and rendering a raw key while English is
// still downloading can cause downstream UI to fail during a locale change.
const resources: Partial<Record<LanguageCode, Record<string, string>>> = {
  en: englishResource as Record<string, string>,
};
const pendingResourceLoads: Partial<Record<LanguageCode, Promise<Record<string, string>>>> = {};
let activeLanguage: LanguageCode = "en";
const localeLoaders: Record<LanguageCode, () => Promise<{ default: Record<string, string> }>> = {
  en: () => import("./locales/en.json"),
  my: () => import("./locales/my.json"),
  th: () => import("./locales/th.json"),
  zh: () => import("./locales/zh.json"),
  km: () => import("./locales/km.json"),
  lo: () => import("./locales/lo.json"),
  fr: () => import("./locales/fr.json"),
  de: () => import("./locales/de.json"),
  es: () => import("./locales/es.json"),
};
const localeNames: Record<LanguageCode, string> = {
  en: "en-US", my: "my-MM", th: "th-TH", zh: "zh-CN", km: "km-KH", lo: "lo-LA", fr: "fr-FR", de: "de-DE", es: "es-ES",
};
const ensureLocaleResource = async (language: LanguageCode) => {
  if (resources[language]) return resources[language]!;
  if (!pendingResourceLoads[language]) {
    pendingResourceLoads[language] = localeLoaders[language]().then(({ default: locale }) => {
      resources[language] = locale;
      return locale;
    }).finally(() => {
      delete pendingResourceLoads[language];
    });
  }
  return pendingResourceLoads[language]!;
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
  // The Sheet retains these historical I18N rows for traceability. Resolve
  // duplicates through the canonical UI key so the app never maintains two
  // runtime translations for one concept.
  I18N_home: "UI_0039", I18N_explore: "UI_0040", I18N_store: "UI_0037", I18N_chats: "UI_0036", I18N_profile: "UI_0038",
  I18N_notifications: "UI_1555", I18N_back: "UI_0281", I18N_activityHistory: "UI_1615", I18N_cancel: "UI_0094",
  I18N_loading: "UI_1670", I18N_cosmetics: "UI_1692", I18N_manageAccount: "UI_1651", I18N_helpSupport: "UI_1653",
  I18N_privacyPolicy: "UI_1595", I18N_termsService: "UI_1597", I18N_editNamePhoto: "UI_1604",
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

export function translate(language: LanguageCode, requestedKey: string, variables: TranslationVariables = {}, fallback?: string) {
  const key = resolveKey(requestedKey);
  const english = (englishResource as Record<string, string>)[key]
    || (bootstrap as Record<LanguageCode, Record<string, string>>).en[key]
    || fallback;
  if (!english) {
    warnOnce(`Missing glossary key "${requestedKey}".`);
    return requestedKey;
  }
  const locale: Record<string, string> | undefined = language === "en"
    ? (englishResource as Record<string, string>)
    : resources[language];
  const localized = locale?.[key] || (bootstrap as Record<LanguageCode, Record<string, string>>)[language][key];
  if (locale && !localized) warnOnce(`Missing ${language} translation for ${key}; using English.`);
  let template = localized || english;
  const expected = (placeholderIndex as Record<string, string[]>)[key] || [];
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

/**
 * Compatibility helper for legacy JSX attributes/configuration values. New
 * components should prefer `useTranslation().t`; this helper shares the same
 * active locale and is only used for an exact, glossary-backed migration.
 */
export const tr = (key: string, fallback: string, variables: TranslationVariables = {}) =>
  translate(activeLanguage, key, variables, fallback);

type TranslationContextValue = {
  language: LanguageCode;
  setLanguage: (code: LanguageCode) => Promise<void>;
  t: (key: string, variables?: TranslationVariables) => string;
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
};
const LanguageContext = createContext<TranslationContextValue>({
  language: "en",
  setLanguage: async () => undefined,
  t: (key, variables) => translate("en", key, variables),
  formatNumber: (value, options) => new Intl.NumberFormat(localeNames.en, options).format(value),
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<LanguageCode>("en");
  const [localeRevision, setLocaleRevision] = useState(0);
  const setLanguage = useCallback(async (code: LanguageCode) => {
    try {
      await ensureLocaleResource(code);
    } catch (error) {
      warnOnce(`Could not load ${code} locale; using English. ${String(error)}`);
      return;
    }
    window.localStorage.setItem("app_language", code);
    activeLanguage = code;
    setLanguageState(code);
    setLocaleRevision((revision) => revision + 1);
  }, []);
  useEffect(() => {
    const saved = window.localStorage.getItem("app_language");
    if (LANGUAGES.some((item) => item.code === saved) && saved !== "en") {
      void setLanguage(saved as LanguageCode);
      return;
    }
    // English is statically bundled above, so there is no startup window in
    // which a glossary-backed screen can render an unresolved key.
    return undefined;
  }, [setLanguage]);
  useEffect(() => { document.documentElement.lang = language; }, [language]);
  const value = useMemo<TranslationContextValue>(() => ({
    language,
    setLanguage,
    t: (key, variables) => translate(language, key, variables),
    formatNumber: (number, options) => new Intl.NumberFormat(localeNames[language], options).format(number),
  }), [language, localeRevision, setLanguage]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export const useTranslation = () => useContext(LanguageContext);

/**
 * Use this for exact static UI labels while migrating legacy JSX. It consumes
 * the same provider as `useTranslation`, preserves the English label until a
 * lazy language resource is ready, and returns a text node (no layout wrapper).
 */
export function LocalizedText({ id, fallback, values }: { id: string; fallback: string; values?: TranslationVariables }) {
  const { language } = useTranslation();
  return translate(language, id, values, fallback);
}
