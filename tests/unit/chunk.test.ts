import { describe, expect, it } from 'vitest';
import { charCost, chunk, translateChunks, urlBytes } from '../../src/engines/chunk';

const formBytes = (s: string) => { const p = new URLSearchParams(); p.append('q', s); return p.toString().length - 2; };

describe('urlBytes', () => {
  it.each(['hello world', 'Dzień dobry, jak się masz?', '你好，世界', 'a+b=c&d', "!'()~*-._", '😀 emoji'])('matches URLSearchParams for %s', (s) =>
    expect(urlBytes(s)).toBe(formBytes(s)));
});

describe('chunk', () => {
  const pl = 'Dzień dobry, jak się masz? '.repeat(800);
  const cjk = '你好，你今天怎么样？'.repeat(400);
  it('returns the input when under budget', () => expect(chunk('short', 100, charCost)).toEqual(['short']));
  it.each([[pl, 12_000, urlBytes], [cjk, 12_000, urlBytes], [pl, 5000, charCost]] as const)('concatenation is lossless and within budget', (text, budget, cost) => {
    const parts = chunk(text, budget, cost);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.join('')).toBe(text);
    for (const p of parts) expect(cost(p)).toBeLessThanOrEqual(budget);
  });
  it('hard-cuts a single oversize word', () => {
    const w = 'x'.repeat(250);
    const parts = chunk(w, 100, charCost);
    expect(parts.join('')).toBe(w);
    expect(Math.max(...parts.map((p) => p.length))).toBeLessThanOrEqual(100);
  });
});

describe('translateChunks', () => {
  it('keeps whitespace between chunks and the first detected language', async () => {
    const r = await translateChunks(['One. ', 'Two.\n', '  '], async (t) => ({ text: t.toUpperCase(), detectedFrom: t === 'One.' ? 'en' : 'fr' }));
    expect(r).toEqual({ text: 'ONE. TWO.\n  ', detectedFrom: 'en' });
  });
});
