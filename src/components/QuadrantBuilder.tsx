import { useEffect, useState } from 'react';
import { api } from '../api';
import { UnitPicker } from './UnitPicker';
import { EventPicker } from './EventPicker';
import {
  CAMPAIGN_ENERGY, ENERGY_STYLES, CURRENCY_LABELS, CURRENCY_SHOPS, LST_TIERS, lstTierTitle,
} from './Badge';
import type { Unit, GameEvent, Quadrant, QuadrantIn, SectorIn, UnitRequirementIn, RewardIn } from '../types';

const QUADRANT_COLORS = ['purple', 'cyan', 'gold', 'green', 'red', 'blue', 'orange', 'pink', 'teal'];
const ENERGY_OPTIONS = ['', 'normal', 'cantina', 'ship'];
const CURRENCY_OPTIONS = [
  'episode_shipment', 'era_shipment', 'cantina_shop', 'squad_arena', 'galactic_war',
  'fleet_arena', 'championship', 'shard_shop', 'conquest', 'legend',
  'raid_mk1', 'raid_mk2', 'raid_mk3', 'guild_tokens',
  'guild_event_mk1', 'guild_event_mk2', 'guild_event_mk3',
];
const REWARD_TYPES = ['character_unlock', 'ship_unlock', 'assault_battle', 'capital_ship', 'feature_unlock'];
// these reward types are always a real, already-catalogued unit (e.g. a
// character_unlock reward is a character) - picked via UnitPicker instead of
// free-typed, same as SectorRequirement, so the reward links to the shared
// catalog and gets a real portrait.
const UNIT_LINKED_REWARD_TYPES = new Set(['character_unlock', 'ship_unlock', 'capital_ship']);
// same idea, but for the real-world SWGOH event catalog instead of the Unit
// catalog - picked via EventPicker so the reward's name and banner art come
// from the resolved real event instead of a hand-typed guess.
const EVENT_LINKED_REWARD_TYPES = new Set(['assault_battle']);

// Relic tiers have a fixed star prerequisite (confirmed by the user, changed
// twice already as the game rebalanced this - see game_rules.py for the
// source and don't assume this stays current forever).
const MIN_STARS_FOR_RELIC: Record<number, number> = {
  1: 4, 2: 4,
  3: 5, 4: 5,
  5: 6,
  6: 7, 7: 7, 8: 7, 9: 7, 10: 7,
};

// Draft (in-progress form) shapes - string-typed numeric fields (select/input
// values are always strings) rather than the wire UnitRequirementIn's real
// number|null, only converted to numbers on submit.
interface DraftRequirement {
  unit: Unit | null;
  gear_tier: string;
  relic_tier: string;
  target_stars: string;
  energy_type: string;
  currency_types: string[];
  energy_locations: string[] | null;
  lst_tiers: string[];
  omicron_ability_ids: string[];
}

interface DraftReward {
  name: string;
  reward_type: string;
  unit: Unit | null;
  event: GameEvent | null;
}

interface DraftSector {
  _key: string | number;
  sector_type: string;
  notes: string;
  squad_name: string;
  usable_for: string;
  requirements: DraftRequirement[];
  rewards: DraftReward[];
  downstream_keys: (string | number)[];
  downstream_sector_ids: number[];
}

function emptyRequirement(): DraftRequirement {
  return {
    unit: null, gear_tier: '', relic_tier: '', target_stars: '',
    // energy_locations: null = "Any" (untouched default)
    energy_type: '', currency_types: [], energy_locations: null, lst_tiers: [],
    omicron_ability_ids: [],
  };
}

function emptyReward(): DraftReward {
  return { name: '', reward_type: 'assault_battle', unit: null, event: null };
}

// Sectors get reordered a lot while editing (↑/↓), and array position isn't a
// safe way to remember "which sector feeds into which" across that - swapping
// two sectors' positions doesn't move a THIRD sector's reference along with it,
// it silently starts pointing at whatever now sits at that position. `_key`
// is a stable per-sector identity that travels with the sector object through
// any reorder; `downstream_keys` references other sectors by that identity
// instead of by position. Real (already-saved) sectors use their backend id as
// `_key` (already stable/unique); new unsaved sectors get a synthetic one.
let newSectorKeyCounter = 0;
function nextNewSectorKey(): string {
  return `new-${newSectorKeyCounter++}`;
}

function emptySector(): DraftSector {
  return {
    _key: nextNewSectorKey(),
    sector_type: 'squad',
    notes: '',
    squad_name: '',
    usable_for: '',
    requirements: [emptyRequirement()],
    rewards: [],
    downstream_keys: [],
    downstream_sector_ids: [],
  };
}

function sectorLabel(s: DraftSector): string {
  return s.squad_name || 'squad';
}

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

