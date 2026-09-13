'use client';
import { useEffect, useState } from 'react';
import {
  BookOpen,
  CalendarDays,
  Check,
  Clock,
  Settings,
  Download,
  FileText,
  History,
  Layers,
  Plus,
  Pencil,
  Trash2,
  Undo2,
  X,
  ArrowLeft,
  ArrowRight,
  AlertCircle,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { DateField } from './date-field';
import { UnitField } from './unit-field';
import { QuickAdd, SavedFeedback } from './quick-add';
import {
  nextAssessment,
  relativeDue,
  waitingLabel,
  UNASSIGNED_UNIT,
} from '@/lib/first-step';
import {
  createAssessment,
  formatDate,
  localDate,
  resubmit,
  submit,
  updateAssessment,
  byDue,
  STORAGE_KEY,
} from '@/lib/assessments';
import {
  backup,
  mergeBackup,
  readBackup,
  type Card,
  type Workspace,
  type Unit,
  type Remote,
} from '@/lib/workspace';
import type { useCloud } from '@/hooks/use-cloud';
export type CloudStore = ReturnType<typeof useCloud>;
function download(name: string, raw: string) {
  const url = URL.createObjectURL(
    new Blob([raw], { type: 'application/json' }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function exportData(data: Workspace, label = 'backup') {
  download(`assessment-tracker-${label}-${localDate()}.json`, backup(data));
}
const tone = (unit: Unit | undefined) => `color-${unit?.color ?? 0}`;
function recordedDate(value: string) {
  return new Intl.DateTimeFormat('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}
type Draft = {
  unitName: string;
  unitId: string;
  cards: { id: string; name: string; due: string | null }[];
};
function Builder({
  data,
  onSave,
  onClose,
  scope,
}: {
  data: Workspace;
  onSave: (v: Workspace) => boolean;
  onClose: () => void;
  scope: string;
}) {
  const [draft, setDraft] = useState<Draft>({
    unitName: '',
    unitId: '',
    cards: [],
  });
  const [key, setKey] = useState('');
  const [source, setSource] = useState<{ key: string; raw: string } | null>(
    null,
  );
  const [error, setError] = useState('');
  const [stored, setStored] = useState<{ key: string; draft: Draft }[]>([]);
  useEffect(() => {
    // Browser-only storage is loaded after hydration.
    // oxlint-disable-next-line react/react-compiler
    setKey(`assessment-tracker.draft.${scope}.${crypto.randomUUID()}`);
    if (scope === 'sample') return;
    try {
      const found = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)!;
        if (k.startsWith(`assessment-tracker.draft.${scope}.`)) {
          const v = JSON.parse(localStorage.getItem(k)!);
          if (v.cards?.length) found.push({ key: k, draft: v });
        }
      }
      setStored(found);
    } catch {
      setError('A saved draft could not be read. Its original copy is kept.');
    }
  }, [scope]);
  function change(next: Draft) {
    try {
      if (scope !== 'sample') localStorage.setItem(key, JSON.stringify(next));
      setDraft(next);
      setError('');
    } catch {
      setError(
        'Draft could not be saved on this device. Your previous draft is kept. Free some browser storage and try again.',
      );
    }
  }
  function addCard() {
    const used = new Set([
      ...data.items.filter((a) => a.unitId === draft.unitId).map((a) => a.name),
      ...draft.cards.map((a) => a.name),
    ]);
    let n = 1;
    while (used.has(`Assessment ${n}`)) n++;
    change({
      ...draft,
      cards: [
        ...draft.cards,
        { id: crypto.randomUUID(), name: `Assessment ${n}`, due: null },
      ],
    });
  }
  function select(name: string) {
    const unit = data.units.find((u) => u.name === name);
    change({
      ...draft,
      unitName: name,
      unitId: unit?.id ?? '',
    });
  }
  function save() {
    try {
      const name = draft.unitName.trim();
      if (!name) throw Error('Enter a unit name first.');
      if (!draft.cards.length) throw Error('Add an assessment card first.');
      const existing = data.units.find(
        (u) => u.name.toLowerCase() === name.toLowerCase(),
      );
      const unit = existing ?? {
        id: crypto.randomUUID(),
        name,
        color: data.units.length % 6,
      };
      const cards = draft.cards.map((c) => ({
        ...createAssessment(unit.name, c.name, c.due),
        id: c.id,
        unitId: unit.id,
        deletedAt: null,
      }));
      if (cards.some((c) => data.items.some((a) => a.id === c.id)))
        throw Error(
          'These draft cards were already saved. Close this draft and check your semester.',
        );
      const next = {
        ...data,
        units: existing ? data.units : [...data.units, unit],
        items: [...data.items, ...cards],
      };
      if (onSave(next)) {
        try {
          if (scope !== 'sample') {
            localStorage.removeItem(key);
            if (source && localStorage.getItem(source.key) === source.raw)
              localStorage.removeItem(source.key);
          }
        } catch {}
        onClose();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save cards.');
    }
  }
  const selected = data.units.find((u) => u.name === draft.unitName);
  return (
    <section className="builder">
      <button className="text-button" onClick={onClose}>
        <ArrowLeft size={16} /> Back to semester
      </button>
      <div className="section-heading">
        <div>
          <p className="eyebrow">Make a little space for each assessment</p>
          <h1>
            {draft.unitName
              ? `Build your ${draft.unitName} unit`
              : 'Build your semester'}
          </h1>
        </div>
        <span className="pill">
          {scope === 'sample'
            ? 'Temporary practice drafts'
            : 'Drafts stay on this device'}
        </span>
      </div>
      {stored.length > 0 && (
        <details className="notice">
          <summary>Resume a saved draft · {stored.length}</summary>
          {stored.map((s) => (
            <button
              key={s.key}
              onClick={() => {
                const raw = JSON.stringify(s.draft);
                const newKey = `assessment-tracker.draft.${scope}.${crypto.randomUUID()}`;
                try {
                  localStorage.setItem(newKey, raw);
                } catch {
                  setError('Could not create a safe copy of this draft.');
                  return;
                }
                setSource({ key: s.key, raw });
                setDraft(s.draft);
                setKey(newKey);
                setStored(stored.filter((x) => x.key !== s.key));
              }}
            >
              Resume {s.draft.unitName || 'unnamed unit'} ·{' '}
              {s.draft.cards.length} card{s.draft.cards.length === 1 ? '' : 's'}
            </button>
          ))}
        </details>
      )}
      <div className="unit-entry">
        <BookOpen />
        <label>
          Which unit are you studying?
          <input
            list="unit-options"
            value={draft.unitName}
            maxLength={200}
            placeholder="e.g. Database"
            onChange={(e) => select(e.target.value)}
          />
          <datalist id="unit-options">
            {data.units.map((u) => (
              <option key={u.id} value={u.name}>
                {u.name}
              </option>
            ))}
          </datalist>
        </label>
        {data.units.length > 0 && (
          <label>
            Or choose a unit
            <select
              aria-label="Choose an existing unit"
              value={selected?.id ?? ''}
              onChange={(e) =>
                select(
                  data.units.find((u) => u.id === e.target.value)?.name ?? '',
                )
              }
            >
              <option value="">New unit</option>
              {data.units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <div className="draft-grid">
        {draft.cards.map((c, i) => (
          <article
            className={`draft-card ${tone(selected ?? ({ color: data.units.length % 6 } as Unit))}`}
            key={c.id}
          >
            <div className="draft-ribbon">
              <span>DRAFT {String(i + 1).padStart(2, '0')}</span>
              <button
                className="icon-button"
                aria-label={`Remove draft ${i + 1}`}
                onClick={() =>
                  change({
                    ...draft,
                    cards: draft.cards.filter((x) => x.id !== c.id),
                  })
                }
              >
                <X size={18} />
              </button>
            </div>
            <div className="draft-body">
              <label className="sr-only" htmlFor={c.id}>
                Assessment name {i + 1}
              </label>
              <input
                id={c.id}
                aria-label={`Assessment name ${i + 1}`}
                maxLength={200}
                value={c.name}
                onChange={(e) =>
                  change({
                    ...draft,
                    cards: draft.cards.map((x) =>
                      x.id === c.id ? { ...x, name: e.target.value } : x,
                    ),
                  })
                }
              />
              <DateField
                value={c.due}
                onChange={(due) =>
                  change({
                    ...draft,
                    cards: draft.cards.map((x) =>
                      x.id === c.id ? { ...x, due } : x,
                    ),
                  })
                }
              />
              {!c.due && <p className="muted">No date yet. That is okay.</p>}
            </div>
          </article>
        ))}
        <button
          className="add-card"
          disabled={!draft.unitName.trim()}
          onClick={addCard}
        >
          <span>
            <Plus size={32} />
          </span>
          Another assessment
        </button>
      </div>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      <div className="builder-footer">
        <p>Use the assessment number, or make the title your own.</p>
        <button
          className="primary"
          disabled={!draft.cards.length}
          onClick={save}
        >
          Save {draft.cards.length || ''} assessment
          {draft.cards.length !== 1 ? 's' : ''}
          <ArrowRight size={17} />
        </button>
      </div>
    </section>
  );
}
function CardView({
  card,
  unit,
  onEdit,
  onChange,
  onHistory,
  onRecordResult,
  onSetUnit,
  onSetDue,
  onSubmit,
  units,
  disabled,
  today,
}: {
  today: string;
  card: Card;
  unit: Unit | undefined;
  onEdit: () => void;
  onChange: (c: Card) => void;
  onHistory: () => void;
  onRecordResult: () => void;
  onSetUnit: (name: string) => boolean;
  onSetDue: (due: string | null) => boolean;
  onSubmit: () => void;
  units: string[];
  disabled: boolean;
}) {
  const c = card;
  return (
    <article
      id={`card-${c.id}`}
      tabIndex={-1}
      className={`assessment-card ${tone(unit)} ${c.status === 'work' && c.due === today && !c.deletedAt ? 'due-today-card' : ''}`}
      data-testid="assessment-card"
    >
      <div className="card-top">
        <div>
          <h3>{c.name}</h3>
          {c.unit !== UNASSIGNED_UNIT ? (
            <span className="unit-chip">{c.unit}</span>
          ) : (
            <UnitField units={units} disabled={disabled} onChange={onSetUnit} />
          )}
        </div>
        <button
          className="icon-button"
          aria-label={`Edit ${c.name}`}
          onClick={onEdit}
        >
          <Pencil size={16} />
        </button>
      </div>
      {c.id.startsWith('recovered-') && (
        <span className="badge amber">
          Recovered copy · review before removing
        </span>
      )}
      {c.attempt > 1 && (
        <span className="badge amber">Resubmission · round {c.attempt}</span>
      )}
      {c.status === 'waiting' && (
        <span className="badge">
          <Clock size={14} />
          Awaiting results
        </span>
      )}
      {c.status === 'done' && (
        <span className="badge complete">
          <Check size={14} />
          Completed
        </span>
      )}
      <div className="card-date">
        {c.due ? (
          <>
            <CalendarDays size={17} />
            {formatDate(c.due)}
          </>
        ) : (
          <DateField
            value={null}
            emptyLabel="+ Due date"
            disabled={disabled}
            onChange={onSetDue}
          />
        )}
      </div>
      {c.status === 'work' && c.due && c.due <= today && !c.deletedAt && (
        <span className={`badge ${c.due === today ? 'due-today' : 'amber'}`}>
          {relativeDue(c.due, today)}
        </span>
      )}
      {c.submittedAt && (
        <p className="submitted-date">
          Submitted {recordedDate(c.submittedAt)}
          {c.status === 'waiting' && ` · ${waitingLabel(c.submittedAt, today)}`}
        </p>
      )}
      <div
        className={`record-line ${c.status}`}
        aria-label={`Current status: ${c.status}`}
      >
        <span className="record-step done-step">
          <i />
          Added<small>{recordedDate(c.history[0].at)}</small>
        </span>
        {(c.submittedAt || c.attempt > 1) && (
          <>
            <span className={`record-step ${c.submittedAt ? 'done-step' : ''}`}>
              <i />
              Submitted
              <small>{c.submittedAt ? recordedDate(c.submittedAt) : '—'}</small>
            </span>
            <span
              className={`record-step ${c.status === 'done' ? 'done-step' : ''}`}
            >
              <i />
              Result
              <small>
                {c.status === 'done'
                  ? 'Recorded'
                  : c.status === 'waiting'
                    ? 'Waiting'
                    : '—'}
              </small>
            </span>
          </>
        )}
      </div>
      {c.attempt > 1 && (
        <p className="previous-record">
          Previous submission is kept in this record.
        </p>
      )}
      <div className="card-actions">
        {c.deletedAt ? (
          <button
            disabled={disabled}
            onClick={() =>
              onChange({
                ...updateAssessment(c, {}, 'Restored from trash'),
                unitId: c.unitId,
                deletedAt: null,
              })
            }
          >
            <Undo2 size={15} />
            Restore card
          </button>
        ) : c.status === 'work' ? (
          <button disabled={disabled} onClick={onSubmit}>
            Mark submitted
          </button>
        ) : c.status === 'waiting' ? (
          <button disabled={disabled} onClick={onRecordResult}>
            Record result
          </button>
        ) : (
          <button
            disabled={disabled}
            onClick={() =>
              onChange({
                ...updateAssessment(
                  c,
                  { status: c.submittedAt ? 'waiting' : 'work' },
                  'Completion undone',
                ),
                unitId: c.unitId,
                deletedAt: null,
              })
            }
          >
            <Undo2 size={14} />
            Undo completion
          </button>
        )}
      </div>
      <button className="text-button history-link" onClick={onHistory}>
        <History size={14} /> View record · {c.history.length} event
        {c.history.length === 1 ? '' : 's'}
      </button>
    </article>
  );
}
export function Semester({
  data,
  commit,
  scope,
  cloud,
  onExit,
  isSample = false,
  emulator = false,
  onSample,
}: {
  data: Workspace;
  commit: (v: Workspace) => boolean;
  scope: string;
  cloud?: CloudStore;
  onExit: () => void;
  isSample?: boolean;
  emulator?: boolean;
  onSample?: () => void;
}) {
  const [tab, setTab] = useState<'semester' | 'submitted' | 'trash'>(
    'semester',
  );
  const [unit, setUnit] = useState('all');
  const [showUnits, setShowUnits] = useState(false);
  const [view, setView] = useState<'date' | 'unit'>('date');
  const [building, setBuilding] = useState(false);
  const [edit, setEdit] = useState<Card | null>(null);
  const [history, setHistory] = useState<Card | null>(null);
  const [reassessment, setReassessment] = useState<Card | null>(null);
  const [resultCard, setResultCard] = useState<Card | null>(null);
  const [submitCard, setSubmitCard] = useState<Card | null>(null);
  const [newDue, setNewDue] = useState<string | null>(null);
  const [recovery, setRecovery] = useState(false);
  const [settings, setSettings] = useState(false);
  const [preview, setPreview] = useState<
    (Awaited<ReturnType<typeof mergeBackup>> & { baseData: string }) | null
  >(null);
  const [revisions, setRevisions] = useState<
    { revision: number; updated_at: string }[]
  >([]);
  const [moreHistory, setMoreHistory] = useState(true);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [rename, setRename] = useState<Unit | null>(null);
  const [today, setToday] = useState(localDate());
  useEffect(() => {
    const timer = setInterval(() => setToday(localDate()), 60000);
    return () => clearInterval(timer);
  }, []);
  const blocked = !!cloud && (!!cloud.pending || cloud.status === 'Loading');
  const active = data.items.filter((c) => !c.deletedAt);
  const filtered = active.filter((c) => unit === 'all' || c.unitId === unit);
  const next = nextAssessment(filtered);
  const work = filtered.filter((c) => c.status === 'work').sort(byDue);
  const overdue = work.filter((c) => c.due && c.due < today);
  const undated = work.filter((c) => !c.due);
  const todayWork = work.filter((c) => c.due === today);
  const dated = work.filter((c) => c.due && c.due > today);
  const waiting = filtered
    .filter((c) => c.status === 'waiting')
    .sort((a, b) => (a.submittedAt ?? '').localeCompare(b.submittedAt ?? ''));
  const done = filtered.filter((c) => c.status === 'done');
  const trash = data.items.filter(
    (c) => c.deletedAt && (unit === 'all' || c.unitId === unit),
  );
  function save(v: Workspace) {
    if (blocked) return false;
    setPreview(null);
    const ok = commit(v);
    if (ok) setMessage('');
    return ok;
  }
  function change(c: Card) {
    return save({
      ...data,
      items: data.items.map((x) => (x.id === c.id ? c : x)),
    });
  }
  function render(c: Card) {
    return (
      <CardView
        key={c.id}
        card={c}
        unit={data.units.find((u) => u.id === c.unitId)}
        disabled={blocked}
        today={today}
        onChange={change}
        onEdit={() => setEdit(structuredClone(c))}
        units={data.units
          .filter((u) => u.name !== UNASSIGNED_UNIT)
          .map((u) => u.name)}
        onSubmit={() => setSubmitCard(c)}
        onSetUnit={(name) => {
          const u = data.units.find(
            (u) => u.name.toLowerCase() === name.toLowerCase(),
          ) ?? { id: crypto.randomUUID(), name, color: data.units.length % 6 };
          return save({
            ...data,
            units: data.units.some((x) => x.id === u.id)
              ? data.units
              : [...data.units, u],
            items: data.items.map((x) =>
              x.id === c.id
                ? {
                    ...updateAssessment(x, { unit: u.name }, 'Unit added'),
                    unitId: u.id,
                    deletedAt: x.deletedAt,
                  }
                : x,
            ),
          });
        }}
        onSetDue={(due) =>
          change({
            ...updateAssessment(c, { due }, 'Due date added'),
            unitId: c.unitId,
            deletedAt: c.deletedAt,
          })
        }
        onHistory={() => setHistory(c)}
        onRecordResult={() => setResultCard(c)}
      />
    );
  }
  async function prepare(raw: string) {
    setBusy(true);
    try {
      setPreview({
        ...(await mergeBackup(data, readBackup(raw))),
        baseData: JSON.stringify(data),
      });
      setMessage('');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Could not read backup.');
    } finally {
      setBusy(false);
    }
  }
  async function loadHistory(append = false) {
    if (!cloud) return;
    setBusy(true);
    try {
      const suffix =
        append && revisions.length
          ? `?before=${revisions.at(-1)!.revision}`
          : '';
      const { response, value } = await cloud.request('/api/history' + suffix);
      if (!response.ok) throw Error(value.error);
      setRevisions(append ? [...revisions, ...value.items] : value.items);
      setMoreHistory(value.items.length === 30);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Could not load history.');
    } finally {
      setBusy(false);
    }
  }
  const batchEntry = (
    <button
      className="text-button batch-entry"
      onClick={() => setBuilding(true)}
      disabled={blocked}
    >
      <Plus size={19} /> Add several at once
    </button>
  );
  const months = [...new Set(dated.map((c) => c.due!.slice(0, 7)))].sort();
  return (
    <>
      <header className="topbar">
        <button
          className="brand"
          onClick={(e) => {
            e.preventDefault();
            setBuilding(false);
            setTab('semester');
          }}
        >
          <Layers size={30} />
          <span>
            Assessments<span className="brand-dot">.</span>
          </span>
        </button>
        <nav aria-label="Main navigation">
          <button
            className={tab === 'semester' ? 'active' : ''}
            onClick={() => {
              setTab('semester');
              setBuilding(false);
            }}
          >
            Semester
          </button>
          <button
            className={tab === 'submitted' ? 'active' : ''}
            onClick={() => {
              setTab('submitted');
              setBuilding(false);
            }}
          >
            Submissions{' '}
            <span>{active.filter((c) => c.status === 'waiting').length}</span>
          </button>
        </nav>
        <div className="account-actions">
          {!isSample &&
            cloud &&
            (cloud.status === 'Saved' ? (
              cloud.remote.revision > 0 && (
                <SavedFeedback key={cloud.remote.token} />
              )
            ) : (
              <output className="save-state">
                {cloud.status === 'Loading'
                  ? 'Opening…'
                  : cloud.status === 'Saving'
                    ? 'Saving…'
                    : cloud.status === 'Conflict'
                      ? 'Review changes'
                      : 'Not saved yet'}
              </output>
            ))}
          <button
            className="icon-button"
            aria-label="Settings"
            onClick={() => setSettings(true)}
          >
            <Settings size={21} />
          </button>
          {isSample && (
            <button className="text-button" onClick={onExit}>
              Exit sample
            </button>
          )}
        </div>
      </header>
      <main className="workspace">
        {emulator && (
          <div className="test-service-label">
            Local test service · Data is stored on this computer, not in the
            live cloud.
          </div>
        )}
        {isSample && (
          <div className="notice sample-banner">
            <span>
              <strong>A sample semester.</strong> Try anything here. Practice
              changes are temporary.
            </span>
            <button onClick={onExit}>Back to my account</button>
          </div>
        )}
        {cloud && (
          <>
            {(cloud.error ||
              (cloud.pending && cloud.status === 'Unsynced')) && (
              <div className="notice error" role="alert">
                <AlertCircle size={19} />
                <div>
                  <p>
                    {cloud.pending
                      ? 'Not saved yet. Your changes are kept on this device. Try again when you are connected.'
                      : cloud.status === 'Save failed'
                        ? 'We could not refresh your semester. Check your connection and try again.'
                        : 'This change could not be saved. Keep this page open and check the details before continuing.'}
                  </p>
                  {cloud.error && (
                    <details>
                      <summary>Details</summary>
                      <p>{cloud.error}</p>
                    </details>
                  )}
                </div>
                <button
                  onClick={() => void cloud.sync()}
                  disabled={cloud.status === 'Saving' || !!cloud.conflict}
                >
                  Try again
                </button>
              </div>
            )}
            {cloud.recoveries.length > 0 && !cloud.pending && (
              <div className="notice">
                <span>Some changes on this device still need to be saved.</span>
                <button onClick={() => setRecovery(true)}>
                  Review changes
                </button>
              </div>
            )}
            {cloud.conflict && (
              <section className="conflict-panel">
                <h2>Both versions are safe</h2>
                <p>
                  Another device saved revision {cloud.conflict.revision}. Your
                  version has {data.items.length} cards; the cloud version has{' '}
                  {cloud.conflict.data.items.length}. Keep both to add differing
                  cards as recovered copies. Your original version also stays in
                  local recovery files.
                </p>
                <div className="actions">
                  <button
                    onClick={() => exportData(data, 'my-conflicting-version')}
                  >
                    Download my version
                  </button>
                  <button
                    onClick={() =>
                      exportData(cloud.conflict!.data, 'cloud-version')
                    }
                  >
                    Download cloud version
                  </button>
                  <button
                    className="primary"
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      try {
                        const merged = await mergeBackup(
                          cloud.conflict!.data,
                          data,
                        );
                        cloud.resolve(merged.data);
                      } catch (e) {
                        setMessage(String(e));
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    Keep both versions
                  </button>
                </div>
              </section>
            )}
          </>
        )}
        {message && (
          <div className="feedback" aria-live="polite">
            {message}
            <button
              className="icon-button"
              aria-label="Dismiss message"
              onClick={() => setMessage('')}
            >
              <X size={15} />
            </button>
          </div>
        )}
        {building ? (
          <Builder
            key={scope}
            data={data}
            onSave={save}
            scope={scope}
            onClose={() => setBuilding(false)}
          />
        ) : (
          <>
            <div className="section-heading">
              <div>
                <h1>
                  {tab === 'semester'
                    ? 'My semester'
                    : tab === 'submitted'
                      ? 'Submissions'
                      : 'Trash'}
                </h1>
                {tab !== 'trash' && (
                  <p className="today-date">
                    {new Intl.DateTimeFormat('en-AU', {
                      weekday: 'long',
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    }).format(new Date(today + 'T12:00:00'))}
                  </p>
                )}
                {tab === 'semester' && next && (
                  <button
                    className="next-up"
                    onClick={() => {
                      const card = document.getElementById(`card-${next.id}`);
                      card?.scrollIntoView({
                        behavior: 'smooth',
                        block: 'center',
                      });
                      card?.focus({ preventScroll: true });
                    }}
                  >
                    <strong>Next up</strong> — {next.name}
                    {next.unit !== UNASSIGNED_UNIT
                      ? ` (${next.unit})`
                      : ''} ·{' '}
                    {relativeDue(next.due, today)}
                  </button>
                )}
                <p className="subtitle">
                  {tab === 'semester'
                    ? active.length
                      ? `${active.length} assessment${active.length === 1 ? '' : 's'} you added · from first deadline to final result`
                      : 'Start with one assessment. The rest can come later.'
                    : tab === 'submitted'
                      ? 'Your submitted records, longest waiting first.'
                      : 'Restore cards with their deadlines and submission history.'}
                </p>
              </div>
              {active.length > 0 && batchEntry}
            </div>
            {tab === 'semester' && (
              <QuickAdd
                data={data}
                onAdd={(v) => {
                  if (!save(v)) return false;
                  setUnit('all');
                  return true;
                }}
                disabled={blocked}
                first={!active.length}
              />
            )}
            {!active.length && (
              <div className="batch-secondary">{batchEntry}</div>
            )}
            {active.length > 0 && (
              <button
                className="mobile-unit-toggle"
                aria-expanded={showUnits}
                onClick={() => setShowUnits(!showUnits)}
              >
                Units
                {unit !== 'all'
                  ? ` · ${data.units.find((u) => u.id === unit)?.name ?? ''}`
                  : ''}
              </button>
            )}
            {active.length > 0 && tab === 'semester' && (
              <section
                className={`unit-summary ${showUnits ? 'units-open' : ''}`}
                aria-label="Your unit summary"
              >
                {data.units
                  .filter(
                    (u) =>
                      u.name !== UNASSIGNED_UNIT &&
                      active.some((c) => c.unitId === u.id),
                  )
                  .map((u) => {
                    const cards = active.filter((c) => c.unitId === u.id);
                    return (
                      <button
                        key={u.id}
                        className={tone(u)}
                        onClick={() => setUnit(u.id)}
                      >
                        <i className="dot" />
                        <span>
                          <strong>{u.name}</strong>
                          <small>
                            {cards.length} assessment
                            {cards.length === 1 ? '' : 's'}
                          </small>
                        </span>
                        <em>
                          {cards.filter((c) => c.status === 'work').length} to
                          do ·{' '}
                          {cards.filter((c) => c.status === 'waiting').length}{' '}
                          waiting ·{' '}
                          {cards.filter((c) => c.status === 'done').length}{' '}
                          completed
                        </em>
                      </button>
                    );
                  })}
                <p>Counts reflect only the assessments you added.</p>
              </section>
            )}
            {active.length > 0 && (
              <div className="filter-row">
                <div
                  className={`unit-filters ${showUnits ? 'units-open' : ''}`}
                  aria-label="Filter by unit"
                >
                  <button
                    className={unit === 'all' ? 'selected' : ''}
                    onClick={() => setUnit('all')}
                  >
                    All units
                  </button>
                  {data.units
                    .filter(
                      (u) =>
                        u.name !== UNASSIGNED_UNIT ||
                        active.some((c) => c.unitId === u.id),
                    )
                    .map((u) => (
                      <button
                        key={u.id}
                        className={unit === u.id ? 'selected' : ''}
                        onClick={() => setUnit(u.id)}
                      >
                        <i className={`dot ${tone(u)}`} />
                        {u.name}
                      </button>
                    ))}
                </div>
                {tab === 'semester' && (
                  <div className="view-switch" aria-label="Group assessments">
                    <button
                      aria-pressed={view === 'date'}
                      className={view === 'date' ? 'selected' : ''}
                      onClick={() => setView('date')}
                    >
                      By date
                    </button>
                    <button
                      aria-pressed={view === 'unit'}
                      className={view === 'unit' ? 'selected' : ''}
                      onClick={() => setView('unit')}
                    >
                      By unit
                    </button>
                  </div>
                )}
              </div>
            )}
            {tab === 'semester' && (
              <>
                {!active.length ? (
                  <section className="sample-invitation">
                    <p>Want to see how a semester can look?</p>
                    {onSample && (
                      <button className="text-button" onClick={onSample}>
                        <BookOpen size={18} /> Explore a sample semester{' '}
                        <ArrowRight size={16} />
                      </button>
                    )}
                  </section>
                ) : (
                  <div className="semester-board">
                    <div className="work-board">
                      {overdue.length > 0 && (
                        <section className="work-section overdue-section">
                          <h2>
                            <AlertCircle size={21} />
                            Overdue <span>{overdue.length}</span>
                          </h2>
                          <div className="card-grid">{overdue.map(render)}</div>
                        </section>
                      )}
                      <section className="work-section today-section">
                        <h2>
                          Today <span>{todayWork.length}</span>
                        </h2>
                        {todayWork.length ? (
                          <div className="card-grid">
                            {todayWork.map(render)}
                          </div>
                        ) : (
                          <p className="muted">Nothing due today.</p>
                        )}
                      </section>
                      {view === 'date' ? (
                        <section className="work-section coming-section">
                          <h2>
                            Coming up <span>{dated.length}</span>
                          </h2>
                          <div className="month-grid">
                            {months.map((month) => (
                              <section className="month-column" key={month}>
                                <h2 className="month-title">
                                  {new Intl.DateTimeFormat('en-AU', {
                                    month: 'long',
                                    year: 'numeric',
                                  }).format(new Date(month + '-01T12:00:00'))}
                                  <span>
                                    {
                                      dated.filter((c) =>
                                        c.due!.startsWith(month),
                                      ).length
                                    }
                                  </span>
                                </h2>
                                {dated
                                  .filter((c) => c.due!.startsWith(month))
                                  .map(render)}
                              </section>
                            ))}
                          </div>
                        </section>
                      ) : (
                        <section className="work-section coming-section">
                          <h2>
                            Coming up <span>{dated.length}</span>
                          </h2>
                          <div className="month-grid">
                            {data.units
                              .filter((u) => unit === 'all' || unit === u.id)
                              .map((u) => (
                                <section className="month-column" key={u.id}>
                                  <h2 className="month-title">
                                    <i className={`dot ${tone(u)}`} />
                                    {u.name}
                                    <button
                                      className="icon-button"
                                      disabled={blocked}
                                      aria-label={`Rename unit ${u.name}`}
                                      onClick={() => setRename({ ...u })}
                                    >
                                      <Pencil size={15} />
                                    </button>
                                  </h2>
                                  {dated
                                    .filter((c) => c.unitId === u.id)
                                    .map(render)}
                                  {!dated.some((c) => c.unitId === u.id) && (
                                    <p className="muted">
                                      No upcoming dated work.
                                    </p>
                                  )}
                                </section>
                              ))}
                          </div>
                        </section>
                      )}
                      <section className="undated-section">
                        <div className="section-label">
                          <h2 className="month-title">
                            No date yet <span>{undated.length}</span>
                          </h2>
                          <p>Assessments without a deadline.</p>
                        </div>
                        {undated.length ? (
                          <div className="card-grid">{undated.map(render)}</div>
                        ) : (
                          <p className="muted">
                            All active assessments have a date.
                          </p>
                        )}
                      </section>
                      {!work.length && (
                        <p className="empty-note">
                          No work waiting here. Check Submissions for results
                          and completed assessments.
                        </p>
                      )}
                    </div>
                    <aside
                      className="desktop-record-overview"
                      aria-label="Submission overview"
                    >
                      <div className="section-label">
                        <h2>
                          Waiting on results{' '}
                          <span className="count">{waiting.length}</span>
                        </h2>
                        <p>Longest waiting first</p>
                      </div>
                      <div className="card-grid">{waiting.map(render)}</div>
                      {!waiting.length && (
                        <p className="muted">
                          No assessments awaiting results.
                        </p>
                      )}
                      <div className="section-label completed-overview-heading">
                        <h2>
                          Completed <span className="count">{done.length}</span>
                        </h2>
                      </div>
                      <div className="card-grid">{done.map(render)}</div>
                    </aside>
                  </div>
                )}
              </>
            )}
            {tab === 'submitted' && (
              <>
                <div className="section-label">
                  <h2>
                    Awaiting results{' '}
                    <span className="count">{waiting.length}</span>
                  </h2>
                  <p>
                    Marking submitted here records your confirmation. It does
                    not submit files to your school.
                  </p>
                </div>
                <div className="card-grid submitted-grid">
                  {waiting.map(render)}
                </div>
                {!waiting.length && (
                  <p className="empty-note">No assessments awaiting results.</p>
                )}
                <details className="completed-section" open>
                  <summary>Completed · {done.length}</summary>
                  <div className="card-grid">{done.map(render)}</div>
                </details>
              </>
            )}
            {tab === 'trash' && (
              <>
                {trash.length ? (
                  <div className="card-grid">{trash.map(render)}</div>
                ) : (
                  <p className="empty-note">Your trash is empty.</p>
                )}
                <p className="muted">
                  Cards stay here until you restore them. No automatic deletion.
                </p>
              </>
            )}
          </>
        )}
      </main>
      <nav className="mobile-tabs" aria-label="Mobile navigation">
        <button
          className={tab === 'semester' ? 'active' : ''}
          onClick={() => {
            setTab('semester');
            setBuilding(false);
          }}
        >
          <CalendarDays size={21} /> Semester
        </button>
        <button
          className={tab === 'submitted' ? 'active' : ''}
          onClick={() => {
            setTab('submitted');
            setBuilding(false);
          }}
        >
          <FileText size={21} /> Submissions
          <span>{active.filter((c) => c.status === 'waiting').length}</span>
        </button>
      </nav>
      <Dialog open={settings} onOpenChange={setSettings}>
        <DialogContent className="app-dialog settings-dialog">
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Your account and ways to keep your assessments safe.
          </DialogDescription>
          {onSample && (
            <button
              onClick={() => {
                setSettings(false);
                onSample();
              }}
            >
              <BookOpen size={18} /> Explore a sample semester
            </button>
          )}
          <button
            onClick={() => {
              setSettings(false);
              setTab('trash');
              setUnit('all');
              setBuilding(false);
            }}
          >
            <Trash2 size={18} /> Trash ·{' '}
            {data.items.filter((c) => c.deletedAt).length}
          </button>
          <button
            onClick={() => exportData(data, isSample ? 'sample' : 'backup')}
          >
            <Download size={18} /> Export backup
          </button>
          <button
            onClick={() => {
              setSettings(false);
              setRecovery(true);
            }}
          >
            <History size={18} /> Backup & recovery
          </button>
          {cloud && (
            <p className="muted">
              {cloud.status} ·{' '}
              {cloud.remote.updatedAt
                ? `Last confirmed save: ${new Date(cloud.remote.updatedAt).toLocaleString('en-AU')}`
                : 'No confirmed saves yet.'}
            </p>
          )}
          <button className="text-button" onClick={onExit}>
            {isSample ? 'Exit sample' : 'Sign out'}
          </button>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!edit}
        onOpenChange={(open) => {
          if (!open) setEdit(null);
        }}
      >
        <DialogContent className="app-dialog">
          <DialogTitle>Edit assessment</DialogTitle>
          <DialogDescription>
            Changes are added to history. Earlier dates and submissions stay
            there.
          </DialogDescription>
          {edit && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const current = data.items.find((c) => c.id === edit.id)!;
                if (current.history.length !== edit.history.length) {
                  setMessage(
                    'This card changed on another device. Reopen it before editing.',
                  );
                  return;
                }
                const name = edit.unit.trim() || UNASSIGNED_UNIT;
                const u = data.units.find(
                  (u) => u.name.toLowerCase() === name.toLowerCase(),
                ) ?? {
                  id: crypto.randomUUID(),
                  name,
                  color: data.units.length % 6,
                };
                const updated = {
                  ...updateAssessment(
                    current,
                    { name: edit.name.trim(), unit: u.name, due: edit.due },
                    'Details corrected',
                  ),
                  unitId: u.id,
                  deletedAt: current.deletedAt,
                };
                if (
                  save({
                    ...data,
                    units: data.units.some((x) => x.id === u.id)
                      ? data.units
                      : [...data.units, u],
                    items: data.items.map((x) =>
                      x.id === updated.id ? updated : x,
                    ),
                  })
                )
                  setEdit(null);
              }}
            >
              <label>
                Assessment name
                <input
                  value={edit.name}
                  required
                  maxLength={200}
                  onChange={(e) => setEdit({ ...edit, name: e.target.value })}
                />
              </label>
              <label htmlFor="edit-unit">
                Unit (optional)
                <input
                  id="edit-unit"
                  list="edit-unit-options"
                  maxLength={200}
                  value={edit.unit === UNASSIGNED_UNIT ? '' : edit.unit}
                  placeholder="e.g. Database"
                  onChange={(e) => setEdit({ ...edit, unit: e.target.value })}
                />
                <datalist id="edit-unit-options">
                  {data.units
                    .filter((u) => u.name !== UNASSIGNED_UNIT)
                    .map((u) => (
                      <option key={u.id} value={u.name}>
                        {u.name}
                      </option>
                    ))}
                </datalist>
              </label>
              <DateField
                value={edit.due}
                onChange={(due) => setEdit({ ...edit, due })}
              />
              <button
                className="primary wide"
                disabled={blocked || !edit.name.trim()}
              >
                Save changes
              </button>
              {!edit.deletedAt && (
                <button
                  type="button"
                  className="danger text-button"
                  disabled={blocked}
                  onClick={() => {
                    const c = data.items.find((c) => c.id === edit.id)!;
                    if (
                      change({
                        ...updateAssessment(c, {}, 'Moved to trash'),
                        unitId: c.unitId,
                        deletedAt: new Date().toISOString(),
                      })
                    )
                      setEdit(null);
                  }}
                >
                  <Trash2 size={16} />
                  Move to trash · recoverable
                </button>
              )}
            </form>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!submitCard}
        onOpenChange={(open) => {
          if (!open) setSubmitCard(null);
        }}
      >
        <DialogContent className="app-dialog">
          <DialogTitle>Record your submission</DialogTitle>
          <DialogDescription>
            Marking submitted records your confirmation. It does not submit
            files to your school.
          </DialogDescription>
          <p>{submitCard?.name}</p>
          <button
            className="primary"
            disabled={blocked}
            onClick={() => {
              const current = data.items.find((c) => c.id === submitCard?.id);
              if (
                !current ||
                current.deletedAt ||
                current.status !== 'work' ||
                current.history.length !== submitCard?.history.length
              ) {
                setSubmitCard(null);
                setMessage('This card changed. Reopen it to continue.');
                return;
              }
              if (
                change({
                  ...submit(current),
                  unitId: current.unitId,
                  deletedAt: null,
                })
              ) {
                setSubmitCard(null);
                setTab('submitted');
              }
            }}
          >
            Confirm submitted
          </button>
          <button onClick={() => setSubmitCard(null)}>Cancel</button>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!resultCard}
        onOpenChange={(open) => {
          if (!open) setResultCard(null);
        }}
      >
        <DialogContent className="app-dialog result-dialog">
          <DialogTitle>What was the outcome?</DialogTitle>
          <DialogDescription>
            Record what your teacher told you for {resultCard?.name}.
          </DialogDescription>
          {resultCard && (
            <>
              <div className="previous-dates">
                <strong>{resultCard.name}</strong>
                <p>
                  Submitted{' '}
                  {resultCard.submittedAt
                    ? new Date(resultCard.submittedAt).toLocaleString('en-AU')
                    : 'date not recorded'}
                </p>
              </div>
              <button
                className="primary wide"
                disabled={blocked}
                onClick={() => {
                  const current = data.items.find(
                    (c) => c.id === resultCard.id,
                  );
                  if (
                    !current ||
                    current.status !== 'waiting' ||
                    current.history.length !== resultCard.history.length
                  ) {
                    setMessage(
                      'This card changed. Reopen it to record the result.',
                    );
                    setResultCard(null);
                    return;
                  }
                  if (
                    change({
                      ...updateAssessment(
                        current,
                        { status: 'done' },
                        'Completed',
                      ),
                      unitId: current.unitId,
                      deletedAt: null,
                    })
                  )
                    setResultCard(null);
                }}
              >
                Completed
              </button>
              <button
                disabled={blocked}
                onClick={() => {
                  setReassessment(resultCard);
                  setNewDue(null);
                  setResultCard(null);
                }}
              >
                Needs resubmission
              </button>
              <p className="muted">
                Completed is your record of the result. The app does not infer a
                grade or pass.
              </p>
            </>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!reassessment}
        onOpenChange={(o) => {
          if (!o) setReassessment(null);
        }}
      >
        <DialogContent className="app-dialog">
          <DialogTitle>Add a resubmission</DialogTitle>
          <DialogDescription>
            Your previous deadline and submission stay in history.
          </DialogDescription>
          {reassessment && (
            <>
              <span
                className={`unit-chip ${tone(data.units.find((u) => u.id === reassessment.unitId))}`}
              >
                {reassessment.unit}
              </span>
              <h2>{reassessment.name}</h2>
              <div className="previous-dates">
                <p>Previous due date: {formatDate(reassessment.due)}</p>
                <p>
                  Submitted:{' '}
                  {reassessment.submittedAt
                    ? new Date(reassessment.submittedAt).toLocaleString('en-AU')
                    : 'Not recorded'}
                </p>
              </div>
              <DateField
                label="New due date (optional)"
                value={newDue}
                onChange={setNewDue}
              />
              <p>
                Moves back to My semester. No reassessment limit is assumed.
              </p>
              <button
                className="primary"
                disabled={blocked}
                onClick={() => {
                  const c = data.items.find((c) => c.id === reassessment.id)!;
                  if (
                    c.status !== 'waiting' ||
                    c.history.length !== reassessment.history.length
                  ) {
                    setMessage('This card changed. Reopen it to continue.');
                    return;
                  }
                  if (
                    change({
                      ...resubmit(c, newDue),
                      unitId: c.unitId,
                      deletedAt: null,
                    })
                  ) {
                    setReassessment(null);
                    setTab('semester');
                  }
                }}
              >
                Save resubmission
              </button>
              <button onClick={() => setReassessment(null)}>Cancel</button>
            </>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!history}
        onOpenChange={(o) => {
          if (!o) setHistory(null);
        }}
      >
        <DialogContent className="app-dialog history-dialog">
          <DialogTitle>{history?.name} · History</DialogTitle>
          <DialogDescription>
            Actual recorded changes, including every earlier deadline and
            submission.
          </DialogDescription>
          <ol className="timeline">
            {history?.history.toReversed().map((h, i) => (
              <li key={i}>
                <span className="event-time">
                  {new Date(h.at).toLocaleString('en-AU')}
                </span>
                <h3>{h.action}</h3>
                <p>
                  {h.snapshot.unit} · {h.snapshot.name}
                </p>
                <p>
                  Due: {formatDate(h.snapshot.due)} · Round {h.snapshot.attempt}
                </p>
                <p>
                  {h.snapshot.status === 'work'
                    ? 'Needs work'
                    : h.snapshot.status === 'waiting'
                      ? 'Awaiting results'
                      : 'Completed'}
                  {h.snapshot.submittedAt
                    ? ` · Submitted ${new Date(h.snapshot.submittedAt).toLocaleString('en-AU')}`
                    : ''}
                </p>
              </li>
            ))}
          </ol>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!rename}
        onOpenChange={(o) => {
          if (!o) setRename(null);
        }}
      >
        <DialogContent className="app-dialog">
          <DialogTitle>Rename unit</DialogTitle>
          <DialogDescription>
            Updates the cards in this unit and keeps the previous name in
            history.
          </DialogDescription>
          {rename && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const name = rename.name.trim();
                if (
                  data.units.some(
                    (u) =>
                      u.id !== rename.id &&
                      u.name.toLowerCase() === name.toLowerCase(),
                  )
                ) {
                  setMessage('That unit name is already in use.');
                  return;
                }
                if (
                  save({
                    ...data,
                    units: data.units.map((u) =>
                      u.id === rename.id ? { ...u, name } : u,
                    ),
                    items: data.items.map((c) =>
                      c.unitId === rename.id
                        ? {
                            ...updateAssessment(
                              c,
                              { unit: name },
                              'Unit renamed',
                            ),
                            unitId: c.unitId,
                            deletedAt: c.deletedAt,
                          }
                        : c,
                    ),
                  })
                )
                  setRename(null);
              }}
            >
              <label>
                Unit name
                <input
                  required
                  maxLength={200}
                  value={rename.name}
                  onChange={(e) =>
                    setRename({ ...rename, name: e.target.value })
                  }
                />
              </label>
              <button
                className="primary"
                disabled={blocked || !rename.name.trim()}
              >
                Save unit name
              </button>
            </form>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={recovery}
        onOpenChange={(o) => {
          setRecovery(o);
          if (!o) setPreview(null);
        }}
      >
        <DialogContent className="app-dialog recovery-dialog">
          <DialogTitle>Backup & recovery</DialogTitle>
          <DialogDescription>
            Sync keeps devices together. A backup is a separate copy you keep
            somewhere safe.
          </DialogDescription>
          <section>
            <h3>Keep a separate backup</h3>
            <p>
              Includes units, cards, trash and all assessment history. Download
              regularly and before importing.
            </p>
            <button
              onClick={() => exportData(data, isSample ? 'sample' : 'backup')}
            >
              <Download size={16} />
              Download backup
            </button>
            {!isSample && (
              <button
                onClick={() => {
                  const entries: Record<string, string> = {};
                  for (let i = 0; i < localStorage.length; i++) {
                    const k = localStorage.key(i)!;
                    if (
                      ['pending', 'branch', 'draft'].some((kind) =>
                        k.startsWith(`assessment-tracker.${kind}.${scope}.`),
                      )
                    )
                      entries[k] = localStorage.getItem(k)!;
                  }
                  download(
                    `assessment-tracker-local-recovery-${localDate()}.json`,
                    JSON.stringify(
                      { format: 'local-recovery-archive', entries },
                      null,
                      2,
                    ),
                  );
                }}
              >
                Download local recovery files
              </button>
            )}
          </section>
          {!isSample && (
            <>
              <section>
                <h3>Import or restore a backup</h3>
                <p>
                  Existing cards stay. Identical cards are skipped. Different
                  versions are added as recovered copies for review.
                </p>
                <label className="file-label">
                  Choose JSON backup
                  <input
                    type="file"
                    accept=".json,application/json"
                    disabled={busy || blocked}
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      if (f) {
                        if (f.size > 2000000)
                          setMessage('Choose a backup under 2 MB.');
                        else await prepare(await f.text());
                      }
                      e.target.value = '';
                    }}
                  />
                </label>
                <button
                  disabled={busy || blocked}
                  onClick={() => {
                    try {
                      const raw = localStorage.getItem(STORAGE_KEY);
                      if (raw) void prepare(raw);
                      else
                        setMessage(
                          'No version 1 data was found at this browser address. Open the old localhost/port and export there, then import the file here.',
                        );
                    } catch {
                      setMessage(
                        'Could not read the original browser data. It was not changed.',
                      );
                    }
                  }}
                >
                  Review old browser data
                </button>
                <p className="muted">
                  The original browser data is never overwritten or deleted.
                </p>
              </section>
              {preview && (
                <section className="notice import-preview">
                  <h3>Review before importing</h3>
                  <p>
                    {preview.added} to add · {preview.skipped} unchanged ·{' '}
                    {preview.copies} recovered copies
                  </p>
                  <button
                    className="primary"
                    disabled={blocked || busy}
                    onClick={() => {
                      if (JSON.stringify(data) !== preview.baseData) {
                        setPreview(null);
                        setMessage(
                          'Your semester changed while you reviewed this backup. Review the import again to include those changes.',
                        );
                        return;
                      }
                      if (save(preview.data)) {
                        setPreview(null);
                        setRecovery(false);
                      }
                    }}
                  >
                    Import {preview.added} cards
                  </button>
                  <button onClick={() => setPreview(null)}>
                    Cancel import
                  </button>
                </section>
              )}
              {cloud?.recoveries.map((r) => (
                <section key={r.key}>
                  <h3>Unsynced copy · {r.pending.data.items.length} cards</h3>
                  <p>
                    Based on revision {r.pending.baseRevision}. Retrying checks
                    for changes on other devices.
                  </p>
                  <button
                    disabled={blocked}
                    onClick={() => {
                      cloud.resume(r.pending);
                      setRecovery(false);
                    }}
                  >
                    Resume sync
                  </button>
                  <button
                    onClick={() => exportData(r.pending.data, 'unsynced')}
                  >
                    Download this copy
                  </button>
                </section>
              ))}
              <section>
                <h3>Saved versions</h3>
                <p>
                  Every confirmed save has a version on the server. Restore adds
                  recovered cards; it does not roll back other work.
                </p>
                <button disabled={busy} onClick={() => void loadHistory()}>
                  Load saved versions
                </button>
                <ul className="revision-list">
                  {revisions.map((r) => (
                    <li key={r.revision}>
                      <span>
                        Version {r.revision}
                        <small>
                          {new Date(r.updated_at).toLocaleString('en-AU')}
                        </small>
                      </span>
                      <button
                        disabled={busy || blocked}
                        onClick={async () => {
                          setBusy(true);
                          try {
                            const { response, value } = await cloud!.request(
                              `/api/history?revision=${r.revision}`,
                            );
                            if (!response.ok) throw Error(value.error);
                            setPreview({
                              ...(await mergeBackup(
                                data,
                                (value as Remote).data,
                              )),
                              baseData: JSON.stringify(data),
                            });
                          } catch (e) {
                            setMessage(String(e));
                          } finally {
                            setBusy(false);
                          }
                        }}
                      >
                        Review restore
                      </button>
                    </li>
                  ))}
                </ul>
                {revisions.length > 0 && moreHistory && (
                  <button
                    disabled={busy}
                    onClick={() => void loadHistory(true)}
                  >
                    Older versions
                  </button>
                )}
              </section>
            </>
          )}
          {message && (
            <p className="notice" aria-live="polite">
              {message}
            </p>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
