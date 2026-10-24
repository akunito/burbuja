/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 *
 * Derived from Simple Translate, src/common/translate.ts (sendRequestToGoogle),
 * Copyright (c) 2017-2018 Sienori, MPL-2.0, https://github.com/sienori/simple-translate commit 1ec976cc. */

import { canonical } from '../langs';
import { chunk, translateChunks, urlBytes } from './chunk';
import { type DictEntry, type Engine, EngineError, type EngineRequest, type EngineResult, doFetch, httpError } from './types';

// Public key embedded in Google's own web translator (same one Simple Translate and TWP use).
const PA_KEY = 'AIzaSyDLEeFI5OtFBwYBIoK_jj5m32rZK5CkCXA';
// Measured 2026-10-24: GET fails with 400 above ~16 KB of URL (Polish 12k chars, CJK 2k chars). POST is rejected.
const PA_TEXT_BUDGET = 12_000;

interface PaResponse {
  translation?: string;
  sourceLanguage?: string;
  // absent when query.source_language is fixed (Simple Translate reads it unguarded)
  detectedLanguages?: { srclangs?: string[] };
  bilingualDictionary?: { pos: string; entry: { word: string }[] }[];
}

/** Single word (no whitespace, short) → also ask for the bilingual dictionary. */
export const isSingleWord = (t: string): boolean => t.length <= 40 && !/\s/.test(t);

export const googlePa: Engine = {
  id: 'google',
  timeoutMs: 6000,
  unavailable: () => null,
  async translate(req: EngineRequest, signal: AbortSignal): Promise<EngineResult> {
    let dict: DictEntry[] | undefined;
    const one = async (text: string) => {
      const p = new URLSearchParams();
      p.append('params.client', 'gtx');
      p.append('query.source_language', req.from);
      p.append('query.target_language', req.to);
      p.append('query.display_language', req.to);
      p.append('query.text', text);
      p.append('key', PA_KEY);
      p.append('data_types', 'TRANSLATION');
      const wantDict = isSingleWord(text);
      if (wantDict) p.append('data_types', 'BILINGUAL_DICTIONARY_FULL');
      const res = await doFetch(`https://translate-pa.googleapis.com/v1/translate?${p}`, {}, signal);
      if (!res.ok) throw httpError(res.status);
      const j = (await res.json().catch(() => null)) as PaResponse | null;
      if (!j || typeof j.translation !== 'string') throw new EngineError('bad_response');
      if (wantDict && j.bilingualDictionary?.length) {
        dict = j.bilingualDictionary.map((d) => ({ pos: d.pos, terms: d.entry.slice(0, 6).map((e) => e.word) }));
      }
      return { text: j.translation, detectedFrom: canonical(j.sourceLanguage ?? j.detectedLanguages?.srclangs?.[0]) };
    };
    const r = await translateChunks(chunk(req.text, PA_TEXT_BUDGET, urlBytes), one);
    return dict ? { ...r, dict } : r;
  },
};

interface GtxResponse {
  sentences?: { trans?: string }[];
  src?: string;
  dict?: { pos: string; terms: string[] }[];
}

/** Second Google variant without key (translate_a/single, client=gtx). Survives a translate-pa key rotation. */
export const googleGtx: Engine = {
  id: 'google-gtx',
  timeoutMs: 6000,
  unavailable: () => null,
  async translate(req, signal) {
    let dict: DictEntry[] | undefined;
    const one = async (text: string) => {
      const p = new URLSearchParams();
      p.append('client', 'gtx');
      p.append('sl', req.from);
      p.append('tl', req.to);
      p.append('hl', req.to);
      p.append('dt', 't');
      const wantDict = isSingleWord(text);
      if (wantDict) p.append('dt', 'bd');
      p.append('dj', '1');
      p.append('q', text);
      const res = await doFetch(`https://translate.googleapis.com/translate_a/single?${p}`, {}, signal);
      if (!res.ok) throw httpError(res.status);
      const j = (await res.json().catch(() => null)) as GtxResponse | null;
      if (!j || !Array.isArray(j.sentences)) throw new EngineError('bad_response');
      let out = '';
      for (const s of j.sentences) if (s.trans) out += s.trans;
      if (wantDict && j.dict?.length) dict = j.dict.map((d) => ({ pos: d.pos, terms: d.terms.slice(0, 6) }));
      return { text: out, detectedFrom: canonical(j.src) };
    };
    const r = await translateChunks(chunk(req.text, PA_TEXT_BUDGET, urlBytes), one);
    return dict ? { ...r, dict } : r;
  },
};
