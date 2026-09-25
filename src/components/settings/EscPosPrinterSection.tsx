/**
 * FreeKiosk v2.0 - ESC/POS Printer Settings
 * Printer status, print width, feed, cut, origin restriction and a test page for Silent Print
 */

import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';

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

const STATE_LABELS: Record<PrinterStatus['state'], string> = {
  ready: 'Ready',
  no_printer: 'No printer detected',
  no_permission: 'Access not granted',
  paper_out: 'Out of paper',
  error: 'Error',
};

const ERROR_MESSAGES: Record<string, string> = {
  NO_PRINTER: 'No printer is attached. Check the cable and the USB adapter.',
  NO_PERMISSION: 'Access to the printer has not been granted yet.',
  PAPER_OUT: 'The printer is out of paper.',
  OPEN_FAILED: 'The printer could not be opened. Another app may be holding it.',
  WRITE_FAILED: 'The printer stopped accepting data part-way through.',
  PAGE_RENDER_FAILED: 'The page could not be rendered for printing.',
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
          'Access denied',
          'The printer cannot be used until access is granted.',
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
      const message = ERROR_MESSAGES[error?.code] ?? error?.message ?? 'Unknown error';
      Alert.alert('Test page failed', message);
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
          <Text style={[styles.statusText, { color: tone }]}>{STATE_LABELS[state]}</Text>
        </View>

        {printer && (
          <>
            <Text style={styles.detail}>{printer.name}</Text>
            <Text style={styles.detailMuted}>
              {printer.commandSet ? `Commands: ${printer.commandSet}` : 'Command set not reported'}
              {printer.hardwareId ? `  ·  ${printer.hardwareId}` : ''}
            </Text>
          </>
        )}
        {status?.paper === 'unknown' && state === 'ready' && (
          <Text style={styles.detailMuted}>This printer does not report paper level.</Text>
        )}

        <View style={styles.actions}>
          <SettingsButton
            title="Refresh"
            icon="refresh"
            variant="outline"
            size="small"
            fullWidth={false}
            loading={checking}
            onPress={refresh}
          />
          {state === 'no_permission' && (
            <SettingsButton
              title="Grant access"
              icon="lock-open"
              size="small"
              fullWidth={false}
              onPress={handleGrantAccess}
            />
          )}
        </View>
      </View>

      <SettingsInput
        label="Print width (dots)"
        hint="Printable width in dots (set according to the printer's specification)"
        value={String(widthDots)}
        onChangeText={(text) => onWidthDotsChange(parseInt(text, 10) || 0)}
        placeholder={String(DEFAULT_ESC_POS_WIDTH_DOTS)}
        keyboardType="number-pad"
      />

      <SettingsSlider
        label="Feed after printing"
        hint="Blank lines fed at the end of each print job"
        value={feedLines}
        onValueChange={onFeedLinesChange}
        minimumValue={0}
        maximumValue={10}
        step={1}
        formatValue={(value) => `${Math.round(value)} lines`}
      />

      <SettingsSwitch
        label="Cut paper"
        hint="Automatically cut after each print job (does not affect printers without cutters)"
        value={cut}
        onValueChange={onCutChange}
      />

      <SettingsSwitch
        label="Restrict printing by origin"
        hint="Only pages from the origins you list can use window.FreeKiosk.silentPrinter"
        value={origins !== null}
        onValueChange={(enabled) => onOriginsChange(enabled ? [] : null)}
      />

      {origins !== null && (
        <UrlListEditor
          urls={origins}
          onUrlsChange={onOriginsChange}
          maxUrls={0}
          placeholder="https://app.example.com"
          emptyTitle="No origins allowed"
          emptyHint="No page can print until you add one"
        />
      )}

      <SettingsButton
        title="Print test page"
        icon="printer"
        variant="secondary"
        loading={printing}
        disabled={state === 'no_printer'}
        onPress={handleTestPage}
      />

      <SettingsInfoBox variant="info">
        <Text style={styles.infoText}>
          {'Web pages print silently by calling window.FreeKiosk.silentPrinter.print() or printImage(). print() lays the page out so one CSS pixel is one dot.\n\n'}
          {'window.print() is not affected: it opens the Android print dialog when Window Printing is enabled, and does nothing otherwise.\n\n'}
          {'For access that survives reboots: plug the printer in, then choose FreeKiosk and tick "Always open". The button above only grants access until the printer is unplugged, and lock task mode suppresses that dialog entirely.\n\n'}
          {'Printers exposing a vendor-specific USB interface instead of the standard printer class still print, but cannot report paper level.'}
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
