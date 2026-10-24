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

## Engines and upstream

The engine adapters are derived from [Simple Translate](https://github.com/sienori/simple-translate) and [TWP – Translate Web Pages](https://github.com/FilipePS/Traduzir-paginas-web), both MPL-2.0. The free Google and Bing endpoints are unofficial and change without notice; those projects are the first place a fix shows up.

## License

[MPL-2.0](LICENSE).
