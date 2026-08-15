import { useMemo, useState } from 'react';
import { retryableImgOnError } from './Badge';
import type { Unit } from '../types';

interface UnitPickerProps {
  units: Unit[];
  value: Unit | null;
  onChange: (unit: Unit | null) => void;
}

export function UnitPicker({ units, value, onChange }: UnitPickerProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

  const matches = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return units.filter((u) => u.name.toLowerCase().includes(q)).slice(0, 8);
  }, [query, units]);

  if (value) {
    return (
      <div className="unit-picker-selected">
        <img
          className="unit-picker-thumb"
          src={value.thumbnail_url ?? undefined}
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
        placeholder="Search unit by name..."
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
          {matches.map((u) => (
            <li
              key={u.id}
              onMouseDown={() => {
                onChange(u);
                setQuery('');
                setOpen(false);
              }}
            >
              <img
                src={u.thumbnail_url ?? undefined}
                alt=""
                onError={retryableImgOnError()}
              />
              <span>{u.name}</span>
              <span className="unit-picker-type">{u.unit_type}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
