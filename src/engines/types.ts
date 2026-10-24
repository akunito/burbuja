/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

export type EngineId = 'google' | 'google-gtx' | 'bing' | 'deepl';
export const ENGINE_IDS: readonly EngineId[] = ['google', 'google-gtx', 'bing', 'deepl'];

export type ErrorKind =
  | 'network' | 'timeout' | 'rate_limited' | 'auth' | 'unsupported_lang' | 'bad_response' | 'empty'
  | 'not_configured' | 'aborted' | 'http' | 'identical' | 'backoff';

export class EngineError extends Error {
  constructor(public kind: ErrorKind, public status = 0) {
    super(status ? `${kind} (${status})` : kind);
  }
}

export interface DictEntry { pos: string; terms: string[] }

export interface EngineResult {
  text: string;
  /** Canonical code, '' when the engine did not report it (fixed source). */
  detectedFrom: string;
  dict?: DictEntry[];
}

export interface EngineRequest {
  text: string;
  /** 'auto' or canonical code. */
  from: string;
  /** Canonical code. */
  to: string;
}

export interface Engine {
  id: EngineId;
  timeoutMs: number;
  /** null = ready; otherwise why it cannot run (skipped silently by the chain). */
  unavailable(req: EngineRequest): ErrorKind | null;
  translate(req: EngineRequest, signal: AbortSignal): Promise<EngineResult>;
}

/** Shared HTTP→ErrorKind mapping. 400 means "unsupported language" only where the adapter says so. */
export function httpError(status: number): EngineError {
  if (status === 429 || status === 503) return new EngineError('rate_limited', status);
  if (status === 401 || status === 403 || status === 456) return new EngineError('auth', status);
  return new EngineError('http', status);
}

export async function doFetch(url: string, init: RequestInit, signal: AbortSignal): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal, credentials: 'omit', cache: 'no-store' });
  } catch (e) {
    if (signal.aborted) throw new EngineError(signal.reason?.name === 'TimeoutError' ? 'timeout' : 'aborted');
    throw new EngineError('network');
  }
}
