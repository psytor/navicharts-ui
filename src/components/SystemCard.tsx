import { useState } from 'react';
import { Card } from 'astrogators-shared-ui';
import {
  TierBadge, EnergyBadge, CurrencyBadge, OmicronBadge, LstBadge, StatusDot, UnitPortrait,
  derivedEnergyTypes, UNIT_WAYPOINT_TYPES,
} from './Badge';
import { api } from '../api';
import type { System, SystemRequirement, Waypoint } from '../types';

function RequirementRow({ req }: { req: SystemRequirement }) {
  return (
    <div className="requirement-row">
      <StatusDot met={req.met} />
      <UnitPortrait unit={req.unit} />
      <span className="unit-name">{req.unit.name}</span>
      <TierBadge gearTier={req.gear_tier} relicTier={req.relic_tier} />
      <EnergyBadge energyTypes={derivedEnergyTypes(req)} />
      <CurrencyBadge currencyTypes={req.currency_types} />
      <OmicronBadge unit={req.unit} omicronAbilityIds={req.omicron_ability_ids} />
      <LstBadge lstTiers={req.lst_tiers} />
    </div>
  );
}

// No manual toggle for any waypoint type - unit-shaped waypoints
// (character_unlock/ship_unlock/capital_ship) show a read-only dot derived
// server-side from the roster snapshot; assault_battle/feature_unlock
// waypoints have no completion signal at all and just display plainly.
export function WaypointRow({ waypoint }: { waypoint: Waypoint }) {
  const isUnitWaypoint = UNIT_WAYPOINT_TYPES.has(waypoint.waypoint_type);
  return (
    <div className="reward-checkbox">
      {isUnitWaypoint && <StatusDot met={waypoint.completed} />}
      <UnitPortrait unit={waypoint.unit} />
      <span className="reward-name">
        {waypoint.name}
        <span className="reward-type"> ({waypoint.waypoint_type.replace(/_/g, ' ')})</span>
      </span>
      {waypoint.unlocked_by.length > 0 && (
        <span className="reward-unlocked-by">
          unlocked by {waypoint.unlocked_by.map((s) => s.name || 'squad').join(', ')}
        </span>
      )}
    </div>
  );
}

export function SystemCard({ system, onChange, canModify }: { system: System; onChange: () => void; canModify: boolean }) {
  const [notes, setNotes] = useState(system.notes || '');
  const [editingNotes, setEditingNotes] = useState(false);
  const [saving, setSaving] = useState(false);

  async function saveNotes() {
    setSaving(true);
    try {
      await api.completeSystem(system.id, { notes });
      setEditingNotes(false);
      onChange();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card
      chamfered
      chamferSize="sm"
      padding="md"
      showDiagonalBorders={system.status}
      edgeColor={system.status ? 'var(--color-success)' : 'transparent'}
      className={`sector-card ${system.status ? 'sector-complete' : ''}`}
    >
      <div className="requirements-list">
        {system.name && <div className="squad-name">{system.name}</div>}
        {system.requirements.map((req) => (
          <RequirementRow key={req.id} req={req} />
        ))}
        <div className="sector-status-line">
          <StatusDot met={system.status} />
          <span>{system.status ? 'Requirements met' : 'Not yet met'}</span>
        </div>
        {system.usable_for && <p className="usable-for">{system.usable_for}</p>}
        {system.unlocks.length > 0 && (
          <p className="leads-to">→ unlocks: {system.unlocks.map((w) => w.name).join(', ')}</p>
        )}
      </div>

      {canModify && (
        <div className="sector-notes">
          {editingNotes ? (
            <div className="notes-edit">
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                autoFocus
              />
              <div className="notes-actions">
                <button onClick={saveNotes} disabled={saving}>Save</button>
                <button onClick={() => setEditingNotes(false)} disabled={saving}>Cancel</button>
              </div>
            </div>
          ) : system.notes ? (
            <p className="notes-text" onClick={() => setEditingNotes(true)}>
              {system.notes}
            </p>
          ) : (
            <button className="add-note-btn" onClick={() => setEditingNotes(true)}>
              + add note
            </button>
          )}
        </div>
      )}
      {!canModify && system.notes && <div className="sector-notes"><p className="notes-text">{system.notes}</p></div>}
    </Card>
  );
}
