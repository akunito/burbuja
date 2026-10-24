# Burbuja

Translate selected text in a bubble, in Firefox and Zen (Chrome later). Select text, click the small icon, read the translation. Dark by default.

- Google Translate (free web endpoints) first, automatic fallback to Bing (Microsoft Edge endpoint) and DeepL Free (your own key).
- Source language detected automatically and changeable in the bubble; target language, swap, engine switch, listen and copy.
- No telemetry, no analytics, no accounts. Selected text is sent only to the translation engines you enable.

Status: early development. Plan: [docs/plans/implementation.md](docs/plans/implementation.md).

## Build

Nothing runs on the host: every npm command goes through a throwaway `node:22-bookworm` container.

```bash
./scripts/npm ci
./scripts/npm run build      # .output/firefox-mv2 and .output/chrome-mv3
./scripts/npm test
./scripts/npm run lint:ext   # web-ext lint on the Firefox build
```

Load the Firefox build temporarily from `about:debugging` → This Firefox → Load Temporary Add-on → `.output/firefox-mv2/manifest.json`.

## Tests

```bash
./scripts/npm test           # unit tests on captured engine responses
./scripts/npm run smoke      # live canary against Google/Bing/TTS
./scripts/e2e                # real input in Zen (headless, throwaway profile, host Zen from /nix)
E2E_BLOCK_GOOGLE=1 ./scripts/e2e   # Google unreachable → fallback must answer
```

## Building from source (AMO reviewers)

Requirements: Node 22 and npm 10 (or Docker). From the unpacked source archive:

```bash
npm ci
npx wxt build -b firefox     # output: .output/firefox-mv2
```

The same with Docker only: `docker run --rm -v "$PWD:/app" -w /app node:22-bookworm sh -c 'npm ci && npx wxt build -b firefox'`.

## Install

Signed builds are attached to each [GitHub release](https://github.com/akunito/burbuja/releases) as `burbuja-<version>.xpi`. Open the file with Firefox or Zen, accept the prompt, and updates arrive automatically from `updates.json` on GitHub Pages.

## Engines and upstream

The engine adapters are derived from [Simple Translate](https://github.com/sienori/simple-translate) and [TWP – Translate Web Pages](https://github.com/FilipePS/Traduzir-paginas-web), both MPL-2.0. The free Google and Bing endpoints are unofficial and change without notice; those projects are the first place a fix shows up.

## License

[MPL-2.0](LICENSE).
