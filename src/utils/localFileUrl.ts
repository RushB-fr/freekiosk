/**
 * Local files as the kiosk page (#385): what a person types for one, and what reading it needs.
 */

/** Folders FreeKiosk can always read, whatever Android says about the rest of the storage. */
const OWN_FOLDERS = [
  '/Android/data/com.freekiosk/',
  '/Android/media/com.freekiosk/',
  '/data/user/0/com.freekiosk/',
  '/data/data/com.freekiosk/',
  '/android_asset/',
];

/**
 * Turns the ways of writing a local file into a `file:///` address: `/storage/a/b.html`,
 * `file://storage/a/b.html` (one slash short, the usual slip) and `file:/storage/a/b.html`.
 * Anything else, `file:///...` and `content://...` included, comes back as typed (trimmed).
 */
export function normalizeLocalFileInput(input: string): string {
  const text = input.trim();
  const lower = text.toLowerCase();
  let path: string | null = null;

  if (text.startsWith('/') && !text.startsWith('//')) {
    path = text;
  } else if (lower.startsWith('file:///')) {
    return text;
  } else if (lower.startsWith('file://')) {
    path = '/' + text.slice('file://'.length);
  } else if (lower.startsWith('file:/')) {
    path = text.slice('file:'.length);
  }

  if (path === null) return text;
  return 'file://' + path.replace(/ /g, '%20');
}

/** A `file://` address or a `content://` document, which the WebView reads as a local file. */
export function isLocalDocumentUrl(url: string): boolean {
  const lower = url.trim().toLowerCase();
  return lower.startsWith('file://') || lower.startsWith('content://');
}

/**
 * Whether reading this address needs Android's "All files access": a `file://` address outside
 * FreeKiosk's own folders. A `content://` document carries its own permission, and the app's folders
 * need none.
 */
export function needsAllFilesAccess(url: string): boolean {
  const text = url.trim();
  if (!text.toLowerCase().startsWith('file://')) return false;
  let path = text.slice('file://'.length);
  const query = path.search(/[?#]/);
  if (query >= 0) path = path.slice(0, query);
  try {
    path = decodeURIComponent(path);
  } catch {
    // keep the path as typed
  }
  return !OWN_FOLDERS.some(folder => path.includes(folder));
}
