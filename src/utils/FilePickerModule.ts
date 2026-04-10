/**
 * FreeKiosk - File Picker Module (TypeScript wrapper)
 * Native Android file picker for selecting videos and images from the device.
 * Files are copied to the app's internal storage for reliable WebView access.
 */

import { NativeModules } from 'react-native';

interface PickedFile {
  path: string;      // file:// URI to the copied file
  name: string;      // Original filename
  mimeType: string;  // e.g. "video/mp4", "image/jpeg"
  size: number;      // File size in bytes
  type: string;      // "video" or "image"
}

interface PickedJsonFile {
  content: string;   // Raw JSON content of the file
  name: string;      // Original filename
  size: number;      // File size in bytes
}

interface MediaFileInfo {
  path: string;
  name: string;
  size: number;
}

interface FilePickerModuleType {
  /** Open file picker for single media selection */
  pickMedia(mediaType: 'video' | 'image' | 'any'): Promise<PickedFile>;
  /** Open file picker for multiple media selection */
  pickMultipleMedia(mediaType: 'video' | 'image' | 'any'): Promise<PickedFile[]>;
  /** Open file picker for JSON file selection (backup import). Uses SAF to bypass Scoped Storage. */
  pickJsonFile(): Promise<PickedJsonFile>;
  /** Delete a previously copied media file */
  deleteMediaFile(filePath: string): Promise<boolean>;
  /** Get the internal media directory path */
  getMediaDirectory(): Promise<string>;
  /** List all files in the media directory */
  listMediaFiles(): Promise<MediaFileInfo[]>;
  /** Clear all files in the media directory */
  clearMediaFiles(): Promise<number>;
}

const FilePickerModule: FilePickerModuleType = NativeModules.FilePickerModule;

export default FilePickerModule;
export type { PickedFile, PickedJsonFile, MediaFileInfo };
