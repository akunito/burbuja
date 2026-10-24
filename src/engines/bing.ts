/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 *
 * Derived from TWP – Translate Web Pages, src/background/translationService.js (bingService),
 * MPL-2.0, https://github.com/FilipePS/Traduzir-paginas-web commit 50a92116. */

import { canonical, toBing } from '../langs';
import { charCost, chunk, translateChunks } from './chunk';
import { type Engine, EngineError, doFetch, httpError } from './types';

// Measured 2026-10-24: 5000 chars → 200 in 7.9 s, 10000 → 200, 20000 → no answer in 15 s.
// No auth token: edge.microsoft.com/translate/auth returns an empty body and TWP stopped sending it.
const BING_BUDGET = 5000;

type BingResponse = { detectedLanguage?: { language?: string }; translations?: { text?: string }[] }[];

export const bing: Engine = {
  id: 'bing',
  timeoutMs: 10_000,
  unavailable: () => null,
  async translate(req, signal) {
    const qs = `isEnterpriseClient=false&to=${encodeURIComponent(toBing(req.to))}` +
      (req.from === 'auto' ? '' : `&from=${encodeURIComponent(toBing(req.from))}`);
    const one = async (text: string) => {
      const res = await doFetch(`https://edge.microsoft.com/translate/translatetext?${qs}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify([text]),
      }, signal);
      // Measured: unknown language code → 400 with empty body.
      if (res.status === 400) throw new EngineError('unsupported_lang', 400);
      if (!res.ok) throw httpError(res.status);
      const j = (await res.json().catch(() => null)) as BingResponse | null;
      const first = j?.[0];
      const t = first?.translations?.[0]?.text;
      if (typeof t !== 'string') throw new EngineError('bad_response');
      return { text: t, detectedFrom: canonical(first?.detectedLanguage?.language) };
    };
    return translateChunks(chunk(req.text, BING_BUDGET, charCost), one);
  },
};
