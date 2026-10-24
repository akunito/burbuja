# Burbuja — implementation plan (v1)

Spec and decisions: Plane BUR-1 (https://plane.akunito.com, project BUR). Tickets: BUR-2 skeleton, BUR-3 engines, BUR-4 bubble, BUR-5 options, BUR-6 release, BUR-7 OCR (v2), BUR-8 Chrome/history (v2). Plan written 2026-10-24.

## 0. Measured facts this plan rests on (2026-10-24, curl from DESK)

| Check | Result |
|---|---|
| Google `translate-pa.googleapis.com/v1/translate` GET, public web key `AIzaSyDLEeFI5OtFBwYBIoK_jj5m32rZK5CkCXA`, `params.client=gtx`, `query.source_language=auto` | 200 in 0.16 s, JSON `{translation, sourceLanguage, detectedLanguages.srclangsConfidences}` |
| Google GET length limit | Polish 6000 chars OK, 12000 → 400. CJK 1500 OK, 2000 → 400. Limit is URL bytes (~16 KB), not chars. |
| Google POST form body to the same endpoint | 400 (not supported) |
| Bing `edge.microsoft.com/translate/translatetext?isEnterpriseClient=false&to=es`, JSON body `["text"]`, **no auth** | 200 in 0.24 s, `[{detectedLanguage:{language,score}, translations:[{text,to}]}]`. TWP also stopped sending the token (its auth line is commented out). |
| Bing `edge.microsoft.com/translate/auth` | empty body today; `api-edge.cognitive…` without token → 401. Do not depend on the token. |
| Bing 5000 / 10000 chars | 200 (7.9 s / 0.65 s); 20000 timed out at 15 s |
| Google TTS `translate.google.com/translate_tts?ie=UTF-8&tl=es&client=dict-chrome-ex&q=…` | 200 `audio/mpeg` |
| DeepL Free `api-free.deepl.com/v2/translate` without key | 403 (needs the user's free key; header `Authorization: DeepL-Auth-Key <key>`) |
| Tooling (npm, 2026-10-24) | wxt 0.21.4, preact 11.0.2, @preact/preset-vite 2.10.6, vitest 5.0.5, typescript 7.0.2, web-ext 10.8.0, happy-dom 21.0.4, tesseract.js 7.0.0 |
| Local browsers | Zen 1.22.1b (`zen-beta`, running), Brave |

Sources read: Simple Translate `src/common/translate.ts` (MPL-2.0, Google translate-pa + DeepL), TWP `src/background/translationService.js` + `textToSpeech.js` (MPL-2.0, Bing edge + Google/Bing TTS).

## 1. Architecture

WXT project, one codebase, two targets: `firefox` (MV2 event page, what Zen/Firefox take best today) and `chrome` (MV3 service worker, v2 milestone but must build from day one).

```
entrypoints/
  background.ts        engines + fallback chain + TTS fetch + settings cache; all network lives here
  content/index.tsx    selection watcher, trigger icon, bubble (Preact in a closed shadow root)
  options/             options page (Preact)
src/engines/
  types.ts             Engine, TranslateRequest, TranslateResult, EngineError(kind)
  google.ts            translate-pa adapter (MPL-2.0, derived from Simple Translate)
  bing.ts              edge translatetext adapter (MPL-2.0, derived from TWP)
  deepl.ts             DeepL Free/Pro adapter (MPL-2.0, derived from Simple Translate)
  chain.ts             fallback orchestrator + cache
  chunk.ts             splitter by sentence under a byte/char budget
  langs.ts             canonical language list + per-engine code maps
src/tts.ts             Google TTS chunked fetch, speechSynthesis fallback
src/settings.ts        typed settings, defaults, storage.sync + storage.local split, change listener
src/messages.ts        typed message contract content ⇄ background
tests/                 vitest unit + fixtures/ (real responses captured 2026-10-24)
scripts/               docker wrappers (npm, build, test, sign)
```

Why network in the background (corrected after audit): translate-pa reflects `Origin` and Bing edge sends `ACAO: *`, so CORS is not the reason. The reasons: the page's CSP `connect-src` applies to content-script fetches, Google TTS and DeepL send no ACAO, the DeepL key must never reach page context, and one shared cache/backoff.

### Message contract (`src/messages.ts`)
- `translate {text, from: 'auto'|code, to: code, engine?: EngineId}` → `{ok:true, text, detectedFrom, engine, attempts:[{engine, error?}]}` or `{ok:false, attempts}`.
- `tts {text, lang}` → `{ok:true, mime, chunks: ArrayBuffer[]}` or `{ok:false}` (content then uses `speechSynthesis`).
- `getSettings` → `Settings`. Settings changes reach content scripts via `storage.onChanged` directly (no message).
- Request id + abort: a new `translate` from the same tab cancels the previous one (AbortController per tab in the background).

## 2. Engines (BUR-3)

Interface:
```ts
interface Engine { id: 'google'|'bing'|'deepl'; maxBytes: number; supports(from, to): boolean;
  translate(req, signal): Promise<{text, detectedFrom}> /* throws EngineError */ }
type ErrorKind = 'network'|'timeout'|'rate_limited'|'auth'|'unsupported_lang'|'bad_response'|'empty'
```

- **google**: GET only (POST measured 400). Chunk when the encoded URL would exceed 12 000 bytes (measured limit ~16 KB, margin kept). Key is a module constant plus a settings override field (hidden "advanced") so a key rotation can be patched by the user without a release. Map `zh-CN`/`zh-TW` as is, `he`→`iw` check, `auto` allowed.
- **bing**: POST JSON `["…"]`, no auth. `from` omitted when auto. Code map: `zh-CN→zh-Hans`, `zh-TW→zh-Hant`, `no→nb`, `sr→sr-Cyrl`, `tl→fil`. Chunk at 5000 chars. Timeout 10 s (measured 7.9 s on 5000 chars).
- **deepl**: only active when a key is set. `api-free` vs `api` chosen by key suffix `:fx` (DeepL's documented convention) — no plan selector needed. Target codes uppercase, `en→EN-US`, `pt→PT-BR`, `zh-CN→ZH-HANS`, `zh-TW→ZH-HANT`; unsupported target → `unsupported_lang` (chain skips it, not an error to show). Source sent when not auto (Simple Translate ignores it; we don't).
- **Fallback chain** (`chain.ts`): ordered list from settings (default google → bing → deepl). Per attempt timeout 6 s (bing 10 s). Move to the next engine on any `EngineError`; `empty` = result text blank or identical to the input when detected≠target. If the user picked an engine explicitly from the bubble, that engine only, no fallback, error shown with a "try fallback" action.
- **Cache**: in-memory LRU in the background, 200 entries, key `engine|from|to|text`. Not persisted (privacy, and MV3 SW restarts make persistence pointless for v1).
- **Rate-limit backoff**: an engine that returned `rate_limited` is skipped for 60 s.
- **Language detection override**: the bubble shows `detectedFrom`; changing it re-requests with `from` fixed.
- **Watchlist** (README): sienori/simple-translate, FilipePS/Traduzir-paginas-web, translate-tools/linguist — they patched the August 2026 Google break within days.

## 3. Bubble (BUR-4)

- Content script on `<all_urls>`, `all_frames: false` for v1 (iframes later), `run_at: document_idle`.
- WXT `createShadowRootUi` with `mode: 'closed'`, CSS injected into the shadow root, host element `position: fixed; z-index: 2147483647`, `all: initial` on the root.
- Trigger: on `pointerup` (and keyboard selection end via `selectionchange` debounce 250 ms), if `getSelection().toString().trim()` is 1..5000 chars (setting), not inside our own UI, not in `input/textarea/[contenteditable]` (setting) → show a 24 px icon near the selection end rect, auto-hide after 4 s or on scroll/keydown/selection collapse. Click icon → open panel, send `translate`.
- Modes (setting): `icon` (default), `immediate`, `shortcut-only`. Shortcut via `commands` (`Alt+Shift+T` default; Alt+T collides with menu access in Firefox on Linux — verify in Zen).
- Panel: header row [source select (detected, marked "auto: Polish")] [swap] [target select]; body = translated text (selectable, `dir=auto`); footer = engine chip (menu: other engines), listen, copy, close. Error state lists attempts ("Google: rate limited · Bing: timeout").
- Position: below the selection, flip above when no room, clamp to viewport, max 420×360 px, scroll inside. Draggable header (nice-to-have, after core).
- Close: Esc, click outside, new selection, navigation.
- Themes: CSS variables, `data-theme=dark|light`, default dark, `system` follows `prefers-color-scheme`.
- TTS: background fetches Google TTS in ≤ 200-char chunks (sentence split), returns ArrayBuffers; content plays them sequentially via `Audio` + blob URLs. Fallback `speechSynthesis` with `lang`. Page CSP can block blob media in rare sites → fallback to `speechSynthesis` on `error`.
- Copy: `navigator.clipboard.writeText` (user gesture inside our click handler), fallback `document.execCommand('copy')` on a hidden textarea inside the shadow root.
- Swap: exchanges source/target and translates the *translated* text back (ImTranslator behaviour), only if source ≠ auto or detected is known.

## 4. Options (BUR-5)

Preact page, dark default. Settings (`src/settings.ts`, versioned schema `v: 1`, defaults merged on read):
- `targetLang` (default = `browser.i18n.getUILanguage()` base, fallback `es`), `secondLang` (used when detected == target, default `en`).
- `engines: [{id, enabled}]` order, `googleKeyOverride` (advanced), DeepL key → **storage.local only**, never in sync or export (export has an explicit opt-in checkbox).
- `theme`, `triggerMode`, `maxChars`, `ignoreEditable`, `excludedHosts[]` (also a toolbar-popup toggle "disable on this site" — tiny popup, v1 if cheap, else v2).
- Export/import JSON.

## 5. Build, test, release

- **No host toolchain**: `scripts/npm` = `docker run --rm -it -v "${PWD}:/app" -w /app --user 0:0 --memory 4g node:22-bookworm npm "$@"` (rootless docker: container root = akunito, files stay owned by akunito). `node_modules/` and `.output/` gitignored. Pin exact versions in `package.json`, commit `package-lock.json`.
- **Unit tests (vitest + happy-dom)**: adapters against captured fixtures (success, 429, 403, malformed, empty), chunker (byte budget with CJK), lang maps, chain (google 429 → bing; deepl without key skipped; explicit engine no fallback; timeout), settings migration, selection filter logic.
- **Live smoke** (`npm run smoke`, opt-in, not CI): hits the real endpoints with one sentence per engine and fails loudly — the canary for Google/Bing breaking.
- **Extension e2e**: Playwright Chromium in docker (`mcr.microsoft.com/playwright`) loading the `chrome` build: open a fixture page, select text, click icon, assert panel text and engine chip, with network routed to fixtures (deterministic) plus one live run.
- **Zen check (real target)**: `web-ext run --firefox=$(readlink -f ~/.nix-profile/bin/zen-beta)` cannot run in docker against the host Zen; instead build in docker and load `.output/firefox-mv2` via `about:debugging` in a separate Zen profile on a hidden Xvfb display, driven by Claude (screenshots). Final hand check by Diego in his daily Zen.
- `web-ext lint` on the Firefox build in CI (must be 0 errors).
- **Release (BUR-6)**: GitHub Actions on tag `v*`: build firefox + chrome, `web-ext sign --channel unlisted` with `AMO_JWT_ISSUER/SECRET` repo secrets, attach signed `.xpi` + chrome zip to the release, update `updates.json` (gecko `update_url`) on GitHub Pages. Gecko id `burbuja@akunito.com`, `strict_min_version: "140.0"` + `data_collection_permissions` (see §10).
- **License**: MPL-2.0 for the whole repo (ported files are MPL-2.0 already; one license is simpler than a mix). Ported files keep a header naming the origin file and commit.

## 6. Permissions (Firefox MV2 / Chrome MV3)

`storage`, `contextMenus` (v2 OCR; leave out in v1), host permissions: `https://translate-pa.googleapis.com/*`, `https://translate.google.com/*` (TTS), `https://edge.microsoft.com/*`, `https://api-free.deepl.com/*`, `https://api.deepl.com/*`; content script `<all_urls>`. No `tabs`, no `scripting`, no telemetry endpoints. CSP default.

## 7. Milestones and order

1. **BUR-2** skeleton: package.json, wxt.config.ts, docker scripts, empty background/content/options, both targets build, `web-ext lint` clean, loads in Zen. Commit + push public repo.
2. **BUR-3** engines + chain + unit tests + smoke (green against live endpoints).
3. **BUR-4** bubble + TTS + copy, e2e in Chromium, Zen check driven by Claude.
4. **BUR-5** options.
5. **BUR-6** release pipeline (needs Diego's AMO API credentials as repo secrets — the only blocking input).
6. Hand test by Diego in Zen → close BUR-1 v1.

Each milestone: change → test → read → adjust; Plane ticket comment with what was verified and how.

## 8. Risks

- Google key/endpoint change (happened 2026-08): key override setting + chain + smoke canary.
- Bing edge endpoint may start requiring a token again: adapter keeps the `auth` call path behind a flag so it can be re-enabled quickly.
- AMO review of unlisted builds is automated but can flag remote code: we load none (Tesseract models in v2 are data, workers bundled).
- Zen-specific: Zen's own split/compact UI and its built-in translation menu do not interfere with content scripts; verify the shortcut does not clash with Zen keybinds.
- Selection inside closed shadow DOMs / PDFs (pdf.js viewer) is not reachable in v1 — documented limitation.

## 9. v2 notes kept here so v1 does not block them

- OCR (BUR-7): context menu on images → background fetches image bytes (host permission `<all_urls>` becomes optional permission requested at first use) → Tesseract.js worker in an offscreen document (Chrome) / background page (Firefox) → chain → bubble anchored to the image. Custom OCR URL + token in storage.local. Benchmark before choosing the default.
- Chrome (BUR-8): MV3 SW has no Audio/DOM — TTS playback already happens in the content script, so only OCR needs an offscreen document.

## 10. Audit changes (Opus audit 2026-10-24) — these override the sections above

**Manifest (blocker):** gecko `strict_min_version: "140.0"`, `data_collection_permissions.required: ["websiteContent"]`, `update_url` (https) present before the first signing.

**Dependencies:** wxt 0.21.4 + **vite 8** (peer dep, was missing) + **preact 10.29.x** with `jsxImportSource: "preact"` and no `@preact/preset-vite` (preset predates preact 11 and pulls babel; `@wxt-dev/module-preact` does not exist). TypeScript pinned to 5.9 (7.x is the native port, no stable JS API). vitest 5, happy-dom, web-ext 10.

**Engines:**
- Google adapter: `detectedLanguages` is absent when `source_language` is fixed → optional chaining (Simple Translate `translate.ts:77` would throw on the "change source" path).
- Second Google variant without key: `translate.googleapis.com/translate_a/single?client=gtx` (200 today). Chain default: google-pa → google-gtx → bing → deepl. Drop the hidden key-override field.
- Reverse maps: normalise every `detectedFrom` to the canonical code (Bing `nb`, `zh-Hans`; DeepL `EN`, `ZH`). DeepL has separate source (no variant) and target maps. Google takes `he`, Bing takes `no`: fewer forward mappings.
- "Empty" = blank text only. "Identical" counts as a failure only with ≥ 2 words containing letters and detected ≠ target; apply `secondLang` (detected == target) before that check; if the next engine is identical too, show the first result without error.
- Dictionary for single words from Google `BILINGUAL_DICTIONARY_FULL` (pos + top alternatives) shown under the translation.
- Chunking with `Intl.Segmenter` (sentence granularity).
- Bing token path removed (dead code).

**Bubble:**
- Capture text and range rect when the icon is shown; `preventDefault` on the icon's `pointerdown`/`mousedown` so the page selection does not collapse.
- `createShadowRootUi({ mode: 'closed', isolateEvents: true, css inline })` so page shortcuts (GitHub `/`, YouTube `k`) do not steal keys; filter outside clicks with `composedPath()`.
- Selections in `input`/`textarea` read from `value.slice(selectionStart, selectionEnd)` when `ignoreEditable` is off.
- CSS in `px`, not `rem` (rem follows the page's font-size).
- `all_frames: true`, `match_about_blank: true`; tiny listener, UI mounted lazily on the first valid selection. Abort key `tabId:frameId`.
- Every request carries a `requestId`; content drops stale responses (swap/re-translate races). WXT `ctx` listeners clean up a context invalidated by an update.
- TTS playback via `AudioContext.decodeAudioData` (no URL, immune to page `media-src`). Chunks ≤ 200 chars (measured: 200 OK, 260 → 400). Chrome messaging is JSON → base64 the audio on that target; Firefox passes ArrayBuffer.
- Default target from `navigator.languages[0]` keeping region (zh-TW, pt-BR). UI strings via `_locales` (en, es, pl); language names via `Intl.DisplayNames`.
- Shortcut `Alt+Shift+T` default, documented as changeable in about:addons (Alt+Shift switches layouts on some systems).

**State:** Firefox MV2 background is persistent, in-memory cache/backoff is fine there. Chrome MV3: backoff in `storage.session` (v2 work).

**Testing:** unit (vitest) as planned. Firefox e2e: Firefox in docker driven by Selenium/geckodriver with a temporary add-on install, network routed to fixtures. Zen: Claude drives a throwaway Zen profile on Xvfb (declared in the dotfiles; DESK context rule) with the add-on loaded through `about:debugging` / `web-ext run --firefox=<zen>` from a container mounting `/nix` read-only, or via the signed unlisted .xpi once BUR-6 exists. Chromium e2e moves to v2; v1 only checks the chrome target builds. `web-ext lint` must be clean.

**Release:** `WEB_EXT_API_KEY` / `WEB_EXT_API_SECRET` secrets; `web-ext sign --channel unlisted --upload-source-code <wxt zip sources>`; docker build instructions in the README.

**Licence:** MPL-2.0 for the repo; Exhibit A header in every source file; ported files keep origin notices (Simple Translate "Copyright (c) 2017-2018 Sienori", commit `1ec976cc`; TWP commit `50a92116`). Linguist is BSD-3: ideas only, no code copied.

**Cut from v1:** settings export/import, "disable on this site" popup, `immediate` trigger mode (icon + shortcut only), Chromium e2e, Bing token path.
