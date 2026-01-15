/**
 * FreeKiosk v1.2 - Settings Styles
 * Centralized styles for all settings screens
 */

import { StyleSheet } from 'react-native';
import { Colors, Spacing, Typography } from '../../../theme';

export const settingsStyles = StyleSheet.create({
  // Main container
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  
  // Scrollable content
  scrollContent: {
    padding: Spacing.screenHorizontal,
    paddingBottom: 40,
  },
  
  // Header area
  header: {
    backgroundColor: Colors.surface,
    paddingTop: Spacing.lg,
    paddingBottom: 0,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  
  headerTitle: {
    ...Typography.title,
    textAlign: 'center',
    paddingHorizontal: Spacing.screenHorizontal,
  },
  
  // Device Owner Badge
  deviceOwnerBadge: {
    marginHorizontal: Spacing.screenHorizontal,
    marginTop: Spacing.md,
    marginBottom: Spacing.lg,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: Spacing.inputRadius,
    alignItems: 'center',
  },
  
  deviceOwnerBadgeActive: {
    backgroundColor: Colors.successLight,
    borderWidth: 1,
    borderColor: Colors.success,
  },
  
  deviceOwnerBadgeInactive: {
    backgroundColor: Colors.warningLight,
    borderWidth: 1,
    borderColor: Colors.warning,
  },
  
  deviceOwnerBadgeText: {
    fontSize: 14,
    fontWeight: '600',
  },
  
  deviceOwnerBadgeTextActive: {
    color: Colors.successDark,
  },
  
  deviceOwnerBadgeTextInactive: {
    color: Colors.warningDark,
  },
  
  // Tab bar
  tabBar: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
  },
  
  tab: {
    flex: 1,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
  },
  
  tabActive: {
    borderBottomColor: Colors.primary,
  },
  
  tabContent: {
    alignItems: 'center',
  },
  
  tabIcon: {
    fontSize: 20,
    marginBottom: 4,
  },
  
  tabLabel: {
    ...Typography.tab,
    color: Colors.tabInactive,
  },
  
  tabLabelActive: {
    color: Colors.tabActive,
    fontWeight: '600',
  },
  
  // Section spacing
  sectionTitle: {
    ...Typography.sectionTitle,
    marginTop: Spacing.lg,
    marginBottom: Spacing.md,
  },
  
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  
  modalContent: {
    backgroundColor: Colors.surface,
    borderRadius: Spacing.cardRadius,
    padding: Spacing.xxl,
    marginHorizontal: Spacing.xxl,
    alignItems: 'center',
    elevation: 10,
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  
  modalTitle: {
    ...Typography.sectionTitle,
    marginBottom: Spacing.md,
  },
  
  modalText: {
    ...Typography.body,
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  
  modalHint: {
    ...Typography.hint,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  
  // App picker modal
  appPickerContainer: {
    flex: 1,
    backgroundColor: Colors.surface,
  },
  
  appPickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.lg,
    backgroundColor: Colors.primary,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  
  appPickerTitle: {
    ...Typography.sectionTitle,
    color: Colors.textOnPrimary,
  },
  
  appPickerCloseButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  
  appPickerCloseText: {
    fontSize: 28,
    color: Colors.textOnPrimary,
    fontWeight: 'bold',
  },
  
  appItem: {
    padding: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
    backgroundColor: Colors.surface,
  },
  
  appName: {
    ...Typography.label,
    marginBottom: 4,
  },
  
  appPackage: {
    ...Typography.mono,
  },
  
  // Version info
  versionText: {
    ...Typography.hint,
    textAlign: 'center',
    marginTop: Spacing.lg,
    marginBottom: Spacing.md,
  },
  
  // Loading indicator
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default settingsStyles;
