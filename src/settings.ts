/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { browser } from 'wxt/browser';
import { ENGINE_IDS, type EngineId } from './engines/types';

export type Theme = 'dark' | 'light' | 'system';
export type Trigger = 'icon' | 'shortcut';

export interface Settings {
  v: 1;
  /** '' = follow the browser's preferred language. */
  targetLang: string;
  /** Target used when the text is already in targetLang. '' = off. */
  secondLang: string;
  engines: { id: EngineId; enabled: boolean }[];
  theme: Theme;
  trigger: Trigger;
  maxChars: number;
  ignoreEditable: boolean;
  showDict: boolean;
  excludedHosts: string[];
}

export const DEFAULTS: Settings = {
  v: 1,
  targetLang: '',
  secondLang: 'en',
  engines: ENGINE_IDS.map((id) => ({ id, enabled: true })),
  theme: 'dark',
  trigger: 'icon',
  maxChars: 5000,
  ignoreEditable: true,
  showDict: true,
  excludedHosts: [],
};

const SYNC_KEY = 'settings';
// The DeepL key never goes to storage.sync (it would leave the device with the Firefox account).
export const DEEPL_KEY = 'deeplKey';

/** Merge stored data over defaults; unknown engines dropped, new engines appended enabled. */
export function normalize(raw: unknown): Settings {
  const s = { ...DEFAULTS, ...(raw && typeof raw === 'object' ? (raw as Partial<Settings>) : {}) } as Settings;
  const seen = new Set<EngineId>();
  const engines: Settings['engines'] = [];
  for (const e of Array.isArray(s.engines) ? s.engines : []) {
    if (e && ENGINE_IDS.includes(e.id) && !seen.has(e.id)) { seen.add(e.id); engines.push({ id: e.id, enabled: !!e.enabled }); }
  }
  for (const id of ENGINE_IDS) if (!seen.has(id)) engines.push({ id, enabled: true });
  s.engines = engines;
  if (!Number.isFinite(s.maxChars) || s.maxChars < 1) s.maxChars = DEFAULTS.maxChars;
  if (!Array.isArray(s.excludedHosts)) s.excludedHosts = [];
  s.v = 1;
  return s;
}

export async function loadSettings(): Promise<Settings> {
  const got = await browser.storage.sync.get(SYNC_KEY).catch(() => ({} as Record<string, unknown>));
  return normalize(got[SYNC_KEY]);
}

export async function saveSettings(s: Settings): Promise<void> {
  await browser.storage.sync.set({ [SYNC_KEY]: normalize(s) });
}

export function onSettingsChanged(cb: (s: Settings) => void): () => void {
  const l = (changes: Record<string, { newValue?: unknown }>, area: string) => {
    if (area === 'sync' && changes[SYNC_KEY]) cb(normalize(changes[SYNC_KEY].newValue));
  };
  browser.storage.onChanged.addListener(l);
  return () => browser.storage.onChanged.removeListener(l);
}

export async function loadDeepLKey(): Promise<string> {
  const got = await browser.storage.local.get(DEEPL_KEY).catch(() => ({} as Record<string, unknown>));
  const k = got[DEEPL_KEY];
  return typeof k === 'string' ? k.trim() : '';
}
