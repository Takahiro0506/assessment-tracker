import { createAssessment, byDue, localDate } from './assessments.ts';
import { parseWorkspace, type Workspace, type Card } from './workspace.ts';

export const UNASSIGNED_UNIT = 'Unit not set';

export function waitingLabel(submittedAt: string, today: string): string {
  const submittedDay = localDate(new Date(submittedAt));
  const days = Math.max(
    0,
    Math.round(
      (Date.parse(today + 'T00:00:00Z') -
        Date.parse(submittedDay + 'T00:00:00Z')) /
        86400000,
    ),
  );
  return `${days} day${days === 1 ? '' : 's'} waiting`;
}

// Keep the existing validated schema and history format; no migration is needed.
export function quickAdd(data: Workspace, name: string): Workspace {
  const unit = data.units.find(
    (u) => u.name.toLowerCase() === UNASSIGNED_UNIT.toLowerCase(),
  ) ?? {
    id: crypto.randomUUID(),
    name: UNASSIGNED_UNIT,
    color: 5,
  };
  return parseWorkspace({
    ...data,
    units: data.units.some((u) => u.id === unit.id)
      ? data.units
      : [...data.units, unit],
    items: [
      ...data.items,
      {
        ...createAssessment(unit.name, name, null),
        unitId: unit.id,
        deletedAt: null,
      },
    ],
  });
}

export function relativeDue(due: string | null, today: string): string {
  if (!due) return 'No date yet';
  // UTC calendar-day arithmetic avoids daylight-saving and timezone offsets.
  const days = Math.round(
    (Date.parse(due + 'T00:00:00Z') - Date.parse(today + 'T00:00:00Z')) /
      86400000,
  );
  if (days < 0) return `${-days} day${days === -1 ? '' : 's'} overdue`;
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  return `Due in ${days} days`;
}

export function nextAssessment(items: Card[]): Card | undefined {
  return items
    .filter((c) => !c.deletedAt && c.status === 'work')
    .sort(byDue)[0];
}
