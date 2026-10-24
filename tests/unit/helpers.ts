import { readFileSync } from 'node:fs';
import { vi } from 'vitest';

export const fixture = (name: string): string => readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8');

export interface Call { url: string; init?: RequestInit }

/** Replaces global fetch; handler returns [status, body] or throws. Records calls. */
export function mockFetch(handler: (url: string, init?: RequestInit) => [number, string] | Promise<[number, string]>): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    if (init?.signal?.aborted) throw new DOMException('aborted', 'AbortError');
    const [status, body] = await handler(String(url), init);
    return new Response(body, { status });
  });
  return calls;
}

export const signal = (): AbortSignal => new AbortController().signal;
