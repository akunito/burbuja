import { afterEach, describe, expect, it, vi } from 'vitest';
import { bing } from '../../src/engines/bing';
import { deeplHost, makeDeepL } from '../../src/engines/deepl';
import { googleGtx, googlePa } from '../../src/engines/google';
import { EngineError } from '../../src/engines/types';
import { fixture, mockFetch, signal } from './helpers';

afterEach(() => vi.unstubAllGlobals());

const kindOf = async (p: Promise<unknown>) => { try { await p; return 'ok'; } catch (e) { return (e as EngineError).kind; } };

describe('google translate-pa', () => {
  it('parses auto-detected result', async () => {
    const calls = mockFetch(() => [200, fixture('google-en-es.json')]);
    const r = await googlePa.translate({ text: 'Good morning, how are you?', from: 'auto', to: 'es' }, signal());
    expect(r).toEqual({ text: 'Buenos días, ¿cómo estás?', detectedFrom: 'en' });
    const u = new URL(calls[0]!.url);
    expect(u.host).toBe('translate-pa.googleapis.com');
    expect(u.searchParams.get('query.source_language')).toBe('auto');
    expect(u.searchParams.getAll('data_types')).toEqual(['TRANSLATION']);
  });
  it('fixed source: response has no detectedLanguages and must not throw', async () => {
    mockFetch(() => [200, fixture('google-pl-fixed.json')]);
    const r = await googlePa.translate({ text: 'Dzień dobry. Jak się masz?', from: 'pl', to: 'es' }, signal());
    expect(r.detectedFrom).toBe('pl');
  });
  it('single word asks for and returns the dictionary', async () => {
    const calls = mockFetch(() => [200, fixture('google-word-dict.json')]);
    const r = await googlePa.translate({ text: 'house', from: 'auto', to: 'es' }, signal());
    expect(new URL(calls[0]!.url).searchParams.getAll('data_types')).toContain('BILINGUAL_DICTIONARY_FULL');
    expect(r.dict?.[0]?.pos).toBe('sustantivo');
    expect(r.dict?.[0]?.terms[0]).toBe('casa');
  });
  it.each([[429, 'rate_limited'], [503, 'rate_limited'], [403, 'auth'], [400, 'http']] as const)('HTTP %i → %s', async (st, kind) => {
    mockFetch(() => [st, fixture('google-badkey.txt')]);
    expect(await kindOf(googlePa.translate({ text: 'hi', from: 'auto', to: 'es' }, signal()))).toBe(kind);
  });
  it('malformed JSON → bad_response', async () => {
    mockFetch(() => [200, '<html>']);
    expect(await kindOf(googlePa.translate({ text: 'hi', from: 'auto', to: 'es' }, signal()))).toBe('bad_response');
  });
  it('network failure → network', async () => {
    vi.stubGlobal('fetch', async () => { throw new TypeError('NetworkError'); });
    expect(await kindOf(googlePa.translate({ text: 'hi', from: 'auto', to: 'es' }, signal()))).toBe('network');
  });
  it('long text is split into several requests under the URL budget', async () => {
    const calls = mockFetch((url) => [200, JSON.stringify({ translation: 'x', sourceLanguage: 'pl' })]);
    await googlePa.translate({ text: 'Dzień dobry, jak się masz? '.repeat(800), from: 'auto', to: 'es' }, signal());
    expect(calls.length).toBeGreaterThan(1);
    for (const c of calls) expect(c.url.length).toBeLessThan(16_000);
  });
});

describe('google gtx', () => {
  it('joins sentences and detects', async () => {
    mockFetch(() => [200, fixture('gtx-pl-fixed-multi.json')]);
    const r = await googleGtx.translate({ text: 'Dzień dobry. Jak się masz? Wszystko dobrze.', from: 'pl', to: 'es' }, signal());
    expect(r).toEqual({ text: 'Buen día. ¿Cómo estás? Todo está bien.', detectedFrom: 'pl' });
  });
  it('dictionary for single words', async () => {
    mockFetch(() => [200, fixture('gtx-word.json')]);
    const r = await googleGtx.translate({ text: 'house', from: 'auto', to: 'es' }, signal());
    expect(r.dict?.[0]).toEqual({ pos: 'noun', terms: ['casa', 'cámara', 'familia', 'sala', 'pabellón', 'entrada'] });
  });
});

describe('bing', () => {
  it('auto detect, maps the request', async () => {
    const calls = mockFetch(() => [200, fixture('bing-en-es.json')]);
    const r = await bing.translate({ text: 'Good morning, how are you?', from: 'auto', to: 'zh-CN' }, signal());
    expect(r).toEqual({ text: 'Buenos días, ¿cómo estás?', detectedFrom: 'en' });
    const u = new URL(calls[0]!.url);
    expect(u.searchParams.get('to')).toBe('zh-Hans');
    expect(u.searchParams.has('from')).toBe(false);
    expect(calls[0]!.init?.body).toBe('["Good morning, how are you?"]');
  });
  it('fixed source sends from and has no detection', async () => {
    const calls = mockFetch(() => [200, fixture('bing-pl-es-fixed.json')]);
    const r = await bing.translate({ text: 'Dzień dobry', from: 'pl', to: 'es' }, signal());
    expect(new URL(calls[0]!.url).searchParams.get('from')).toBe('pl');
    expect(r.detectedFrom).toBe('');
  });
  it('400 → unsupported_lang', async () => {
    mockFetch(() => [400, '']);
    expect(await kindOf(bing.translate({ text: 'hi', from: 'auto', to: 'xx' }, signal()))).toBe('unsupported_lang');
  });
});

describe('deepl', () => {
  it('unavailable without key or language', () => {
    expect(makeDeepL(() => '').unavailable({ text: 'x', from: 'auto', to: 'es' })).toBe('not_configured');
    expect(makeDeepL(() => 'k:fx').unavailable({ text: 'x', from: 'auto', to: 'sw' })).toBe('unsupported_lang');
    expect(makeDeepL(() => 'k:fx').unavailable({ text: 'x', from: 'sw', to: 'es' })).toBe('unsupported_lang');
    expect(makeDeepL(() => 'k:fx').unavailable({ text: 'x', from: 'auto', to: 'es' })).toBeNull();
  });
  it('host by key suffix', () => {
    expect(deeplHost('abc:fx')).toBe('https://api-free.deepl.com');
    expect(deeplHost('abc')).toBe('https://api.deepl.com');
  });
  it('request shape and parse', async () => {
    const calls = mockFetch(() => [200, JSON.stringify({ translations: [{ text: 'Hola', detected_source_language: 'EN' }] })]);
    const r = await makeDeepL(() => 'k:fx').translate({ text: 'Hello', from: 'pl', to: 'en' }, signal());
    expect(r).toEqual({ text: 'Hola', detectedFrom: 'en' });
    const body = new URLSearchParams(String(calls[0]!.init?.body));
    expect(body.get('target_lang')).toBe('EN-US');
    expect(body.get('source_lang')).toBe('PL');
    expect((calls[0]!.init?.headers as Record<string, string>).Authorization).toBe('DeepL-Auth-Key k:fx');
  });
  it('403 → auth', async () => {
    mockFetch(() => [403, fixture('deepl-badkey.txt')]);
    expect(await kindOf(makeDeepL(() => 'bad:fx').translate({ text: 'hi', from: 'auto', to: 'es' }, signal()))).toBe('auth');
  });
});
