import { describe, expect, it } from 'vitest';
import { Translator, suspiciousIdentical } from '../../src/engines/chain';
import { type Engine, EngineError, type EngineId, type EngineResult, type ErrorKind } from '../../src/engines/types';
import { signal } from './helpers';

type Script = (text: string, from: string, to: string, s: AbortSignal) => Promise<EngineResult>;
function fake(id: EngineId, script: Script, unavailable: ErrorKind | null = null, timeoutMs = 1000): Engine & { calls: number } {
  const e = { id, timeoutMs, calls: 0, unavailable: () => unavailable,
    translate: (r: { text: string; from: string; to: string }, s: AbortSignal) => { e.calls++; return script(r.text, r.from, r.to, s); } };
  return e;
}
const ok = (text: string, detectedFrom = 'en'): Script => async () => ({ text, detectedFrom });
const fail = (kind: ErrorKind): Script => async () => { throw new EngineError(kind); };
const make = (...es: Engine[]) => { let t = 1000; const tr = new Translator(new Map(es.map((e) => [e.id, e])), () => es.map((e) => e.id), () => t); return { tr, advance: (ms: number) => { t += ms; } }; };

describe('Translator', () => {
  it('falls back google 429 → gtx network → bing', async () => {
    const { tr } = make(fake('google', fail('rate_limited')), fake('google-gtx', fail('network')), fake('bing', ok('Hola')));
    const r = await tr.run({ text: 'Hello', from: 'auto', to: 'es' }, signal());
    expect(r.ok && r.engine).toBe('bing');
    expect(r.attempts.map((a) => a.error ?? 'ok')).toEqual(['rate_limited', 'network', 'ok']);
  });
  it('skips a rate-limited engine for 60 s', async () => {
    const g = fake('google', fail('rate_limited'));
    const { tr, advance } = make(g, fake('bing', ok('Hola')));
    await tr.run({ text: 'a b', from: 'auto', to: 'es' }, signal());
    await tr.run({ text: 'c d', from: 'auto', to: 'es' }, signal());
    expect(g.calls).toBe(1);
    advance(61_000);
    await tr.run({ text: 'e f', from: 'auto', to: 'es' }, signal());
    expect(g.calls).toBe(2);
  });
  it('unconfigured engines are skipped silently', async () => {
    const { tr } = make(fake('deepl', ok('x'), 'not_configured'), fake('bing', ok('Hola')));
    const r = await tr.run({ text: 'Hello', from: 'auto', to: 'es' }, signal());
    expect(r.ok && r.engine).toBe('bing');
  });
  it('explicit engine: no fallback', async () => {
    const b = fake('bing', ok('Hola'));
    const { tr } = make(fake('google', fail('network')), b);
    const r = await tr.run({ text: 'Hello', from: 'auto', to: 'es', engine: 'google' }, signal());
    expect(r.ok).toBe(false);
    expect(b.calls).toBe(0);
  });
  it('identical sentence falls through; if every engine agrees, first result wins without error', async () => {
    const { tr } = make(fake('google', ok('Good morning friends', 'en')), fake('bing', ok('Good morning friends', 'en')));
    const r = await tr.run({ text: 'Good morning friends', from: 'auto', to: 'es' }, signal());
    expect(r.ok && r.engine).toBe('google');
    expect(r.attempts.map((a) => a.error)).toEqual(['identical', 'identical']);
  });
  it('identical single word is legitimate', async () => {
    const b = fake('bing', ok('nope'));
    const { tr } = make(fake('google', ok('Taxi', 'en')), b);
    const r = await tr.run({ text: 'Taxi', from: 'auto', to: 'es' }, signal());
    expect(r.ok && r.text).toBe('Taxi');
    expect(b.calls).toBe(0);
  });
  it('detected == target → second language', async () => {
    const g = fake('google', async (t, from, to) => ({ text: to === 'en' ? 'Good morning' : t, detectedFrom: 'es' }));
    const { tr } = make(g);
    const r = await tr.run({ text: 'Buenos días', from: 'auto', to: 'es', secondLang: 'en' }, signal());
    expect(r.ok && [r.text, r.to, r.detectedFrom]).toEqual(['Good morning', 'en', 'es']);
  });
  it('per-engine timeout moves on', async () => {
    const slow = fake('google', (_t, _f, _to, s) => new Promise((_, rej) => s.addEventListener('abort', () => rej(new EngineError('timeout')))), null, 30);
    const { tr } = make(slow, fake('bing', ok('Hola')));
    const r = await tr.run({ text: 'Hello', from: 'auto', to: 'es' }, signal());
    expect(r.ok && r.engine).toBe('bing');
    expect(r.attempts[0]!.error).toBe('timeout');
  });
  it('outer abort stops the chain', async () => {
    const ac = new AbortController();
    const b = fake('bing', ok('Hola'));
    const g = fake('google', (_t, _f, _to, s) => new Promise((_, rej) => { ac.abort(); rej(new EngineError('aborted')); void s; }));
    const { tr } = make(g, b);
    const r = await tr.run({ text: 'Hello', from: 'auto', to: 'es' }, ac.signal);
    expect(r).toMatchObject({ ok: false, aborted: true });
    expect(b.calls).toBe(0);
  });
  it('caches per engine/from/to/text', async () => {
    const g = fake('google', ok('Hola'));
    const { tr } = make(g);
    await tr.run({ text: 'Hello', from: 'auto', to: 'es' }, signal());
    await tr.run({ text: '  Hello ', from: 'auto', to: 'es' }, signal());
    await tr.run({ text: 'Hello', from: 'auto', to: 'fr' }, signal());
    expect(g.calls).toBe(2);
  });
  it('empty input → not ok, no calls', async () => {
    const g = fake('google', ok('x'));
    const { tr } = make(g);
    expect((await tr.run({ text: '   ', from: 'auto', to: 'es' }, signal())).ok).toBe(false);
    expect(g.calls).toBe(0);
  });
});

describe('suspiciousIdentical', () => {
  it.each([
    ['Hello there', 'Hello there', 'en', 'es', true],
    ['Hello', 'Hello', 'en', 'es', false],
    ['https://x.y/z', 'https://x.y/z', 'en', 'es', false],
    ['12 345', '12 345', 'en', 'es', false],
    ['Hola amigos', 'Hola amigos', 'es', 'es', false],
    ['Hello there', 'Hola', 'en', 'es', false],
    ['Hello there', 'Hello there', '', 'es', false],
  ])('%s → %s (%s→%s) = %s', (i, o, f, t, exp) => expect(suspiciousIdentical(i, o, f, t)).toBe(exp));
});
