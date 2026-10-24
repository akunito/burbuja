/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { browser } from 'wxt/browser';
import type { EngineId, ErrorKind } from './engines/types';

export const t = (key: string, sub?: string): string => (browser.i18n.getMessage as (k: string, s?: string) => string)(key, sub) || key;

export const uiLocale = (): string => browser.i18n.getUILanguage();

export const ENGINE_LABEL: Record<EngineId, string> = {
  google: 'Google', 'google-gtx': 'Google (alt)', bing: 'Bing', deepl: 'DeepL',
};

const ERR_KEY: Record<ErrorKind, string> = {
  network: 'errNetwork', timeout: 'errTimeout', rate_limited: 'errRateLimited', auth: 'errAuth',
  unsupported_lang: 'errUnsupportedLang', bad_response: 'errBadResponse', empty: 'errEmpty',
  not_configured: 'errNotConfigured', http: 'errHttp', identical: 'errIdentical', backoff: 'errBackoff', aborted: 'errAborted',
};
export const errText = (k: ErrorKind): string => t(ERR_KEY[k]);
