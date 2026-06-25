// Named-entity definitions for the perception analysis: forces (loaded from the
// existing police-data snapshot so the two datasets share one vocabulary),
// plus a curated set of leaders and rank/role terms. Each def is
// { name, type, match } where `match` is the lowercase phrase/token to find.

import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const FORCES_DIR = join(ROOT, 'src/content/policedata/forces');

export function loadForceEntities() {
  let out = [];
  try {
    for (const file of readdirSync(FORCES_DIR)) {
      if (!file.endsWith('.json')) continue;
      const { name } = JSON.parse(readFileSync(join(FORCES_DIR, file), 'utf8'));
      if (name) out.push({ name, type: 'force', match: name.toLowerCase() });
    }
  } catch {
    // No snapshot yet — fall back to the headline forces.
    out = [
      { name: 'Metropolitan Police', type: 'force', match: 'metropolitan police' },
      { name: 'Greater Manchester Police', type: 'force', match: 'greater manchester police' },
      { name: 'West Midlands Police', type: 'force', match: 'west midlands police' },
    ];
  }
  return out;
}

// Met Commissioners and other figures whose coverage marks the period.
export const LEADERS = [
  { name: 'John Stevens', type: 'leader', match: 'john stevens' },
  { name: 'Ian Blair', type: 'leader', match: 'ian blair' },
  { name: 'Paul Stephenson', type: 'leader', match: 'paul stephenson' },
  { name: 'Bernard Hogan-Howe', type: 'leader', match: 'hogan-howe' },
  { name: 'Cressida Dick', type: 'leader', match: 'cressida dick' },
  { name: 'Mark Rowley', type: 'leader', match: 'mark rowley' },
  { name: 'Wayne Couzens', type: 'officer', match: 'couzens' },
  { name: 'David Carrick', type: 'officer', match: 'carrick' },
  { name: 'Baroness Casey', type: 'leader', match: 'casey' },
];

export const ROLES = [
  { name: 'Chief constable', type: 'role', match: 'chief constable' },
  { name: 'Commissioner', type: 'role', match: 'commissioner' },
  { name: 'Police and crime commissioner', type: 'role', match: 'crime commissioner' },
  { name: 'Detective', type: 'role', match: 'detective' },
  { name: 'Sergeant', type: 'role', match: 'sergeant' },
];

export function allEntities() {
  return [...loadForceEntities(), ...LEADERS, ...ROLES];
}
