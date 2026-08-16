import { useState } from 'react';
import { Button, Input } from 'astrogators-shared-ui';
import { UnitPicker } from './UnitPicker';
import { CAMPAIGN_ENERGY, ENERGY_STYLES, CURRENCY_LABELS, CURRENCY_SHOPS, LST_TIERS, lstTierTitle } from './Badge';
import type { Unit, Quadrant } from '../types';
import {
  ENERGY_OPTIONS, CURRENCY_OPTIONS, MIN_STARS_FOR_RELIC, emptyRequirement,
  type DraftRequirement, type DraftSystem, type FlatSystemEntry, type FlatWaypointEntry,
} from './quadrantBuilderShared';

// A unit's real farming_locations (pulled from comlink) tell us every real
// energy-type node it's farmable from (for the 4 daily-battle campaigns) -
// the checkbox list below lets the user pick which of those to actually use,
// without ever inventing a location we don't have real data for.
function energyLocationNames(unit: Unit | null): string[] {
  const locs = unit?.farming_locations || [];
  return [...new Set(locs.filter((l) => CAMPAIGN_ENERGY[l.campaign_name]).map((l) => l.campaign_name))];
}

// Real locations that aren't one of the 4 daily-battle campaigns (assault
// battle/raid/legendary/journey/conquest, e.g. Darth Vader's "Assault
// Battle: Military Might") - Energy/Currency checkboxes don't apply to
// these, just show them as read-only info.
function nonEnergyRealLocations(unit: Unit | null) {
  const locs = unit?.farming_locations || [];
  return locs.filter((l) => !CAMPAIGN_ENERGY[l.campaign_name]);
}

function locationHint(unit: Unit | null): string {
  const locs = unit?.farming_locations || [];
  if (locs.length === 0) {
    return 'No farming node found in game data - check shop/shipments manually.';
  }
  const energyNames = energyLocationNames(unit);
  if (energyNames.length > 0) {
    return `Real energy location(s) found: ${energyNames.join(', ')} - check which to farm below.`;
  }
  const names = [...new Set(locs.map((l) => l.campaign_name))];
  return `Real location found: ${names.join(', ')} - not an energy type.`;
}

// A unit's real abilities (pulled from comlink) tell us exactly which ones
// have an Omicron variant (per-ability, computed from real skill-tier data
// at import time). Omicron, not Omega, is the meaningful discretionary pick
// worth flagging as "required for efficiency" - Omega is baseline
// progression almost every Basic/Special/Leader ability needs eventually,
// so it isn't informative here.
function omicronEligibleAbilities(unit: Unit | null) {
  return (unit?.abilities || []).filter((a) => a.needs_omicron);
}

interface RequirementEditorProps {
  req: DraftRequirement;
  units: Unit[];
  onChange: (req: DraftRequirement) => void;
  onRemove: () => void;
}

