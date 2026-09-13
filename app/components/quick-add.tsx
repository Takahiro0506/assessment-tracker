'use client';
import { useState } from 'react';
import { Plus } from 'lucide-react';
import { quickAdd } from '../lib/first-step';
import type { Workspace } from '../lib/workspace';

export function QuickAdd({
  data,
  onAdd,
  disabled,
  first,
}: {
  data: Workspace;
  onAdd: (data: Workspace) => boolean;
  disabled: boolean;
  first: boolean;
}) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  return (
    <form
      className={`quick-add ${first ? 'first-assessment' : ''}`}
      onSubmit={(e) => {
        e.preventDefault();
        if (disabled || !name.trim()) return;
        try {
          if (onAdd(quickAdd(data, name))) {
            setName('');
            setError('');
          }
        } catch (e) {
          setError(
            e instanceof Error
              ? e.message
              : 'Could not add this assessment. Your text is still here.',
          );
        }
      }}
    >
      {first && <h2>Add your first assessment</h2>}
      <label htmlFor="quick-assessment">
        {first ? 'Assessment name' : 'Add an assessment'}
      </label>
      <div className="quick-input-row">
        <input
          id="quick-assessment"
          value={name}
          maxLength={200}
          placeholder={first ? 'e.g. SQL exercises' : 'Add an assessment…'}
          autoComplete="off"
          aria-describedby="quick-help"
          onChange={(e) => setName(e.target.value)}
        />
        <button
          className="primary"
          disabled={disabled || !name.trim()}
          aria-label="Add assessment"
        >
          <Plus size={18} />
          <span>Add</span>
        </button>
      </div>
      <p id="quick-help">
        Press Enter to add it. Unit and date can come later.
      </p>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}

export function SavedFeedback() {
  const [visible, setVisible] = useState(true);
  return visible ? (
    <output className="saved-feedback" onAnimationEnd={() => setVisible(false)}>
      Saved
    </output>
  ) : null;
}
