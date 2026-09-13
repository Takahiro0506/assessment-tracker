import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus } from 'lucide-react';
export function AddForm({
  btnDisabled,
  nameInput,
  recent,
  onAdd,
}: {
  btnDisabled: boolean;
  nameInput: React.RefObject<HTMLInputElement | null>;
  recent: string[];
  onAdd: (unit: string, name: string, due: string | null) => boolean;
}) {
  const [unit, setUnit] = useState('');
  const [name, setName] = useState('');
  const [due, setDue] = useState('');
  function add(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    if (onAdd(unit, name, due || null)) {
      setName('');
      setDue('');
      nameInput.current?.focus();
    }
  }
  return (
    <form className="add-row" onSubmit={add}>
      <label htmlFor="add-unit">
        <span>Unit</span>
        <Input
          id="add-unit"
          aria-label="Unit name"
          placeholder="Enter or choose a unit"
          list="units"
          value={unit}
          onChange={(e) => setUnit(e.target.value)}
          required
          maxLength={200}
          disabled={btnDisabled}
        />
      </label>
      <label htmlFor="add-name">
        <span>Assessment</span>
        <Input
          ref={nameInput}
          id="add-name"
          aria-label="Assessment name"
          placeholder="Assessment name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          maxLength={200}
          disabled={btnDisabled}
        />
      </label>
      <label htmlFor="add-due">
        <span>
          Due date <em>optional</em>
        </span>
        <Input
          id="add-due"
          aria-label="Due date"
          type="date"
          value={due}
          onChange={(e) => setDue(e.target.value)}
          min="0001-01-01"
          max="9999-12-31"
          disabled={btnDisabled}
        />
      </label>
      <Button type="submit" disabled={btnDisabled}>
        <Plus />
        Add assessment
      </Button>
      <div className="recent-units" aria-label="Recently used units">
        {recent.map((u) => (
          <Button
            key={u}
            type="button"
            variant="outline"
            disabled={btnDisabled}
            aria-pressed={unit === u}
            onClick={() => {
              setUnit(u);
              nameInput.current?.focus();
            }}
          >
            {u}
          </Button>
        ))}
      </div>
      <p className="add-hint">Keep adding — your unit stays selected.</p>
    </form>
  );
}
