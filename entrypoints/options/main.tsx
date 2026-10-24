/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { render } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { browser } from 'wxt/browser';
import type { EngineId } from '../../src/engines/types';
import { ENGINE_LABEL, errText, t, uiLocale } from '../../src/i18n';
import { LANGS, defaultTarget, langName } from '../../src/langs';
import type { TranslateReply } from '../../src/messages';
import { DEEPL_KEY, type Settings, loadDeepLKey, loadSettings, normalize, saveSettings } from '../../src/settings';
import './style.css';

type TestState = { busy: true } | { busy: false; ok: boolean; text: string };

function Options({ initial, initialKey }: { initial: Settings; initialKey: string }) {
  const [s, setS] = useState(initial);
  const [key, setKey] = useState(initialKey);
  const [showKey, setShowKey] = useState(false);
  const [saved, setSaved] = useState(false);
  const [tests, setTests] = useState<Partial<Record<EngineId, TestState>>>({});
  const savedTimer = useRef(0);
  const loc = uiLocale();
  const langs = useMemo(() => LANGS.map((code) => ({ code, name: langName(code, loc) })).sort((a, b) => a.name.localeCompare(b.name, loc)), [loc]);
  const browserLang = defaultTarget(navigator.languages);

  useEffect(() => {
    const theme = s.theme === 'system' ? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark') : s.theme;
    document.documentElement.dataset.theme = theme;
  }, [s.theme]);

  const flash = () => {
    setSaved(true);
    clearTimeout(savedTimer.current);
    savedTimer.current = window.setTimeout(() => setSaved(false), 1200);
  };
  const update = (patch: Partial<Settings>) => {
    const next = normalize({ ...s, ...patch });
    setS(next);
    void saveSettings(next).then(flash);
  };
  const saveKey = (v: string) => {
    setKey(v);
    void browser.storage.local.set({ [DEEPL_KEY]: v.trim() }).then(flash);
  };
  const move = (i: number, d: -1 | 1) => {
    const e = s.engines.slice();
    const j = i + d;
    if (j < 0 || j >= e.length) return;
    [e[i], e[j]] = [e[j]!, e[i]!];
    update({ engines: e });
  };
  const test = async (id: EngineId) => {
    setTests((x) => ({ ...x, [id]: { busy: true } }));
    const to = s.targetLang || browserLang;
    const r = (await browser.runtime.sendMessage({ type: 'translate', id: Date.now(), text: 'Good morning, how are you?', from: 'en', to: to === 'en' ? 'es' : to, engine: id })) as TranslateReply;
    const err = !r.ok ? r.attempts.find((a) => a.error)?.error : undefined;
    setTests((x) => ({ ...x, [id]: { busy: false, ok: r.ok, text: r.ok ? t('optTestOk', r.text) : err ? errText(err) : t('uiFailed') } }));
  };

  return (
    <main>
      <header><img src="/icon/128.png" alt="" /><h1>{t('optTitle')}</h1></header>

      <section>
        <h2>{t('optLanguages')}</h2>
        <div class="row">
          <label for="target">{t('optTarget')}</label>
          <select id="target" value={s.targetLang} onChange={(e) => update({ targetLang: e.currentTarget.value })}>
            <option value="">{t('optBrowserLang', langName(browserLang, loc))}</option>
            {langs.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}
          </select>
        </div>
        <div class="row">
          <label for="second">{t('optSecond')}</label>
          <select id="second" value={s.secondLang} onChange={(e) => update({ secondLang: e.currentTarget.value })}>
            <option value="">{t('optOff')}</option>
            {langs.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}
          </select>
        </div>
      </section>

      <section>
        <h2>{t('optEngines')}</h2>
        <p class="help" style={{ marginTop: 0 }}>{t('optEnginesHelp')}</p>
        <ul class="engines">
          {s.engines.map((e, i) => {
            const ts = tests[e.id];
            return (
              <li class="engine" key={e.id}>
                <input type="checkbox" id={`en-${e.id}`} checked={e.enabled} title={t('optEnabled')}
                  onChange={(ev) => update({ engines: s.engines.map((x) => (x.id === e.id ? { ...x, enabled: ev.currentTarget.checked } : x)) })} />
                <label class="name" for={`en-${e.id}`}>{ENGINE_LABEL[e.id]}</label>
                <button class="icon-btn" aria-label={t('optUp')} title={t('optUp')} disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
                <button class="icon-btn" aria-label={t('optDown')} title={t('optDown')} disabled={i === s.engines.length - 1} onClick={() => move(i, 1)}>↓</button>
                <button disabled={ts?.busy} onClick={() => void test(e.id)}>{t('optTest')}</button>
                {ts && !ts.busy && <div class={`result ${ts.ok ? 'ok' : 'bad'}`} role="status">{ts.text}</div>}
              </li>
            );
          })}
        </ul>
        <div class="row col">
          <label for="deepl">{t('optDeepLKey')}</label>
          <div class="key">
            <input id="deepl" type={showKey ? 'text' : 'password'} autocomplete="off" spellcheck={false} value={key}
              onChange={(e) => saveKey(e.currentTarget.value)} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx:fx" />
            <button onClick={() => setShowKey(!showKey)}>{showKey ? t('optHide') : t('optShow')}</button>
          </div>
          <p class="help">{t('optDeepLHelp')}</p>
        </div>
      </section>

      <section>
        <h2>{t('optAppearance')}</h2>
        <div class="row">
          <span>{t('optTheme')}</span>
          <div class="radios" role="radiogroup" aria-label={t('optTheme')}>
            {(['dark', 'light', 'system'] as const).map((th) => (
              <label key={th}><input type="radio" name="theme" checked={s.theme === th} onChange={() => update({ theme: th })} /> {t(th === 'dark' ? 'optDark' : th === 'light' ? 'optLight' : 'optSystem')}</label>
            ))}
          </div>
        </div>
      </section>

      <section>
        <h2>{t('optBehaviour')}</h2>
        <div class="row col">
          <span>{t('optTrigger')}</span>
          <div class="radios stack" role="radiogroup" aria-label={t('optTrigger')}>
            <label><input type="radio" name="trigger" checked={s.trigger === 'icon'} onChange={() => update({ trigger: 'icon' })} /> {t('optTriggerIcon')}</label>
            <label><input type="radio" name="trigger" checked={s.trigger === 'shortcut'} onChange={() => update({ trigger: 'shortcut' })} /> {t('optTriggerShortcut')}</label>
          </div>
          <p class="help">{t('optShortcutHelp')}</p>
        </div>
        <div class="row">
          <label for="max">{t('optMaxChars')}</label>
          <input id="max" type="number" min={1} max={50000} step={100} value={s.maxChars} onChange={(e) => update({ maxChars: Number(e.currentTarget.value) })} />
        </div>
        <div class="row">
          <label for="ign">{t('optIgnoreEditable')}</label>
          <input id="ign" type="checkbox" checked={s.ignoreEditable} onChange={(e) => update({ ignoreEditable: e.currentTarget.checked })} />
        </div>
        <div class="row">
          <label for="dict">{t('optShowDict')}</label>
          <input id="dict" type="checkbox" checked={s.showDict} onChange={(e) => update({ showDict: e.currentTarget.checked })} />
        </div>
        <div class="row col">
          <label for="excl">{t('optExcluded')}</label>
          <textarea id="excl" spellcheck={false} value={s.excludedHosts.join('\n')} placeholder="example.com"
            onChange={(e) => update({ excludedHosts: e.currentTarget.value.split('\n').map((x) => x.trim()).filter(Boolean) })} />
        </div>
      </section>

      <p class="privacy">{t('optPrivacy')}</p>
      {saved && <div class="toast" role="status">{t('optSaved')}</div>}
    </main>
  );
}

document.title = t('optTitle');
document.documentElement.lang = uiLocale();
void Promise.all([loadSettings(), loadDeepLKey()]).then(([s, k]) => render(<Options initial={s} initialKey={k} />, document.getElementById('app')!));
