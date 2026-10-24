/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { fromBase64 } from './tts';

let ctx: AudioContext | undefined;
let current: AudioBufferSourceNode | undefined;
let token = 0;

export function stopAudio(): void {
  token++;
  try { current?.stop(); } catch { /* already stopped */ }
  current = undefined;
  if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
}

/**
 * Plays MP3 chunks through Web Audio: no URL is loaded, so the page's CSP media-src cannot block it
 * (blob: URLs in <audio> can be). Resolves when playback ends or is stopped.
 */
/**
 * Must run synchronously inside the click handler, before any await: autoplay policy only lets an
 * AudioContext start under user activation, and a resume() issued later can stay pending forever.
 */
export function primeAudio(): void {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
  } catch { /* no Web Audio: speechSynthesis fallback */ }
}

export async function playChunks(chunks: (ArrayBuffer | string)[]): Promise<void> {
  stopAudio();
  const my = ++token;
  ctx ??= new AudioContext();
  if (ctx.state !== 'running') {
    const started = await Promise.race([ctx.resume().then(() => true), new Promise<false>((r) => setTimeout(() => r(false), 2000))]);
    if (!started) throw new DOMException('audio context did not start', 'NotAllowedError');
  }
  for (const c of chunks) {
    if (my !== token) return;
    const buf = await ctx.decodeAudioData(typeof c === 'string' ? fromBase64(c) : c.slice(0));
    if (my !== token) return;
    await new Promise<void>((resolve) => {
      const src = ctx!.createBufferSource();
      src.buffer = buf;
      src.connect(ctx!.destination);
      src.onended = () => resolve();
      current = src;
      src.start();
    });
  }
}

export function speakFallback(text: string, lang: string): Promise<void> {
  stopAudio();
  return new Promise((resolve) => {
    if (typeof speechSynthesis === 'undefined') return resolve();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang;
    u.onend = u.onerror = () => resolve();
    speechSynthesis.speak(u);
  });
}
