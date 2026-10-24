/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { browser } from 'wxt/browser';
import { Translator } from '../src/engines/chain';
import { bing } from '../src/engines/bing';
import { makeDeepL } from '../src/engines/deepl';
import { googleGtx, googlePa } from '../src/engines/google';
import type { Engine, EngineId } from '../src/engines/types';
import { defaultTarget } from '../src/langs';
import type { CommandMsg, ToBackground, TranslateReply, TtsReply } from '../src/messages';
import { DEEPL_KEY, DEFAULTS, type Settings, loadDeepLKey, loadSettings, onSettingsChanged } from '../src/settings';
import { fetchTts, toBase64 } from '../src/tts';

export default defineBackground(() => {
  let settings: Settings = DEFAULTS;
  let deeplKey = '';
  let enabledOrder: EngineId[] = DEFAULTS.engines.map((e) => e.id);
  const apply = (s: Settings) => {
    settings = s;
    enabledOrder = s.engines.filter((e) => e.enabled).map((e) => e.id);
  };
  const ready = Promise.all([
    loadSettings().then(apply),
    loadDeepLKey().then((k) => { deeplKey = k; }),
  ]);
  onSettingsChanged(apply);
  browser.storage.onChanged.addListener((ch, area) => {
    if (area === 'local' && ch[DEEPL_KEY]) deeplKey = typeof ch[DEEPL_KEY].newValue === 'string' ? (ch[DEEPL_KEY].newValue as string).trim() : '';
  });

  const engines = new Map<EngineId, Engine>([
    ['google', googlePa], ['google-gtx', googleGtx], ['bing', bing], ['deepl', makeDeepL(() => deeplKey)],
  ]);
  const translator = new Translator(engines, () => enabledOrder);
  // One in-flight translation per frame: a new request (swap, engine switch, new selection) aborts the previous one.
  const inflight = new Map<string, AbortController>();

  browser.runtime.onMessage.addListener((raw: unknown, sender, sendResponse: (r: unknown) => void) => {
    const msg = raw as ToBackground;
    const key = `${sender.tab?.id ?? -1}:${sender.frameId ?? 0}`;
    switch (msg.type) {
      case 'translate': {
        inflight.get(key)?.abort();
        const ac = new AbortController();
        inflight.set(key, ac);
        ready.then(() => {
          const to = msg.to || settings.targetLang || defaultTarget(navigator.languages);
          return translator.run({ text: msg.text, from: msg.from || 'auto', to, engine: msg.engine, secondLang: settings.secondLang }, ac.signal);
        }).then((r) => {
          if (inflight.get(key) === ac) inflight.delete(key);
          sendResponse({ ...r, id: msg.id } satisfies TranslateReply);
        }, () => sendResponse({ ok: false, aborted: false, attempts: [], id: msg.id } satisfies TranslateReply));
        return true;
      }
      case 'cancel':
        inflight.get(key)?.abort();
        inflight.delete(key);
        return false;
      case 'tts': {
        fetchTts(msg.text, msg.lang, AbortSignal.timeout(15_000)).then((chunks) => {
          if (!chunks) return sendResponse({ ok: false } satisfies TtsReply);
          sendResponse({ ok: true, chunks: import.meta.env.BROWSER === 'firefox' ? chunks : chunks.map(toBase64) } satisfies TtsReply);
        });
        return true;
      }
      case 'openOptions':
        browser.runtime.openOptionsPage();
        return false;
    }
    return false;
  });

  browser.commands?.onCommand.addListener(async (name) => {
    if (name !== 'translate-selection') return;
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab?.id != null) browser.tabs.sendMessage(tab.id, { type: 'command', name } satisfies CommandMsg).catch(() => {});
  });
});
