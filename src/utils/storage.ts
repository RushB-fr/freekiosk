import AsyncStorage from '@react-native-async-storage/async-storage';

const KEYS = {
  URL: '@kiosk_url',
  PIN: '@kiosk_pin',
  AUTO_RELOAD: '@kiosk_auto_reload',
  KIOSK_ENABLED: '@kiosk_enabled',
  AUTO_LAUNCH: '@kiosk_auto_launch',
};

export const StorageService = {
  saveUrl: async (url: string): Promise<void> => {
    try {
      await AsyncStorage.setItem(KEYS.URL, url);
    } catch (error) {
      console.error('Error saving URL:', error);
    }
  },

  getUrl: async (): Promise<string | null> => {
    try {
      return await AsyncStorage.getItem(KEYS.URL);
    } catch (error) {
      console.error('Error getting URL:', error);
      return null;
    }
  },

  savePin: async (pin: string): Promise<void> => {
    try {
      await AsyncStorage.setItem(KEYS.PIN, pin);
    } catch (error) {
      console.error('Error saving PIN:', error);
    }
  },

  getPin: async (): Promise<string | null> => {
    try {
      return await AsyncStorage.getItem(KEYS.PIN);
    } catch (error) {
      console.error('Error getting PIN:', error);
      return null;
    }
  },

  saveAutoReload: async (value: boolean): Promise<void> => {
    try {
      await AsyncStorage.setItem(KEYS.AUTO_RELOAD, JSON.stringify(value));
    } catch (error) {
      console.error('Error saving auto reload:', error);
    }
  },

  getAutoReload: async (): Promise<boolean> => {
    try {
      const value = await AsyncStorage.getItem(KEYS.AUTO_RELOAD);
      return value ? JSON.parse(value) : false;
    } catch (error) {
      console.error('Error getting auto reload:', error);
      return false;
    }
  },

  saveKioskEnabled: async (value: boolean): Promise<void> => {
    try {
      await AsyncStorage.setItem(KEYS.KIOSK_ENABLED, JSON.stringify(value));
    } catch (error) {
      console.error('Error saving kiosk enabled:', error);
    }
  },

  getKioskEnabled: async (): Promise<boolean> => {
    try {
      const value = await AsyncStorage.getItem(KEYS.KIOSK_ENABLED);
      // Par défaut FALSE (kiosk activé si null)
      return value === null ? false : JSON.parse(value);
    } catch (error) {
      console.error('Error getting kiosk enabled:', error);
      return false; // Default OFF
    }
  },

  // Ajout des méthodes Auto Launch avec bonne clé KEYS.AUTO_LAUNCH
  saveAutoLaunch: async (value: boolean): Promise<void> => {
    try {
      await AsyncStorage.setItem(KEYS.AUTO_LAUNCH, JSON.stringify(value));
    } catch (error) {
      console.error('Error saving auto launch:', error);
    }
  },

  getAutoLaunch: async (): Promise<boolean> => {
    try {
      const value = await AsyncStorage.getItem(KEYS.AUTO_LAUNCH);
      return value ? JSON.parse(value) : false;
    } catch (error) {
      console.error('Error getting auto launch:', error);
      return false;
    }
  },

  async clearAll(): Promise<void> {
  try {
    await AsyncStorage.multiRemove([
      KEYS.URL,
      KEYS.PIN,
      KEYS.AUTO_RELOAD,
      KEYS.KIOSK_ENABLED,
      KEYS.AUTO_LAUNCH,
    ]);
  } catch (error) {
    console.error('Error clearing all storage keys:', error);
  }
}
};
