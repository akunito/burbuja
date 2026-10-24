/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 *
 * Endpoint and client id as used by TWP – Translate Web Pages, src/background/textToSpeech.js,
 * MPL-2.0, https://github.com/FilipePS/Traduzir-paginas-web commit 50a92116. */

import { charCost, chunk } from './engines/chunk';

// Measured 2026-10-24: q of 200 chars → 200, 260 → 400 (limit counts characters, CJK included).
const TTS_BUDGET = 200;
const MAX_TTS_CHARS = 3000;

export async function fetchTts(text: string, lang: string, signal: AbortSignal): Promise<ArrayBuffer[] | null> {
  const pieces = chunk(text.slice(0, MAX_TTS_CHARS), TTS_BUDGET, charCost);
  const tl = encodeURIComponent(lang);
  const out: ArrayBuffer[] = [];
  for (const p of pieces) {
    const q = p.trim();
    if (!q) continue;
    try {
      const res = await fetch(
        `https://translate.google.com/translate_tts?ie=UTF-8&client=dict-chrome-ex&tl=${tl}&q=${encodeURIComponent(q)}`,
        { signal, credentials: 'omit' },
      );
      if (!res.ok) return null;
      out.push(await res.arrayBuffer());
    } catch {
      return null;
    }
  }
  return out.length ? out : null;
}

export function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000) as unknown as number[]);
  return btoa(s);
}

export function fromBase64(b64: string): ArrayBuffer {
  const s = atob(b64);
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  return bytes.buffer;
}
