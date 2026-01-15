/**
 * FreeKiosk v1.2 - URL List Editor Component
 * Manage a list of URLs for rotation
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import { Colors, Spacing, Typography } from '../../theme';

interface UrlListEditorProps {
  urls: string[];
  onUrlsChange: (urls: string[]) => void;
  maxUrls?: number;
}

const UrlListEditor: React.FC<UrlListEditorProps> = ({
  urls,
  onUrlsChange,
  maxUrls = 10,
}) => {
  const [newUrl, setNewUrl] = useState('');

  const validateUrl = (url: string): boolean => {
    const trimmed = url.trim().toLowerCase();
    if (!trimmed) return false;
    
    // Basic validation - must have a domain
    if (!trimmed.includes('.')) return false;
    
    // Reject dangerous protocols
    if (trimmed.startsWith('file://') || 
        trimmed.startsWith('javascript:') || 
        trimmed.startsWith('data:')) {
      return false;
    }
    
    return true;
  };

  const normalizeUrl = (url: string): string => {
    let trimmed = url.trim();
    const lower = trimmed.toLowerCase();
    
    // Add https:// if no protocol
    if (!lower.startsWith('http://') && !lower.startsWith('https://')) {
      trimmed = 'https://' + trimmed;
    }
    
    return trimmed;
  };

  const handleAddUrl = () => {
    if (!newUrl.trim()) {
      Alert.alert('Error', 'Please enter a URL');
      return;
    }

    if (!validateUrl(newUrl)) {
      Alert.alert('Invalid URL', 'Please enter a valid URL (e.g., example.com)');
      return;
    }

    if (urls.length >= maxUrls) {
      Alert.alert('Limit Reached', `Maximum ${maxUrls} URLs allowed`);
      return;
    }

    const normalized = normalizeUrl(newUrl);
    
    // Check for duplicates
    if (urls.includes(normalized)) {
      Alert.alert('Duplicate', 'This URL is already in the list');
      return;
    }

    onUrlsChange([...urls, normalized]);
    setNewUrl('');
  };

  const handleRemoveUrl = (index: number) => {
    const newUrls = urls.filter((_, i) => i !== index);
    onUrlsChange(newUrls);
  };

  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    const newUrls = [...urls];
    [newUrls[index - 1], newUrls[index]] = [newUrls[index], newUrls[index - 1]];
    onUrlsChange(newUrls);
  };

  const handleMoveDown = (index: number) => {
    if (index === urls.length - 1) return;
    const newUrls = [...urls];
    [newUrls[index], newUrls[index + 1]] = [newUrls[index + 1], newUrls[index]];
    onUrlsChange(newUrls);
  };

  return (
    <View style={styles.container}>
      {/* URL List */}
      {urls.length > 0 ? (
        <View style={styles.urlList}>
          {urls.map((url, index) => (
            <View key={index} style={styles.urlItem}>
              <View style={styles.urlInfo}>
                <Text style={styles.urlIndex}>{index + 1}</Text>
                <Text style={styles.urlText} numberOfLines={1}>
                  {url.replace(/^https?:\/\//, '')}
                </Text>
              </View>
              
              <View style={styles.urlActions}>
                {/* Move buttons */}
                <TouchableOpacity
                  style={[styles.actionButton, index === 0 && styles.actionButtonDisabled]}
                  onPress={() => handleMoveUp(index)}
                  disabled={index === 0}
                >
                  <Text style={styles.actionButtonText}>▲</Text>
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={[styles.actionButton, index === urls.length - 1 && styles.actionButtonDisabled]}
                  onPress={() => handleMoveDown(index)}
                  disabled={index === urls.length - 1}
                >
                  <Text style={styles.actionButtonText}>▼</Text>
                </TouchableOpacity>
                
                {/* Delete button */}
                <TouchableOpacity
                  style={[styles.actionButton, styles.deleteButton]}
                  onPress={() => handleRemoveUrl(index)}
                >
                  <Text style={styles.deleteButtonText}>✕</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      ) : (
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateIcon}>📋</Text>
          <Text style={styles.emptyStateText}>No URLs added yet</Text>
          <Text style={styles.emptyStateHint}>Add URLs below to start rotation</Text>
        </View>
      )}

      {/* Add URL Input */}
      <View style={styles.addSection}>
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            value={newUrl}
            onChangeText={setNewUrl}
            placeholder="https://example.com"
            placeholderTextColor={Colors.textHint}
            keyboardType="url"
            autoCapitalize="none"
            autoCorrect={false}
            onSubmitEditing={handleAddUrl}
          />
          <TouchableOpacity
            style={[styles.addButton, urls.length >= maxUrls && styles.addButtonDisabled]}
            onPress={handleAddUrl}
            disabled={urls.length >= maxUrls}
          >
            <Text style={styles.addButtonText}>+</Text>
          </TouchableOpacity>
        </View>
        
        <Text style={styles.countText}>
          {urls.length} / {maxUrls} URLs
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginTop: Spacing.sm,
  },
  urlList: {
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  urlItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceVariant,
    borderRadius: Spacing.inputRadius,
    padding: Spacing.sm,
    paddingLeft: Spacing.md,
  },
  urlInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  urlIndex: {
    ...Typography.labelSmall,
    color: Colors.primary,
    backgroundColor: Colors.primaryLight,
    width: 24,
    height: 24,
    borderRadius: 12,
    textAlign: 'center',
    lineHeight: 24,
    overflow: 'hidden',
  },
  urlText: {
    ...Typography.body,
    flex: 1,
  },
  urlActions: {
    flexDirection: 'row',
    gap: 4,
  },
  actionButton: {
    width: 32,
    height: 32,
    borderRadius: 6,
    backgroundColor: Colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionButtonDisabled: {
    opacity: 0.3,
  },
  actionButtonText: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  deleteButton: {
    backgroundColor: Colors.errorLight,
  },
  deleteButtonText: {
    fontSize: 14,
    color: Colors.error,
    fontWeight: 'bold',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: Spacing.xl,
    backgroundColor: Colors.surfaceVariant,
    borderRadius: Spacing.inputRadius,
    marginBottom: Spacing.md,
  },
  emptyStateIcon: {
    fontSize: 32,
    marginBottom: Spacing.sm,
  },
  emptyStateText: {
    ...Typography.label,
    color: Colors.textSecondary,
  },
  emptyStateHint: {
    ...Typography.hint,
    marginTop: 4,
  },
  addSection: {
    gap: Spacing.xs,
  },
  inputRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  input: {
    flex: 1,
    height: 48,
    backgroundColor: Colors.surface,
    borderRadius: Spacing.inputRadius,
    borderWidth: 1,
    borderColor: Colors.divider,
    paddingHorizontal: Spacing.md,
    ...Typography.body,
    color: Colors.textPrimary,
  },
  addButton: {
    width: 48,
    height: 48,
    backgroundColor: Colors.primary,
    borderRadius: Spacing.inputRadius,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addButtonDisabled: {
    backgroundColor: Colors.divider,
  },
  addButtonText: {
    fontSize: 24,
    color: Colors.textOnPrimary,
    fontWeight: 'bold',
  },
  countText: {
    ...Typography.hint,
    textAlign: 'right',
  },
});

export default UrlListEditor;
