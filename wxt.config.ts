import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: '.',
  outDir: '.output',
  vite: () => ({
    oxc: { jsx: { runtime: 'automatic', importSource: 'preact' } },
  }),
  manifest: ({ browser }) => ({
    name: '__MSG_extName__',
    description: '__MSG_extDescription__',
    default_locale: 'en',
    permissions: ['storage'],
    host_permissions: [
      'https://translate-pa.googleapis.com/*',
      'https://translate.googleapis.com/*',
      'https://translate.google.com/*',
      'https://edge.microsoft.com/*',
      'https://api-free.deepl.com/*',
      'https://api.deepl.com/*',
    ],
    icons: { 16: 'icon/16.png', 32: 'icon/32.png', 48: 'icon/48.png', 96: 'icon/96.png', 128: 'icon/128.png' },
    commands: {
      'translate-selection': {
        suggested_key: { default: 'Alt+Shift+T' },
        description: '__MSG_cmdTranslateSelection__',
      },
    },
    ...(browser === 'firefox'
      ? {
          browser_specific_settings: {
            gecko: {
              id: 'burbuja@akunito.com',
              strict_min_version: '140.0',
              update_url: 'https://akunito.github.io/burbuja/updates.json',
              // AMO requires this key for new add-ons since 2025-11-03; the selected text leaves the
              // browser for Google/Bing/DeepL, so "none" would be false. Built-in consent UI needs Firefox 140.
              data_collection_permissions: { required: ['websiteContent'] },
            },
            // data_collection_permissions exists on Android from 142; without this web-ext lint warns.
            gecko_android: { strict_min_version: '142.0' },
          },
        }
      : {}),
  }),
});
