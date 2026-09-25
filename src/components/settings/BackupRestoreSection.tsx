/**
 * FreeKiosk v1.3 - BackupRestoreSection Component
 * UI component for backup and restore functionality
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  FlatList,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Colors, Spacing, Typography } from '../../theme';
import Icon from '../Icon';
import {
  buildBackupJson,
  importBackup,
  importBackupFromContent,
  parseBackupContent,
  listBackupFiles,
  deleteBackupFile,
  readBackupFile,
  BackupData,
} from '../../utils/BackupService';
import FilePickerModule from '../../utils/FilePickerModule';
import { useTranslation } from 'react-i18next';

interface BackupFile {
  name: string;
  path: string;
  date: string;
}

interface BackupRestoreSectionProps {
  onRestoreComplete?: () => void;
}

const BackupRestoreSection: React.FC<BackupRestoreSectionProps> = ({
  onRestoreComplete,
}) => {
  const { t } = useTranslation();
  const [isExporting, setIsExporting] = useState(false);
  const [showRestoreModal, setShowRestoreModal] = useState(false);
  const [backupFiles, setBackupFiles] = useState<BackupFile[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [selectedBackup, setSelectedBackup] = useState<BackupFile | null>(null);
  const [backupPreview, setBackupPreview] = useState<BackupData | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const [browsedContent, setBrowsedContent] = useState<string | null>(null);
  const [browsedFileName, setBrowsedFileName] = useState<string | null>(null);

  const loadBackupFiles = async () => {
    setLoadingFiles(true);
    try {
      const files = await listBackupFiles();
      setBackupFiles(files);
    } catch (error) {
      console.error('Error loading backup files:', error);
    } finally {
      setLoadingFiles(false);
    }
  };

  const handleExportBackup = async () => {
    setIsExporting(true);
    try {
      // Build JSON content first
      const built = await buildBackupJson();
      if (!built.success || !built.json || !built.filename) {
        Alert.alert(t('components.backupRestore.exportFailed'), built.error || t('components.backupRestore.prepareFailedMessage'), [{ text: t('components.backupRestore.ok') }]);
        return;
      }
      // Use SAF "Save As" dialog — works on all Android versions without storage permissions
      const saved = await FilePickerModule.saveJsonFile(built.json, built.filename);
      Alert.alert(
        t('components.backupRestore.backupCreated'),
        t('components.backupRestore.exportSuccess', { name: saved.name }),
        [{ text: t('components.backupRestore.ok') }]
      );
    } catch (error: any) {
      if (error?.code === 'PICKER_CANCELLED') return;
      Alert.alert(t('components.backupRestore.exportFailed'), error?.message || String(error), [{ text: t('components.backupRestore.ok') }]);
    } finally {
      setIsExporting(false);
    }
  };

  const handleOpenRestoreModal = async () => {
    setShowRestoreModal(true);
    await loadBackupFiles();
  };

  const handleSelectBackup = async (file: BackupFile) => {
    // Clear any browsed file selection
    setBrowsedContent(null);
    setBrowsedFileName(null);
    setSelectedBackup(file);
    // Load preview
    const result = await readBackupFile(file.path);
    if (result.success && result.data) {
      setBackupPreview(result.data);
    } else {
      setBackupPreview(null);
    }
  };

  const handleBrowseFile = async () => {
    if (Platform.OS !== 'android') {
      Alert.alert(t('components.backupRestore.notSupported'), t('components.backupRestore.fileBrowsingAndroidOnly'));
      return;
    }

    try {
      const result = await FilePickerModule.pickJsonFile();
      if (result && result.content) {
        const parsed = parseBackupContent(result.content);
        if (parsed.success && parsed.data) {
          // Clear any previous file-based selection
          setSelectedBackup(null);
          setBrowsedContent(result.content);
          setBrowsedFileName(result.name || t('components.backupRestore.selectedBackupDefault'));
          setBackupPreview(parsed.data);
        } else {
          Alert.alert(
            t('components.backupRestore.invalidBackup'),
            parsed.error || t('components.backupRestore.notValidBackup'),
            [{ text: t('components.backupRestore.ok') }]
          );
        }
      }
    } catch (error: any) {
      if (error?.code === 'PICKER_CANCELLED') return;
      console.error('Browse file error:', error);
      Alert.alert(t('components.backupRestore.error'), t('components.backupRestore.browseFileFailed', { error: error?.message || String(error) }));
    }
  };

  const handleRestoreBrowsedBackup = async () => {
    if (!browsedContent) return;

    Alert.alert(
      t('components.backupRestore.restoreConfigTitle'),
      t('components.backupRestore.restoreFromNamedMessage', { name: browsedFileName }),
      [
        { text: t('components.backupRestore.cancel'), style: 'cancel' },
        {
          text: t('components.backupRestore.restore'),
          style: 'destructive',
          onPress: async () => {
            setIsRestoring(true);
            try {
              const result = await importBackupFromContent(browsedContent, browsedFileName || undefined);
              if (result.success) {
                let message = t('components.backupRestore.restoreSuccessBase');
                if (result.warning) {
                  message += `\n\n${result.warning}`;
                }
                message += t('components.backupRestore.restartNote');

                Alert.alert(t('components.backupRestore.restoreCompleteTitle'), message, [
                  {
                    text: t('components.backupRestore.ok'),
                    onPress: () => {
                      setShowRestoreModal(false);
                      setSelectedBackup(null);
                      setBackupPreview(null);
                      setBrowsedContent(null);
                      setBrowsedFileName(null);
                      onRestoreComplete?.();
                    },
                  },
                ]);
              } else {
                Alert.alert(
                  t('components.backupRestore.restoreFailedTitle'),
                  result.error || t('components.backupRestore.unknownError'),
                  [{ text: t('components.backupRestore.ok') }]
                );
              }
            } finally {
              setIsRestoring(false);
            }
          },
        },
      ]
    );
  };

  const handleRestoreBackup = async () => {
    if (!selectedBackup) return;

    Alert.alert(
      t('components.backupRestore.restoreConfigTitle'),
      t('components.backupRestore.restoreGenericMessage'),
      [
        { text: t('components.backupRestore.cancel'), style: 'cancel' },
        {
          text: t('components.backupRestore.restore'),
          style: 'destructive',
          onPress: async () => {
            setIsRestoring(true);
            try {
              const result = await importBackup(selectedBackup.path);
              if (result.success) {
                let message = t('components.backupRestore.restoreSuccessBase');
                if (result.warning) {
                  message += `\n\n${result.warning}`;
                }
                message += t('components.backupRestore.restartNote');

                Alert.alert(t('components.backupRestore.restoreCompleteTitle'), message, [
                  {
                    text: t('components.backupRestore.ok'),
                    onPress: () => {
                      setShowRestoreModal(false);
                      setSelectedBackup(null);
                      setBackupPreview(null);
                      onRestoreComplete?.();
                    },
                  },
                ]);
              } else {
                Alert.alert(
                  t('components.backupRestore.restoreFailedTitle'),
                  result.error || t('components.backupRestore.unknownError'),
                  [{ text: t('components.backupRestore.ok') }]
                );
              }
            } finally {
              setIsRestoring(false);
            }
          },
        },
      ]
    );
  };

  const handleDeleteBackup = async (file: BackupFile) => {
    Alert.alert(
      t('components.backupRestore.deleteBackupTitle'),
      t('components.backupRestore.deleteBackupMessage', { name: file.name }),
      [
        { text: t('components.backupRestore.cancel'), style: 'cancel' },
        {
          text: t('components.backupRestore.delete'),
          style: 'destructive',
          onPress: async () => {
            const result = await deleteBackupFile(file.path);
            if (result.success) {
              if (selectedBackup?.path === file.path) {
                setSelectedBackup(null);
                setBackupPreview(null);
              }
              await loadBackupFiles();
            } else {
              Alert.alert(t('components.backupRestore.error'), result.error || t('components.backupRestore.deleteFailed'));
            }
          },
        },
      ]
    );
  };

  const formatDate = (dateString: string): string => {
    if (!dateString) return t('components.backupRestore.unknownDate');
    try {
      const date = new Date(dateString);
      return date.toLocaleString();
    } catch {
      return dateString;
    }
  };

  const getSettingsCount = (data: BackupData | null): number => {
    if (!data?.settings) return 0;
    return Object.keys(data.settings).length;
  };

  const renderBackupItem = ({ item }: { item: BackupFile }) => {
    const isSelected = selectedBackup?.path === item.path;
    
    return (
      <TouchableOpacity
        style={[styles.backupItem, isSelected && styles.backupItemSelected]}
        onPress={() => handleSelectBackup(item)}
      >
        <View style={styles.backupItemContent}>
          <Icon
            name="format-list-bulleted"
            size={24}
            color={isSelected ? Colors.primary : Colors.textSecondary}
          />
          <View style={styles.backupItemInfo}>
            <Text
              style={[styles.backupItemName, isSelected && styles.backupItemNameSelected]}
              numberOfLines={1}
            >
              {item.name}
            </Text>
            <Text style={styles.backupItemDate}>
              {formatDate(item.date)}
            </Text>
          </View>
        </View>
        <TouchableOpacity
          style={styles.deleteButton}
          onPress={() => handleDeleteBackup(item)}
        >
          <Icon name="delete-outline" size={20} color={Colors.error} />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Icon name="content-copy" size={20} color={Colors.textSecondary} />
        <Text style={styles.headerTitle}>{t('components.backupRestore.headerTitle')}</Text>
      </View>

      <Text style={styles.description}>
        {t('components.backupRestore.description')}
      </Text>

      <View style={styles.buttonRow}>
        <TouchableOpacity
          style={[styles.actionButton, styles.exportButton]}
          onPress={handleExportBackup}
          disabled={isExporting}
        >
          {isExporting ? (
            <ActivityIndicator size="small" color={Colors.textOnPrimary} />
          ) : (
            <>
              <Icon name="upload" size={18} color={Colors.textOnPrimary} />
              <Text style={styles.actionButtonText}>{t('components.backupRestore.export')}</Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionButton, styles.importButton]}
          onPress={handleOpenRestoreModal}
        >
          <Icon name="download" size={18} color={Colors.primary} />
          <Text style={styles.importButtonText}>{t('components.backupRestore.import')}</Text>
        </TouchableOpacity>
      </View>

      {/* Restore Modal */}
      <Modal
        visible={showRestoreModal}
        animationType="slide"
        onRequestClose={() => setShowRestoreModal(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{t('components.backupRestore.selectBackupTitle')}</Text>
            <TouchableOpacity
              style={styles.modalCloseButton}
              onPress={() => {
                setShowRestoreModal(false);
                setSelectedBackup(null);
                setBackupPreview(null);
                setBrowsedContent(null);
                setBrowsedFileName(null);
              }}
            >
              <Icon name="close" size={22} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <View style={styles.modalContent}>
            {/* Browse Files Button (Android only - uses SAF to bypass Scoped Storage) */}
            {Platform.OS === 'android' && (
              <TouchableOpacity
                style={styles.browseButton}
                onPress={handleBrowseFile}
              >
                <Icon name="folder-open-outline" size={20} color={Colors.primary} />
                <Text style={styles.browseButtonText}>{t('components.backupRestore.browseDeviceButton')}</Text>
              </TouchableOpacity>
            )}

            {/* Browsed file indicator */}
            {browsedFileName && browsedContent && (
              <View style={styles.browsedFileIndicator}>
                <Icon name="file-document-outline" size={18} color={Colors.success} />
                <Text style={styles.browsedFileText} numberOfLines={1}>
                  {t('components.backupRestore.selectedFile', { name: browsedFileName })}
                </Text>
                <TouchableOpacity
                  onPress={() => {
                    setBrowsedContent(null);
                    setBrowsedFileName(null);
                    setBackupPreview(null);
                  }}
                >
                  <Icon name="close-circle" size={18} color={Colors.textSecondary} />
                </TouchableOpacity>
              </View>
            )}

            {/* Backup List */}
            <View style={styles.listSection}>
              <Text style={styles.sectionTitle}>{t('components.backupRestore.availableBackups')}</Text>
              {loadingFiles ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="large" color={Colors.primary} />
                  <Text style={styles.loadingText}>{t('components.backupRestore.loadingBackups')}</Text>
                </View>
              ) : backupFiles.length === 0 ? (
                <View style={styles.emptyContainer}>
                  <Icon name="calendar" size={48} color={Colors.textHint} />
                  <Text style={styles.emptyText}>{t('components.backupRestore.noBackupsFound')}</Text>
                  <Text style={styles.emptySubtext}>
                    {t('components.backupRestore.noBackupsHint')}
                  </Text>
                </View>
              ) : (
                <FlatList
                  data={backupFiles}
                  keyExtractor={(item) => item.path}
                  renderItem={renderBackupItem}
                  style={styles.backupList}
                  contentContainerStyle={styles.backupListContent}
                />
              )}
            </View>

            {/* Preview Section */}
            {(selectedBackup || browsedContent) && (
              <View style={styles.previewSection}>
                <Text style={styles.sectionTitle}>{t('components.backupRestore.backupDetails')}</Text>
                <View style={styles.previewCard}>
                  {backupPreview ? (
                    <>
                      <View style={styles.previewRow}>
                        <Text style={styles.previewLabel}>{t('components.backupRestore.appVersion')}</Text>
                        <Text style={styles.previewValue}>{backupPreview.appVersion || t('components.backupRestore.unknown')}</Text>
                      </View>
                      <View style={styles.previewRow}>
                        <Text style={styles.previewLabel}>{t('components.backupRestore.exportDate')}</Text>
                        <Text style={styles.previewValue}>{formatDate(backupPreview.exportDate)}</Text>
                      </View>
                      <View style={styles.previewRow}>
                        <Text style={styles.previewLabel}>{t('components.backupRestore.settingsCount')}</Text>
                        <Text style={styles.previewValue}>{getSettingsCount(backupPreview)}</Text>
                      </View>
                      <View style={styles.previewRow}>
                        <Text style={styles.previewLabel}>{t('components.backupRestore.hadPin')}</Text>
                        <Text style={styles.previewValue}>
                          {backupPreview.hasPinConfigured ? t('components.backupRestore.yesNotIncluded') : t('components.backupRestore.no')}
                        </Text>
                      </View>
                      {browsedContent && (
                        <View style={styles.previewRow}>
                          <Text style={styles.previewLabel}>{t('components.backupRestore.source')}</Text>
                          <Text style={styles.previewValue}>{t('components.backupRestore.browsedFile')}</Text>
                        </View>
                      )}
                    </>
                  ) : (
                    <Text style={styles.previewError}>{t('components.backupRestore.previewError')}</Text>
                  )}
                </View>

                <TouchableOpacity
                  style={[
                    styles.restoreButton,
                    (!backupPreview || isRestoring) && styles.restoreButtonDisabled,
                  ]}
                  onPress={browsedContent ? handleRestoreBrowsedBackup : handleRestoreBackup}
                  disabled={!backupPreview || isRestoring}
                >
                  {isRestoring ? (
                    <ActivityIndicator size="small" color={Colors.textOnPrimary} />
                  ) : (
                    <>
                      <Icon name="refresh" size={18} color={Colors.textOnPrimary} />
                      <Text style={styles.restoreButtonText}>{t('components.backupRestore.restoreThisBackup')}</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.cardDefault,
    borderRadius: Spacing.cardRadius,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  headerTitle: {
    ...Typography.label,
    marginLeft: Spacing.sm,
    color: Colors.textPrimary,
  },
  description: {
    ...Typography.hint,
    color: Colors.textSecondary,
    marginBottom: Spacing.md,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.sm,
    borderRadius: Spacing.buttonRadius,
    gap: Spacing.xs,
  },
  exportButton: {
    backgroundColor: Colors.primary,
  },
  importButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  actionButtonText: {
    ...Typography.buttonSmall,
    color: Colors.textOnPrimary,
  },
  importButtonText: {
    ...Typography.buttonSmall,
    color: Colors.primary,
  },

  // Modal styles
  modalContainer: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.md,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  modalTitle: {
    ...Typography.sectionTitle,
    color: Colors.textPrimary,
  },
  modalCloseButton: {
    padding: Spacing.sm,
  },
  modalCloseButtonText: {
    fontSize: 24,
    color: Colors.textSecondary,
  },
  modalContent: {
    flex: 1,
    padding: Spacing.md,
  },

  // List section
  listSection: {
    flex: 1,
    marginBottom: Spacing.md,
  },

  // Browse button (SAF file picker)
  browseButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    borderRadius: Spacing.inputRadius,
    borderWidth: 1,
    borderColor: Colors.primary,
    borderStyle: 'dashed',
    marginBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  browseButtonText: {
    ...Typography.body,
    color: Colors.primary,
    fontWeight: '500',
  },
  browsedFileIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: Spacing.inputRadius,
    borderWidth: 1,
    borderColor: Colors.success,
    marginBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  browsedFileText: {
    ...Typography.body,
    color: Colors.success,
    flex: 1,
    fontWeight: '500',
  },
  sectionTitle: {
    ...Typography.label,
    color: Colors.textPrimary,
    marginBottom: Spacing.sm,
  },
  backupList: {
    flex: 1,
  },
  backupListContent: {
    paddingBottom: Spacing.md,
  },
  backupItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.surface,
    padding: Spacing.md,
    borderRadius: Spacing.inputRadius,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  backupItemSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLight,
  },
  backupItemContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  backupItemInfo: {
    flex: 1,
    marginLeft: Spacing.sm,
  },
  backupItemName: {
    ...Typography.body,
    color: Colors.textPrimary,
  },
  backupItemNameSelected: {
    color: Colors.primary,
    fontWeight: '600',
  },
  backupItemDate: {
    ...Typography.hint,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  deleteButton: {
    padding: Spacing.sm,
  },

  // Loading & Empty states
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: Spacing.xl,
  },
  loadingText: {
    ...Typography.body,
    color: Colors.textSecondary,
    marginTop: Spacing.sm,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: Spacing.xl,
  },
  emptyText: {
    ...Typography.body,
    color: Colors.textSecondary,
    marginTop: Spacing.sm,
  },
  emptySubtext: {
    ...Typography.hint,
    color: Colors.textHint,
    marginTop: Spacing.xs,
    textAlign: 'center',
  },

  // Preview section
  previewSection: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: Spacing.md,
  },
  previewCard: {
    backgroundColor: Colors.surface,
    padding: Spacing.md,
    borderRadius: Spacing.inputRadius,
    marginBottom: Spacing.md,
  },
  previewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.xs,
  },
  previewLabel: {
    ...Typography.body,
    color: Colors.textSecondary,
  },
  previewValue: {
    ...Typography.body,
    color: Colors.textPrimary,
    fontWeight: '500',
  },
  previewError: {
    ...Typography.body,
    color: Colors.error,
    textAlign: 'center',
  },
  restoreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.success,
    paddingVertical: Spacing.md,
    borderRadius: Spacing.buttonRadius,
    gap: Spacing.sm,
  },
  restoreButtonDisabled: {
    backgroundColor: Colors.textDisabled,
  },
  restoreButtonText: {
    ...Typography.buttonSmall,
    color: Colors.textOnPrimary,
  },
});

export default BackupRestoreSection;
