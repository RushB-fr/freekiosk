import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import { I18nManager, NativeModules, Platform } from 'react-native';
import { StorageService } from '../utils/storage';
import en from './locales/en.json';
import fr from './locales/fr.json';
import ptBR from './locales/pt-BR.json';

export const SUPPORTED_LANGUAGES = ['en', 'fr', 'pt-BR'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

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
  // so every Portuguese variant gets pt-BR, the only Portuguese translation.
  const base = code?.split(/[-_]/)[0].toLowerCase();
  return SUPPORTED_LANGUAGES.find((lang) => lang.split('-')[0] === base) ?? 'en';
}

i18next.use(initReactI18next).init({
  compatibilityJSON: 'v4',
  resources: {
    en: { translation: en },
    fr: { translation: fr },
    'pt-BR': { translation: ptBR },
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
