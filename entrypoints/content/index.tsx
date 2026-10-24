/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { render } from 'preact';
import { browser } from 'wxt/browser';
import { createShadowRootUi, type ShadowRootContentScriptUi } from 'wxt/utils/content-script-ui/shadow-root';
import { playChunks, primeAudio, speakFallback, stopAudio } from '../../src/audio';
import type { EngineId } from '../../src/engines/types';
import { uiLocale } from '../../src/i18n';
import { LANGS, defaultTarget, langName } from '../../src/langs';
import type { CommandMsg, ToBackground, TranslateReply, TtsReply } from '../../src/messages';
import { hostExcluded, pickSelection, type Picked } from '../../src/selection';
import { type Settings, loadSettings, onSettingsChanged } from '../../src/settings';
import { type Actions, App, type ViewState } from './App';
import css from './bubble.css?inline';

const ICON_SIZE = 28;
const ICON_TTL_MS = 4000;
// Selenium cannot see into a closed root; e2e builds (WXT_E2E=1) open it.
const SHADOW_MODE = import.meta.env.WXT_E2E === '1' ? 'open' : 'closed';

const mark = (k: string, v: string) => { if (import.meta.env.WXT_E2E === '1') document.documentElement.dataset[k] = v; };
const send = <R,>(m: ToBackground): Promise<R> => browser.runtime.sendMessage(m) as Promise<R>;

