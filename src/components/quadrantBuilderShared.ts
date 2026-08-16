import type { Unit, GameEvent } from '../types';

export const SECTOR_COLORS = ['purple', 'cyan', 'gold', 'green', 'red', 'blue', 'orange', 'pink', 'teal'];
export const ENERGY_OPTIONS = ['', 'normal', 'cantina', 'ship'];
export const CURRENCY_OPTIONS = [
  'episode_shipment', 'era_shipment', 'cantina_shop', 'squad_arena', 'galactic_war',
  'fleet_arena', 'championship', 'shard_shop', 'conquest', 'legend',
  'raid_mk1', 'raid_mk2', 'raid_mk3', 'guild_tokens',
  'guild_event_mk1', 'guild_event_mk2', 'guild_event_mk3',
];
export const WAYPOINT_TYPES = ['character_unlock', 'ship_unlock', 'assault_battle', 'capital_ship', 'feature_unlock'];
// these waypoint types are always a real, already-catalogued unit (e.g. a
// character_unlock waypoint is a character) - picked via UnitPicker instead
// of free-typed, same as SystemRequirement, so the waypoint links to the
// shared catalog and gets a real portrait.
export const UNIT_LINKED_WAYPOINT_TYPES = new Set(['character_unlock', 'ship_unlock', 'capital_ship']);
// same idea, but for the real-world SWGOH event catalog instead of the Unit
// catalog - picked via EventPicker so the waypoint's name and banner art
// come from the resolved real event instead of a hand-typed guess.
export const EVENT_LINKED_WAYPOINT_TYPES = new Set(['assault_battle']);

// Relic tiers have a fixed star prerequisite (confirmed by the user, changed
// twice already as the game rebalanced this - see game_rules.py for the
// source and don't assume this stays current forever).
export const MIN_STARS_FOR_RELIC: Record<number, number> = {
  1: 4, 2: 4,
  3: 5, 4: 5,
  5: 6,
  6: 7, 7: 7, 8: 7, 9: 7, 10: 7,
};

// Draft (in-progress form) shapes - string-typed numeric fields (select/input
// values are always strings) rather than the wire UnitRequirementIn's real
// number|null, only converted to numbers on submit.
export interface DraftRequirement {
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

export interface DraftWaypoint {
  _key: string | number;
  name: string;
  waypoint_type: string;
  unit: Unit | null;
  event: GameEvent | null;
}

export interface DraftSystem {
  _key: string | number;
  notes: string;
  name: string;
  usable_for: string;
  requirements: DraftRequirement[];
  // waypoint targets, same in-form-key vs. already-existing-absolute-id
  // split as the sector/system picks below
  unlock_keys: (string | number)[];
  unlock_waypoint_ids: number[];
  // system prerequisites (systems that must be built before this one)
  prerequisite_keys: (string | number)[];
  prerequisite_system_ids: number[];
}

export interface DraftSector {
  _key: string | number;
  name: string;
  color: string;
  notes: string;
  systems: DraftSystem[];
  waypoints: DraftWaypoint[];
}

export function emptyRequirement(): DraftRequirement {
  return {
    unit: null, gear_tier: '', relic_tier: '', target_stars: '',
    // energy_locations: null = "Any" (untouched default)
    energy_type: '', currency_types: [], energy_locations: null, lst_tiers: [],
    omicron_ability_ids: [],
  };
}

// Sectors/Systems/Waypoints all get reordered or moved between each other a
// lot while editing, and array position isn't a safe way to remember "which
// system unlocks which waypoint" (or "which system requires which") across
// that - `_key` is a stable identity that travels with the row through any
// reorder/move. Real (already-saved) rows use their backend id as `_key`
// (already stable/unique); new unsaved rows get a synthetic one.
let newSectorKeyCounter = 0;
let newSystemKeyCounter = 0;
let newWaypointKeyCounter = 0;
function nextNewSectorKey(): string {
  return `new-sector-${newSectorKeyCounter++}`;
}
function nextNewSystemKey(): string {
  return `new-system-${newSystemKeyCounter++}`;
}
function nextNewWaypointKey(): string {
  return `new-waypoint-${newWaypointKeyCounter++}`;
}

export function emptyWaypoint(): DraftWaypoint {
  return { _key: nextNewWaypointKey(), name: '', waypoint_type: 'assault_battle', unit: null, event: null };
}

export function emptySystem(): DraftSystem {
  return {
    _key: nextNewSystemKey(),
    notes: '',
    name: '',
    usable_for: '',
    requirements: [emptyRequirement()],
    unlock_keys: [],
    unlock_waypoint_ids: [],
    prerequisite_keys: [],
    prerequisite_system_ids: [],
  };
}

export function emptySector(): DraftSector {
  return {
    _key: nextNewSectorKey(),
    name: '',
    color: SECTOR_COLORS[0],
    notes: '',
    systems: [emptySystem()],
    waypoints: [],
  };
}

// Flattened (quadrant-wide, sector-order-then-within-sector-order) view of
// every System/Waypoint currently in the form - this is the pool a "Requires"/
// "Unlocks" picker offers, and its order is exactly what unlock_waypoint_indices/
// prerequisite_system_indices get resolved against at submit time.
export interface FlatSystemEntry { sectorIndex: number; system: DraftSystem; }
export interface FlatWaypointEntry { sectorIndex: number; waypoint: DraftWaypoint; }

export function flattenSystems(sectors: DraftSector[]): FlatSystemEntry[] {
  return sectors.flatMap((sector, sectorIndex) => sector.systems.map((system) => ({ sectorIndex, system })));
}
export function flattenWaypoints(sectors: DraftSector[]): FlatWaypointEntry[] {
  return sectors.flatMap((sector, sectorIndex) => sector.waypoints.map((waypoint) => ({ sectorIndex, waypoint })));
}
