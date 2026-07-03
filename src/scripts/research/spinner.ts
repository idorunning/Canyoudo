// The one loading indicator for /research — shown whenever the assistant is
// searching, reading or thinking, so the reader always knows something is
// happening. A small spinning ring (Tailwind's animate-spin; falls back to a
// gentle pulse when the reader prefers reduced motion) beside a live label.

import { el } from './cards';

/** A spinner row: animated ring + label. Update the text via setSpinnerLabel. */
export function spinner(label: string): HTMLElement {
  const wrap = el('span', 'inline-flex items-center gap-2.5 font-sans text-sm text-ink-700');
  wrap.setAttribute('role', 'status');
  const ring = el(
    'span',
    'inline-block h-4 w-4 shrink-0 rounded-full border-2 border-accent border-t-transparent animate-spin motion-reduce:animate-pulse'
  );
  ring.setAttribute('aria-hidden', 'true');
  wrap.appendChild(ring);
  const text = el('span', '', label);
  text.dataset.role = 'spinner-label';
  wrap.appendChild(text);
  return wrap;
}

/** Update a spinner's label in place (keeps the ring spinning smoothly). */
export function setSpinnerLabel(spin: HTMLElement, label: string): void {
  const text = spin.querySelector<HTMLElement>('[data-role="spinner-label"]');
  if (text) text.textContent = label;
}
