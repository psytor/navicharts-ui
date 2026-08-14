import { useState } from 'react';
import {
  TierBadge, EnergyBadge, CurrencyBadge, OmicronBadge, LstBadge, StatusDot, UnitPortrait,
  derivedEnergyTypes,
} from './Badge';
import { api } from '../api';
import type { Sector, SectorRequirement, Reward } from '../types';

function RequirementRow({ req }: { req: SectorRequirement }) {
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

interface RewardRowProps {
  reward: Reward;
  onChange: () => void;
  // Curated charts are admin-only to edit server-side (see star_charts.py's
  // module docstring) - a non-admin viewing one would 404 on this call, so
  // the checkbox is rendered read-only (disabled, no click handler) instead
  // of letting the click throw an unhandled request error.
  canModify: boolean;
}

export function RewardRow({ reward, onChange, canModify }: RewardRowProps) {
  const [saving, setSaving] = useState(false);

  async function toggle() {
    setSaving(true);
    try {
      await api.completeReward(reward.id, !reward.completed);
      onChange();
    } finally {
      setSaving(false);
    }
  }

  return (
    <label className="reward-checkbox">
      <input
        type="checkbox"
        checked={reward.completed}
        disabled={saving || !canModify}
        onChange={canModify ? toggle : undefined}
      />
      <UnitPortrait unit={reward.unit} />
      <span className="reward-name">
        {reward.name}
        <span className="reward-type"> ({reward.reward_type.replace(/_/g, ' ')})</span>
      </span>
      {reward.unlocked_by && <span className="reward-unlocked-by">unlocked by {reward.unlocked_by}</span>}
    </label>
  );
}

export function SectorCard({ sector, onChange, canModify }: { sector: Sector; onChange: () => void; canModify: boolean }) {
  const [notes, setNotes] = useState(sector.notes || '');
  const [editingNotes, setEditingNotes] = useState(false);
  const [saving, setSaving] = useState(false);

  async function saveNotes() {
    setSaving(true);
    try {
      await api.completeSector(sector.id, { notes });
      setEditingNotes(false);
      onChange();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={`sector-card ${sector.status ? 'sector-complete' : ''}`}>
      <div className="requirements-list">
        {sector.squad_name && <div className="squad-name">{sector.squad_name}</div>}
        {sector.requirements.map((req) => (
          <RequirementRow key={req.id} req={req} />
        ))}
        <div className="sector-status-line">
          <StatusDot met={sector.status} />
          <span>{sector.status ? 'Requirements met' : 'Not yet met'}</span>
        </div>
        {sector.usable_for && <p className="usable-for">{sector.usable_for}</p>}
        {sector.leads_to.length > 0 && (
          <p className="leads-to">→ leads to: {sector.leads_to.join(', ')}</p>
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
          ) : sector.notes ? (
            <p className="notes-text" onClick={() => setEditingNotes(true)}>
              {sector.notes}
            </p>
          ) : (
            <button className="add-note-btn" onClick={() => setEditingNotes(true)}>
              + add note
            </button>
          )}
        </div>
      )}
      {!canModify && sector.notes && <div className="sector-notes"><p className="notes-text">{sector.notes}</p></div>}
    </div>
  );
}
