import i18next, { LANGUAGE_OPTIONS, resolveSupportedLanguage } from '../src/i18n';

describe('device locale to app language', () => {
  it.each([
    ['es_ES', 'es'],
    ['es_MX', 'es'],
    ['es-AR', 'es'],
    ['de_DE', 'de'],
    ['de_CH', 'de'],
    ['it_IT', 'it'],
    ['it-CH', 'it'],
    ['nl_NL', 'nl'],
    ['nl_BE', 'nl'],
    ['fr_CA', 'fr'],
    ['pt_PT', 'pt-BR'],
    ['pt-BR', 'pt-BR'],
    ['pl_PL', 'pl'],
    ['zh_CN', 'zh-Hans'],
    ['zh-Hans-CN', 'zh-Hans'],
    ['zh_TW', 'zh-Hans'],
    ['en_GB', 'en'],
    ['ja_JP', 'en'],
    ['', 'en'],
    [null, 'en'],
  ])('%s resolves to %s', (locale, expected) => {
    expect(resolveSupportedLanguage(locale)).toBe(expected);
  });

  it.each(LANGUAGE_OPTIONS.map((o) => [o.value, o.label]))('%s is offered as "%s" and has a translation bundle', (value) => {
    expect(i18next.hasResourceBundle(value, 'translation')).toBe(true);
  });

  it('translates a string in each language, not the English fallback', () => {
    const english = i18next.getFixedT('en')('general.language.title');
    for (const { value } of LANGUAGE_OPTIONS) {
      if (value === 'en') continue;
      expect(i18next.getFixedT(value)('general.language.title')).not.toBe(english);
    }
  });

  it('picks the plural form of each language', () => {
    for (const { value } of LANGUAGE_OPTIONS) {
      const one = i18next.getFixedT(value)('components.escPos.feedLinesValue', { count: 1 });
      const many = i18next.getFixedT(value)('components.escPos.feedLinesValue', { count: 5 });
      expect(one).toContain('1');
      expect(many).toContain('5');
    }
  });
});
