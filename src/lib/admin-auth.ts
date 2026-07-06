// Minimal admin gate for /dashboard — separate from the public Supabase
// reader auth (src/scripts/members/gate.ts), since this protects an
// internal-only page rather than reader-facing content.
//
// One shared password (ADMIN_DASHBOARD_PASSWORD env var) is all this needs:
// there's a single admin (you), not a team of accounts to manage. On success
// the cookie stores a one-way hash of the password, never the password
// itself, so the cookie can't be reversed into the real value if it leaks.

import { createHash, timingSafeEqual } from 'node:crypto';

export const ADMIN_COOKIE = 'ta_admin';

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function configured(): boolean {
  return Boolean(process.env.ADMIN_DASHBOARD_PASSWORD);
}

export function checkPassword(candidate: string): boolean {
  const real = process.env.ADMIN_DASHBOARD_PASSWORD;
  if (!real) return false;
  const a = Buffer.from(hash(candidate));
  const b = Buffer.from(hash(real));
  return a.length === b.length && timingSafeEqual(a, b);
}

export function sessionToken(): string {
  return hash(`${process.env.ADMIN_DASHBOARD_PASSWORD}:session`);
}

export function isValidSession(cookieValue: string | undefined): boolean {
  if (!cookieValue || !configured()) return false;
  const a = Buffer.from(cookieValue);
  const b = Buffer.from(sessionToken());
  return a.length === b.length && timingSafeEqual(a, b);
}