interface SectorEditorProps {
  sector: DraftSector;
  sectorIndex: number;
  allSectors: DraftSector[];
  otherQuadrants: Quadrant[];
  units: Unit[];
  events: GameEvent[];
  onChange: (sector: DraftSector) => void;
  onRemove: () => void;
  onMove: (direction: number) => void;
  isFirst: boolean;
  isLast: boolean;
}

function SectorEditor({ sector, sectorIndex, allSectors, otherQuadrants, units, events, onChange, onRemove, onMove, isFirst, isLast }: SectorEditorProps) {
  const [expandedQuadrantIds, setExpandedQuadrantIds] = useState<number[]>([]);

  function updateReq(i: number, patch: DraftRequirement) {
    const requirements = sector.requirements.map((r, idx) => (idx === i ? patch : r));
    onChange({ ...sector, requirements });
  }
  function removeReq(i: number) {
    onChange({ ...sector, requirements: sector.requirements.filter((_, idx) => idx !== i) });
  }
  function updateReward(i: number, patch: DraftReward) {
    const rewards = sector.rewards.map((r, idx) => (idx === i ? patch : r));
    onChange({ ...sector, rewards });
  }
  function removeReward(i: number) {
    onChange({ ...sector, rewards: sector.rewards.filter((_, idx) => idx !== i) });
  }
  function toggleDownstream(targetKey: string | number) {
    const has = sector.downstream_keys.includes(targetKey);
    const downstream_keys = has
      ? sector.downstream_keys.filter((k) => k !== targetKey)
      : [...sector.downstream_keys, targetKey];
    onChange({ ...sector, downstream_keys });
  }
  function toggleDownstreamSectorId(targetSectorId: number) {
    const has = sector.downstream_sector_ids.includes(targetSectorId);
    const downstream_sector_ids = has
      ? sector.downstream_sector_ids.filter((id) => id !== targetSectorId)
      : [...sector.downstream_sector_ids, targetSectorId];
    onChange({ ...sector, downstream_sector_ids });
  }
  function toggleQuadrantExpanded(quadrantId: number) {
    setExpandedQuadrantIds((ids) =>
      ids.includes(quadrantId) ? ids.filter((id) => id !== quadrantId) : [...ids, quadrantId]
    );
  }

  return (
    <div className="sector-editor">
      <div className="sector-editor-header">
        <span className="sector-editor-title">Sector {sectorIndex + 1}</span>
        <div className="sector-editor-controls">
          <button type="button" onClick={() => onMove(-1)} disabled={isFirst}>↑</button>
          <button type="button" onClick={() => onMove(1)} disabled={isLast}>↓</button>
          <button type="button" onClick={onRemove}>Remove sector</button>
        </div>
      </div>

      <input
        type="text"
        placeholder="Squad name (optional, e.g. Imperial Troopers)"
        value={sector.squad_name}
        onChange={(e) => onChange({ ...sector, squad_name: e.target.value })}
      />
      <input
        type="text"
        placeholder="Usable for (optional, e.g. clears Forest Moon Assault Battle)"
        value={sector.usable_for}
        onChange={(e) => onChange({ ...sector, usable_for: e.target.value })}
      />
      {sector.requirements.map((req, i) => (
        <RequirementEditor
          key={i}
          req={req}
          units={units}
          onChange={(patch) => updateReq(i, patch)}
          onRemove={() => removeReq(i)}
        />
      ))}
      <button
        type="button"
        className="sector-add-btn"
        onClick={() => onChange({ ...sector, requirements: [...sector.requirements, emptyRequirement()] })}
      >
        + add unit
      </button>

      <div className="unlocks-editor">
        <span className="unlocks-label">Unlocks:</span>
        {sector.rewards.map((rw, i) => (
          <div className="reward-editor" key={i}>
            {UNIT_LINKED_REWARD_TYPES.has(rw.reward_type) ? (
              <UnitPicker
                units={units}
                value={rw.unit}
                onChange={(unit) => updateReward(i, { ...rw, unit, name: unit?.name || '' })}
              />
            ) : EVENT_LINKED_REWARD_TYPES.has(rw.reward_type) ? (
              <EventPicker
                events={events}
                value={rw.event}
                onChange={(event) => updateReward(i, { ...rw, event, name: event?.name || '' })}
              />
            ) : (
              <input
                type="text"
                placeholder="Reward name (e.g. Forest Moon)"
                value={rw.name}
                onChange={(e) => updateReward(i, { ...rw, name: e.target.value })}
              />
            )}
            <select
              value={rw.reward_type}
              onChange={(e) => updateReward(i, { name: '', reward_type: e.target.value, unit: null, event: null })}
            >
              {REWARD_TYPES.map((t) => (
                <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
              ))}
            </select>
            <button type="button" className="req-remove" onClick={() => removeReward(i)}>×</button>
          </div>
        ))}
        <button
          type="button"
          className="sector-add-btn"
          onClick={() => onChange({ ...sector, rewards: [...sector.rewards, emptyReward()] })}
        >
          + add reward
        </button>
      </div>

      <textarea
        placeholder="Notes (optional)"
        value={sector.notes}
        onChange={(e) => onChange({ ...sector, notes: e.target.value })}
        rows={2}
      />

      {(allSectors.length > 1 || otherQuadrants?.length > 0) && (
        <div className="downstream-picker">
          <span className="downstream-label">Feeds into:</span>
          {allSectors.map((s, i) =>
            i === sectorIndex ? null : (
              <label key={s._key} className="downstream-option">
                <input
                  type="checkbox"
                  checked={sector.downstream_keys.includes(s._key)}
                  onChange={() => toggleDownstream(s._key)}
                />
                Sector {i + 1} ({sectorLabel(s)})
              </label>
            )
          )}
          {otherQuadrants?.map((q) => (
            <div key={q.id} className="downstream-quadrant-group">
              <button
                type="button"
                className="downstream-quadrant-toggle"
                onClick={() => toggleQuadrantExpanded(q.id)}
              >
                {expandedQuadrantIds.includes(q.id) ? '▾' : '▸'} {q.name}
              </button>
              {expandedQuadrantIds.includes(q.id) &&
                q.sectors.map((s) => (
                  <label key={s.id} className="downstream-option downstream-option-cross">
                    <input
                      type="checkbox"
                      checked={sector.downstream_sector_ids.includes(s.id)}
                      onChange={() => toggleDownstreamSectorId(s.id)}
                    />
                    {s.squad_name || 'squad'}
                  </label>
                ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function quadrantToFormState(quadrant: Quadrant): { name: string; color: string; sectors: DraftSector[] } {
  const sectorIds = new Set(quadrant.sectors.map((s) => s.id));
  return {
    name: quadrant.name,
    color: quadrant.color || QUADRANT_COLORS[0],
    sectors: quadrant.sectors.map((s) => ({
      // an already-saved sector's own backend id doubles as its stable `_key` -
      // it's already unique and, unlike array position, unaffected by reordering.
      _key: s.id,
      sector_type: s.sector_type,
      notes: s.notes || '',
      squad_name: s.squad_name || '',
      usable_for: s.usable_for || '',
      requirements: s.requirements.map((r) => ({
        unit: r.unit,
        gear_tier: r.gear_tier != null ? String(r.gear_tier) : '',
        relic_tier: r.relic_tier != null ? String(r.relic_tier) : '',
        target_stars: r.target_stars != null ? String(r.target_stars) : '',
        energy_type: r.energy_type ?? '',
        currency_types: r.currency_types || [],
        // null must stay null ("Any") here - `|| []` would wrongly collapse
        // it into "explicitly none"
        energy_locations: r.energy_locations ?? null,
        lst_tiers: r.lst_tiers || [],
        omicron_ability_ids: r.omicron_ability_ids || [],
      })),
      rewards: s.rewards.map((rw) => ({
        name: rw.name, reward_type: rw.reward_type, unit: rw.unit || null, event: rw.event || null,
      })),
      // same-quadrant downstream targets keep the target's real sector id, which
      // is also that sector's `_key` in this form; cross-quadrant targets (sectors
      // in another quadrant) keep their absolute id in the separate field -
      // see the downstream-picker's "other quadrants" section.
      downstream_keys: s.downstream_sector_ids.filter((id) => sectorIds.has(id)),
      downstream_sector_ids: s.downstream_sector_ids.filter((id) => !sectorIds.has(id)),
    })),
  };
}

interface QuadrantBuilderProps {
  starChartId: number;
  nextOrderIndex?: number;
  onAdded?: () => void;
  editingQuadrant?: Quadrant | null;
  onEdited?: () => void;
  onCancelEdit?: () => void;
  allQuadrants: Quadrant[];
}

export function QuadrantBuilder({ starChartId, nextOrderIndex, onAdded, editingQuadrant, onEdited, onCancelEdit, allQuadrants }: QuadrantBuilderProps) {
  const isEditing = !!editingQuadrant;
  const otherQuadrants = (allQuadrants || []).filter((q) => !editingQuadrant || q.id !== editingQuadrant.id);
  const [open, setOpen] = useState(isEditing);
  const [units, setUnits] = useState<Unit[]>([]);
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [name, setName] = useState(() => editingQuadrant?.name || '');
  const [color, setColor] = useState(() => editingQuadrant?.color || QUADRANT_COLORS[0]);
  const [sectors, setSectors] = useState<DraftSector[]>(() =>
    editingQuadrant ? quadrantToFormState(editingQuadrant).sectors : [emptySector()]
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && units.length === 0) {
      api.getUnitCatalog().then(setUnits).catch((e) => setError(e.message));
    }
  }, [open, units.length]);

  useEffect(() => {
    if (open && events.length === 0) {
      api.getEvents('assault_battle').then(setEvents).catch((e) => setError(e.message));
    }
  }, [open, events.length]);

  function updateSector(i: number, patch: DraftSector) {
    setSectors(sectors.map((s, idx) => (idx === i ? patch : s)));
  }
  function removeSector(i: number) {
    const removedKey = sectors[i]._key;
    setSectors(
      sectors
        .filter((_, idx) => idx !== i)
        .map((s) => ({ ...s, downstream_keys: s.downstream_keys.filter((k) => k !== removedKey) }))
    );
  }
  function moveSector(i: number, direction: number) {
    const target = i + direction;
    if (target < 0 || target >= sectors.length) return;
    const next = [...sectors];
    [next[i], next[target]] = [next[target], next[i]];
    setSectors(next);
  }

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      const payload: QuadrantIn = {
        name,
        color,
        order_index: isEditing ? editingQuadrant!.order_index : (nextOrderIndex ?? 0),
        sectors: sectors.map((s, i): SectorIn => ({
          sector_type: s.sector_type,
          order_index: i,
          notes: s.notes || null,
          squad_name: s.squad_name || null,
          usable_for: s.usable_for || null,
          requirements: s.requirements
            .filter((r) => r.unit)
            .map((r): UnitRequirementIn => ({
              unit_id: r.unit!.id,
              gear_tier: r.gear_tier ? Number(r.gear_tier) : null,
              relic_tier: r.relic_tier ? Number(r.relic_tier) : null,
              target_stars: r.target_stars ? Number(r.target_stars) : null,
              energy_type: r.energy_type || null,
              currency_types: r.currency_types || [],
              // null ("Any") must round-trip as null, not collapse to []
              energy_locations: r.energy_locations ?? null,
              lst_tiers: r.lst_tiers || [],
              omicron_ability_ids: r.omicron_ability_ids || [],
            })),
          rewards: s.rewards
            .filter((rw) => rw.name.trim())
            .map((rw): RewardIn => ({
              name: rw.name,
              reward_type: rw.reward_type,
              unit_id: rw.unit?.id ?? null,
              event_id: rw.event?.id ?? null,
            })),
          // resolved fresh from stable keys against the CURRENT sector order,
          // not carried along as stale positions - see `_key` above
          downstream_indices: s.downstream_keys
            .map((key) => sectors.findIndex((st) => st._key === key))
            .filter((idx) => idx !== -1),
          downstream_sector_ids: s.downstream_sector_ids,
        })),
      };
      if (isEditing) {
        await api.updateQuadrant(starChartId, editingQuadrant!.id, payload);
        onEdited?.();
      } else {
        await api.createQuadrant(starChartId, payload);
        setOpen(false);
        setName('');
        setSectors([emptySector()]);
        onAdded?.();
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (!isEditing && !open) {
    return (
      <button className="add-quadrant-toggle" onClick={() => setOpen(true)}>
        + Add quadrant
      </button>
    );
  }

  return (
    <div className="add-quadrant-panel">
      {isEditing && <div className="quadrant-builder-edit-label">Editing quadrant</div>}
      <div className="quadrant-builder-header">
        <input
          type="text"
          placeholder="Quadrant name (e.g. Jedi Quest)"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <select value={color} onChange={(e) => setColor(e.target.value)}>
          {QUADRANT_COLORS.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      {sectors.map((sector, i) => (
        <SectorEditor
          key={sector._key}
          sector={sector}
          sectorIndex={i}
          allSectors={sectors}
          otherQuadrants={otherQuadrants}
          units={units}
          events={events}
          onChange={(patch) => updateSector(i, patch)}
          onRemove={() => removeSector(i)}
          onMove={(dir) => moveSector(i, dir)}
          isFirst={i === 0}
          isLast={i === sectors.length - 1}
        />
      ))}

      <div className="add-sector-buttons">
        <button type="button" onClick={() => setSectors([...sectors, emptySector()])}>+ Add sector</button>
      </div>

      {error && <p className="add-quadrant-error">{error}</p>}

      <div className="add-quadrant-actions">
        <button onClick={submit} disabled={saving || !name.trim()}>
          {saving ? 'Saving...' : isEditing ? 'Save changes' : 'Add quadrant'}
        </button>
        <button
          onClick={() => (isEditing ? onCancelEdit?.() : setOpen(false))}
          disabled={saving}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
