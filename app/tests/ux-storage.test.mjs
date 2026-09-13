import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createAssessment,
  submit,
  updateAssessment,
  serialize,
  dueGroup,
  shiftDate,
  recentUnits,
  undoCompletion,
  STORAGE_KEY,
} from '../lib/assessments.ts';
import {
  readStored,
  writeStored,
  writeSample,
  StorageConflict,
} from '../lib/storage.ts';
function memory(raw = null) {
  return {
    value: raw,
    writes: 0,
    getItem(key) {
      assert.equal(key, STORAGE_KEY);
      return this.value;
    },
    setItem(key, value) {
      assert.equal(key, STORAGE_KEY);
      this.writes++;
      this.value = value;
    },
  };
}
void test('groups are exhaustive and disjoint across today, day 6, day 7 and year rollover', () => {
  const today = '2026-12-28';
  assert.equal(dueGroup(null, today), 'undated');
  assert.equal(dueGroup('2026-12-27', today), 'overdue');
  assert.equal(dueGroup(today, today), 'upcoming');
  assert.equal(dueGroup('2027-01-03', today), 'upcoming');
  assert.equal(dueGroup('2027-01-04', today), 'later');
  assert.equal(shiftDate('2024-02-28', 1), '2024-02-29');
  assert.equal(shiftDate('2026-02-28', 1), '2026-03-01');
  assert.equal(shiftDate('2026-10-03', 2), '2026-10-05');
});
void test('unit shortcuts are recent, distinct and bounded', () => {
  const rows = ['A', 'B', 'A', 'C', 'D', 'E'].map((u, i) =>
    createAssessment(u, 'Task', null, `2026-09-0${i + 1}T00:00:00.000Z`),
  );
  assert.deepEqual(recentUnits(rows), ['E', 'D', 'C', 'A']);
});
void test('undo completion retains the completion event and submission timestamp', () => {
  const old = submit(createAssessment('A', 'Report', null));
  const done = updateAssessment(old, { status: 'done' }, 'Completed');
  const undone = undoCompletion(done, old);
  assert.equal(undone.status, 'waiting');
  assert.equal(undone.submittedAt, old.submittedAt);
  assert.equal(undone.history.at(-2).action, 'Completed');
  assert.equal(undone.history.at(-1).action, 'Completion undone');
  assert.throws(() =>
    undoCompletion(
      updateAssessment(done, { name: 'Changed' }, 'Corrected'),
      old,
    ),
  );
});
void test('storage round trip and conflict rejection preserve the other tab data', () => {
  const storage = memory();
  const items = [createAssessment('A', 'Own task', null)];
  const raw = writeStored(storage, null, items);
  assert.deepEqual(readStored(storage).items, items);
  storage.value = serialize([]);
  assert.throws(() => writeStored(storage, raw, items), StorageConflict);
  assert.equal(storage.writes, 1);
  assert.equal(readStored(storage).items.length, 0);
});
void test('corrupt or unavailable storage cannot silently become an empty saved list', () => {
  const store = memory('{broken');
  assert.throws(() => readStored(store));
  assert.equal(store.value, '{broken');
  assert.equal(store.writes, 0);
  const denied = {
    getItem() {
      throw Error('blocked');
    },
    setItem() {
      throw Error('blocked');
    },
  };
  assert.throws(() => readStored(denied));
  assert.throws(() => writeStored(denied, null, []));
});
void test('quota failure and invalid replacement preserve original bytes', () => {
  const store = memory(serialize([createAssessment('A', 'Own task', null)]));
  const before = store.value;
  store.setItem = () => {
    throw Error('quota');
  };
  assert.throws(() => writeStored(store, before, []));
  assert.equal(store.value, before);
  const invalid = [
    { ...createAssessment('A', 'Invalid', null), due: '2026-02-30' },
  ];
  assert.throws(() => writeStored(store, before, invalid, true));
  assert.equal(store.value, before);
});
void test('practice records have no shared references and do not modify stored personal records', () => {
  const personal = [createAssessment('A', 'Own task', null)];
  const store = memory(serialize(personal));
  const bytes = store.value;
  const sample = writeSample(personal);
  sample[0].name = 'Practice edit';
  sample[0].history[0].snapshot.name = 'Practice edit';
  assert.equal(personal[0].name, 'Own task');
  assert.equal(personal[0].history[0].snapshot.name, 'Own task');
  assert.equal(store.value, bytes);
  assert.equal(store.writes, 0);
});
