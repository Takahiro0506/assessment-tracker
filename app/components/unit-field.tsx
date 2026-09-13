'use client';
import { useId, useState } from 'react';

export function UnitField({
  units,
  disabled,
  onChange,
}: {
  units: string[];
  disabled: boolean;
  onChange: (name: string) => boolean;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  if (!open)
    return (
      <button
        className="card-add-field"
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        + Unit
      </button>
    );
  return (
    <form
      className="inline-unit"
      onSubmit={(event) => {
        event.preventDefault();
        if (!disabled && name.trim() && onChange(name.trim())) setOpen(false);
      }}
    >
      <label htmlFor={id}>Unit (optional)</label>
      <input
        id={id}
        list={`${id}-options`}
        value={name}
        maxLength={200}
        placeholder="e.g. Database"
        onChange={(event) => setName(event.target.value)}
      />
      <datalist id={`${id}-options`}>
        {units.map((unit) => (
          <option key={unit} value={unit}>
            {unit}
          </option>
        ))}
      </datalist>
      <button disabled={disabled || !name.trim()}>Add unit</button>
      <button type="button" onClick={() => setOpen(false)}>
        Cancel
      </button>
    </form>
  );
}
