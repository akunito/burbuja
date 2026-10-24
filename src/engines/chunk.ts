/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

let sentenceSeg: Intl.Segmenter | undefined;
let wordSeg: Intl.Segmenter | undefined;

/**
 * Splits text into consecutive pieces whose concatenation is exactly `text`, each with
 * cost(piece) <= budget when possible (sentence boundaries first, then words, then hard cut).
 */
export function chunk(text: string, budget: number, cost: (s: string) => number): string[] {
  if (cost(text) <= budget) return [text];
  sentenceSeg ??= new Intl.Segmenter(undefined, { granularity: 'sentence' });
  const out: string[] = [];
  let cur = '';
  for (const { segment } of sentenceSeg.segment(text)) {
    if (cost(cur + segment) <= budget) { cur += segment; continue; }
    if (cur) { out.push(cur); cur = ''; }
    if (cost(segment) <= budget) { cur = segment; continue; }
    wordSeg ??= new Intl.Segmenter(undefined, { granularity: 'word' });
    for (const { segment: w } of wordSeg.segment(segment)) {
      if (cost(cur + w) <= budget) { cur += w; continue; }
      if (cur) { out.push(cur); cur = ''; }
      if (cost(w) <= budget) { cur = w; continue; }
      // Single "word" over budget (CJK run without spaces, long URL): cut by code points.
      for (const ch of w) {
        if (cost(cur + ch) > budget && cur) { out.push(cur); cur = ''; }
        cur += ch;
      }
    }
  }
  if (cur) out.push(cur);
  return out;
}

export const charCost = (s: string): number => s.length;

/** Bytes after URLSearchParams (form) encoding, without allocating the encoded string. */
export function urlBytes(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) {
      // form encoding keeps alnum and *-._ , space becomes '+', everything else %XX
      n += (c >= 0x30 && c <= 0x39) || (c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a) || c === 42 || c === 45 || c === 46 || c === 95 || c === 32 ? 1 : 3;
    } else if (c < 0x800) n += 6;
    else if (c >= 0xd800 && c <= 0xdbff) { n += 12; i++; }
    else n += 9;
  }
  return n;
}

/** Translate each chunk sequentially and stitch back, preserving each chunk's trailing whitespace. */
export async function translateChunks(
  pieces: string[],
  one: (piece: string) => Promise<{ text: string; detectedFrom: string }>,
): Promise<{ text: string; detectedFrom: string }> {
  if (pieces.length === 1) return one(pieces[0]!);
  let text = '';
  let detectedFrom = '';
  for (const p of pieces) {
    const trimmed = p.trim();
    if (!trimmed) { text += p; continue; }
    const r = await one(trimmed);
    detectedFrom ||= r.detectedFrom;
    const lead = p.slice(0, p.length - p.trimStart().length);
    const trail = p.slice(p.trimEnd().length);
    text += lead + r.text + trail;
  }
  return { text, detectedFrom };
}
