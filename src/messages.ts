/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { ChainResult } from './engines/chain';
import type { EngineId } from './engines/types';

export interface TranslateMsg { type: 'translate'; id: number; text: string; from: string; to: string; engine?: EngineId }
export interface CancelMsg { type: 'cancel' }
export interface TtsMsg { type: 'tts'; text: string; lang: string }
export interface OpenOptionsMsg { type: 'openOptions' }
export type ToBackground = TranslateMsg | CancelMsg | TtsMsg | OpenOptionsMsg;

export type TranslateReply = ChainResult & { id: number };
/** Firefox clones ArrayBuffers; Chrome serialises messages as JSON, so audio travels as base64 there. */
export type TtsReply = { ok: true; chunks: (ArrayBuffer | string)[] } | { ok: false };

export interface CommandMsg { type: 'command'; name: 'translate-selection' }
