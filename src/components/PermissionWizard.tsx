/**
 * PermissionWizard - guided post-enrollment permission setup.
 *
 * Shown right after a device enrolls (and reachable from settings). Its job is
 * to get the device to its fullest capability set:
 *
 *  - Device Owner: nothing to do, everything is auto-granted at app start
 *    (see MainActivity request*Permission()) and via the DPM. The wizard just
 *    reassures and offers to enable the accessibility service programmatically.
 *  - Non Device Owner: walks the user through each runtime + special-access
 *    permission, with a deep-link into the relevant system screen. Statuses
 *    refresh when the app returns to the foreground.
 *
 * On close it fires a heartbeat so the refreshed capability list reaches the
 * cloud immediately (CloudSyncService.sendHeartbeat recomputes getCapabilities).
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  AppState,
  Modal,
  PermissionsAndroid,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import KioskModule from '../utils/KioskModule';
import AccessibilityModule from '../utils/AccessibilityModule';
import OverlayPermissionModule from '../utils/OverlayPermissionModule';
import { CloudSyncService } from '../utils/CloudSyncService';
import Icon, { IconName } from './Icon';

interface Props {
  visible: boolean;
  onClose: () => void;
}

type ItemKey = 'camera' | 'location' | 'accessibility' | 'overlay' | 'usage' | 'battery';

interface PermItem {
  key: ItemKey;
  label: string;
  description: string;
  icon: IconName;
  check: (isDeviceOwner: boolean) => Promise<boolean>;
  action: (isDeviceOwner: boolean) => Promise<void>;
}

async function safeBool(p: Promise<boolean> | undefined): Promise<boolean> {
  try {
    return p ? await p : false;
  } catch {
    return false;
  }
}

const ITEMS: PermItem[] = [
  {
    key: 'camera',
    label: 'Camera',
    description: 'Required for QR scanning, screenshots via camera and motion detection.',
    icon: 'camera',
    check: () => safeBool(PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.CAMERA) as Promise<boolean>),
    action: async () => {
      await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA);
    },
  },
  {
    key: 'location',
    label: 'Location',
    description: 'Lets the cloud geolocate the device and report Wi-Fi details.',
    icon: 'earth',
    check: () =>
      safeBool(PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION) as Promise<boolean>),
    action: async () => {
      await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
    },
  },
  {
    key: 'accessibility',
    label: 'Accessibility service',
    description: 'Suppresses the back button and gestures to keep the kiosk locked down.',
    icon: 'gesture-tap',
    check: isDO =>
      isDO
        ? Promise.resolve(true)
        : safeBool(AccessibilityModule?.isAccessibilityServiceEnabled()),
    action: async isDO => {
      if (isDO) {
        await AccessibilityModule?.enableViaDeviceOwner().catch(() => {});
      } else {
        await AccessibilityModule?.openAccessibilitySettings().catch(() => {});
      }
    },
  },
  {
    key: 'overlay',
    label: 'Display over other apps',
    description: 'Needed for blocking overlays and the status-bar guard.',
    icon: 'view-grid',
    check: () => safeBool(OverlayPermissionModule?.canDrawOverlays()),
    action: async () => {
      await OverlayPermissionModule?.requestOverlayPermission().catch(() => {});
    },
  },
  {
    key: 'usage',
    label: 'Usage access',
    description: 'Lets FreeKiosk detect and relaunch the foreground app in external-app mode.',
    icon: 'chart-bar',
    check: () => safeBool(KioskModule?.hasUsageStatsPermission()),
    action: async () => {
      await KioskModule?.requestUsageStatsPermission().catch(() => {});
    },
  },
  {
    key: 'battery',
    label: 'Ignore battery optimizations',
    description: 'Keeps the cloud heartbeat alive so the device can be woken remotely.',
    icon: 'flash',
    // The request is a no-op once the exemption is held, so without reading the state
    // back the step stayed listed as outstanding for ever and tapping it did nothing
    // visible. PowerManager does answer this one.
    check: () => safeBool(KioskModule?.isIgnoringBatteryOptimizations()),
    action: async () => {
      await KioskModule?.requestIgnoreBatteryOptimizations().catch(() => {});
    },
  },
];

export default function PermissionWizard({ visible, onClose }: Props) {
  const [isDeviceOwner, setIsDeviceOwner] = useState(false);
  const [statuses, setStatuses] = useState<Record<ItemKey, boolean>>(
    {} as Record<ItemKey, boolean>,
  );
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (Platform.OS !== 'android') {
      setLoading(false);
      return;
    }
    const dor = await safeBool(KioskModule?.isDeviceOwner());
    setIsDeviceOwner(dor);
    const entries = await Promise.all(
      ITEMS.map(async item => [item.key, await item.check(dor)] as const),
    );
    setStatuses(Object.fromEntries(entries) as Record<ItemKey, boolean>);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (visible) {
      setLoading(true);
      refresh();
    }
  }, [visible, refresh]);

  // Special-access grants happen in a system settings screen, so re-check when
  // the app comes back to the foreground.
  useEffect(() => {
    if (!visible) return;
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') refresh();
    });
    return () => sub.remove();
  }, [visible, refresh]);

  const handleAction = useCallback(
    async (item: PermItem) => {
      await item.action(isDeviceOwner);
      // Runtime permissions resolve inline; re-check right away.
      refresh();
    },
    [isDeviceOwner, refresh],
  );

  const handleClose = useCallback(() => {
    // Republish the refreshed capability list to the cloud.
    CloudSyncService.sendHeartbeat(undefined, { force: true }).catch(() => {});
    onClose();
  }, [onClose]);

  const grantedCount = ITEMS.filter(i => statuses[i.key]).length;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={handleClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Set up permissions</Text>
          <TouchableOpacity onPress={handleClose} hitSlop={12}>
            <Icon name="close" size={26} color="#fff" />
          </TouchableOpacity>
        </View>

        <View style={[styles.banner, isDeviceOwner ? styles.bannerOk : styles.bannerInfo]}>
          <Icon name={isDeviceOwner ? 'shield-check' : 'shield'} size={22} color="#fff" />
          <Text style={styles.bannerText}>
            {isDeviceOwner
              ? 'Managed mode (Device Owner). Permissions are granted automatically; you can finish right away.'
              : 'Standard mode. Grant the permissions below to unlock every feature. Reboot, silent install and true screen-off need Managed mode (factory reset + provisioning QR).'}
          </Text>
        </View>

        <ScrollView contentContainerStyle={styles.list}>
          {ITEMS.map(item => {
            const granted = statuses[item.key];
            return (
              <View key={item.key} style={styles.row}>
                <Icon name={item.icon} size={24} color={granted ? '#22c55e' : '#94a3b8'} />
                <View style={styles.rowText}>
                  <Text style={styles.rowLabel}>{item.label}</Text>
                  <Text style={styles.rowDesc}>{item.description}</Text>
                </View>
                {granted ? (
                  <View style={styles.grantedChip}>
                    <Icon name="check" size={16} color="#22c55e" />
                    <Text style={styles.grantedText}>Granted</Text>
                  </View>
                ) : (
                  <TouchableOpacity style={styles.grantBtn} onPress={() => handleAction(item)}>
                    <Text style={styles.grantBtnText}>Grant</Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          })}
        </ScrollView>

        <View style={styles.footer}>
          <Text style={styles.progress}>
            {loading ? 'Checking...' : `${grantedCount} / ${ITEMS.length} granted`}
          </Text>
          <TouchableOpacity style={styles.doneBtn} onPress={handleClose}>
            <Text style={styles.doneBtnText}>Done</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
  },
  title: { color: '#fff', fontSize: 20, fontWeight: '700' },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 12,
    borderRadius: 12,
  },
  bannerOk: { backgroundColor: '#166534' },
  bannerInfo: { backgroundColor: '#1e3a5f' },
  bannerText: { color: '#e2e8f0', fontSize: 13, flex: 1, lineHeight: 18 },
  list: { padding: 16, gap: 12 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 14,
  },
  rowText: { flex: 1 },
  rowLabel: { color: '#fff', fontSize: 15, fontWeight: '600' },
  rowDesc: { color: '#94a3b8', fontSize: 12, marginTop: 2, lineHeight: 16 },
  grantedChip: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  grantedText: { color: '#22c55e', fontSize: 13, fontWeight: '600' },
  grantBtn: {
    backgroundColor: '#3b82f6',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  grantBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
  },
  progress: { color: '#94a3b8', fontSize: 14 },
  doneBtn: {
    backgroundColor: '#22c55e',
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 10,
  },
  doneBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
