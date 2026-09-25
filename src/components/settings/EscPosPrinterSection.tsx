/**
 * FreeKiosk v2.0 - ESC/POS Printer Settings
 * Printer status, print width, feed, cut, origin restriction and a test page for Silent Print
 */

import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import { useTranslation } from 'react-i18next';

import Icon from '../Icon';
import { Colors, FontSizes, Spacing } from '../../theme';
import SilentPrintModule, {
  DEFAULT_ESC_POS_WIDTH_DOTS,
  type PrinterStatus,
} from '../../utils/SilentPrintModule';
import SettingsButton from './SettingsButton';
import SettingsInfoBox from './SettingsInfoBox';
import SettingsInput from './SettingsInput';
import SettingsSlider from './SettingsSlider';
import SettingsSwitch from './SettingsSwitch';
import UrlListEditor from './UrlListEditor';

interface EscPosPrinterSectionProps {
  widthDots: number;
  onWidthDotsChange: (value: number) => void;
  cut: boolean;
  onCutChange: (value: boolean) => void;
  feedLines: number;
  onFeedLinesChange: (value: number) => void;
  /** null = any page may print; [] = no page may */
  origins: string[] | null;
  onOriginsChange: (value: string[] | null) => void;
}

// Translation keys, resolved with t() at render time
const STATE_LABELS: Record<PrinterStatus['state'], string> = {
  ready: 'components.escPos.stateReady',
  no_printer: 'components.escPos.stateNoPrinter',
  no_permission: 'components.escPos.stateNoPermission',
  paper_out: 'components.escPos.statePaperOut',
  error: 'components.escPos.stateError',
};

const ERROR_MESSAGES: Record<string, string> = {
  NO_PRINTER: 'components.escPos.errorNoPrinter',
  NO_PERMISSION: 'components.escPos.errorNoPermission',
  PAPER_OUT: 'components.escPos.errorPaperOut',
  OPEN_FAILED: 'components.escPos.errorOpenFailed',
  WRITE_FAILED: 'components.escPos.errorWriteFailed',
  PAGE_RENDER_FAILED: 'components.escPos.errorPageRender',
};

