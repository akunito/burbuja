/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

export interface Picked {
  text: string;
  /** Viewport rect of the selection (or of the input holding it). */
  rect: { left: number; top: number; right: number; bottom: number };
}

const isTextInput = (el: Element | null): el is HTMLInputElement | HTMLTextAreaElement =>
  !!el && (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && /^(text|search|url|email|tel|)$/i.test((el as HTMLInputElement).type)));

/** Reads the current selection; null when there is nothing usable. `host` = our own UI, never translated. */
export function pickSelection(doc: Document, opts: { ignoreEditable: boolean; maxChars: number; host?: Element | null }): Picked | null {
  const active = doc.activeElement;
  if (isTextInput(active)) {
    // getSelection() is empty for selections inside form fields.
    if (opts.ignoreEditable) return null;
    const { selectionStart: s, selectionEnd: e } = active;
    if (s == null || e == null || s === e) return null;
    const text = active.value.slice(s, e).trim();
    if (!text || text.length > opts.maxChars) return null;
    const r = active.getBoundingClientRect();
    return { text, rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom } };
  }
  const sel = doc.getSelection();
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
  const anchor = sel.anchorNode;
  const anchorEl = anchor && (anchor.nodeType === 1 ? (anchor as Element) : anchor.parentElement);
  if (opts.host && anchorEl && opts.host.contains(anchorEl)) return null;
  if (opts.ignoreEditable && anchorEl && (anchorEl as HTMLElement).isContentEditable) return null;
  const text = sel.toString().trim();
  if (!text || text.length > opts.maxChars) return null;
  const range = sel.getRangeAt(sel.rangeCount - 1);
  const rects = range.getClientRects();
  const last = rects.length ? rects[rects.length - 1]! : range.getBoundingClientRect();
  const all = range.getBoundingClientRect();
  return { text, rect: { left: all.left, top: all.top, right: last.right, bottom: last.bottom } };
}

export function hostExcluded(host: string, excluded: readonly string[]): boolean {
  for (const e of excluded) {
    const x = e.trim().toLowerCase();
    if (x && (host === x || host.endsWith(`.${x}`))) return true;
  }
  return false;
}

/** Fixed-position placement for a box of size w×h near `r`: below, else above, clamped to the viewport. */
export function place(r: Picked['rect'], w: number, h: number, vw: number, vh: number, gap = 8, margin = 8): { left: number; top: number } {
  let top = r.bottom + gap;
  if (top + h > vh - margin && r.top - gap - h >= margin) top = r.top - gap - h;
  top = Math.max(margin, Math.min(top, vh - margin - h));
  const left = Math.max(margin, Math.min(r.left, vw - margin - w));
  return { left, top };
}
