/**
 * #385: a local file typed as a plain path, or with one slash too few, becomes a file:/// address,
 * and an address outside FreeKiosk's own folders is known to need "All files access".
 */
export {};

const { normalizeLocalFileInput, isLocalDocumentUrl, needsAllFilesAccess } = require('../src/utils/localFileUrl');

describe('normalizeLocalFileInput', () => {
  it.each([
    ['/storage/emulated/0/news/news001.html', 'file:///storage/emulated/0/news/news001.html'],
    ['  /sdcard/dash/index.html  ', 'file:///sdcard/dash/index.html'],
    ['file://storage/a/b/c.html', 'file:///storage/a/b/c.html'],
    ['FILE://storage/a/b/c.html', 'file:///storage/a/b/c.html'],
    ['file:/storage/a/b/c.html', 'file:///storage/a/b/c.html'],
    ['/storage/emulated/0/my news/day 1.html', 'file:///storage/emulated/0/my%20news/day%201.html'],
  ])('turns %s into %s', (input, expected) => {
    expect(normalizeLocalFileInput(input)).toBe(expected);
  });

  it.each([
    'file:///storage/a/b.html',
    'content://com.android.externalstorage.documents/document/home%3Anews%2Fnews001.html',
    'https://example.com/a',
    'http://myserver:1124',
    'myserver:1124',
    'example.com',
    '//cdn.example.com/x.js',
    '',
  ])('leaves %j as typed', (input) => {
    expect(normalizeLocalFileInput(input)).toBe(input.trim());
  });
});

describe('isLocalDocumentUrl', () => {
  it('knows file:// and content:// addresses', () => {
    expect(isLocalDocumentUrl('file:///a/b.html')).toBe(true);
    expect(isLocalDocumentUrl(' CONTENT://x/y ')).toBe(true);
    expect(isLocalDocumentUrl('https://example.com')).toBe(false);
    expect(isLocalDocumentUrl('/storage/a.html')).toBe(false);
  });
});

describe('needsAllFilesAccess', () => {
  it.each([
    'file:///storage/emulated/0/news/news001.html',
    'file:///sdcard/dash/index.html',
    'file:///storage/1234-ABCD/page.html',
    'file:///storage/emulated/0/Android/data/com.other.app/files/x.html',
    'file:///storage/emulated/0/Download/com.freekiosk/x.html',
  ])('needs it for %s', (url) => {
    expect(needsAllFilesAccess(url)).toBe(true);
  });

  it.each([
    'file:///storage/emulated/0/Android/data/com.freekiosk/files/dashboard/index.html',
    'file:///sdcard/Android/data/com.freekiosk/files/dashboard/index.html?x=1#top',
    'file:///storage/emulated/0/Android/media/com.freekiosk/page.html',
    'file:///data/user/0/com.freekiosk/files/page.html',
    'file:///android_asset/pdfjs/viewer.html',
    'file:///storage/emulated/0/Android/data/com.freekiosk/files/my%20dash/index.html',
  ])('does not need it for %s, FreeKiosk reads its own folder', (url) => {
    expect(needsAllFilesAccess(url)).toBe(false);
  });

  it('does not apply to content:// documents or web addresses', () => {
    expect(needsAllFilesAccess('content://com.android.providers.downloads.documents/document/5')).toBe(false);
    expect(needsAllFilesAccess('https://example.com')).toBe(false);
  });
});