const EscPosPrinterSection: React.FC<EscPosPrinterSectionProps> = ({
  widthDots,
  onWidthDotsChange,
  cut,
  onCutChange,
  feedLines,
  onFeedLinesChange,
  origins,
  onOriginsChange,
}) => {
  const { t } = useTranslation();
  const [status, setStatus] = useState<PrinterStatus | null>(null);
  const [checking, setChecking] = useState(false);
  const [printing, setPrinting] = useState(false);

  const refresh = useCallback(async (): Promise<PrinterStatus> => {
    setChecking(true);
    try {
      const next = await SilentPrintModule.status();
      setStatus(next);
      return next;
    } catch (error) {
      console.error('[EscPosPrinter] Status failed:', error);
      const failed: PrinterStatus = { state: 'error', paper: 'unknown', printer: null };
      setStatus(failed);
      return failed;
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleGrantAccess = async () => {
    try {
      await SilentPrintModule.requestPermission();
      // Judged on the printer's actual state, not on what the request reported.
      const next = await refresh();
      if (next.state === 'no_permission') {
        Alert.alert(
          t('components.escPos.accessDeniedTitle'),
          t('components.escPos.accessDeniedMessage'),
        );
      }
    } catch (error) {
      console.error('[EscPosPrinter] Permission request failed:', error);
    }
  };

  const handleTestPage = async () => {
    setPrinting(true);
    try {
      await SilentPrintModule.printTestPage({ widthDots, cut, feedLines });
    } catch (error: any) {
      const key = ERROR_MESSAGES[error?.code];
      const message = key ? t(key) : error?.message ?? t('components.escPos.unknownError');
      Alert.alert(t('components.escPos.testPageFailed'), message);
    } finally {
      setPrinting(false);
      refresh();
    }
  };

  const printer = status?.printer ?? null;
  const state = status?.state ?? 'error';
  const tone =
    state === 'ready' ? Colors.success : state === 'no_printer' ? Colors.textSecondary : Colors.warning;

  return (
    <>
      <View style={styles.card}>
        <View style={styles.statusRow}>
          <Icon
            name={state === 'ready' ? 'check-circle' : 'alert-circle'}
            size={18}
            color={tone}
          />
          <Text style={[styles.statusText, { color: tone }]}>{t(STATE_LABELS[state])}</Text>
        </View>

        {printer && (
          <>
            <Text style={styles.detail}>{printer.name}</Text>
            <Text style={styles.detailMuted}>
              {printer.commandSet
                ? t('components.escPos.commandSet', { commandSet: printer.commandSet })
                : t('components.escPos.commandSetUnknown')}
              {printer.hardwareId ? `  ·  ${printer.hardwareId}` : ''}
            </Text>
          </>
        )}
        {status?.paper === 'unknown' && state === 'ready' && (
          <Text style={styles.detailMuted}>{t('components.escPos.noPaperLevel')}</Text>
        )}

        <View style={styles.actions}>
          <SettingsButton
            title={t('components.escPos.refresh')}
            icon="refresh"
            variant="outline"
            size="small"
            fullWidth={false}
            loading={checking}
            onPress={refresh}
          />
          {state === 'no_permission' && (
            <SettingsButton
              title={t('components.escPos.grantAccess')}
              icon="lock-open"
              size="small"
              fullWidth={false}
              onPress={handleGrantAccess}
            />
          )}
        </View>
      </View>

      <SettingsInput
        label={t('components.escPos.widthDots')}
        hint={t('components.escPos.widthDotsHint')}
        value={String(widthDots)}
        onChangeText={(text) => onWidthDotsChange(parseInt(text, 10) || 0)}
        placeholder={String(DEFAULT_ESC_POS_WIDTH_DOTS)}
        keyboardType="number-pad"
      />

      <SettingsSlider
        label={t('components.escPos.feedLines')}
        hint={t('components.escPos.feedLinesHint')}
        value={feedLines}
        onValueChange={onFeedLinesChange}
        minimumValue={0}
        maximumValue={10}
        step={1}
        formatValue={(value) => t('components.escPos.feedLinesValue', { count: Math.round(value) })}
      />

      <SettingsSwitch
        label={t('components.escPos.cut')}
        hint={t('components.escPos.cutHint')}
        value={cut}
        onValueChange={onCutChange}
      />

      <SettingsSwitch
        label={t('components.escPos.restrictOrigins')}
        hint={t('components.escPos.restrictOriginsHint')}
        value={origins !== null}
        onValueChange={(enabled) => onOriginsChange(enabled ? [] : null)}
      />

      {origins !== null && (
        <UrlListEditor
          urls={origins}
          onUrlsChange={onOriginsChange}
          maxUrls={0}
          placeholder="https://app.example.com"
          emptyTitle={t('components.escPos.noOrigins')}
          emptyHint={t('components.escPos.noOriginsHint')}
        />
      )}

      <SettingsButton
        title={t('components.escPos.printTestPage')}
        icon="printer"
        variant="secondary"
        loading={printing}
        disabled={state === 'no_printer'}
        onPress={handleTestPage}
      />

      <SettingsInfoBox variant="info">
        <Text style={styles.infoText}>
          {t('components.escPos.info')}
        </Text>
      </SettingsInfoBox>
    </>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderColor: Colors.border,
    borderWidth: 1,
    borderRadius: 8,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  statusText: {
    fontSize: FontSizes.md,
    fontWeight: '600',
  },
  detail: {
    marginTop: Spacing.sm,
    fontSize: FontSizes.md,
    color: Colors.textPrimary,
  },
  detailMuted: {
    marginTop: 2,
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  infoText: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
});

export default EscPosPrinterSection;
