'use client';
import { useState } from 'react';
import { DayPicker } from 'react-day-picker';
import { CalendarDays } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { formatDate, formatDateLong, parseDateInput } from '@/lib/assessments';
let calendarMonth: Date | undefined;
export function DateField({
  value,
  onChange,
  label = 'Due date (optional)',
  emptyLabel = 'Set date',
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  label?: string;
  emptyLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [month, setMonth] = useState<Date>(new Date());
  function launch() {
    setText(value ?? '');
    setError('');
    setMonth(
      value ? new Date(value + 'T12:00:00') : (calendarMonth ?? new Date()),
    );
    setOpen(true);
  }
  function save() {
    const parsed = parseDateInput(text);
    if (text.trim() && !parsed) {
      setError('Enter a real date, for example 16 October 2026 or 2026-10-16.');
      return;
    }
    onChange(parsed);
    calendarMonth = month;
    setOpen(false);
  }
  return (
    <>
      <button
        type="button"
        className={`date-button ${value ? 'has-date' : ''}`}
        aria-label={`${label}: ${value ? formatDate(value) : 'No date yet'}`}
        onClick={launch}
      >
        <CalendarDays size={18} />
        {value ? formatDate(value) : emptyLabel}
        {!value && <span className="muted"> · optional</span>}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="date-dialog">
          <DialogTitle>When is it due?</DialogTitle>
          <DialogDescription>
            Choose a date or type it below. You can leave it unset.
          </DialogDescription>
          <label>
            {label}
            <input
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setError('');
              }}
              placeholder="16 October 2026"
              inputMode="text"
              autoComplete="off"
              aria-invalid={!!error}
            />
          </label>
          {error && (
            <p role="alert" className="error-text">
              {error}
            </p>
          )}
          <DayPicker
            mode="single"
            month={month}
            onMonthChange={setMonth}
            selected={
              parseDateInput(text)
                ? new Date(parseDateInput(text)! + 'T12:00:00')
                : undefined
            }
            onSelect={(day) => {
              if (day)
                setText(
                  `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`,
                );
            }}
            weekStartsOn={1}
            showOutsideDays
          />
          <p className="date-readback">
            {parseDateInput(text)
              ? formatDateLong(parseDateInput(text))
              : 'No date yet'}
          </p>
          <button className="primary" onClick={save}>
            Use this date
          </button>
          <button
            onClick={() => {
              onChange(null);
              calendarMonth = month;
              setOpen(false);
            }}
          >
            Leave date unset
          </button>
        </DialogContent>
      </Dialog>
    </>
  );
}
