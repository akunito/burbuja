/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 *
 * Derived from Simple Translate, src/common/translate.ts (sendRequestToDeepL),
 * Copyright (c) 2017-2018 Sienori, MPL-2.0, https://github.com/sienori/simple-translate commit 1ec976cc. */

import { canonical, toDeepLSource, toDeepLTarget } from '../langs';
import { type Engine, EngineError, doFetch, httpError } from './types';

interface DeepLResponse { translations?: { text?: string; detected_source_language?: string }[] }

/** Free keys end in ':fx' (DeepL's documented convention) → api-free host. */
export const deeplHost = (key: string): string =>
  key.endsWith(':fx') ? 'https://api-free.deepl.com' : 'https://api.deepl.com';

export function makeDeepL(getKey: () => string): Engine {
  return {
    id: 'deepl',
    timeoutMs: 8000,
    unavailable(req) {
      if (!getKey()) return 'not_configured';
      if (!toDeepLTarget(req.to)) return 'unsupported_lang';
      if (req.from !== 'auto' && !toDeepLSource(req.from)) return 'unsupported_lang';
      return null;
    },
    async translate(req, signal) {
      const key = getKey();
      const body = new URLSearchParams();
      body.append('text', req.text);
      body.append('target_lang', toDeepLTarget(req.to)!);
      if (req.from !== 'auto') body.append('source_lang', toDeepLSource(req.from)!);
      const res = await doFetch(`${deeplHost(key)}/v2/translate`, {
        method: 'POST',
        headers: { Authorization: `DeepL-Auth-Key ${key}` },
        body,
      }, signal);
      if (!res.ok) throw httpError(res.status);
      const j = (await res.json().catch(() => null)) as DeepLResponse | null;
      const t = j?.translations?.[0];
      if (typeof t?.text !== 'string') throw new EngineError('bad_response');
      return { text: t.text, detectedFrom: canonical(t.detected_source_language) };
    },
  };
}
