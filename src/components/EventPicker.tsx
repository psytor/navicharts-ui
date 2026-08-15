import { useMemo, useState } from 'react';
import { retryableImgOnError } from './Badge';
import type { GameEvent } from '../types';

interface EventPickerProps {
  events: GameEvent[];
  value: GameEvent | null;
  onChange: (event: GameEvent | null) => void;
}

export function EventPicker({ events, value, onChange }: EventPickerProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pool = q ? events.filter((e) => e.name.toLowerCase().includes(q)) : events;
    return pool.slice(0, 8);
  }, [query, events]);

  if (value) {
    return (
      <div className="unit-picker-selected">
        <img
          className="unit-picker-thumb"
          src={value.image_url ?? undefined}
          alt=""
          onError={retryableImgOnError()}
        />
        <span>{value.name}</span>
        <button type="button" className="unit-picker-clear" onClick={() => onChange(null)}>
          change
        </button>
      </div>
    );
  }

  return (
    <div className="unit-picker">
      <input
        type="text"
        placeholder="Search Assault Battle by name..."
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && matches.length > 0 && (
        <ul className="unit-picker-dropdown">
          {matches.map((e) => (
            <li
              key={e.id}
              onMouseDown={() => {
                onChange(e);
                setQuery('');
                setOpen(false);
              }}
            >
              <img
                src={e.image_url ?? undefined}
                alt=""
                onError={retryableImgOnError()}
              />
              <span>{e.name}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
