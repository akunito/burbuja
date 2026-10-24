/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { type DictEntry, type Engine, EngineError, type EngineId, type EngineRequest, type EngineResult, type ErrorKind } from './types';

export interface Attempt { engine: EngineId; error?: ErrorKind; ms: number }

export type ChainResult =
  | { ok: true; text: string; detectedFrom: string; from: string; to: string; engine: EngineId; dict?: DictEntry[]; attempts: Attempt[] }
  | { ok: false; aborted: boolean; attempts: Attempt[] };

export interface ChainRequest extends EngineRequest {
  /** Explicit engine from the bubble: that engine only, no fallback. */
  engine?: EngineId;
  /** Used when the detected language already equals the target. '' = off. */
  secondLang?: string;
}

const CACHE_MAX = 200;
const CACHE_MAX_TEXT = 5000;
const BACKOFF_MS = 60_000;
const LETTERS = /\p{L}/u;

/** Identical output counts as a failure only for real sentences in another language (names, URLs, "taxi" are legit). */
export function suspiciousIdentical(input: string, output: string, from: string, to: string): boolean {
  if (!from || from === 'auto' || from === to) return false;
  if (input.trim().toLocaleLowerCase() !== output.trim().toLocaleLowerCase()) return false;
  let words = 0;
  for (const w of input.split(/\s+/)) if (LETTERS.test(w) && ++words >= 2) return true;
  return false;
}

export class Translator {
  private cache = new Map<string, EngineResult>();
  private backoffUntil = new Map<EngineId, number>();

  constructor(
    private engines: ReadonlyMap<EngineId, Engine>,
    private order: () => readonly EngineId[],
    private now: () => number = Date.now,
  ) {}

  async run(req: ChainRequest, signal: AbortSignal): Promise<ChainResult> {
    const text = req.text.trim();
    if (!text) return { ok: false, aborted: false, attempts: [] };
    const base: EngineRequest = { text, from: req.from, to: req.to };
    const list = req.engine ? [req.engine] : this.order();
    const first = await this.runList(list, base, signal, !!req.engine);
    const second = req.secondLang;
    if (first.ok && req.from === 'auto' && second && second !== req.to && first.detectedFrom === req.to) {
      const again = await this.runList(
        [first.engine, ...list.filter((id) => id !== first.engine)],
        { text, from: first.detectedFrom, to: second }, signal, !!req.engine,
      );
      if (again.ok) {
        again.attempts = first.attempts.concat(again.attempts);
        again.detectedFrom = first.detectedFrom;
        return again;
      }
    }
    return first;
  }

  private async runList(list: readonly EngineId[], req: EngineRequest, signal: AbortSignal, explicit: boolean): Promise<ChainResult> {
    const attempts: Attempt[] = [];
    let candidate: (EngineResult & { engine: EngineId }) | undefined;
    for (const id of list) {
      const engine = this.engines.get(id);
      if (!engine) continue;
      if (!explicit && (this.backoffUntil.get(id) ?? 0) > this.now()) { attempts.push({ engine: id, error: 'backoff', ms: 0 }); continue; }
      const why = engine.unavailable(req);
      if (why) { attempts.push({ engine: id, error: why, ms: 0 }); continue; }

      const key = req.text.length <= CACHE_MAX_TEXT ? `${id}|${req.from}|${req.to}|${req.text}` : '';
      let r = key ? this.cache.get(key) : undefined;
      const t0 = this.now();
      if (r) {
        this.cache.delete(key); this.cache.set(key, r); // LRU touch
      } else {
        try {
          r = await engine.translate(req, AbortSignal.any([signal, AbortSignal.timeout(engine.timeoutMs)]));
        } catch (e) {
          if (signal.aborted) return { ok: false, aborted: true, attempts };
          const kind: ErrorKind = e instanceof EngineError ? e.kind : 'bad_response';
          if (kind === 'rate_limited') this.backoffUntil.set(id, this.now() + BACKOFF_MS);
          attempts.push({ engine: id, error: kind, ms: this.now() - t0 });
          continue;
        }
      }
      const ms = this.now() - t0;
      if (!r.text.trim()) { attempts.push({ engine: id, error: 'empty', ms }); continue; }
      const from = r.detectedFrom || req.from;
      if (!explicit && suspiciousIdentical(req.text, r.text, from, req.to)) {
        attempts.push({ engine: id, error: 'identical', ms });
        candidate ??= { ...r, engine: id };
        continue;
      }
      if (key && !this.cache.has(key)) {
        this.cache.set(key, r);
        if (this.cache.size > CACHE_MAX) this.cache.delete(this.cache.keys().next().value!);
      }
      attempts.push({ engine: id, ms });
      return { ok: true, text: r.text, detectedFrom: r.detectedFrom, from: req.from, to: req.to, engine: id, dict: r.dict, attempts };
    }
    if (candidate) {
      return { ok: true, text: candidate.text, detectedFrom: candidate.detectedFrom, from: req.from, to: req.to, engine: candidate.engine, dict: candidate.dict, attempts };
    }
    return { ok: false, aborted: false, attempts };
  }
}
