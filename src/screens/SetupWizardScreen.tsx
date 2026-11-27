/**
 * SetupWizardScreen - the guided first launch.
 *
 * Shown once, on a tablet where nothing is configured (see isFreshInstall). It asks for what a
 * basic kiosk needs, in this order: the page to show, the user's own PIN, a few things that keep
 * the kiosk running, and whether to lock the device. The last screen explains how to get back to
 * the settings and lets the user practise the gesture. Nothing is saved before "Start the kiosk",
 * so leaving half way leaves the tablet as it was.
 *
 * Works with a touch screen and with the remote of an Android TV (every control is focusable,
 * and the last screen explains the Back key instead of the tap gesture).
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  BackHandler,
  Image,
  Linking,
  NativeModules,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import type { RootStackParamList } from '../navigation/AppNavigator';
import SettingsButton from '../components/settings/SettingsButton';
import SettingsInput from '../components/settings/SettingsInput';
import Icon from '../components/Icon';
import { Colors, Spacing } from '../theme';
import { StorageService } from '../utils/storage';
import { saveSecurePin } from '../utils/secureStorage';
import { CLOUD_ENABLED } from '../config/features';
import {
  TAP_RADIUS_DP,
  WIZARD_PIN_MAX,
  WIZARD_PIN_MIN,
  isValidWizardPin,
  markSetupDone,
  nextTapState,
  normalizeWizardUrl,
} from '../utils/setupWizard';
import type { TapState } from '../utils/setupWizard';

const { KioskModule } = NativeModules;

type Step = 'welcome' | 'url' | 'pin' | 'alive' | 'lock' | 'ready';
type LockChoice = 'lock' | 'later';
type Props = { navigation: NativeStackNavigationProp<RootStackParamList, 'Setup'> };

const GUIDE_URL = 'https://freekiosk.app/docs/installation/';
const CLOUD_URL = 'https://cloud.freekiosk.app';

/** The steps of a normal setup, in order: the progress line counts them (the welcome screen is not one). */
const FLOW: Step[] = ['url', 'pin', 'alive', 'lock', 'ready'];

