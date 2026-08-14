/**
 * Wire types for the Navicharts backend - mirrors src/schemas.py in the
 * navicharts service exactly (field names/shapes, snake_case as-is - no
 * camelCase translation layer, matching the standalone project's original
 * convention of using backend field names straight through the frontend).
 */

export type ChartVisibility = "private" | "shared" | "curated";

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

export interface SectorRequirement {
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

export interface Reward {
  id: number;
  name: string;
  reward_type: string;
  completed: boolean;
  image_ref: string | null;
  unit: Unit | null;
  event: GameEvent | null;
  unlocked_by: string | null;
}

export interface Sector {
  id: number;
  order_index: number;
  sector_type: string;
  notes: string | null;
  squad_name: string | null;
  usable_for: string | null;
  requirements: SectorRequirement[];
  rewards: Reward[];
  downstream_sector_ids: number[];
  leads_to: string[];
  status: boolean;
}

export interface Quadrant {
  id: number;
  name: string;
  color: string | null;
  order_index: number;
  sectors: Sector[];
}

export interface StarChart {
  id: number;
  name: string;
  source: string | null;
  episode_number: number | null;
  owner_user_id: number | null;
  visibility: ChartVisibility;
  quadrants: Quadrant[];
}

export interface StarChartListItem {
  id: number;
  name: string;
  source: string | null;
  episode_number: number | null;
  owner_user_id: number | null;
  visibility: ChartVisibility;
}

export interface SquadMember {
  id: number;
  unit: Unit;
  is_leader: boolean;
  order_index: number;
}

export interface Squad {
  id: number;
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

export interface RewardIn {
  name: string;
  reward_type: string;
  unit_id: string | null;
  event_id: string | null;
}

export interface SectorIn {
  sector_type: string;
  order_index: number;
  notes: string | null;
  squad_name: string | null;
  usable_for: string | null;
  requirements: UnitRequirementIn[];
  rewards: RewardIn[];
  downstream_indices: number[];
  downstream_sector_ids: number[];
}

export interface QuadrantIn {
  name: string;
  color: string | null;
  order_index: number;
  sectors: SectorIn[];
}

export interface StarChartCreateIn {
  name: string;
  source: string | null;
  episode_number: number | null;
}

export interface SquadMemberIn {
  unit_id: string;
  is_leader: boolean;
}

export interface SquadIn {
  name: string;
  squad_type: string;
  purpose: string;
  notes: string | null;
  members: SquadMemberIn[];
}
