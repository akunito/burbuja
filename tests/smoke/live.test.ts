import { describe, expect, it } from 'vitest';
import { bing } from '../../src/engines/bing';
import { googleGtx, googlePa } from '../../src/engines/google';
import { fetchTts } from '../../src/tts';

const sig = () => AbortSignal.timeout(15_000);

describe('live endpoints', () => {
  it.each([googlePa, googleGtx, bing])('$id translates pl→es with detection', async (e) => {
    const r = await e.translate({ text: 'Dzień dobry, jak się masz?', from: 'auto', to: 'es' }, sig());
    expect(r.text.toLowerCase()).toContain('cómo');
    expect(r.detectedFrom).toBe('pl');
  });
  it.each([googlePa, googleGtx, bing])('$id accepts a fixed source', async (e) => {
    const r = await e.translate({ text: 'Guten Morgen', from: 'de', to: 'en' }, sig());
    expect(r.text.toLowerCase()).toContain('morning');
  });
  it('google tts returns audio', async () => {
    const r = await fetchTts('Buenos días', 'es', sig());
    expect(r?.[0]?.byteLength).toBeGreaterThan(1000);
  });
});
