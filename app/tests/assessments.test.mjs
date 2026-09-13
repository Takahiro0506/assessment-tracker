import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createAssessment,
  submit,
  resubmit,
  updateAssessment,
  serialize,
  parseBackup,
  validDate,
  localDate,
  formatDate,
  byDue,
  demoData,
} from '../lib/assessments.ts';
const t1 = '2026-09-01T00:00:00.000Z',
  t2 = '2026-09-02T03:00:00.000Z';
void test('registration trims input and permits an unknown deadline', () => {
  const a = createAssessment(' Web ', ' Report ', null, t1);
  assert.equal(a.unit, 'Web');
  assert.equal(a.name, 'Report');
  assert.equal(a.due, null);
  assert.throws(() => createAssessment(' ', 'Report', null));
});
void test('multiple resubmissions and corrections preserve all old records', () => {
  const a = createAssessment('Web', 'Report', '2026-09-01', t1);
  const b = submit(a, t2);
  const c = resubmit(b, null, t2);
  const d = resubmit(submit(c, t2), '2026-09-12', t2);
  const e = updateAssessment(
    d,
    { name: 'Updated', due: '2026-09-13' },
    'Corrected',
    t2,
  );
  assert.equal(a.history.length, 1);
  assert.equal(b.history[1].snapshot.submittedAt, t2);
  assert.equal(c.status, 'work');
  assert.equal(c.submittedAt, null);
  assert.equal(c.attempt, 2);
  assert.equal(e.attempt, 3);
  assert.equal(e.history[0].snapshot.due, '2026-09-01');
  assert.equal(e.history[2].snapshot.due, null);
  assert.equal(e.history[4].snapshot.due, '2026-09-12');
  assert.equal(e.history[0].snapshot.name, 'Report');
  assert.deepEqual(parseBackup(serialize([e])).items, [e]);
  assert.throws(() => submit(b));
});
void test('calendar dates reject normalization, support leap days and do not shift timezone', () => {
  assert.equal(validDate('2026-02-29'), false);
  assert.equal(validDate('2024-02-29'), true);
  assert.equal(validDate('2026-04-31'), false);
  assert.equal(validDate('0000-01-01'), false);
  assert.equal(validDate('2026-9-08'), false);
  assert.equal(formatDate('2026-09-08'), '8 Sept 2026');
  assert.equal(localDate(new Date(2026, 8, 8, 0, 1)), '2026-09-08');
});
void test('restoration rejects corrupt, unsupported, duplicate and inconsistent backups', () => {
  const a = createAssessment('Web', 'Test', null, t1);
  const data = JSON.parse(serialize([a]));
  assert.throws(() => parseBackup('{'));
  assert.throws(() => parseBackup(JSON.stringify({ ...data, version: 2 })));
  assert.throws(() => parseBackup(serialize([a, a])));
  assert.throws(() => parseBackup(serialize([{ ...a, due: '2026-02-30' }])));
  assert.throws(() => parseBackup(serialize([{ ...a, name: 'Tampered' }])));
  assert.throws(() => parseBackup(serialize([{ ...a, history: [] }])));
  assert.throws(() => parseBackup(serialize([{ ...a, status: 'waiting' }])));
});
void test('dated assessments sort by deadline; unknown dates remain separately identifiable', () => {
  const items = [
    createAssessment('A', 'unknown', null),
    createAssessment('A', 'later', '2026-09-12'),
    createAssessment('A', 'first', '2026-09-09'),
  ];
  assert.deepEqual(
    items.sort(byDue).map((x) => x.name),
    ['first', 'later', 'unknown'],
  );
});
void test('both fictional workloads are valid and contain all statuses and resubmission history', () => {
  for (const mode of ['normal', 'busy']) {
    const rows = demoData(mode);
    assert.equal(rows.length, mode === 'normal' ? 7 : 24);
    assert.deepEqual(parseBackup(serialize(rows)).items, rows);
    assert.deepEqual(
      new Set(rows.map((x) => x.status)),
      new Set(['work', 'waiting', 'done']),
    );
    assert.ok(rows.some((x) => x.attempt > 1));
    assert.ok(rows.some((x) => x.due === null));
    for (const row of rows)
      for (let i = 1; i < row.history.length; i++)
        assert.ok(row.history[i - 1].at <= row.history[i].at);
  }
});
