import React, { useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import {
  NetworkBlockRule,
  normalizeNetworkBlockInput,
  normalizeNetworkBlockRules,
  YOUTUBE_NETWORK_BLOCK_RULES,
} from '../../types/networkBlocking';
import { Colors, Spacing, Typography } from '../../theme';
import Icon from '../Icon';
import SettingsSwitch from './SettingsSwitch';

interface NetworkBlockingSectionProps {
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  rules: NetworkBlockRule[];
  onRulesChange: (rules: NetworkBlockRule[]) => void;
  isDeviceOwner: boolean;
}

const NetworkBlockingSection: React.FC<NetworkBlockingSectionProps> = ({
  enabled,
  onEnabledChange,
  rules,
  onRulesChange,
  isDeviceOwner,
}) => {
  const [input, setInput] = useState('');
  const youtubePresetComplete = useMemo(
    () => YOUTUBE_NETWORK_BLOCK_RULES.every(presetRule => rules.some(rule => rule.id === presetRule.id)),
    [rules],
  );

  const addRule = (): void => {
    const normalized = normalizeNetworkBlockInput(input);
    if (!normalized) {
      Alert.alert(
        'Invalid network rule',
        'Enter a website/domain, an IP address, or a CIDR range. Examples: youtube.com, 203.0.113.9, 203.0.113.0/24.',
      );
      return;
    }
    onRulesChange(normalizeNetworkBlockRules([...rules, normalized]));
    setInput('');
  };

  const addYoutubePreset = (): void => {
    onRulesChange(normalizeNetworkBlockRules([...rules, ...YOUTUBE_NETWORK_BLOCK_RULES]));
  };

  const removeRule = (rule: NetworkBlockRule): void => {
    onRulesChange(rules.filter(item => item.id !== rule.id));
  };

  return (
    <View>
      <SettingsSwitch
        label="Enable Network Protection"
        hint="Block selected websites, domains, IP addresses, and CIDR ranges across browsers and apps, independently of Lock Mode and Hidden Mode."
        value={enabled}
        onValueChange={onEnabledChange}
        disabled={!isDeviceOwner}
      />

      <View style={styles.infoBox}>
        <Icon name="shield-lock" size={18} color={Colors.info} style={styles.infoIcon} />
        <Text style={styles.infoText}>
          FreeKiosk uses Android&apos;s device-wide VPN routing and DNS filtering. Domain rules include every subdomain and refresh their current IP addresses to also catch apps using encrypted DNS.
        </Text>
      </View>

      {!isDeviceOwner && (
        <View style={styles.warningBox}>
          <Icon name="alert-circle-outline" size={18} color={Colors.warningDark} style={styles.infoIcon} />
          <Text style={styles.warningText}>Network Protection requires FreeKiosk to be Device Owner.</Text>
        </View>
      )}

      <View style={styles.warningBox}>
        <Icon name="alert-outline" size={18} color={Colors.warningDark} style={styles.infoIcon} />
        <Text style={styles.warningText}>
          Some services share CDN addresses. An IP fallback can occasionally block another site using the same server; remove the rule to restore it immediately.
        </Text>
      </View>

      <View style={styles.addRow}>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder="youtube.com or 203.0.113.0/24"
          placeholderTextColor={Colors.textHint}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          onSubmitEditing={addRule}
        />
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Add network block rule"
          style={[styles.addButton, !input.trim() && styles.disabled]}
          disabled={!input.trim()}
          onPress={addRule}
        >
          <Icon name="plus" size={21} color={Colors.textOnPrimary} />
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        accessibilityRole="button"
        style={[styles.presetButton, youtubePresetComplete && styles.disabled]}
        disabled={youtubePresetComplete}
        onPress={addYoutubePreset}
      >
        <Icon name="youtube" size={20} color={Colors.error} style={styles.presetIcon} />
        <Text style={styles.presetText}>
          {youtubePresetComplete ? 'YouTube preset added' : 'Add YouTube blocking preset'}
        </Text>
      </TouchableOpacity>

      {rules.length === 0 ? (
        <View style={styles.emptyState}>
          <Icon name="web-off" size={36} color={Colors.textDisabled} />
          <Text style={styles.emptyTitle}>No network rules</Text>
          <Text style={styles.emptyHint}>Add the YouTube preset for the first test.</Text>
        </View>
      ) : rules.map(rule => (
        <View key={rule.id} style={styles.ruleRow}>
          <View style={styles.ruleInfo}>
            <Text style={styles.ruleType}>{rule.type === 'domain' ? 'DOMAIN + SUBDOMAINS' : 'IP / CIDR'}</Text>
            <Text style={styles.ruleValue} numberOfLines={1}>{rule.value}</Text>
          </View>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={`Stop blocking ${rule.value}`}
            style={styles.removeButton}
            onPress={() => removeRule(rule)}
          >
            <Icon name="delete-outline" size={22} color={Colors.error} />
          </TouchableOpacity>
        </View>
      ))}

      {rules.length > 0 && (
        <View style={[styles.statusBox, enabled && isDeviceOwner ? styles.statusActive : styles.statusSaved]}>
          <Icon
            name={enabled && isDeviceOwner ? 'shield-check' : 'clock-outline'}
            size={17}
            color={enabled && isDeviceOwner ? Colors.successDark : Colors.textSecondary}
            style={styles.infoIcon}
          />
          <Text style={styles.statusText}>
            {enabled && isDeviceOwner
              ? `${rules.length} network rule${rules.length === 1 ? '' : 's'} will be enforced when you save`
              : `${rules.length} network rule${rules.length === 1 ? '' : 's'} saved; Network Protection is off`}
          </Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  infoBox: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: Colors.infoLight, borderRadius: 8, padding: 10, marginBottom: Spacing.sm },
  warningBox: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: Colors.warningLight, borderRadius: 8, padding: 10, marginBottom: Spacing.sm },
  infoIcon: { marginRight: 7 },
  infoText: { ...Typography.hint, flex: 1, color: Colors.infoDark },
  warningText: { ...Typography.hint, flex: 1, color: Colors.warningDark },
  addRow: { flexDirection: 'row', alignItems: 'center', marginTop: Spacing.sm, marginBottom: Spacing.sm },
  input: { flex: 1, minHeight: 46, borderWidth: 1, borderColor: Colors.border, borderRadius: 9, backgroundColor: Colors.surface, color: Colors.textPrimary, paddingHorizontal: 12 },
  addButton: { width: 46, height: 46, marginLeft: 8, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.primary },
  disabled: { opacity: 0.45 },
  presetButton: { minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.errorLight, borderRadius: 9, backgroundColor: Colors.surface, marginBottom: Spacing.md },
  presetIcon: { marginRight: 8 },
  presetText: { ...Typography.buttonSmall, color: Colors.errorDark },
  emptyState: { alignItems: 'center', paddingVertical: Spacing.lg },
  emptyTitle: { ...Typography.labelSmall, color: Colors.textSecondary, marginTop: Spacing.sm },
  emptyHint: { ...Typography.hint, color: Colors.textHint, marginTop: Spacing.xs },
  ruleRow: { minHeight: 58, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface, borderRadius: 9, paddingHorizontal: 10, marginBottom: 8 },
  ruleInfo: { flex: 1 },
  ruleType: { ...Typography.caption, color: Colors.primary, fontWeight: '700' },
  ruleValue: { ...Typography.mono, color: Colors.textPrimary, fontSize: 12, marginTop: 3 },
  removeButton: { padding: 8 },
  statusBox: { flexDirection: 'row', alignItems: 'center', borderRadius: 8, padding: 10, marginTop: Spacing.sm, borderWidth: 1 },
  statusActive: { backgroundColor: Colors.successLight, borderColor: Colors.success },
  statusSaved: { backgroundColor: Colors.surfaceVariant, borderColor: Colors.border },
  statusText: { ...Typography.hint, flex: 1, color: Colors.textSecondary, fontWeight: '600' },
});

export default NetworkBlockingSection;
