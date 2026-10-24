/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// Canonical codes = Google Translate codes (the primary engine). Other engines map to/from these.
export const LANGS: readonly string[] = [
  'af','sq','am','ar','hy','as','ay','az','bm','eu','be','bn','bho','bs','bg','ca','ceb','ny','zh-CN','zh-TW',
  'co','hr','cs','da','dv','doi','nl','en','eo','et','ee','tl','fi','fr','fy','gl','ka','de','el','gn','gu','ht',
  'ha','haw','he','hi','hmn','hu','is','ig','ilo','id','ga','it','ja','jv','kn','kk','km','rw','gom','ko','kri',
  'ku','ckb','ky','lo','la','lv','ln','lt','lg','lb','mk','mai','mg','ms','ml','mt','mi','mr','mni-Mtei','lus',
  'mn','my','ne','no','or','om','ps','fa','pl','pt','pa','qu','ro','ru','sm','sa','gd','nso','sr','st','sn','sd',
  'si','sk','sl','so','es','su','sw','sv','tg','ta','tt','te','th','ti','ts','tr','tk','ak','uk','ur','ug','uz',
  'vi','cy','xh','yi','yo','zu',
];
const LANG_SET = new Set(LANGS);

// Engines and browsers report variants we fold into a canonical code.
const ALIASES: Record<string, string> = {
  iw: 'he', jw: 'jv', nb: 'no', nn: 'no', fil: 'tl', 'zh-hans': 'zh-CN', 'zh-hant': 'zh-TW', zh: 'zh-CN',
  'zh-cn': 'zh-CN', 'zh-tw': 'zh-TW', 'zh-hk': 'zh-TW', 'zh-sg': 'zh-CN', 'sr-cyrl': 'sr', 'sr-latn': 'sr',
  'pt-br': 'pt', 'pt-pt': 'pt', 'en-us': 'en', 'en-gb': 'en', 'mni': 'mni-Mtei', 'kmr': 'ku',
};

/** Any engine/browser code → canonical code, or '' when unknown. */
export function canonical(code: string | undefined | null): string {
  if (!code) return '';
  if (LANG_SET.has(code)) return code;
  const lower = code.toLowerCase();
  const alias = ALIASES[lower];
  if (alias) return alias;
  if (LANG_SET.has(lower)) return lower;
  const base = lower.split(/[-_]/)[0]!;
  return ALIASES[base] ?? (LANG_SET.has(base) ? base : '');
}

/** Default target from the browser's preferred languages, keeping zh-TW vs zh-CN. */
export function defaultTarget(prefs: readonly string[]): string {
  for (const p of prefs) {
    const c = canonical(p);
    if (c) return c;
  }
  return 'en';
}

let names: Intl.DisplayNames | undefined;
let namesLocale = '';
export function langName(code: string, uiLocale: string): string {
  if (code === 'auto') return code;
  if (!names || namesLocale !== uiLocale) {
    names = new Intl.DisplayNames([uiLocale, 'en'], { type: 'language', fallback: 'code' });
    namesLocale = uiLocale;
  }
  const tag = code === 'mni-Mtei' ? 'mni' : code === 'gom' ? 'kok' : code;
  try {
    const n = names.of(tag) ?? code;
    return n.charAt(0).toLocaleUpperCase(uiLocale) + n.slice(1);
  } catch {
    return code;
  }
}

// --- Bing (edge.microsoft.com). Accepts 'no' and 'he' directly (measured 2026-10-24).
const TO_BING: Record<string, string> = {
  'zh-CN': 'zh-Hans', 'zh-TW': 'zh-Hant', tl: 'fil', 'mni-Mtei': 'mni', ku: 'kmr', ckb: 'ku', sr: 'sr-Cyrl',
};
export const toBing = (c: string): string => TO_BING[c] ?? c;

// --- DeepL: separate source (no variants) and target (variants for EN/PT/ZH) sets.
const DEEPL_SOURCE = new Set([
  'ar','bg','cs','da','de','el','en','es','et','fi','fr','he','hu','id','it','ja','ko','lt','lv','nb','nl','pl',
  'pt','ro','ru','sk','sl','sv','th','tr','uk','vi','zh',
]);
export function toDeepLSource(c: string): string | null {
  const d = c === 'no' ? 'nb' : c.startsWith('zh') ? 'zh' : c;
  return DEEPL_SOURCE.has(d) ? d.toUpperCase() : null;
}
export function toDeepLTarget(c: string): string | null {
  switch (c) {
    case 'en': return 'EN-US';
    case 'pt': return 'PT-BR';
    case 'zh-CN': return 'ZH-HANS';
    case 'zh-TW': return 'ZH-HANT';
  }
  return toDeepLSource(c);
}