function RequirementEditor({ req, units, onChange, onRemove }: RequirementEditorProps) {
  function handleUnitChange(u: Unit | null) {
    const isShip = u?.unit_type === 'ship';
    // a new unit's real locations/abilities have nothing to do with the old
    // one's - reset energy to "Any" (null) and clear any omicron ability
    // selection rather than carry stale selections along. Ships have no
    // gear/relic system (only their crew does) and can't use a Lightspeed
    // Token, so clear those too when switching to one - otherwise a stale
    // value would sit in state, hidden from the form but still submitted.
    onChange({
      ...req,
      unit: u,
      energy_type: '',
      energy_locations: null,
      omicron_ability_ids: [],
      ...(isShip ? { gear_tier: '', relic_tier: '', lst_tiers: [] } : {}),
    });
  }

  // null means "Any" (every real energy location checked, the untouched
  // default) - toggling one off from that state means "farm everywhere
  // except this one," not "nothing." Checking every box back on collapses
  // back to null rather than leaving an explicit list that just happens to
  // equal the full set, so "Any" stays representable/round-trips cleanly.
  function toggleEnergyLocation(allNames: string[], name: string) {
    const current = req.energy_locations == null ? allNames : req.energy_locations;
    const has = current.includes(name);
    let energy_locations: string[] | null = has ? current.filter((n) => n !== name) : [...current, name];
    if (energy_locations.length === allNames.length) energy_locations = null;
    onChange({ ...req, energy_locations });
  }

  function toggleCurrency(type: string) {
    const has = req.currency_types.includes(type);
    const currency_types = has
      ? req.currency_types.filter((t) => t !== type)
      : [...req.currency_types, type];
    onChange({ ...req, currency_types });
  }

  function toggleOmicronAbility(skillId: string) {
    const has = req.omicron_ability_ids.includes(skillId);
    const omicron_ability_ids = has
      ? req.omicron_ability_ids.filter((id) => id !== skillId)
      : [...req.omicron_ability_ids, skillId];
    onChange({ ...req, omicron_ability_ids });
  }

  function toggleLstTier(tier: string) {
    const has = req.lst_tiers.includes(tier);
    const lst_tiers = has
      ? req.lst_tiers.filter((t) => t !== tier)
      : [...req.lst_tiers, tier];
    onChange({ ...req, lst_tiers });
  }

  function handleRelicChange(value: string) {
    const relic_tier = value;
    const floor = value ? MIN_STARS_FOR_RELIC[Number(value)] : null;
    // relic tiers have a fixed star floor - auto-raise target_stars to it
    // rather than allow an impossible combination (e.g. Relic 5 at 5 stars)
    const target_stars = floor && (!req.target_stars || Number(req.target_stars) < floor)
      ? String(floor)
      : req.target_stars;
    // Relic tiers also require Gear 13 as a prerequisite - auto-select it
    // rather than leaving the Gear tier dropdown looking unset.
    const gear_tier = value ? '13' : req.gear_tier;
    onChange({ ...req, relic_tier, gear_tier, target_stars });
  }

  function handleStarsChange(value: string) {
    const floor = req.relic_tier ? MIN_STARS_FOR_RELIC[Number(req.relic_tier)] : null;
    const clamped = floor && value && Number(value) < floor ? String(floor) : value;
    onChange({ ...req, target_stars: clamped });
  }

  const energyNames = energyLocationNames(req.unit);
  const nonEnergyLocs = nonEnergyRealLocations(req.unit);
  // Ships have no gear/relic system of their own (only their crew does) and
  // can't use a Lightspeed Token - stars are their actual progression
  // target, "level" isn't a trackable per-requirement setting (it's just
  // expected to be maxed), so those controls are hidden rather than shown
  // and silently meaningless.
  const isShip = req.unit?.unit_type === 'ship';

  return (
    <div className="req-editor">
      <div className="req-editor-unit">
        <UnitPicker units={units} value={req.unit} onChange={handleUnitChange} />
        {req.unit && <span className="req-location-hint">{locationHint(req.unit)}</span>}
      </div>
      {req.unit && (
        <>
          {!isShip && (
            <select
              value={req.gear_tier}
              disabled={!!req.relic_tier}
              title={req.relic_tier ? 'Implied by the relic tier (relics require Gear 13)' : undefined}
              onChange={(e) => onChange({ ...req, gear_tier: e.target.value, relic_tier: '' })}
            >
              <option value="">Gear tier</option>
              {Array.from({ length: 13 }, (_, i) => i + 1).map((g) => (
                <option key={g} value={g}>G{g}</option>
              ))}
            </select>
          )}
          {!isShip && (
            <select value={req.relic_tier} onChange={(e) => handleRelicChange(e.target.value)}>
              <option value="">Relic tier</option>
              {Array.from({ length: 10 }, (_, i) => i + 1).map((r) => (
                <option key={r} value={r}>R{r}</option>
              ))}
            </select>
          )}
          <select
            value={req.target_stars}
            title={req.relic_tier ? `Relic ${req.relic_tier} needs at least ${MIN_STARS_FOR_RELIC[Number(req.relic_tier)]}★` : undefined}
            onChange={(e) => handleStarsChange(e.target.value)}
          >
            <option value="">Stars</option>
            {Array.from({ length: 7 }, (_, i) => i + 1)
              .filter((s) => !req.relic_tier || s >= MIN_STARS_FOR_RELIC[Number(req.relic_tier)])
              .map((s) => (
                <option key={s} value={s}>{s}★</option>
              ))}
          </select>
          {energyNames.length > 0 ? (
            <div className="checklist energy-checklist">
              <span className="checklist-label">Energy:</span>
              {energyNames.map((name) => (
                <label key={name} className="checklist-option" title="Check to farm here, uncheck to skip">
                  <input
                    type="checkbox"
                    checked={req.energy_locations == null || req.energy_locations.includes(name)}
                    onChange={() => toggleEnergyLocation(energyNames, name)}
                  />
                  {name} ({ENERGY_STYLES[CAMPAIGN_ENERGY[name]]?.label || CAMPAIGN_ENERGY[name]})
                </label>
              ))}
            </div>
          ) : nonEnergyLocs.length > 0 ? (
            <span className="badge badge-energy-readonly" title="Real location, not farmable via Energy">
              {[...new Set(nonEnergyLocs.map((l) => l.campaign_name))].join(', ')}
            </span>
          ) : (
            // manual fallback only when the unit has zero real detected
            // locations at all - for ships this is almost always a
            // shop/currency-only unit (real Fleet Battle nodes are already
            // caught above), so Currency below covers it instead
            !isShip && (
              <select value={req.energy_type} onChange={(e) => onChange({ ...req, energy_type: e.target.value })}>
                <option value="">Energy</option>
                {ENERGY_OPTIONS.filter(Boolean).map((e) => (
                  <option key={e} value={e}>{e}</option>
                ))}
              </select>
            )
          )}
          {omicronEligibleAbilities(req.unit).length > 0 && (
            <div className="checklist omicron-checklist">
              <span className="checklist-label">Omicron Required for Efficiency:</span>
              {omicronEligibleAbilities(req.unit).map((ability) => (
                <label key={ability.skill_id} className="checklist-option">
                  <input
                    type="checkbox"
                    checked={req.omicron_ability_ids.includes(ability.skill_id)}
                    onChange={() => toggleOmicronAbility(ability.skill_id)}
                  />
                  {ability.name}
                </label>
              ))}
            </div>
          )}
          <div className="checklist currency-checklist">
            <span className="checklist-label">Currency:</span>
            {CURRENCY_OPTIONS.map((type) => (
              <label key={type} className="checklist-option" title={CURRENCY_SHOPS[type]}>
                <input
                  type="checkbox"
                  checked={req.currency_types.includes(type)}
                  onChange={() => toggleCurrency(type)}
                />
                {CURRENCY_LABELS[type]}
              </label>
            ))}
          </div>
          {!isShip && (
            <div className="checklist lst-checklist" title="Optional shortcut, not a requirement">
              <span className="checklist-label">Consider LST:</span>
              {LST_TIERS.map((tier) => (
                <label key={tier} className="checklist-option checklist-option-lst" title={lstTierTitle(tier)}>
                  <input
                    type="checkbox"
                    checked={req.lst_tiers.includes(tier)}
                    onChange={() => toggleLstTier(tier)}
                  />
                  {tier}
                </label>
              ))}
            </div>
          )}
        </>
      )}
      <button type="button" className="req-remove" onClick={onRemove}>×</button>
    </div>
  );
}

