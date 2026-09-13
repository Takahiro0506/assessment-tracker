import { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowUpRight, Check, Pencil } from 'lucide-react';
import {
  type Assessment,
  type Status,
  labels,
  formatDate,
  updateAssessment,
  submit,
} from '@/lib/assessments';
type Props = {
  item: Assessment;
  today: string;
  btnDisabled: boolean;
  editing: string | null;
  setEditing: (id: string | null) => void;
  setModal: (modal: { kind: 'resubmit' | 'delete'; item: Assessment }) => void;
  change: (item: Assessment, message: string) => boolean;
  setOpen: React.Dispatch<React.SetStateAction<Record<Status, boolean>>>;
  setError: (error: string) => void;
  onComplete: (item: Assessment) => void;
};
const dotColors = ['#2580dc', '#159767', '#8157c9', '#dc8727', '#ce5275'];
const color = (s: string) =>
  dotColors[
    Array.from(s).reduce((n, c) => n + c.charCodeAt(0), 0) % dotColors.length
  ];
export function AssessmentRow({
  item,
  today,
  btnDisabled,
  editing,
  setEditing,
  setModal,
  change,
  setOpen,
  setError,
  onComplete,
}: Props) {
  const editUnitInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (editing === item.id) editUnitInput.current?.focus();
  }, [editing, item.id]);
  if (editing === item.id)
    return (
      <form
        className="edit-row"
        key={item.id}
        onSubmit={(e) => {
          e.preventDefault();
          try {
            const data = new FormData(e.currentTarget);
            const status = data.get('status') as Status;
            const edited = updateAssessment(
              item,
              {
                unit: (data.get('unit') as string).trim(),
                name: (data.get('name') as string).trim(),
                due: (data.get('due') as string) || null,
                status,
                submittedAt:
                  status === 'waiting'
                    ? item.submittedAt || new Date().toISOString()
                    : status === 'work'
                      ? null
                      : item.submittedAt,
              },
              'Details / status corrected',
            );
            if (
              change(
                edited,
                'Assessment corrected. Previous details remain in History.',
              )
            )
              setEditing(null);
          } catch {
            setError(
              'Enter a unit and assessment name, and a valid date or leave it blank.',
            );
          }
        }}
      >
        <label htmlFor="edit-unit">
          Unit
          <Input
            id="edit-unit"
            name="unit"
            defaultValue={item.unit}
            required
            maxLength={200}
            list="units"
            ref={editUnitInput}
          />
        </label>
        <label htmlFor="edit-name">
          Assessment
          <Input
            id="edit-name"
            name="name"
            defaultValue={item.name}
            required
            maxLength={200}
          />
        </label>
        <label htmlFor="edit-due">
          Due date · optional
          <Input
            type="date"
            id="edit-due"
            name="due"
            defaultValue={item.due || ''}
            min="0001-01-01"
            max="9999-12-31"
          />
        </label>
        <label>
          Status
          <select name="status" defaultValue={item.status}>
            {Object.entries(labels).map(([k, v]) => (
              <option value={k} key={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <div className="edit-actions">
          <Button type="submit" disabled={btnDisabled}>
            Save changes
          </Button>
          <Button variant="outline" onClick={() => setEditing(null)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => setModal({ kind: 'delete', item })}
          >
            Delete
          </Button>
        </div>
        <p className="edit-hint">
          Corrections keep the previous details in History. Choosing Awaiting
          results records a submission now if none exists.
        </p>
      </form>
    );
  return (
    <article className="assessment-row" key={item.id} aria-label={item.name}>
      <div className="unit-cell">
        <i style={{ background: color(item.unit) }} />
        {item.unit}
      </div>
      <div className="name-cell">
        <div className="assessment-name">
          {item.name}
          {item.attempt > 1 && (
            <span className="resubmission">Resubmission</span>
          )}
        </div>
        {item.history.length > 1 && (
          <details className="history">
            <summary>
              History <span>({item.history.length})</span>
            </summary>
            <ol>
              {item.history.map((entry, i) => (
                <li key={i}>
                  <strong>{entry.action}</strong>
                  <time>{new Date(entry.at).toLocaleString('en-AU')}</time>
                  <span>
                    {entry.snapshot.unit} · {entry.snapshot.name}
                  </span>
                  <span>
                    Attempt {entry.snapshot.attempt} · Due{' '}
                    {formatDate(entry.snapshot.due)} ·{' '}
                    {labels[entry.snapshot.status]}
                  </span>
                  {entry.snapshot.submittedAt && (
                    <span>
                      Submitted{' '}
                      {new Date(entry.snapshot.submittedAt).toLocaleString(
                        'en-AU',
                      )}
                    </span>
                  )}
                </li>
              ))}
            </ol>
          </details>
        )}
      </div>
      <div className="date-cell">
        <span
          className={
            item.status === 'work' && item.due && item.due < today ? 'late' : ''
          }
        >
          {formatDate(item.due)}
        </span>
        {item.status === 'work' && item.due && item.due <= today && (
          <small className={item.due < today ? 'late' : ''}>
            {item.due < today ? 'Overdue' : 'Due today'}
          </small>
        )}
        {item.status === 'waiting' && item.submittedAt && (
          <small>
            Submitted{' '}
            {new Date(item.submittedAt).toLocaleDateString('en-AU', {
              day: 'numeric',
              month: 'short',
            })}
          </small>
        )}
      </div>
      <div className="row-actions">
        {item.status === 'work' ? (
          <Button
            disabled={btnDisabled}
            onClick={() => {
              change(
                submit(item),
                'Marked submitted. Find it in Awaiting results.',
              );
              setOpen((o) => ({ ...o, waiting: true }));
            }}
          >
            <ArrowUpRight />
            Mark submitted
          </Button>
        ) : item.status === 'waiting' ? (
          <div className="result-actions">
            <Button
              disabled={btnDisabled}
              variant="outline"
              onClick={() => onComplete(item)}
            >
              <Check />
              Mark completed
            </Button>
            <Button
              disabled={btnDisabled}
              variant="ghost"
              onClick={() => setModal({ kind: 'resubmit', item })}
            >
              Needs resubmission
            </Button>
          </div>
        ) : (
          <span className="completed-label">
            <Check size={16} /> Completed
          </span>
        )}
        <Button
          variant="ghost"
          size="icon"
          disabled={btnDisabled}
          aria-label={`Edit ${item.name}`}
          onClick={() => setEditing(item.id)}
        >
          <Pencil size={16} />
        </Button>
      </div>
    </article>
  );
}
