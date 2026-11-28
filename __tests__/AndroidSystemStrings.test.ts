/**
 * #420: the strings Android itself shows (boot screen, accessibility service description, the
 * notification channels and the ongoing notifications of the services) live in
 * android/app/src/main/res/values*\/strings.xml, one folder per language of the app.
 *
 * A language added to src/i18n/locales needs its folder here too; a string added to the English
 * file needs its translation; a placeholder must survive the translation; and the five Kotlin
 * files that used to hardcode English must not go back to it. None of this can fail at build time:
 * Android falls back to English silently, which is exactly the bug this guards against.
 */
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..');
const RES = path.join(ROOT, 'android', 'app', 'src', 'main', 'res');
const KOTLIN = path.join(ROOT, 'android', 'app', 'src', 'main', 'java', 'com', 'freekiosk');

/** App locale file -> Android resource folder. */
const FOLDER_OF_LOCALE: Record<string, string> = {
  en: 'values',
  de: 'values-de',
  es: 'values-es',
  fr: 'values-fr',
  it: 'values-it',
  nl: 'values-nl',
  pl: 'values-pl',
  'pt-BR': 'values-pt-rBR',
  'zh-Hans': 'values-b+zh+Hans',
};

/** The plural categories each language has to provide (CLDR; Android lint's MissingQuantity). */
const QUANTITIES: Record<string, string[]> = {
  values: ['one', 'other'],
  'values-de': ['one', 'other'],
  'values-es': ['one', 'other'],
  'values-fr': ['one', 'other'],
  'values-it': ['one', 'other'],
  'values-nl': ['one', 'other'],
  'values-pl': ['one', 'few', 'many', 'other'],
  'values-pt-rBR': ['one', 'other'],
  'values-b+zh+Hans': ['other'],
};

interface Parsed {
  strings: Record<string, string>;
  plurals: Record<string, Record<string, string>>;
}

function parse(folder: string): Parsed {
  const xml = fs.readFileSync(path.join(RES, folder, 'strings.xml'), 'utf8');
  const strings: Record<string, string> = {};
  const plurals: Record<string, Record<string, string>> = {};
  const withoutPlurals = xml.replace(/<plurals name="([^"]+)">([\s\S]*?)<\/plurals>/g, (_m, name: string, body: string) => {
    plurals[name] = {};
    for (const item of body.matchAll(/<item quantity="([^"]+)">([\s\S]*?)<\/item>/g)) plurals[name][item[1]] = item[2];
    return '';
  });
  for (const m of withoutPlurals.replace(/<!--[\s\S]*?-->/g, '').matchAll(/<string name="([^"]+)">([\s\S]*?)<\/string>/g)) {
    strings[m[1]] = m[2];
  }
  return { strings, plurals };
}

const placeholders = (text: string) => (text.match(/%(\d+\$)?[sdf]/g) ?? []).sort();

const english = parse('values');
const localeFiles = fs.readdirSync(path.join(ROOT, 'src', 'i18n', 'locales')).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, ''));

describe('Android system strings', () => {
  it('has a resource folder for every language of the app, and none more', () => {
    expect(Object.keys(FOLDER_OF_LOCALE).sort()).toEqual([...localeFiles].sort());
    const folders = fs.readdirSync(RES).filter((d) => d.startsWith('values') && fs.existsSync(path.join(RES, d, 'strings.xml')));
    expect(folders.sort()).toEqual(Object.values(FOLDER_OF_LOCALE).sort());
  });

  it('keeps the brand name and nothing else in English where it is not a name', () => {
    expect(english.strings.app_name).toBe('FreeKiosk');
    // 17 texts the issue lists: boot, accessibility, 3 per channel with a notification, etc.
    expect(Object.keys(english.strings).length + Object.keys(english.plurals).length).toBeGreaterThanOrEqual(17);
  });

  describe.each(Object.entries(FOLDER_OF_LOCALE).filter(([, folder]) => folder !== 'values'))('%s (%s)', (_locale, folder) => {
    const translated = parse(folder);

    it('translates every string of the English file', () => {
      const missing = Object.keys(english.strings).filter((k) => k !== 'app_name' && !(k in translated.strings));
      expect({ missing, extra: Object.keys(translated.strings).filter((k) => !(k in english.strings)) }).toEqual({ missing: [], extra: [] });
      expect(Object.keys(translated.plurals).sort()).toEqual(Object.keys(english.plurals).sort());
    });

    it('is not left in English, empty, or badly escaped', () => {
      for (const [name, value] of Object.entries(translated.strings)) {
        expect([name, value.trim().length > 0]).toEqual([name, true]);
        expect([name, value === english.strings[name]]).toEqual([name, false]);
        // aapt refuses an unescaped apostrophe or double quote in a string
        expect([name, /(^|[^\\])['"]/.test(value)]).toEqual([name, false]);
      }
    });

    it('keeps the placeholders of every string', () => {
      for (const [name, value] of Object.entries(translated.strings)) {
        expect([name, placeholders(value)]).toEqual([name, placeholders(english.strings[name])]);
      }
    });

    it('gives the plural forms the language needs, each with its number', () => {
      for (const [name, items] of Object.entries(translated.plurals)) {
        expect([name, Object.keys(items).sort()]).toEqual([name, [...QUANTITIES[folder]].sort()]);
        for (const [quantity, value] of Object.entries(items)) {
          expect([name, quantity, placeholders(value)]).toEqual([name, quantity, ['%d']]);
        }
      }
    });
  });

  it('is read by the services instead of being written in them', () => {
    const files = ['BackgroundAppMonitorService.kt', 'CameraForegroundService.kt', 'KioskWatchdogService.kt', 'OverlayService.kt', 'ScreenController.kt'];
    for (const file of files) {
      const code = fs.readFileSync(path.join(KOTLIN, file), 'utf8');
      expect([file, /\.setContentText\(\s*"/.test(code)]).toEqual([file, false]);
      expect([file, /NotificationChannel\(\s*[\w.]+,\s*"/.test(code)]).toEqual([file, false]);
      expect([file, /description = "/.test(code)]).toEqual([file, false]);
      expect([file, /getString\(R\.string\./.test(code) || /getQuantityString\(/.test(code)]).toEqual([file, true]);
    }
  });

  it('only uses string resources that exist', () => {
    const used = new Set<string>();
    for (const file of fs.readdirSync(KOTLIN).filter((f) => f.endsWith('.kt'))) {
      const code = fs.readFileSync(path.join(KOTLIN, file), 'utf8');
      for (const m of code.matchAll(/R\.(string|plurals)\.(\w+)/g)) used.add(`${m[1]}:${m[2]}`);
    }
    const defined = new Set([
      ...Object.keys(english.strings).map((k) => `string:${k}`),
      ...Object.keys(english.plurals).map((k) => `plurals:${k}`),
    ]);
    const manifest = fs.readFileSync(path.join(ROOT, 'android', 'app', 'src', 'main', 'AndroidManifest.xml'), 'utf8');
    for (const m of manifest.matchAll(/@string\/(\w+)/g)) used.add(`string:${m[1]}`);
    const unknown = [...used].filter((u) => !defined.has(u) && !u.startsWith('string:app_name'));
    expect(unknown).toEqual([]);
  });
});
