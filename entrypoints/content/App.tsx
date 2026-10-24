/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { ChainResult } from '../../src/engines/chain';
import { ENGINE_IDS, type EngineId } from '../../src/engines/types';
import { ENGINE_LABEL, errText, t } from '../../src/i18n';
import type { Picked } from '../../src/selection';
import { place } from '../../src/selection';

export interface PanelState {
  text: string;
  from: string;
  to: string;
  loading: boolean;
  result?: ChainResult;
  enginesEnabled: readonly EngineId[];
}

export interface ViewState {
  theme: 'dark' | 'light';
  icon?: { x: number; y: number };
  anchor?: Picked['rect'];
  panel?: PanelState;
  speaking: boolean;
  showDict: boolean;
  langs: readonly { code: string; name: string }[];
  langName: (code: string) => string;
}

export interface Actions {
  openFromIcon(): void;
  setFrom(code: string): void;
  setTo(code: string): void;
  swap(): void;
  useEngine(id: EngineId | undefined): void;
  listen(): void;
  copy(): Promise<boolean>;
  close(): void;
  settings(): void;
}

const I = {
  logo: <svg viewBox="0 0 24 24" fill="none"><path d="M4 5h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-8l-4.5 3.5V17H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z" fill="currentColor" style="color:var(--accent)"/><text x="12" y="13.6" font-size="7.5" font-weight="700" text-anchor="middle" fill="var(--accent-fg)" font-family="system-ui,sans-serif">Aa</text></svg>,
  swap: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 7h13l-4-4M17 17H4l4 4"/></svg>,
  speak: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H3v6h3l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/></svg>,
  stop: <svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>,
  copy: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>,
  gear: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>,
  close: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>,
};

export function App({ s, a }: { s: ViewState; a: Actions }) {
  return (
    <div class="root" data-theme={s.theme}>
      {s.icon && !s.panel && (
        <button
          class="icon" data-testid="icon" title={t('uiTranslate')} aria-label={t('uiTranslate')}
          style={{ left: `${s.icon.x}px`, top: `${s.icon.y}px` }}
          // mousedown default would collapse the page selection before click fires
          onPointerDown={(e) => e.preventDefault()} onMouseDown={(e) => e.preventDefault()}
          onClick={a.openFromIcon}
        >{I.logo}</button>
      )}
      {s.panel && s.anchor && <Panel s={s} p={s.panel} anchor={s.anchor} a={a} />}
    </div>
  );
}

function Panel({ s, p, anchor, a }: { s: ViewState; p: PanelState; anchor: Picked['rect']; a: Actions }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const [menu, setMenu] = useState(false);
  const [copied, setCopied] = useState(false);
  const r = p.result;
  const detected = r?.ok ? r.detectedFrom : '';
  const effFrom = p.from === 'auto' ? detected : p.from;
  const effTo = r?.ok ? r.to : p.to;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const next = place(anchor, el.offsetWidth, el.offsetHeight, innerWidth, innerHeight);
    if (!pos || Math.abs(next.top - pos.top) > 1 || Math.abs(next.left - pos.left) > 1) setPos(next);
  });
  useEffect(() => { setMenu(false); }, [p.loading]);
  useEffect(() => { if (!copied) return; const id = setTimeout(() => setCopied(false), 1200); return () => clearTimeout(id); }, [copied]);

  return (
    <div
      class="panel" ref={ref} role="dialog" aria-label="Burbuja" data-testid="panel"
      style={{ left: `${pos?.left ?? -9999}px`, top: `${pos?.top ?? 0}px` }}
    >
      <div class="bar">
        <select aria-label={t('uiSource')} title={t('uiSource')} data-testid="from" value={p.from} onChange={(e) => a.setFrom(e.currentTarget.value)}>
          <option value="auto">{detected ? t('uiDetected', s.langName(detected)) : t('uiAutoDetect')}</option>
          {s.langs.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}
        </select>
        <button class="btn" title={t('uiSwap')} aria-label={t('uiSwap')} data-testid="swap" disabled={!effFrom || p.loading} onClick={a.swap}>{I.swap}</button>
        <select aria-label={t('uiTarget')} title={t('uiTarget')} data-testid="to" value={effTo} onChange={(e) => a.setTo(e.currentTarget.value)}>
          {s.langs.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}
        </select>
      </div>

      <div class="body" aria-live="polite">
        {p.loading && <div class="loading"><span class="spinner" />{t('uiLoading')}</div>}
        {!p.loading && r?.ok && (
          <>
            <div class="out" dir="auto" lang={effTo} data-testid="out">{r.text}</div>
            {s.showDict && r.dict && r.dict.length > 0 && (
              <div class="dict" aria-label={t('uiDictionary')} data-testid="dict">
                {r.dict.map((d) => <div class="dict-row" key={d.pos}><span class="dict-pos">{d.pos}</span><span dir="auto">{d.terms.join(', ')}</span></div>)}
              </div>
            )}
          </>
        )}
        {!p.loading && r && !r.ok && (
          <div data-testid="error">
            <div class="error">{t('uiFailed')}</div>
            <ul class="attempts">
              {r.attempts.filter((x) => x.error && x.error !== 'not_configured').map((x) => <li key={x.engine}>{ENGINE_LABEL[x.engine]}: {errText(x.error!)}</li>)}
            </ul>
            <button class="link" onClick={() => a.useEngine(undefined)}>{t('uiRetry')}</button>
          </div>
        )}
      </div>

      <div class="foot">
        {r?.ok && (
          <button class="chip" data-testid="engine" title={t('uiEngine', ENGINE_LABEL[r.engine])} aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu(!menu)}>
            {ENGINE_LABEL[r.engine]} <span aria-hidden="true">▾</span>
          </button>
        )}
        {menu && r?.ok && (
          <div class="menu" role="menu">
            {ENGINE_IDS.filter((id) => p.enginesEnabled.includes(id)).map((id) => (
              <button role="menuitem" key={id} data-engine={id} aria-current={id === r.engine} onClick={() => { setMenu(false); a.useEngine(id); }}>{ENGINE_LABEL[id]}</button>
            ))}
          </div>
        )}
        <span class="spacer" />
        {copied && <span class="toast" role="status">{t('uiCopied')}</span>}
        <button class={`btn${s.speaking ? ' on' : ''}`} title={s.speaking ? t('uiStop') : t('uiListen')} aria-label={s.speaking ? t('uiStop') : t('uiListen')} data-testid="listen" disabled={!r?.ok} onClick={a.listen}>{s.speaking ? I.stop : I.speak}</button>
        <button class="btn" title={t('uiCopy')} aria-label={t('uiCopy')} data-testid="copy" disabled={!r?.ok} onClick={async () => setCopied(await a.copy())}>{I.copy}</button>
        <button class="btn" title={t('uiSettings')} aria-label={t('uiSettings')} onClick={a.settings}>{I.gear}</button>
        <button class="btn" title={t('uiClose')} aria-label={t('uiClose')} data-testid="close" onClick={a.close}>{I.close}</button>
      </div>
    </div>
  );
}
