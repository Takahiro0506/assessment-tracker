export type Status = 'work' | 'waiting' | 'done';
export type Snapshot = {
  unit: string;
  name: string;
  due: string | null;
  status: Status;
  attempt: number;
  submittedAt: string | null;
};
export type Entry = { at: string; action: string; snapshot: Snapshot };
export type Assessment = Snapshot & { id: string; history: Entry[] };
export type Backup = { version: 1; savedAt: string; items: Assessment[] };
export const STORAGE_KEY = 'assessment-tracker.v1';
export const labels: Record<Status, string> = {
  work: 'Needs work',
  waiting: 'Awaiting results',
  done: 'Completed',
};
export function localDate(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function validDate(value: unknown): value is string {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    value.slice(0, 4) === '0000'
  )
    return false;
  const d = new Date(value + 'T12:00:00Z');
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}
export function formatDate(value: string | null): string {
  return value
    ? new Intl.DateTimeFormat('en-AU', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      }).format(new Date(value + 'T12:00:00'))
    : 'Date not set';
}
const monthNumbers: Record<string, string> = {
  january: '01',
  jan: '01',
  february: '02',
  feb: '02',
  march: '03',
  mar: '03',
  april: '04',
  apr: '04',
  may: '05',
  june: '06',
  jun: '06',
  july: '07',
  jul: '07',
  august: '08',
  aug: '08',
  september: '09',
  sep: '09',
  sept: '09',
  october: '10',
  oct: '10',
  november: '11',
  nov: '11',
  december: '12',
  dec: '12',
};
export function parseDateInput(value: string): string | null {
  const input = value.trim();
  if (!input) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) return validDate(input) ? input : null;
  const match = input.match(
    /^(?:[A-Za-z]+,?\s+)?(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)\s+(\d{4})$/i,
  );
  if (!match) return null;
  const month = monthNumbers[match[2].toLowerCase()];
  if (!month) return null;
  const date = `${match[3]}-${month}-${match[1].padStart(2, '0')}`;
  return validDate(date) ? date : null;
}
export function formatDateLong(value: string | null): string {
  return value
    ? new Intl.DateTimeFormat('en-AU', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }).format(new Date(value + 'T12:00:00'))
    : 'No date yet';
}
const timestamp = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^\d{4}-\d{2}-\d{2}T/.test(value) &&
  Number.isFinite(Date.parse(value));
