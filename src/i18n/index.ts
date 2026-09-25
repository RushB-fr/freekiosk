import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import { NativeModules, Platform } from 'react-native';
import { StorageService } from '../utils/storage';
import en from './locales/en.json';
import fr from './locales/fr.json';

export const SUPPORTED_LANGUAGES = ['en', 'fr'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

function getDeviceLocale(): string {
  const locale =
    Platform.OS === 'ios'
      ? NativeModules.SettingsManager?.settings?.AppleLocale ||
        NativeModules.SettingsManager?.settings?.AppleLanguages?.[0]
      : NativeModules.I18nManager?.localeIdentifier;
  return typeof locale === 'string' ? locale : 'en';
}

export function resolveSupportedLanguage(code: string | null | undefined): SupportedLanguage {
  if (code && (SUPPORTED_LANGUAGES as readonly string[]).includes(code)) {
    return code as SupportedLanguage;
  }
  return 'en';
}

i18next.use(initReactI18next).init({
  compatibilityJSON: 'v4',
  resources: {
    en: { translation: en },
    fr: { translation: fr },
  },
  lng: resolveSupportedLanguage(getDeviceLocale().split(/[-_]/)[0]),
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