export default defineContentScript({
  matches: ['<all_urls>'],
  allFrames: true,
  matchAboutBlank: true,
  runAt: 'document_idle',
  cssInjectionMode: 'manual',
  main(ctx) {
    if (import.meta.env.WXT_E2E === '1') document.documentElement.dataset.burbuja = 'loaded';
    let settings: Settings | undefined;
    let settingsP: Promise<Settings> | undefined;
    const getSettings = () => (settingsP ??= loadSettings().then((s) => (settings = s)));
    onSettingsChanged((s) => { settings = s; if (ui) paint(); });

    let ui: ShadowRootContentScriptUi<HTMLElement> | undefined;
    let uiP: Promise<void> | undefined;
    let pending: Picked | undefined;
    let iconTimer = 0;
    let reqId = 0;
    let langsCache: { loc: string; list: ViewState['langs'] } | undefined;

    const view: ViewState = {
      theme: 'dark', speaking: false, showDict: true, langs: [],
      langName: (c) => langName(c, uiLocale()),
    };

    const resolveTheme = (s: Settings): 'dark' | 'light' =>
      s.theme === 'system' ? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark') : s.theme;

    const langs = () => {
      const loc = uiLocale();
      if (langsCache?.loc !== loc) {
        const list = LANGS.map((code) => ({ code, name: langName(code, loc) }));
        list.sort((x, y) => x.name.localeCompare(y.name, loc));
        langsCache = { loc, list };
      }
      return langsCache.list;
    };

    const ensureUi = () => (uiP ??= (async () => {
      ui = await createShadowRootUi(ctx, {
        name: 'burbuja-ui',
        position: 'inline',
        anchor: document.documentElement,
        append: 'last',
        mode: SHADOW_MODE,
        css,
        isolateEvents: true,
        onMount(container, _shadow, host) {
          host.style.cssText = 'position:fixed!important;left:0!important;top:0!important;width:0!important;height:0!important;overflow:visible!important;z-index:2147483647!important;display:block!important;';
          container.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); actions.close(); } });
          return container;
        },
        onRemove(container) { if (container) render(null, container); },
      });
      ui.mount();
    })());

    const paint = () => {
      if (!ui?.mounted) return;
      if (settings) { view.theme = resolveTheme(settings); view.showDict = settings.showDict; }
      view.langs = langs();
      render(<App s={view} a={actions} />, ui.mounted);
    };

    const hideIcon = () => {
      clearTimeout(iconTimer);
      if (view.icon) { view.icon = undefined; paint(); }
    };

    const translate = (engine?: EngineId) => {
      const p = view.panel;
      if (!p) return;
      const id = ++reqId;
      p.loading = true;
      paint();
      send<TranslateReply>({ type: 'translate', id, text: p.text, from: p.from, to: p.to, engine })
        .then((r) => {
          // stale replies (swap, engine switch, new selection) are dropped here; the background aborts them too
          if (id !== reqId || view.panel !== p) return;
          p.loading = false;
          p.result = r;
          paint();
        }, () => {
          if (id !== reqId || view.panel !== p) return;
          p.loading = false;
          p.result = { ok: false, aborted: false, attempts: [] };
          paint();
        });
    };

    const open = async (picked: Picked) => {
      const s = await getSettings();
      await ensureUi();
      stopAudio();
      hideIcon();
      view.speaking = false;
      view.anchor = picked.rect;
      view.panel = {
        text: picked.text, from: 'auto', to: s.targetLang || defaultTarget(navigator.languages),
        loading: true, enginesEnabled: s.engines.filter((e) => e.enabled).map((e) => e.id),
      };
      translate();
    };

    const actions: Actions = {
      openFromIcon() { if (pending) void open(pending); },
      setFrom(code) { if (view.panel) { view.panel.from = code; translate(); } },
      setTo(code) { if (view.panel) { view.panel.to = code; translate(); } },
      swap() {
        const p = view.panel;
        const r = p?.result;
        if (!p || !r?.ok) return;
        const from = p.from === 'auto' ? r.detectedFrom : p.from;
        if (!from) return;
        p.text = r.text;
        p.from = r.to;
        p.to = from;
        translate();
      },
      useEngine(id) { translate(id); },
      async listen() {
        const r = view.panel?.result;
        if (view.speaking) { stopAudio(); view.speaking = false; paint(); return; }
        if (!r?.ok) return;
        primeAudio();
        view.speaking = true;
        paint();
        const reply = await send<TtsReply>({ type: 'tts', text: r.text, lang: r.to }).catch(() => ({ ok: false }) as TtsReply);
        if (!view.speaking) return;
        mark('burbujaAudio', reply.ok ? `chunks:${reply.chunks.length}` : 'tts-failed');
        try {
          if (reply.ok) await playChunks(reply.chunks);
          else await speakFallback(r.text, r.to);
          mark('burbujaAudio', 'ended');
        } catch (e) {
          mark('burbujaAudio', `error:${(e as Error)?.name}`);
          await speakFallback(r.text, r.to);
        }
        view.speaking = false;
        paint();
      },
      async copy() {
        const r = view.panel?.result;
        if (!r?.ok) return false;
        try {
          await navigator.clipboard.writeText(r.text);
          return true;
        } catch {
          const ta = document.createElement('textarea');
          ta.value = r.text;
          ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
          ui?.mounted?.append(ta);
          ta.select();
          const ok = document.execCommand('copy');
          ta.remove();
          return ok;
        }
      },
      close() {
        stopAudio();
        view.speaking = false;
        if (view.panel) { reqId++; void send({ type: 'cancel' }).catch(() => {}); }
        view.panel = undefined;
        view.icon = undefined;
        paint();
      },
      settings() { void send({ type: 'openOptions' }); },
    };

    const inOurUi = (e: Event) => !!ui && e.composedPath().includes(ui.shadowHost);

    const check = async (px?: number, py?: number) => {
      const s = await getSettings();
      if (s.trigger !== 'icon' || hostExcluded(location.hostname, s.excludedHosts)) return;
      const picked = pickSelection(document, { ignoreEditable: s.ignoreEditable, maxChars: s.maxChars, host: ui?.shadowHost });
      if (!picked) return;
      if (view.panel && view.panel.text === picked.text) return;
      pending = picked;
      await ensureUi();
      let x = px ?? picked.rect.right;
      let y = py ?? picked.rect.bottom;
      x = Math.max(4, Math.min(x + 6, innerWidth - ICON_SIZE - 4));
      y = Math.max(4, Math.min(y + 10, innerHeight - ICON_SIZE - 4));
      view.icon = { x, y };
      paint();
      clearTimeout(iconTimer);
      iconTimer = window.setTimeout(hideIcon, ICON_TTL_MS);
    };

    ctx.addEventListener(document, 'pointerdown', (e: PointerEvent) => {
      if (inOurUi(e)) return;
      pending = undefined;
      if (view.icon || view.panel) actions.close();
    }, { capture: true });

    ctx.addEventListener(document, 'pointerup', (e: PointerEvent) => {
      if (e.button !== 0 || inOurUi(e)) return;
      const x = e.clientX, y = e.clientY;
      // the selection is final only after the mouseup default action
      setTimeout(() => void check(x, y), 0);
    }, { capture: true });

    let keyTimer = 0;
    ctx.addEventListener(document, 'keyup', (e: KeyboardEvent) => {
      if (inOurUi(e) || !(e.shiftKey || e.key === 'Shift' || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a'))) return;
      clearTimeout(keyTimer);
      keyTimer = window.setTimeout(() => void check(), 250);
    }, { capture: true });

    ctx.addEventListener(document, 'keydown', (e: KeyboardEvent) => {
      if (e.key === 'Escape' && (view.panel || view.icon)) actions.close();
    }, { capture: true });

    ctx.addEventListener(window, 'scroll', () => { if (view.icon && !view.panel) hideIcon(); }, { capture: true, passive: true });

    browser.runtime.onMessage.addListener((raw: unknown) => {
      const m = raw as CommandMsg;
      if (m?.type !== 'command' || m.name !== 'translate-selection') return;
      void getSettings().then((s) => {
        if (hostExcluded(location.hostname, s.excludedHosts)) return;
        const picked = pickSelection(document, { ignoreEditable: false, maxChars: s.maxChars, host: ui?.shadowHost });
        if (picked) void open(picked);
      });
    });
  },
});
