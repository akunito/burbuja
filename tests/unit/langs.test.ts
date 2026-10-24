import { describe, expect, it } from 'vitest';
import { LANGS, canonical, defaultTarget, langName, toBing, toDeepLSource, toDeepLTarget } from '../../src/langs';

describe('canonical', () => {
  it.each([
    ['en', 'en'], ['EN', 'en'], ['en-US', 'en'], ['iw', 'he'], ['nb', 'no'], ['zh-Hans', 'zh-CN'], ['zh-Hant', 'zh-TW'],
    ['ZH', 'zh-CN'], ['zh-TW', 'zh-TW'], ['pt-BR', 'pt'], ['fil', 'tl'], ['pl_PL', 'pl'], ['xx', ''], ['', ''], [undefined, ''],
  ])('%s → %s', (inp, out) => expect(canonical(inp)).toBe(out));
});

describe('defaultTarget', () => {
  it('keeps traditional Chinese', () => expect(defaultTarget(['zh-TW', 'en'])).toBe('zh-TW'));
  it('skips unknown', () => expect(defaultTarget(['xx-YY', 'es-ES'])).toBe('es'));
  it('falls back to en', () => expect(defaultTarget([])).toBe('en'));
});

describe('engine maps', () => {
  it('bing', () => {
    expect(toBing('zh-CN')).toBe('zh-Hans');
    expect(toBing('no')).toBe('no');
    expect(toBing('es')).toBe('es');
  });
  it('deepl source has no variants, target does', () => {
    expect(toDeepLSource('en')).toBe('EN');
    expect(toDeepLSource('zh-TW')).toBe('ZH');
    expect(toDeepLSource('no')).toBe('NB');
    expect(toDeepLTarget('en')).toBe('EN-US');
    expect(toDeepLTarget('pt')).toBe('PT-BR');
    expect(toDeepLTarget('zh-TW')).toBe('ZH-HANT');
    expect(toDeepLTarget('sw')).toBeNull();
  });
  it('all canonical codes have a display name', () => {
    for (const c of LANGS) expect(langName(c, 'en')).not.toBe('');
    expect(langName('pl', 'es')).toBe('Polaco');
  });
});
