import { describe, expect, it } from 'vitest';
import { hostExcluded, place } from '../../src/selection';

describe('place', () => {
  const r = { left: 100, top: 100, right: 300, bottom: 120 };
  it('below the selection when it fits', () => expect(place(r, 400, 200, 1280, 900)).toEqual({ left: 100, top: 128 }));
  it('above when there is no room below', () => expect(place({ ...r, top: 800, bottom: 820 }, 400, 200, 1280, 900)).toEqual({ left: 100, top: 592 }));
  it('clamped to the right edge', () => expect(place({ ...r, left: 1100 }, 400, 200, 1280, 900).left).toBe(872));
  it('clamped inside a tiny viewport', () => expect(place(r, 400, 380, 420, 300)).toEqual({ left: 12, top: 8 }));
});

describe('hostExcluded', () => {
  it('matches host and subdomains only', () => {
    expect(hostExcluded('docs.google.com', ['google.com'])).toBe(true);
    expect(hostExcluded('google.com', [' Google.com '])).toBe(true);
    expect(hostExcluded('notgoogle.com', ['google.com'])).toBe(false);
    expect(hostExcluded('x.com', ['', ' '])).toBe(false);
  });
});
