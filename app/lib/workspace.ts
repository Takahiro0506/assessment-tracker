import { parseBackup, serialize, type Assessment } from './assessments.ts';
export type Unit = { id: string; name: string; color: number };
export type Card = Assessment & { unitId: string; deletedAt: string | null };
export type Workspace = { version: 2; units: Unit[]; items: Card[] };
export type Remote = {
  revision: number;
  token: string | null;
  data: Workspace;
  updatedAt: string | null;
};
export type Pending = {
  baseRevision: number;
  baseToken: string | null;
  operationId: string;
  data: Workspace;
};
export const emptyWorkspace = (): Workspace => ({
  version: 2,
  units: [],
  items: [],
});
export const MAX_BYTES = 400_000;
export const isId = (v: unknown): v is string =>
  typeof v === 'string' && /^[a-zA-Z0-9_-]{1,160}$/.test(v);
export function parseWorkspace(value: unknown): Workspace {
  const v = value as Workspace;
  if (
    !v ||
    v.version !== 2 ||
    !Array.isArray(v.units) ||
    v.units.length > 100 ||
    !Array.isArray(v.items) ||
    v.items.length > 1000
  )
    throw new Error(
      'Invalid semester backup (maximum 100 units and 1,000 cards).',
    );
  const ids = new Set<string>();
  const names = new Set<string>();
  const units = v.units.map((u) => {
    if (
      !u ||
      !isId(u.id) ||
      ids.has(u.id) ||
      typeof u.name !== 'string' ||
      !u.name.trim() ||
      u.name.length > 200 ||
      names.has(u.name.trim().toLowerCase()) ||
      !Number.isInteger(u.color) ||
      u.color < 0 ||
      u.color > 5
    )
      throw new Error('Invalid or duplicate units.');
    ids.add(u.id);
    names.add(u.name.trim().toLowerCase());
    return { id: u.id, name: u.name.trim(), color: u.color };
  });
  const cleaned = parseBackup(serialize(v.items)).items;
  const items = cleaned.map((a, i) => {
    const original = v.items[i];
    const unit = units.find((u) => u.id === original.unitId);
    if (
      !isId(a.id) ||
      !unit ||
      unit.name.toLowerCase() !== a.unit.trim().toLowerCase() ||
      !(
        original.deletedAt === null ||
        (typeof original.deletedAt === 'string' &&
          /^\d{4}-\d{2}-\d{2}T/.test(original.deletedAt) &&
          Number.isFinite(Date.parse(original.deletedAt)))
      )
    )
      throw new Error('Invalid card unit or trash date.');
    return { ...a, unitId: unit.id, deletedAt: original.deletedAt };
  });
  const result: Workspace = { version: 2, units, items };
  if (new TextEncoder().encode(JSON.stringify(result)).length > MAX_BYTES)
    throw new Error(
      'Semester storage limit reached (400 KB including history). Export a backup; nothing was overwritten.',
    );
  return result;
}
export function fromLegacy(items: Assessment[]): Workspace {
  const units: Unit[] = [];
  for (const a of items)
    if (
      !units.some((u) => u.name.toLowerCase() === a.unit.trim().toLowerCase())
    )
      units.push({
        id: `legacy-unit-${units.length}`,
        name: a.unit.trim(),
        color:
          (
            { database: 0, 'web development': 1, networking: 2 } as Record<
              string,
              number
            >
          )[a.unit.trim().toLowerCase()] ?? units.length % 6,
      });
  return parseWorkspace({
    version: 2,
    units,
    items: items.map((a, i) => {
      const unit = units.find(
        (u) => u.name.toLowerCase() === a.unit.trim().toLowerCase(),
      )!;
      return {
        ...a,
        id: isId(a.id) ? a.id : `legacy-card-${i}`,
        unitId: unit.id,
        deletedAt: null,
      };
    }),
  });
}
export function readBackup(raw: string): Workspace {
  if (new TextEncoder().encode(raw).length > 2_000_000)
    throw new Error('Backup is too large (maximum 2 MB).');
  const v = JSON.parse(raw);
  return v.version === 1
    ? fromLegacy(parseBackup(raw).items)
    : parseWorkspace(v.data ?? v);
}
export function backup(data: Workspace) {
  return JSON.stringify(
    { format: 'assessment-tracker', savedAt: new Date().toISOString(), data },
    null,
    2,
  );
}
async function digest(v: unknown) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(JSON.stringify(v)),
      ),
    ),
  )
    .map((n) => n.toString(16).padStart(2, '0'))
    .join('');
}
// Imports only add. Identical content is skipped; collisions get content-addressed IDs.
// Repeating an import is idempotent, including after a recovered copy is edited or trashed.
export async function mergeBackup(current: Workspace, incoming: Workspace) {
  const next = structuredClone(current);
  let added = 0;
  let skipped = 0;
  let copies = 0;
  for (const source of incoming.units) {
    if (
      !next.units.some(
        (u) => u.name.toLowerCase() === source.name.toLowerCase(),
      )
    )
      next.units.push({
        ...source,
        id: next.units.some((u) => u.id === source.id)
          ? `unit-${await digest(source)}`
          : source.id,
      });
  }
  for (const a of incoming.items) {
    const unit = next.units.find(
      (u) => u.name.toLowerCase() === a.unit.trim().toLowerCase(),
    )!;
    const card: Card = { ...a, unitId: unit.id };
    const fingerprint = `recovered-${await digest(a)}`;
    const existing = next.items.find((x) => x.id === card.id);
    if (
      next.items.some((x) => x.id === fingerprint) ||
      (existing && JSON.stringify(existing) === JSON.stringify(card))
    ) {
      skipped++;
      continue;
    }
    if (existing) {
      card.id = fingerprint;
      copies++;
    }
    next.items.push(card);
    added++;
  }
  return { data: parseWorkspace(next), added, skipped, copies };
}
