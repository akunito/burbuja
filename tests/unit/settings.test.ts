import { describe, expect, it } from 'vitest';
import { DEFAULTS, normalize } from '../../src/settings';

describe('normalize', () => {
  it('defaults on garbage', () => expect(normalize(null)).toEqual(DEFAULTS));
  it('keeps order, drops unknown/duplicate engines, appends missing', () => {
    const s = normalize({ engines: [{ id: 'bing', enabled: false }, { id: 'nope', enabled: true }, { id: 'bing', enabled: true }, { id: 'google', enabled: true }] });
    expect(s.engines).toEqual([
      { id: 'bing', enabled: false }, { id: 'google', enabled: true }, { id: 'google-gtx', enabled: true }, { id: 'deepl', enabled: true },
    ]);
  });
  it('repairs bad numbers', () => expect(normalize({ maxChars: -3 }).maxChars).toBe(5000));
});