const textField = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= 200;
function snapshot(value: unknown): Snapshot {
  if (!value || typeof value !== 'object')
    throw new Error('Invalid assessment.');
  const v = value as Snapshot;
  if (
    !textField(v.unit) ||
    !textField(v.name) ||
    !(v.due === null || validDate(v.due)) ||
    !['work', 'waiting', 'done'].includes(v.status) ||
    !Number.isInteger(v.attempt) ||
    v.attempt < 1 ||
    !(v.submittedAt === null || timestamp(v.submittedAt)) ||
    (v.status === 'waiting' && v.submittedAt === null)
  )
    throw new Error('Invalid assessment fields or dates.');
  return {
    unit: v.unit,
    name: v.name,
    due: v.due,
    status: v.status,
    attempt: v.attempt,
    submittedAt: v.submittedAt,
  };
}
export function parseBackup(raw: string): Backup {
  const data = JSON.parse(raw);
  if (
    !data ||
    data.version !== 1 ||
    !timestamp(data.savedAt) ||
    !Array.isArray(data.items) ||
    data.items.length > 5000
  )
    throw new Error(
      'Choose a version 1 Assessment Tracker backup (up to 5,000 assessments).',
    );
  const ids = new Set<string>();
  const items = data.items.map((v: Assessment) => {
    const s = snapshot(v);
    if (
      !textField(v.id) ||
      ids.has(v.id) ||
      !Array.isArray(v.history) ||
      !v.history.length ||
      v.history.length > 10000
    )
      throw new Error('Invalid or duplicate assessment records.');
    ids.add(v.id);
    const history = v.history.map((e) => {
      if (!e || !timestamp(e.at) || !textField(e.action))
        throw new Error('Invalid assessment history.');
      return { at: e.at, action: e.action, snapshot: snapshot(e.snapshot) };
    });
    if (JSON.stringify(history.at(-1)!.snapshot) !== JSON.stringify(s))
      throw new Error('Assessment does not match its latest history.');
    return { id: v.id, ...s, history };
  });
  return { version: 1, savedAt: data.savedAt, items };
}
export function serialize(
  items: Assessment[],
  at = new Date().toISOString(),
): string {
  return JSON.stringify({ version: 1, savedAt: at, items }, null, 2);
}
export function createAssessment(
  unit: string,
  name: string,
  due: string | null,
  at = new Date().toISOString(),
): Assessment {
  const s = snapshot({
    unit: unit.trim(),
    name: name.trim(),
    due,
    status: 'work',
    attempt: 1,
    submittedAt: null,
  });
  return {
    id: crypto.randomUUID(),
    ...s,
    history: [{ at, action: 'Added', snapshot: s }],
  };
}
export function updateAssessment(
  item: Assessment,
  patch: Partial<Snapshot>,
  action: string,
  at = new Date().toISOString(),
): Assessment {
  const s = snapshot({ ...item, ...patch });
  return {
    id: item.id,
    ...s,
    history: [...item.history, { at, action, snapshot: s }],
  };
}
export function submit(
  item: Assessment,
  at = new Date().toISOString(),
): Assessment {
  if (item.status !== 'work')
    throw new Error('Only assessments needing work can be submitted.');
  return updateAssessment(
    item,
    { status: 'waiting', submittedAt: at },
    'Submitted',
    at,
  );
}
export function resubmit(
  item: Assessment,
  due: string | null,
  at = new Date().toISOString(),
): Assessment {
  return updateAssessment(
    item,
    { status: 'work', attempt: item.attempt + 1, due, submittedAt: null },
    'Resubmission added',
    at,
  );
}
export function byDue(a: Assessment, b: Assessment): number {
  return (
    (a.due ?? '9999-99-99').localeCompare(b.due ?? '9999-99-99') ||
    a.name.localeCompare(b.name)
  );
}
export function demoData(mode: 'normal' | 'busy'): Assessment[] {
  const date = (offset: number) => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return localDate(d);
  };
  const at = (offset: number) =>
    new Date(date(offset) + 'T10:00:00').toISOString();
  let website = createAssessment(
    'Web Development',
    'Responsive website',
    date(-5),
    at(-12),
  );
  website = resubmit(submit(website, at(-6)), date(2), at(-1));
  const rows = [
    website,
    createAssessment('Database', 'SQL queries', date(4)),
    createAssessment('Networking', 'Practical demonstration', date(7)),
    createAssessment('Project Management', 'Project proposal', null),
    submit(
      createAssessment(
        'Web Development',
        'Accessibility report',
        date(-2),
        at(-10),
      ),
      at(-1),
    ),
    submit(
      createAssessment('Database', 'Data modelling', date(-3), at(-10)),
      at(-2),
    ),
    updateAssessment(
      submit(
        createAssessment(
          'Networking',
          'Network fundamentals',
          date(-8),
          at(-12),
        ),
        at(-9),
      ),
      { status: 'done' },
      'Completed',
      at(-4),
    ),
  ];
  if (mode === 'busy')
    for (let i = 0; i < 17; i++)
      rows.push(
        createAssessment(
          ['Database', 'Networking', 'Web Development'][i % 3],
          ['Practice task', 'Technical report', 'Project review'][i % 3] +
            ' ' +
            (i + 1),
          i % 5 === 0 ? null : date((i % 9) - 2),
        ),
      );
  return rows;
}

export type DueGroup = 'undated' | 'overdue' | 'upcoming' | 'later';
export const dueGroupLabels: Record<DueGroup, string> = {
  undated: 'No date yet',
  overdue: 'Overdue',
  upcoming: 'Next 7 days',
  later: 'Later',
};
export function shiftDate(day: string, offset: number): string {
  if (!validDate(day)) throw new Error('Invalid date.');
  const date = new Date(day + 'T12:00:00Z');
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}
export function dueGroup(due: string | null, today: string): DueGroup {
  if (!due) return 'undated';
  if (due < today) return 'overdue';
  return due <= shiftDate(today, 6) ? 'upcoming' : 'later';
}
export function recentUnits(items: Assessment[], limit = 4): string[] {
  return [
    ...new Set(
      [...items]
        .sort((a, b) =>
          b.history.at(-1)!.at.localeCompare(a.history.at(-1)!.at),
        )
        .map((x) => x.unit),
    ),
  ].slice(0, limit);
}
export function undoCompletion(
  current: Assessment,
  previous: Assessment,
): Assessment {
  if (
    current.id !== previous.id ||
    current.status !== 'done' ||
    current.history.at(-1)?.action !== 'Completed' ||
    current.history.length !== previous.history.length + 1
  )
    throw new Error(
      'This completion can no longer be undone. Use Edit to correct the status.',
    );
  return updateAssessment(
    current,
    { status: previous.status, submittedAt: previous.submittedAt },
    'Completion undone',
  );
}
