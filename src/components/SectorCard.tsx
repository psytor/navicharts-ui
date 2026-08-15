import { useState } from 'react';
import {
  TierBadge, EnergyBadge, CurrencyBadge, OmicronBadge, LstBadge, StatusDot, UnitPortrait,
  derivedEnergyTypes, UNIT_REWARD_TYPES,
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

// No manual toggle for any reward type - unit-shaped rewards
// (character_unlock/ship_unlock/capital_ship) show a read-only dot derived
// server-side from the roster snapshot; assault_battle/feature_unlock
// rewards have no completion signal at all and just display plainly.
export function RewardRow({ reward }: { reward: Reward }) {
  const isUnitReward = UNIT_REWARD_TYPES.has(reward.reward_type);
  return (
    <div className="reward-checkbox">
      {isUnitReward && <StatusDot met={reward.completed} />}
      <UnitPortrait unit={reward.unit} />
      <span className="reward-name">
        {reward.name}
        <span className="reward-type"> ({reward.reward_type.replace(/_/g, ' ')})</span>
      </span>
      {reward.unlocked_by && <span className="reward-unlocked-by">unlocked by {reward.unlocked_by}</span>}
    </div>
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
