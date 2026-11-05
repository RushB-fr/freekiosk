import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import { I18nManager, NativeModules, Platform } from 'react-native';
import { StorageService } from '../utils/storage';
import en from './locales/en.json';
import de from './locales/de.json';
import es from './locales/es.json';
import fr from './locales/fr.json';
import itIT from './locales/it.json';
import nl from './locales/nl.json';
import ptBR from './locales/pt-BR.json';
import pl from './locales/pl.json';
import zhHans from './locales/zh-Hans.json';

// Each language is named in itself: someone who cannot read the current one must still find theirs.
export const LANGUAGE_OPTIONS = [
  { value: 'en', label: 'English' },
  { value: 'de', label: 'Deutsch' },
  { value: 'es', label: 'Español' },
  { value: 'fr', label: 'Français' },
  { value: 'it', label: 'Italiano' },
  { value: 'nl', label: 'Nederlands' },
  { value: 'pt-BR', label: 'Português (Brasil)' },
  { value: 'pl', label: 'Polski' },
  { value: 'zh-Hans', label: '简体中文' },
] as const;
export type SupportedLanguage = (typeof LANGUAGE_OPTIONS)[number]['value'];
export const SUPPORTED_LANGUAGES: readonly SupportedLanguage[] = LANGUAGE_OPTIONS.map((o) => o.value);

function getDeviceLocale(): string {
  const locale =
    Platform.OS === 'ios'
      ? NativeModules.SettingsManager?.settings?.AppleLocale ||
        NativeModules.SettingsManager?.settings?.AppleLanguages?.[0]
      : // NativeModules.I18nManager has no constant fields under the New Architecture.
        I18nManager.getConstants().localeIdentifier;
  return typeof locale === 'string' ? locale : 'en';
}

export function resolveSupportedLanguage(code: string | null | undefined): SupportedLanguage {
  if (code && (SUPPORTED_LANGUAGES as readonly string[]).includes(code)) {
    return code as SupportedLanguage;
  }
  // Device locales come as "pt_BR", "pt-PT" or "fr_CA": match on the language part,
  // so every Portuguese variant gets pt-BR, the only Portuguese translation, and every Chinese
  // one (zh_CN, zh_TW, zh-Hant-HK) gets zh-Hans, the only Chinese one.
  const base = code?.split(/[-_]/)[0].toLowerCase();
  return SUPPORTED_LANGUAGES.find((lang) => lang.split('-')[0] === base) ?? 'en';
}

i18next.use(initReactI18next).init({
  compatibilityJSON: 'v4',
  resources: {
    en: { translation: en },
    de: { translation: de },
    es: { translation: es },
    fr: { translation: fr },
    it: { translation: itIT },
    nl: { translation: nl },
    'pt-BR': { translation: ptBR },
    pl: { translation: pl },
    'zh-Hans': { translation: zhHans },
  },
  lng: resolveSupportedLanguage(getDeviceLocale()),
  fallbackLng: 'en',
  interpolation: {
    escapeValue: false,
  },
});

export async function loadStoredLanguage(): Promise<void> {
  const stored = await StorageService.getLanguage();
  if (stored) {
    await i18next.changeLanguage(resolveSupportedLanguage(stored));
  }
}

export async function setAppLanguage(language: SupportedLanguage): Promise<void> {
  await StorageService.saveLanguage(language);
  await i18next.changeLanguage(language);
}

export default i18next;
