import {
  type Assessment,
  STORAGE_KEY,
  parseBackup,
  serialize,
} from './assessments.ts';
export type LocalStore = Pick<Storage, 'getItem' | 'setItem'>;
export class StorageConflict extends Error {
  constructor() {
    super('Data changed in another tab. Reload before making changes.');
  }
}
export function readStored(storage: LocalStore) {
  const raw = storage.getItem(STORAGE_KEY);
  return { raw, items: raw === null ? [] : parseBackup(raw).items };
}
export function writeStored(
  storage: LocalStore,
  expected: string | null,
  items: Assessment[],
  replace = false,
) {
  if (!replace && storage.getItem(STORAGE_KEY) !== expected)
    throw new StorageConflict();
  const raw = serialize(items);
  parseBackup(raw);
  storage.setItem(STORAGE_KEY, raw);
  return raw;
}
// A practice session never calls storage, including when adding or deleting rows.
export function writeSample(items: Assessment[]) {
  return parseBackup(serialize(items)).items;
}
