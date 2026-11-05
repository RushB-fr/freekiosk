import en from '../src/i18n/locales/en.json';
import de from '../src/i18n/locales/de.json';
import es from '../src/i18n/locales/es.json';
import fr from '../src/i18n/locales/fr.json';
import itIT from '../src/i18n/locales/it.json';
import nl from '../src/i18n/locales/nl.json';
import ptBR from '../src/i18n/locales/pt-BR.json';
import pl from '../src/i18n/locales/pl.json';
import zhHans from '../src/i18n/locales/zh-Hans.json';

// A new language goes in this list too, next to src/i18n/index.ts.
const LOCALES: Array<[string, Tree]> = [
  ['de', de],
  ['es', es],
  ['fr', fr],
  ['it', itIT],
  ['nl', nl],
  ['pt-BR', ptBR],
  ['pl', pl],
  ['zh-Hans', zhHans],
];

type Tree = { [key: string]: string | Tree };

const flatten = (tree: Tree, prefix = ''): Array<[string, string]> =>
  Object.entries(tree).flatMap(([key, value]) =>
    typeof value === 'string' ? [[prefix + key, value] as [string, string]] : flatten(value, `${prefix}${key}.`),
  );

const placeholders = (text: string): string =>
  (text.match(/\{\{\s*[\w.]+\s*\}\}/g) ?? []).map((p) => p.replace(/\s/g, '')).sort().join(',');

// i18next picks the plural form with the language's own rules: a language may need
// categories English does not use (_many), but never fewer than one/other.
const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;
const isPlural = (key: string) => PLURAL_SUFFIX.test(key);
const pluralBase = (key: string) => key.replace(PLURAL_SUFFIX, '');

const english = flatten(en as Tree);
const englishKeys = new Set(english.map(([key]) => key));
const englishByKey = new Map(english);

describe('locale files stay in step with en.json', () => {
  it.each(LOCALES)('%s has every key of en.json and no stray one', (_code, tree) => {
    const keys = new Map(flatten(tree));

    const missing = [...englishKeys].filter((key) => !isPlural(key) && !keys.has(key));
    expect(missing).toEqual([]);

    const stray = [...keys.keys()].filter(
      (key) =>
        !englishKeys.has(key) &&
        !(isPlural(key) && [...englishKeys].some((k) => isPlural(k) && pluralBase(k) === pluralBase(key))),
    );
    expect(stray).toEqual([]);
  });

  it.each(LOCALES)('%s has a one and an other form for every plural of en.json', (_code, tree) => {
    const keys = new Set(flatten(tree).map(([key]) => key));
    const bases = new Set([...englishKeys].filter(isPlural).map(pluralBase));
    const incomplete = [...bases].filter((base) => !keys.has(`${base}_one`) || !keys.has(`${base}_other`));
    expect(incomplete).toEqual([]);
  });

  it.each(LOCALES)('%s keeps the {{placeholders}} of en.json', (_code, tree) => {
    const wrong = flatten(tree).filter(([key, value]) => {
      const source = englishByKey.get(key) ?? englishByKey.get(`${pluralBase(key)}_other`);
      return source !== undefined && placeholders(source) !== placeholders(value);
    });
    expect(wrong.map(([key]) => key)).toEqual([]);
  });

  it.each(LOCALES)('%s has no empty string', (_code, tree) => {
    const empty = flatten(tree).filter(([, value]) => value.trim() === '');
    expect(empty.map(([key]) => key)).toEqual([]);
  });
});