interface SystemEditorProps {
  system: DraftSystem;
  allSystems: FlatSystemEntry[];
  allWaypoints: FlatWaypointEntry[];
  otherQuadrants: Quadrant[];
  units: Unit[];
  onChange: (system: DraftSystem) => void;
  onRemove: () => void;
  onMove: (direction: number) => void;
  isFirst: boolean;
  isLast: boolean;
}

export function SystemEditor({ system, allSystems, allWaypoints, otherQuadrants, units, onChange, onRemove, onMove, isFirst, isLast }: SystemEditorProps) {
  const [expandedDownstreamQuadrantIds, setExpandedDownstreamQuadrantIds] = useState<number[]>([]);
  const [expandedUnlockQuadrantIds, setExpandedUnlockQuadrantIds] = useState<number[]>([]);

  function updateReq(i: number, patch: DraftRequirement) {
    const requirements = system.requirements.map((r, idx) => (idx === i ? patch : r));
    onChange({ ...system, requirements });
  }
  function removeReq(i: number) {
    onChange({ ...system, requirements: system.requirements.filter((_, idx) => idx !== i) });
  }
  function toggleDownstream(targetKey: string | number) {
    const has = system.downstream_keys.includes(targetKey);
    const downstream_keys = has
      ? system.downstream_keys.filter((k) => k !== targetKey)
      : [...system.downstream_keys, targetKey];
    onChange({ ...system, downstream_keys });
  }
  function toggleDownstreamSystemId(targetId: number) {
    const has = system.downstream_system_ids.includes(targetId);
    const downstream_system_ids = has
      ? system.downstream_system_ids.filter((id) => id !== targetId)
      : [...system.downstream_system_ids, targetId];
    onChange({ ...system, downstream_system_ids });
  }
  function toggleUnlock(targetKey: string | number) {
    const has = system.unlock_keys.includes(targetKey);
    const unlock_keys = has
      ? system.unlock_keys.filter((k) => k !== targetKey)
      : [...system.unlock_keys, targetKey];
    onChange({ ...system, unlock_keys });
  }
  function toggleUnlockWaypointId(targetId: number) {
    const has = system.unlock_waypoint_ids.includes(targetId);
    const unlock_waypoint_ids = has
      ? system.unlock_waypoint_ids.filter((id) => id !== targetId)
      : [...system.unlock_waypoint_ids, targetId];
    onChange({ ...system, unlock_waypoint_ids });
  }

  const otherSystems = allSystems.filter((entry) => entry.system._key !== system._key);

  return (
    <div className="sector-editor">
      <div className="sector-editor-header">
        <span className="sector-editor-title">System</span>
        <div className="sector-editor-controls">
          <button type="button" onClick={() => onMove(-1)} disabled={isFirst}>↑</button>
          <button type="button" onClick={() => onMove(1)} disabled={isLast}>↓</button>
          <button type="button" onClick={onRemove}>Remove system</button>
        </div>
      </div>

      <Input
        type="text"
        placeholder="Squad name (optional, e.g. Imperial Troopers)"
        value={system.name}
        onChange={(e) => onChange({ ...system, name: e.target.value })}
        fullWidth
      />
      <Input
        type="text"
        placeholder="Usable for (optional, e.g. clears Forest Moon Assault Battle)"
        value={system.usable_for}
        onChange={(e) => onChange({ ...system, usable_for: e.target.value })}
        fullWidth
      />
      {system.requirements.map((req, i) => (
        <RequirementEditor
          key={i}
          req={req}
          units={units}
          onChange={(patch) => updateReq(i, patch)}
          onRemove={() => removeReq(i)}
        />
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="sector-add-btn"
        onClick={() => onChange({ ...system, requirements: [...system.requirements, emptyRequirement()] })}
      >
        + add unit
      </Button>

      <textarea
        placeholder="Notes (optional)"
        value={system.notes}
        onChange={(e) => onChange({ ...system, notes: e.target.value })}
        rows={2}
      />

      {(otherSystems.length > 0 || otherQuadrants?.length > 0) && (
        <div className="downstream-picker">
          <span className="downstream-label">Feeds into:</span>
          {otherSystems.map((entry) => (
            <label key={entry.system._key} className="downstream-option">
              <input
                type="checkbox"
                checked={system.downstream_keys.includes(entry.system._key)}
                onChange={() => toggleDownstream(entry.system._key)}
              />
              Sector {entry.sectorIndex + 1} ({entry.system.name || 'system'})
            </label>
          ))}
          {otherQuadrants?.map((q) => (
            <div key={q.id} className="downstream-quadrant-group">
              <button
                type="button"
                className="downstream-quadrant-toggle"
                onClick={() => setExpandedDownstreamQuadrantIds((ids) => ids.includes(q.id) ? ids.filter((id) => id !== q.id) : [...ids, q.id])}
              >
                {expandedDownstreamQuadrantIds.includes(q.id) ? '▾' : '▸'} {q.name}
              </button>
              {expandedDownstreamQuadrantIds.includes(q.id) &&
                q.sectors.flatMap((s) => s.systems).map((sy) => (
                  <label key={sy.id} className="downstream-option downstream-option-cross">
                    <input
                      type="checkbox"
                      checked={system.downstream_system_ids.includes(sy.id)}
                      onChange={() => toggleDownstreamSystemId(sy.id)}
                    />
                    {sy.name || 'system'}
                  </label>
                ))}
            </div>
          ))}
        </div>
      )}

      {(allWaypoints.length > 0 || otherQuadrants?.length > 0) && (
        <div className="downstream-picker">
          <span className="downstream-label">Unlocks:</span>
          {allWaypoints.map((entry) => (
            <label key={entry.waypoint._key} className="downstream-option">
              <input
                type="checkbox"
                checked={system.unlock_keys.includes(entry.waypoint._key)}
                onChange={() => toggleUnlock(entry.waypoint._key)}
              />
              Sector {entry.sectorIndex + 1} ({entry.waypoint.name || 'waypoint'})
            </label>
          ))}
          {otherQuadrants?.map((q) => (
            <div key={q.id} className="downstream-quadrant-group">
              <button
                type="button"
                className="downstream-quadrant-toggle"
                onClick={() => setExpandedUnlockQuadrantIds((ids) => ids.includes(q.id) ? ids.filter((id) => id !== q.id) : [...ids, q.id])}
              >
                {expandedUnlockQuadrantIds.includes(q.id) ? '▾' : '▸'} {q.name}
              </button>
              {expandedUnlockQuadrantIds.includes(q.id) &&
                q.sectors.flatMap((s) => s.waypoints).map((w) => (
                  <label key={w.id} className="downstream-option downstream-option-cross">
                    <input
                      type="checkbox"
                      checked={system.unlock_waypoint_ids.includes(w.id)}
                      onChange={() => toggleUnlockWaypointId(w.id)}
                    />
                    {w.name}
                  </label>
                ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
