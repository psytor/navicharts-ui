/**
 * Wire types for the Navicharts backend - mirrors src/schemas.py in the
 * navicharts service exactly (field names/shapes, snake_case as-is - no
 * camelCase translation layer, matching the standalone project's original
 * convention of using backend field names straight through the frontend).
 *
 * Hierarchy: StarChart -> Quadrant -> Sector -> System (roster requirements)
 *                                             -> Waypoint (a reward a System
 *                                                unlocks)
 */

export type ChartVisibility = "private" | "guild" | "shared" | "curated";

export interface RosterSnapshot {
  gear_level: number | null;
  relic_tier: number | null;
  stars: number | null;
  level: number | null;
  gp: number | null;
  synced_at: string;
}

export interface FarmingLocation {
  source_type: string;
  campaign_name: string;
  table_id: string | null;
  difficulty: string | null;
  mission_id: string | null;
  node_letter: string | null;
}

export interface UnitAbility {
  skill_id: string;
  name: string;
  category: string;
  needs_omicron: boolean;
}

export interface Unit {
  id: string;
  name: string;
  thumbnail_url: string | null;
  alignment: string | null;
  unit_type: string;
  is_galactic_legend: boolean;
  is_obtainable: boolean;
  unlock_event_id: string | null;
  farming_locations: FarmingLocation[];
  abilities: UnitAbility[];
}

export interface UnitWithRoster extends Unit {
  latest_snapshot: RosterSnapshot | null;
}

export interface UnitCatalogEntry {
  id: string;
  name: string;
  thumbnail_url: string | null;
  alignment: string | null;
  unit_type: string;
  is_galactic_legend: boolean;
}

export interface GameEvent {
  id: string;
  family: string;
  name: string;
  image_url: string | null;
}

export interface SystemRequirement {
  id: number;
  unit: Unit;
  gear_tier: number | null;
  relic_tier: number | null;
  target_stars: number | null;
  energy_type: string | null;
  currency_types: string[];
  // null = "Any" (untouched default, farm every real energy location);
  // [] = explicitly none (user unchecked every option)
  energy_locations: string[] | null;
  lst_tiers: string[];
  omicron_ability_ids: string[];
  met: boolean;
}

// Small pointer to a System or Waypoint, used wherever a full object isn't
// needed - a Waypoint's unlockers, a System's prerequisites/enables list.
export interface SystemRef {
  id: number;
  name: string | null;
}

export interface WaypointRef {
  id: number;
  name: string;
}

export interface Waypoint {
  id: number;
  name: string;
  waypoint_type: string;
  completed: boolean;
  image_ref: string | null;
  unit: Unit | null;
  event: GameEvent | null;
  // every System that unlocks this Waypoint (usually one, occasionally more)
  unlocked_by: SystemRef[];
}

export interface System {
  id: number;
  order_index: number;
  notes: string | null;
  name: string | null;
  usable_for: string | null;
  requirements: SystemRequirement[];
  unlocks: WaypointRef[];
  prerequisites: SystemRef[];
  enables: SystemRef[];
  status: boolean;
}

export interface Sector {
  id: number;
  name: string;
  color: string | null;
  order_index: number;
  notes: string | null;
  systems: System[];
  waypoints: Waypoint[];
  status: boolean;
}

export interface Quadrant {
  id: number;
  name: string;
  order_index: number;
  sectors: Sector[];
}

export interface StarChart {
  id: number;
  name: string;
  source: string | null;
  owner_user_id: number | null;
  visibility: ChartVisibility;
  quadrants: Quadrant[];
}

export interface StarChartListItem {
  id: number;
  name: string;
  source: string | null;
  owner_user_id: number | null;
  visibility: ChartVisibility;
}

export interface VisibilityIn {
  visibility: ChartVisibility;
  ally_code?: string | null;
}

export interface BookmarkIn {
  star_chart_id: number;
  ally_code?: string | null;
}

export interface SquadMember {
  id: number;
  unit: Unit;
  is_leader: boolean;
  order_index: number;
}

export interface Squad {
  id: number;
  quadrant_id: number;
  name: string;
  squad_type: string;
  purpose: string;
  notes: string | null;
  owner_user_id: number | null;
  visibility: ChartVisibility;
  members: SquadMember[];
}

export interface SyncResult {
  units_synced: number;
  ally_code: string;
}

// ---- input/mutation payloads ----

export interface UnitRequirementIn {
  unit_id: string;
  gear_tier: number | null;
  relic_tier: number | null;
  target_stars: number | null;
  energy_type: string | null;
  currency_types: string[];
  energy_locations: string[] | null;
  lst_tiers: string[];
  omicron_ability_ids: string[];
}

export interface WaypointIn {
  id: number | null;
  name: string;
  waypoint_type: string;
  unit_id: string | null;
  event_id: string | null;
}

export interface SystemIn {
  id: number | null;
  order_index: number;
  notes: string | null;
  name: string | null;
  usable_for: string | null;
  requirements: UnitRequirementIn[];
  // indices into the flattened (quadrant-wide) list of Waypoints in THIS
  // SAME payload that this System unlocks
  unlock_waypoint_indices: number[];
  // absolute ids of already-existing Waypoints this System unlocks
  unlock_waypoint_ids: number[];
  // indices into the flattened (quadrant-wide) list of Systems in THIS SAME
  // payload that this System is a prerequisite for - i.e. what it "feeds
  // into", declared from the upstream/prerequisite System's own form
  downstream_indices: number[];
  // absolute ids of already-existing Systems (in this or another quadrant)
  // this System feeds into
  downstream_system_ids: number[];
}

export interface SectorIn {
  id: number | null;
  name: string;
  color: string | null;
  order_index: number;
  notes: string | null;
  systems: SystemIn[];
  waypoints: WaypointIn[];
}

export interface QuadrantIn {
  name: string;
  order_index: number;
  sectors: SectorIn[];
}

export interface StarChartCreateIn {
  name: string;
  source: string | null;
}

export interface SquadMemberIn {
  unit_id: string;
  is_leader: boolean;
}

export interface SquadIn {
  quadrant_id: number;
  name: string;
  squad_type: string;
  purpose: string;
  notes: string | null;
  members: SquadMemberIn[];
}
