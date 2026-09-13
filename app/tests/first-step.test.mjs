import test from 'node:test';
import assert from 'node:assert/strict';
import {
  quickAdd,
  relativeDue,
  nextAssessment,
  UNASSIGNED_UNIT,
  waitingLabel,
} from '../lib/first-step.ts';
import { emptyWorkspace, backup, readBackup } from '../lib/workspace.ts';
import { parseDateInput, updateAssessment } from '../lib/assessments.ts';
void test('waiting days follow local calendar dates across midnight and daylight saving', () => {
  const previousTZ = process.env.TZ;
  try {
    process.env.TZ = 'Australia/Perth';
    assert.equal(
      waitingLabel('2026-09-12T16:05:00Z', '2026-09-13'),
      '0 days waiting',
    );
    assert.equal(
      waitingLabel('2026-09-12T15:55:00Z', '2026-09-13'),
      '1 day waiting',
    );
    assert.equal(
      waitingLabel('2026-09-10T15:55:00Z', '2026-09-13'),
      '3 days waiting',
    );
    process.env.TZ = 'Australia/Sydney';
    assert.equal(
      waitingLabel('2026-10-03T13:30:00Z', '2026-10-05'),
      '2 days waiting',
    );
    assert.equal(
      waitingLabel('2026-10-05T13:30:00Z', '2026-10-05'),
      '0 days waiting',
    );
  } finally {
    if (previousTZ === undefined) delete process.env.TZ;
    else process.env.TZ = previousTZ;
  }
});
void test('title-only addition is valid, additive and survives backup with an unset unit and date', () => {
  const original = emptyWorkspace();
  const first = quickAdd(original, '  SQL exercises  ');
  const second = quickAdd(first, 'Website review');
  assert.equal(original.items.length, 0);
  assert.equal(first.items.length, 1);
  assert.equal(second.units.length, 1);
  assert.equal(first.items[0].name, 'SQL exercises');
  assert.equal(first.items[0].due, null);
  assert.equal(first.items[0].unit, UNASSIGNED_UNIT);
  assert.deepEqual(readBackup(backup(second)), second);
  assert.throws(() => quickAdd(first, '   '));
  const assigned = updateAssessment(
    first.items[0],
    { unit: 'Database', due: '2026-10-16' },
    'Details corrected',
  );
  assert.deepEqual(assigned.history[0], first.items[0].history[0]);
  assert.equal(assigned.history[1].snapshot.unit, 'Database');
});
void test('next assessment prioritises overdue then today, excluding submitted and trash', () => {
  const items = quickAdd(
    quickAdd(quickAdd(emptyWorkspace(), 'Later'), 'Overdue'),
    'Today',
  ).items;
  items[0].due = '2026-10-16';
  items[1].due = '2026-09-11';
  items[2].due = '2026-09-12';
  assert.equal(nextAssessment(items).name, 'Overdue');
  items[1].status = 'waiting';
  assert.equal(nextAssessment(items).name, 'Today');
  items[2].deletedAt = new Date().toISOString();
  assert.equal(nextAssessment(items).name, 'Later');
  items[0].status = 'done';
  assert.equal(nextAssessment(items), undefined);
});
void test('relative calendar days cover today, singulars, month/year/leap boundaries', () => {
  assert.equal(relativeDue('2026-09-12', '2026-09-12'), 'Due today');
  assert.equal(relativeDue('2026-09-04', '2026-09-12'), '8 days overdue');
  assert.equal(relativeDue('2026-09-11', '2026-09-12'), '1 day overdue');
  assert.equal(relativeDue('2027-01-01', '2026-12-31'), 'Due tomorrow');
  assert.equal(relativeDue('2028-03-01', '2028-02-28'), 'Due in 2 days');
  assert.equal(relativeDue(null, '2026-09-12'), 'No date yet');
});
void test('due dates accept ISO and clear English dates without guessing invalid dates', () => {
  assert.equal(parseDateInput('2026-10-16'), '2026-10-16');
  assert.equal(parseDateInput('16 October 2026'), '2026-10-16');
  assert.equal(parseDateInput('Friday, 16 Oct 2026'), '2026-10-16');
  assert.equal(parseDateInput('31 February 2026'), null);
  assert.equal(parseDateInput(''), null);
});