const SetupWizardScreen: React.FC<Props> = ({ navigation }) => {
  const { t } = useTranslation();
  const [step, setStep] = useState<Step>('welcome');
  const [cloudIntent, setCloudIntent] = useState(false);

  const [url, setUrl] = useState('');
  const [urlError, setUrlError] = useState<string | undefined>();

  const [pin, setPin] = useState('');
  const [firstPin, setFirstPin] = useState<string | null>(null);
  const [chosenPin, setChosenPin] = useState<string | null>(null);
  const [pinError, setPinError] = useState<string | undefined>();

  const [autoLaunch, setAutoLaunch] = useState(true);
  const [batteryOk, setBatteryOk] = useState(false);
  const [isDeviceOwner, setIsDeviceOwner] = useState(false);
  const [lockChoice, setLockChoice] = useState<LockChoice>('lock');

  const [tapCount, setTapCount] = useState(5);
  const [tapTimeout, setTapTimeout] = useState(1500);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | undefined>();

  // What the real gesture will be, so the last screen describes (and lets the user try) the real one.
  useEffect(() => {
    StorageService.getReturnTapCount().then((n) => setTapCount(n || 5)).catch(() => {});
    StorageService.getReturnTapTimeout().then((n) => setTapTimeout(n || 1500)).catch(() => {});
    KioskModule?.isDeviceOwner?.().then((v: boolean) => setIsDeviceOwner(!!v)).catch(() => {});
  }, []);

  // A TV cannot be pinned without Device Owner (Android shows no pinning prompt there): nothing to choose.
  const tvWithoutOwner = Platform.isTV && !isDeviceOwner;
  useEffect(() => {
    if (tvWithoutOwner) setLockChoice('later');
  }, [tvWithoutOwner]);

  const refreshBattery = useCallback(() => {
    KioskModule?.isIgnoringBatteryOptimizations?.()
      .then((v: boolean) => setBatteryOk(!!v))
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (step === 'alive') refreshBattery();
  }, [step, refreshBattery]);

  // The Back key (and a TV remote's Back) goes one step back; on the first screen it does nothing,
  // so a visitor cannot leave the wizard half way.
  const goBack = useCallback((): boolean => {
    setSaveError(undefined);
    switch (step) {
      case 'welcome':
        return true;
      case 'url':
        setStep('welcome');
        return true;
      case 'pin':
        if (chosenPin === null && firstPin !== null) {
          setFirstPin(null);
          setPin('');
          setPinError(undefined);
        } else {
          setChosenPin(null);
          setFirstPin(null);
          setPin('');
          setStep(cloudIntent ? 'welcome' : 'url');
        }
        return true;
      case 'alive':
        setStep('pin');
        setPin(chosenPin ?? '');
        setFirstPin(null);
        setChosenPin(null);
        return true;
      case 'lock':
        setStep('alive');
        return true;
      case 'ready':
        setStep('lock');
        return true;
      default:
        return true;
    }
  }, [step, chosenPin, firstPin, cloudIntent]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', goBack);
    return () => sub.remove();
  }, [goBack]);

  const stepNumber = FLOW.indexOf(step) + 1;

  // ---- actions ----

  const submitUrl = (): void => {
    const check = normalizeWizardUrl(url);
    if (!check.ok) {
      setUrlError(
        check.reason === 'empty'
          ? t('setup.url.errorEmpty')
          : check.reason === 'blocked'
            ? t('setup.url.errorBlocked')
            : t('setup.url.errorInvalid'),
      );
      return;
    }
    setUrl(check.url);
    setUrlError(undefined);
    setStep('pin');
    setPin('');
    setFirstPin(null);
    setChosenPin(null);
    setPinError(undefined);
  };

  const submitPin = async (): Promise<void> => {
    if (!isValidWizardPin(pin)) {
      setPinError(t('setup.pin.errorLength', { min: WIZARD_PIN_MIN, max: WIZARD_PIN_MAX }));
      return;
    }
    if (firstPin === null) {
      setFirstPin(pin);
      setPin('');
      setPinError(undefined);
      return;
    }
    if (firstPin !== pin) {
      setFirstPin(null);
      setPin('');
      setPinError(t('setup.pin.errorMismatch'));
      return;
    }
    setPinError(undefined);
    if (cloudIntent) {
      // Cloud path: the PIN is all the wizard needs, the settings (Advanced > Cloud) do the rest.
      setBusy(true);
      try {
        const saved = await saveSecurePin(pin);
        if (!saved) {
          setFirstPin(null);
          setPin('');
          setPinError(t('setup.pin.errorSave'));
          return;
        }
        await StorageService.savePin('');
        await markSetupDone();
        // Through the PIN screen, like any later visit to the settings: the kiosk screen drops the
        // settings access when it appears, so a direct jump to the settings would be refused.
        navigation.reset({ index: 1, routes: [{ name: 'Kiosk' }, { name: 'Pin', params: { initialTab: 'advanced' } }] });
      } finally {
        setBusy(false);
      }
      return;
    }
    setChosenPin(pin);
    setStep('alive');
  };

  /** Saves everything the wizard collected, then leaves for the kiosk (or the settings). */
  const finish = async (destination: 'kiosk' | 'settings' | 'cloud'): Promise<void> => {
    if (busy || chosenPin === null) return;
    setBusy(true);
    setSaveError(undefined);
    try {
      const pinSaved = await saveSecurePin(chosenPin);
      if (!pinSaved) {
        setSaveError(t('setup.pin.errorSave'));
        return;
      }
      await StorageService.savePin('');
      await StorageService.saveDisplayMode('webview');
      await StorageService.saveUrl(url);
      await StorageService.saveAutoLaunch(autoLaunch);
      if (autoLaunch) {
        await KioskModule?.enableAutoLaunch?.().catch(() => {});
      }
      const lock = lockChoice === 'lock';
      await StorageService.saveKioskEnabled(lock);
      await markSetupDone();
      if (lock) {
        try {
          await KioskModule?.startLockTask?.(null, true, false, false, false);
        } catch (error) {
          console.warn('[SetupWizard] startLockTask error (non-blocking):', error);
        }
      }
      if (destination === 'kiosk') {
        navigation.reset({ index: 0, routes: [{ name: 'Kiosk' }] });
      } else {
        // Through the PIN screen (see above): the PIN just chosen is the one to enter.
        navigation.reset({
          index: 1,
          routes: [
            { name: 'Kiosk' },
            { name: 'Pin', params: destination === 'cloud' ? { initialTab: 'advanced' } : undefined },
          ],
        });
      }
    } catch (error) {
      console.warn('[SetupWizard] Saving failed:', error);
      setSaveError(t('setup.errorGeneric'));
    } finally {
      setBusy(false);
    }
  };

  const openAdvancedSettings = async (): Promise<void> => {
    // Someone who knows FreeKiosk: the usual way in (PIN screen, then all the settings).
    await markSetupDone();
    navigation.reset({ index: 1, routes: [{ name: 'Kiosk' }, { name: 'Pin' }] });
  };

  const startCloudPath = (): void => {
    setCloudIntent(true);
    setStep('pin');
    setPin('');
    setFirstPin(null);
    setChosenPin(null);
    setPinError(undefined);
  };

  const openLink = (target: string): void => {
    Linking.openURL(target).catch(() => {});
  };

  // ---- screens ----

  const renderWelcome = (): React.ReactNode => (
    <>
      <View style={styles.logoCircle}>
        <Image source={require('../assets/images/logo_circle.png')} style={styles.logoImage} resizeMode="contain" />
      </View>
      <Text style={styles.title}>{t('setup.welcome.title')}</Text>
      <Text style={styles.text}>{t('setup.welcome.text')}</Text>
      <SettingsButton
        title={t(Platform.isTV ? 'setup.welcome.startTv' : 'setup.welcome.start')}
        icon="rocket-launch"
        size="large"
        onPress={() => setStep('url')}
        style={styles.gap}
        hasTVPreferredFocus={Platform.isTV}
      />
      {CLOUD_ENABLED && (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Icon name="cloud-cog" size={22} color={Colors.primary} style={styles.cardIcon} />
            <Text style={styles.cardTitle}>{t('components.webView.cloudTitle')}</Text>
          </View>
          <Text style={styles.cardText}>{t('components.webView.cloudText')}</Text>
          <SettingsButton title={t('setup.welcome.cloudConnect')} variant="outline" onPress={startCloudPath} style={styles.gapSmall} />
          {!Platform.isTV && (
            <TouchableOpacity onPress={() => openLink(CLOUD_URL)} style={styles.linkButton}>
              <Text style={styles.link}>{t('components.webView.cloudDiscover')}</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
      <TouchableOpacity onPress={openAdvancedSettings} style={styles.linkButton}>
        <Text style={styles.link}>{t('setup.welcome.advanced')}</Text>
      </TouchableOpacity>
    </>
  );

  const renderUrl = (): React.ReactNode => (
    <>
      <Text style={styles.title}>{t('setup.url.title')}</Text>
      <Text style={styles.text}>{t('setup.url.text')}</Text>
      <SettingsInput
        label={t('setup.url.label')}
        icon="web"
        value={url}
        onChangeText={(v) => {
          setUrl(v);
          setUrlError(undefined);
        }}
        placeholder="https://example.com"
        keyboardType="url"
        error={urlError}
        hint={t('setup.url.hint')}
        autoFocus={Platform.isTV}
      />
      <SettingsButton title={t('setup.next')} icon="arrow-right" onPress={submitUrl} style={styles.gap} />
    </>
  );

  const renderPin = (): React.ReactNode => {
    const confirming = firstPin !== null;
    return (
      <>
        <Text style={styles.title}>{t(confirming ? 'setup.pin.titleConfirm' : 'setup.pin.titleChoose')}</Text>
        <Text style={styles.text}>
          {confirming ? t('setup.pin.textConfirm') : t('setup.pin.textChoose', { min: WIZARD_PIN_MIN, max: WIZARD_PIN_MAX })}
        </Text>
        <SettingsInput
          key={confirming ? 'confirm' : 'choose'}
          label={t('setup.pin.label')}
          icon="key"
          value={pin}
          onChangeText={(v) => {
            setPin(v.replace(/\D/g, ''));
            setPinError(undefined);
          }}
          keyboardType="number-pad"
          secureTextEntry
          maxLength={WIZARD_PIN_MAX}
          error={pinError}
          autoFocus={Platform.isTV}
        />
        <SettingsButton
          title={t(confirming ? 'setup.pin.confirm' : 'setup.next')}
          icon="arrow-right"
          onPress={submitPin}
          loading={busy}
          disabled={pin.length < WIZARD_PIN_MIN}
          style={styles.gap}
        />
      </>
    );
  };

  const renderAlive = (): React.ReactNode => (
    <>
      <Text style={styles.title}>{t('setup.alive.title')}</Text>
      <Text style={styles.text}>{t('setup.alive.text')}</Text>

      <TouchableOpacity
        style={[styles.option, autoLaunch && styles.optionOn]}
        onPress={() => setAutoLaunch((v) => !v)}
        hasTVPreferredFocus={Platform.isTV}
        accessibilityRole="switch"
        accessibilityState={{ checked: autoLaunch }}
      >
        <Icon name={autoLaunch ? 'check-circle' : 'power'} size={26} color={autoLaunch ? Colors.success : Colors.textSecondary} style={styles.optionIcon} />
        <View style={styles.optionBody}>
          <Text style={styles.optionTitle}>{t('setup.alive.autoLaunchTitle')}</Text>
          <Text style={styles.optionText}>{t('setup.alive.autoLaunchText')}</Text>
        </View>
      </TouchableOpacity>

      {!Platform.isTV && (
        <View style={[styles.option, batteryOk && styles.optionOn]}>
          <Icon name={batteryOk ? 'check-circle' : 'power-sleep'} size={26} color={batteryOk ? Colors.success : Colors.textSecondary} style={styles.optionIcon} />
          <View style={styles.optionBody}>
            <Text style={styles.optionTitle}>{t('setup.alive.batteryTitle')}</Text>
            <Text style={styles.optionText}>{t('setup.alive.batteryText')}</Text>
            {!batteryOk && !isDeviceOwner && (
              <SettingsButton
                title={t('setup.alive.batteryAllow')}
                size="small"
                variant="outline"
                fullWidth={false}
                style={styles.gapSmall}
                onPress={() => {
                  KioskModule?.requestIgnoreBatteryOptimizations?.().catch(() => {}).finally(() => setTimeout(refreshBattery, 800));
                }}
              />
            )}
          </View>
        </View>
      )}

      <SettingsButton title={t('setup.next')} icon="arrow-right" onPress={() => setStep('lock')} style={styles.gap} />
    </>
  );

  const renderLock = (): React.ReactNode => tvWithoutOwner ? (
    <>
      <Text style={styles.title}>{t('setup.lock.title')}</Text>
      <View style={styles.note}>
        <Icon name="information" size={20} color={Colors.primary} style={styles.cardIcon} />
        <View style={styles.optionBody}>
          <Text style={styles.optionTitle}>{t('setup.lock.tvTitle')}</Text>
          <Text style={styles.optionText}>{t('setup.lock.tvText')}</Text>
        </View>
      </View>
      <SettingsButton title={t('setup.next')} icon="arrow-right" onPress={() => setStep('ready')} style={styles.gap} hasTVPreferredFocus />
    </>
  ) : (
    <>
      <Text style={styles.title}>{t('setup.lock.title')}</Text>
      <Text style={styles.text}>{t('setup.lock.text')}</Text>

      <TouchableOpacity
        style={[styles.option, lockChoice === 'lock' && styles.optionOn]}
        onPress={() => setLockChoice('lock')}
        hasTVPreferredFocus={Platform.isTV}
        accessibilityRole="radio"
        accessibilityState={{ selected: lockChoice === 'lock' }}
      >
        <Icon name="lock" size={26} color={lockChoice === 'lock' ? Colors.primary : Colors.textSecondary} style={styles.optionIcon} />
        <View style={styles.optionBody}>
          <Text style={styles.optionTitle}>{t('setup.lock.lockTitle')}</Text>
          <Text style={styles.optionText}>{t(isDeviceOwner ? 'setup.lock.lockTextOwner' : 'setup.lock.lockText')}</Text>
        </View>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.option, lockChoice === 'later' && styles.optionOn]}
        onPress={() => setLockChoice('later')}
        accessibilityRole="radio"
        accessibilityState={{ selected: lockChoice === 'later' }}
      >
        <Icon name="arrow-right" size={26} color={lockChoice === 'later' ? Colors.primary : Colors.textSecondary} style={styles.optionIcon} />
        <View style={styles.optionBody}>
          <Text style={styles.optionTitle}>{t('setup.lock.laterTitle')}</Text>
          <Text style={styles.optionText}>{t('setup.lock.laterText')}</Text>
        </View>
      </TouchableOpacity>

      {!isDeviceOwner && (
        <View style={styles.note}>
          <Icon name="information" size={20} color={Colors.primary} style={styles.cardIcon} />
          <View style={styles.optionBody}>
            <Text style={styles.optionTitle}>{t('setup.lock.fullTitle')}</Text>
            <Text style={styles.optionText}>{t('setup.lock.fullText')}</Text>
            {!Platform.isTV && (
              <TouchableOpacity onPress={() => openLink(GUIDE_URL)} style={styles.linkButtonLeft}>
                <Text style={styles.link}>{t('setup.lock.fullLink')}</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      <SettingsButton title={t('setup.next')} icon="arrow-right" onPress={() => setStep('ready')} style={styles.gap} />
    </>
  );

  const renderReady = (): React.ReactNode => {
    const seconds = Math.round((tapTimeout / 1000) * 10) / 10;
    return (
      <>
        <Icon name="check-circle" size={52} color={Colors.success} style={styles.readyIcon} />
        <Text style={styles.title}>{t('setup.ready.title')}</Text>
        <Text style={styles.text}>{t('setup.ready.text')}</Text>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('setup.ready.settingsTitle')}</Text>
          {Platform.isTV ? (
            <Text style={styles.cardText}>{t('setup.ready.tvBack')}</Text>
          ) : (
            <>
              <Text style={styles.cardText}>{t('setup.ready.tapStep', { count: tapCount, seconds })}</Text>
              <Text style={styles.cardText}>{t('setup.ready.pinStep')}</Text>
              <TapPractice count={tapCount} timeoutMs={tapTimeout} hint={t('setup.ready.practiceHint', { count: tapCount })} done={t('setup.ready.practiceDone')} />
              <Text style={styles.cardHint}>{t('setup.ready.volume')}</Text>
            </>
          )}
        </View>

        {lockChoice === 'lock' && !isDeviceOwner && <Text style={styles.cardHint}>{t('setup.ready.pinningNote')}</Text>}
        {saveError && <Text style={styles.errorText}>{saveError}</Text>}

        <SettingsButton title={t('setup.ready.start')} icon="play" size="large" onPress={() => finish('kiosk')} loading={busy} style={styles.gap} hasTVPreferredFocus={Platform.isTV} />
        <SettingsButton title={t('setup.ready.openSettings')} variant="outline" onPress={() => finish('settings')} disabled={busy} style={styles.gapSmall} />

        {CLOUD_ENABLED && (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Icon name="cloud-cog" size={22} color={Colors.primary} style={styles.cardIcon} />
              <Text style={styles.cardTitle}>{t('components.webView.cloudTitle')}</Text>
            </View>
            <Text style={styles.cardText}>{t('components.webView.cloudText')}</Text>
            <SettingsButton title={t('setup.welcome.cloudConnect')} variant="outline" onPress={() => finish('cloud')} disabled={busy} style={styles.gapSmall} />
          </View>
        )}
      </>
    );
  };

  const body = (): React.ReactNode => {
    switch (step) {
      case 'welcome':
        return renderWelcome();
      case 'url':
        return renderUrl();
      case 'pin':
        return renderPin();
      case 'alive':
        return renderAlive();
      case 'lock':
        return renderLock();
      default:
        return renderReady();
    }
  };

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.column}>
          {step !== 'welcome' && !cloudIntent && stepNumber > 0 && (
            <Text style={styles.progress}>{t('setup.progress', { current: stepNumber, total: FLOW.length })}</Text>
          )}
          {/* key: a new step is a new tree, so what asks for the TV focus (autoFocus, hasTVPreferredFocus) gets it again */}
          <React.Fragment key={step}>{body()}</React.Fragment>
          {step !== 'welcome' && (
            <TouchableOpacity onPress={goBack} style={styles.linkButton} disabled={busy}>
              <Text style={styles.link}>{t('setup.back')}</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    </View>
  );
};

/** A zone to try the settings gesture with the real rule (taps close together, within the timeout). */
const TapPractice: React.FC<{ count: number; timeoutMs: number; hint: string; done: string }> = ({ count, timeoutMs, hint, done }) => {
  const [taps, setTaps] = useState<TapState | null>(null);
  const [succeeded, setSucceeded] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (resetTimer.current) clearTimeout(resetTimer.current);
  }, []);

  const onTap = (x: number, y: number): void => {
    const next = nextTapState(taps, Date.now(), x, y, timeoutMs, TAP_RADIUS_DP);
    if (resetTimer.current) clearTimeout(resetTimer.current);
    if (next.count >= count) {
      setTaps(null);
      setSucceeded(true);
      resetTimer.current = setTimeout(() => setSucceeded(false), 2500);
      return;
    }
    setSucceeded(false);
    setTaps(next);
    resetTimer.current = setTimeout(() => setTaps(null), timeoutMs + 200);
  };

  return (
    <View
      style={[styles.practice, succeeded && styles.practiceDone]}
      onStartShouldSetResponder={() => true}
      onResponderRelease={(e) => onTap(e.nativeEvent.pageX, e.nativeEvent.pageY)}
    >
      <Text style={[styles.practiceText, succeeded && styles.practiceTextDone]}>
        {succeeded ? done : taps ? `${taps.count} / ${count}` : hint}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  scroll: { flexGrow: 1, justifyContent: 'center', paddingVertical: Spacing.xxxl, paddingHorizontal: Spacing.screenHorizontal },
  column: { width: '100%', maxWidth: 560, alignSelf: 'center' },
  progress: { fontSize: 13, fontWeight: '600', color: Colors.textHint, textTransform: 'uppercase', letterSpacing: 0.6, textAlign: 'center', marginBottom: Spacing.md },
  logoCircle: { alignSelf: 'center', width: 96, height: 96, borderRadius: 48, backgroundColor: Colors.primaryLight, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.lg },
  logoImage: { width: 64, height: 64 },
  title: { fontSize: 26, fontWeight: '700', color: Colors.textPrimary, textAlign: 'center', marginBottom: Spacing.sm },
  text: { fontSize: 16, lineHeight: 23, color: Colors.textSecondary, textAlign: 'center', marginBottom: Spacing.xl },
  gap: { marginTop: Spacing.lg },
  gapSmall: { marginTop: Spacing.sm },
  linkButton: { alignSelf: 'center', paddingVertical: Spacing.md, paddingHorizontal: Spacing.lg, marginTop: Spacing.xs },
  linkButtonLeft: { alignSelf: 'flex-start', paddingVertical: Spacing.sm },
  link: { fontSize: 15, fontWeight: '600', color: Colors.primary },
  card: { marginTop: Spacing.xl, padding: Spacing.lg, borderRadius: Spacing.cardRadius, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.xs },
  cardIcon: { marginRight: Spacing.sm },
  cardTitle: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.xs },
  cardText: { fontSize: 14, lineHeight: 20, color: Colors.textSecondary, marginTop: Spacing.xs },
  cardHint: { fontSize: 13, lineHeight: 18, color: Colors.textHint, marginTop: Spacing.md, textAlign: 'center' },
  option: { flexDirection: 'row', alignItems: 'flex-start', padding: Spacing.lg, marginBottom: Spacing.md, borderRadius: Spacing.cardRadius, backgroundColor: Colors.surface, borderWidth: 2, borderColor: Colors.border },
  optionOn: { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
  optionIcon: { marginRight: Spacing.md, marginTop: 2 },
  optionBody: { flex: 1 },
  optionTitle: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary },
  optionText: { fontSize: 14, lineHeight: 20, color: Colors.textSecondary, marginTop: 2 },
  note: { flexDirection: 'row', alignItems: 'flex-start', padding: Spacing.md, borderRadius: Spacing.cardRadius, backgroundColor: Colors.infoLight },
  readyIcon: { alignSelf: 'center', marginBottom: Spacing.md },
  practice: { marginTop: Spacing.lg, height: 90, borderRadius: Spacing.cardRadius, borderWidth: 2, borderStyle: 'dashed', borderColor: Colors.primary, backgroundColor: Colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  practiceDone: { borderColor: Colors.success, backgroundColor: Colors.successLight },
  practiceText: { fontSize: 18, fontWeight: '700', color: Colors.primary },
  practiceTextDone: { color: Colors.successDark },
  errorText: { fontSize: 14, color: Colors.error, textAlign: 'center', marginTop: Spacing.md },
});

export default SetupWizardScreen;
