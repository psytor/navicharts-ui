import { Card } from 'astrogators-shared-ui';
import {
  UnitPortrait, ENERGY_STYLES, CURRENCY_LABELS, CURRENCY_SHOPS, CurrencyCornerBadge, CAMPAIGN_ENERGY, locationDetailLabel,
} from './Badge';
import { GearRingPortrait } from './CharacterCard';
import type { StarChart, SystemRequirement, FarmingLocation, RosterSnapshot, UnitWithRoster } from '../types';

const MAX_STARS = 7;
const MAX_GEAR = 13;
// Energy location boxes (Cantina/Light Side/Dark Side/Fleet Battles) show at
// most this many not-yet-maxed units, laid out 2 columns wide - keeps every
// energy box a similar compact height so they actually sit side by side in
// the grid instead of one long list pushing its neighbors down.
const ENERGY_DISPLAY_CAP = 6;

// the 4 "daily battle" campaigns always come first, in this order; any other
// real location (events/legendary/journey/raid/conquest) sorts after,
// followed by generic energy/currency fallback groups for units we don't
// have a confirmed real location for yet.
const CAMPAIGN_ORDER = ['Cantina Battles', 'Light Side Battles', 'Dark Side Battles', 'Fleet Battles'];
const ENERGY_FALLBACK_ORDER = ['normal', 'cantina', 'ship'];
const CURRENCY_KEY_ORDER = [
  'episode_shipment', 'era_shipment', 'cantina_shop', 'squad_arena', 'galactic_war',
  'fleet_arena', 'championship', 'shard_shop', 'conquest', 'legend',
  'raid_mk1', 'raid_mk2', 'raid_mk3', 'guild_tokens',
  'guild_event_mk1', 'guild_event_mk2', 'guild_event_mk3',
];

// Currency-shop groups below are keyed by shop (CURRENCY_SHOPS), not by
// individual currency label - several currencies are spent in the same
// in-game shop (e.g. Guild Tokens + Mk I/II/III Raid Tokens all go through
// Guild Activity), and those should collapse into one shipment box rather
// than one per currency. Prefixed so a shop name that happens to collide
// with a real campaign name (Cantina Battles is both a farming campaign AND
// a currency shop) can't merge into that campaign's real-location group.
const SHIPMENT_PREFIX = 'shipment:';
function shipmentKey(shop: string): string {
  return `${SHIPMENT_PREFIX}${shop}`;
}
function unshipmentKey(key: string): string {
  return key.startsWith(SHIPMENT_PREFIX) ? key.slice(SHIPMENT_PREFIX.length) : key;
}

function campaignColor(campaignName: string): string {
  if (campaignName === 'Cantina Battles') return ENERGY_STYLES.cantina.color;
  if (campaignName === 'Light Side Battles' || campaignName === 'Dark Side Battles') return ENERGY_STYLES.normal.color;
  if (campaignName === 'Fleet Battles') return ENERGY_STYLES.ship.color;
  return '#c084fc';
}

function fallbackLabel(key: string): string {
  return ENERGY_STYLES[key]?.fullLabel || CURRENCY_LABELS[key] || key.replace(/_/g, ' ');
}

function fallbackColor(key: string): string {
  return ENERGY_STYLES[key]?.color || '#8c9bd0';
}

function snapshotMap(units: UnitWithRoster[]): Map<string, RosterSnapshot> {
  const map = new Map<string, RosterSnapshot>();
  for (const u of units) {
    if (u.latest_snapshot) map.set(u.id, u.latest_snapshot);
  }
  return map;
}

interface LocationEntry {
  req: SystemRequirement;
  quadrantIndex: number;
  sectorOrder: number;
  systemOrder: number;
  locationDetail?: FarmingLocation;
  currencyKey?: string;
}

interface LocationGroup {
  key: string;
  isReal: boolean;
  isEvent: boolean;
  isJourney: boolean;
  color: string;
  entries: LocationEntry[];
}

function buildLocations(starChart: StarChart) {
  const groups = new Map<string, Omit<LocationGroup, 'key'>>();

  function addEntry(key: string, isReal: boolean, isEvent: boolean, isJourney: boolean, color: string, entry: LocationEntry) {
    if (!groups.has(key)) groups.set(key, { isReal, isEvent, isJourney, color, entries: [] });
    groups.get(key)!.entries.push(entry);
  }

  starChart.quadrants.forEach((quadrant, quadrantIndex) => {
    quadrant.sectors.forEach((sector) => {
      sector.systems.forEach((system) => {
        system.requirements.forEach((req) => {
          const base: LocationEntry = { req, quadrantIndex, sectorOrder: sector.order_index, systemOrder: system.order_index };
          // A unit with more than one real energy-type location (e.g. Kylo
          // Ren Unmasked: Cantina Battles + Light Side Battles) can be
          // checked down to a subset here via energy_locations - null
          // ("Any", the untouched default) still shows it under every real
          // energy location, same as a unit with only one; [] (explicitly
          // unchecked everything) shows it under none of them. Real
          // non-energy locations (assault battles, raids, legendary/journey/
          // conquest - e.g. Darth Vader's Assault Battle) always show,
          // unaffected by this checkbox since there's nothing to choose
          // between there.
          const allLocations = req.unit.farming_locations || [];
          const realLocations = req.energy_locations == null
            ? allLocations
            : allLocations.filter((l) => (
                !CAMPAIGN_ENERGY[l.campaign_name] || req.energy_locations!.includes(l.campaign_name)
              ));

          if (realLocations.length > 0) {
            const seen = new Set<string>();
            realLocations.forEach((loc) => {
              if (seen.has(loc.campaign_name)) return;
              seen.add(loc.campaign_name);
              const isEvent = loc.source_type === 'scheduled_event';
              const isJourney = loc.source_type === 'journey';
              addEntry(loc.campaign_name, true, isEvent, isJourney, campaignColor(loc.campaign_name), { ...base, locationDetail: loc });
            });
          } else if (allLocations.length === 0 && req.energy_type) {
            // energy_type is a manual fallback only, for when there's no real
            // farming data at all - if the unit HAS real locations but the
            // user explicitly unchecked all of them, that's an intentional
            // "don't farm this via energy," not a gap to fill
            addEntry(fallbackLabel(req.energy_type), false, false, false, fallbackColor(req.energy_type), base);
          }

          // Currency shop options are a valid alternate source in their own
          // right (e.g. farmable at Cantina Battles AND buyable with Squad
          // Arena Tokens) - unlike energy_type, always show these under
          // Shipments regardless of whether a real location was also found
          // above, so this alternate isn't silently dropped. Grouped by shop
          // (CURRENCY_SHOPS), not by individual currency, so currencies that
          // share a shop collapse into one box - a requirement naming two
          // currencies from the same shop (e.g. two Guild Activity tokens)
          // still only adds one entry there, tagged with whichever currency
          // was listed first.
          const shopsAdded = new Set<string>();
          (req.currency_types || []).forEach((key) => {
            const shop = CURRENCY_SHOPS[key] || fallbackLabel(key);
            if (shopsAdded.has(shop)) return;
            shopsAdded.add(shop);
            addEntry(shipmentKey(shop), false, false, false, fallbackColor(key), { ...base, currencyKey: key });
          });
        });
      });
    });
  });

  for (const group of groups.values()) {
    group.entries.sort((a, b) =>
      a.quadrantIndex - b.quadrantIndex || a.sectorOrder - b.sectorOrder || a.systemOrder - b.systemOrder
    );
  }

  const keys = [...groups.keys()];
  // Assault Battle events, Journeys, and shop/currency "shipment" fallbacks
  // each get pulled into their own separate roadmap section rather than
  // sitting alongside the main "energy" locations (campaign nodes, raids,
  // legendary guide nodes) - they're a different kind of farm spot, so
  // grouping them together (like unique journey names, or the many distinct
  // currency types) is more useful than one section per unique name.
  const assaultKeys = keys.filter((k) => groups.get(k)!.isEvent).sort();
  const journeyKeys = keys.filter((k) => groups.get(k)!.isJourney).sort();
  const realOtherKeys = keys
    .filter((k) => groups.get(k)!.isReal && !groups.get(k)!.isEvent && !groups.get(k)!.isJourney && !CAMPAIGN_ORDER.includes(k))
    .sort();
  // Shop names dedupe naturally here (e.g. raid_mk1/mk2/mk3/guild_tokens all
  // resolve to "Guild Activity"), so this ends up one entry per shipment box
  // even though it's built from the longer per-currency order list.
  const shopOrder = [...new Set(CURRENCY_KEY_ORDER.map((k) => CURRENCY_SHOPS[k] || fallbackLabel(k)))];
  const fallbackKeyOrder = [
    ...ENERGY_FALLBACK_ORDER.map(fallbackLabel),
    ...shopOrder.map(shipmentKey),
  ];
  const shipmentKeys = keys
    .filter((k) => !groups.get(k)!.isReal)
    .sort((a, b) => {
      const ai = fallbackKeyOrder.indexOf(a);
      const bi = fallbackKeyOrder.indexOf(b);
      if (ai === -1 && bi === -1) return a.localeCompare(b);
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });

  const orderedKeys = [
    ...CAMPAIGN_ORDER.filter((k) => groups.has(k)),
    ...realOtherKeys,
  ];

  return {
    locations: orderedKeys.map((key) => ({ key, ...groups.get(key)! })),
    assaultBattles: assaultKeys.map((key) => ({ key, ...groups.get(key)! })),
    journeys: journeyKeys.map((key) => ({ key, ...groups.get(key)! })),
    shipments: shipmentKeys.map((key) => ({ key: unshipmentKey(key), ...groups.get(key)! })),
  };
}

function buildGearOrder(starChart: StarChart): LocationEntry[] {
  const entries: LocationEntry[] = [];
  starChart.quadrants.forEach((quadrant, quadrantIndex) => {
    quadrant.sectors.forEach((sector) => {
      sector.systems.forEach((system) => {
        system.requirements
          // stars alone aren't a gearing target (e.g. GL supporting-cast
          // fodder that only needs stars) - only include actual gear/relic
          // progression here
          .filter((req) => req.gear_tier != null || req.relic_tier != null)
          .forEach((req) => {
            entries.push({ req, quadrantIndex, sectorOrder: sector.order_index, systemOrder: system.order_index });
          });
      });
    });
  });
  return entries;
}

// req.met (from the backend) also factors in target_stars, which is a
// separate axis from gear/relic (see gearProgressLabel) - a unit can have
// already reached the relic tier this requirement asks for while still
// being short on stars. That's not a gearing task anymore, so Gearing Order
// drops it once the gear/relic tier itself is reached, regardless of stars.
function isGearOrRelicComplete(req: SystemRequirement, snap: RosterSnapshot | undefined): boolean {
  if (req.relic_tier != null) return (snap?.relic_tier ?? 0) >= req.relic_tier;
  return (snap?.gear_level ?? 0) >= req.gear_tier!;
}

// A small "farm/gear this Nth" badge - entries arrive pre-sorted by quadrant
// priority then sector order (see buildLocations/buildGearOrder), but that
// ordering is otherwise invisible in the UI, so make the rank explicit
// instead of leaving it to be inferred from left-to-right/top-to-bottom
// position alone.
function PriorityBadge({ rank }: { rank: number }) {
  return (
    <span className="unit-card-priority" title="Priority order - based on quadrant order in the Plan tab">
      {rank}
    </span>
  );
}

// Callers always pass entries already filtered down to not-yet-7-star units
// (see activeGroupEntries below) - a maxed shard farm target is dropped
// entirely rather than shown dimmed, since the list only grows over time
// otherwise. `rank` is omitted (no PriorityBadge) for sources where "do
// this one first" doesn't mean anything - Assault Battles, Legendary,
// Raids, and Conquest are all random-drop rewards, not a deterministic
// node you farm in order, so a numbered priority badge would be actively
// misleading there. Energy nodes, Journeys, and Shipments keep it - those
// really are "farm/buy this one before that one."
function ShardUnitCard({ entry, rank, snapshots }: { entry: LocationEntry; rank?: number; snapshots: Map<string, RosterSnapshot> }) {
  const { unit } = entry.req;
  const stars = snapshots.get(unit.id)?.stars ?? 0;
  const detail = locationDetailLabel(entry.locationDetail);
  return (
    <Card chamfered chamferSize="sm" hoverable padding="sm" className="unit-card">
      {rank != null && <PriorityBadge rank={rank} />}
      {/* Shipment boxes group several currencies under one shop (see
          buildLocations) - the corner pin (same overlay RequirementPortrait
          uses in Visualise) points back to the exact currency this unit
          needs, since the shop name alone doesn't say which token. */}
      <div className="unit-card-portrait-wrap">
        <UnitPortrait unit={unit} />
        <CurrencyCornerBadge currencyType={entry.currencyKey} />
      </div>
      <span className="unit-card-name">{unit.name}</span>
      <span className="unit-card-stars">{stars > 0 ? `${stars}★` : '-'}</span>
      {detail && <span className="unit-card-location-detail">{detail}</span>}
    </Card>
  );
}

// Drops units that have already hit 7 stars (nothing left to farm) and,
// for the compact energy boxes, caps to the first N in priority order.
function activeGroupEntries(groups: LocationGroup[], snapshots: Map<string, RosterSnapshot>, opts: { cap?: number } = {}): LocationGroup[] {
  const { cap } = opts;
  return groups
    .map((g) => {
      let entries = g.entries.filter((e) => (snapshots.get(e.req.unit.id)?.stars ?? 0) < MAX_STARS);
      if (cap) entries = entries.slice(0, cap);
      return { ...g, entries };
    })
    .filter((g) => g.entries.length > 0);
}

function gearProgressLabel(req: SystemRequirement, snap: RosterSnapshot | undefined): string {
  const gearLevel = snap?.gear_level ?? 0;

  if (req.relic_tier == null) {
    return `G${gearLevel} → G${req.gear_tier}`;
  }

  // Relic tiers only exist once a unit hits G13 - show gear progress toward
  // that first, then switch to relic progress once relic-eligible. Stars are
  // a separate axis (target_stars) and unrelated to this gear/relic ladder,
  // so they're never shown here even if they're what's actually blocking
  // the relic tier.
  if (gearLevel < MAX_GEAR) {
    return `G${gearLevel} → G${MAX_GEAR}`;
  }

  const relicTier = snap?.relic_tier ?? 0;
  return `R${relicTier} → R${req.relic_tier}`;
}

interface RoadmapSubsectionProps {
  className: string;
  headerClassName: string;
  color: string;
  title: string;
  intro: string;
  groups: LocationGroup[];
  snapshots: Map<string, RosterSnapshot>;
  // Journeys/Shipments really do have a meaningful "do this before that"
  // order; Assault Battles are random drops, so no rank there - see
  // ShardUnitCard's docstring.
  showRank?: boolean;
}

// A carved-out roadmap subsection grouping several named location-groups
// under one chamfered header card (e.g. every individual Journey, or every
// individual shop/currency fallback) - same visual pattern as Assault
// Battles, just reused for the other "not a primary energy farm" cases.
function RoadmapSubsection({ className, headerClassName, color, title, intro, groups, snapshots, showRank = true }: RoadmapSubsectionProps) {
  if (groups.length === 0) return null;
  return (
    <Card chamfered chamferSize="md" showDiagonalBorders diagonalBorderColor={color} className={className}>
      <div className={`location-header ${headerClassName}`}>{title}</div>
      <p className="roadmap-intro">{intro}</p>
      <div className="roadmap-grid">
        {groups.map(({ key, color: groupColor, entries }) => (
          <Card chamfered chamferSize="sm" padding="md" showDiagonalBorders diagonalBorderColor={groupColor} className="location-group" key={key}>
            <div className="location-header" style={{ color: groupColor }}>
              {key}
            </div>
            <div className="location-card-grid">
              {entries.map((entry, i) => (
                <ShardUnitCard key={`${entry.req.id}-${i}`} entry={entry} rank={showRank ? i + 1 : undefined} snapshots={snapshots} />
              ))}
            </div>
          </Card>
        ))}
      </div>
    </Card>
  );
}

// Callers filter out already-gear/relic-complete entries (see
// isGearOrRelicComplete), so every card here always has real gear/relic
// progress left to show - reuses the same portrait+ring+badge rendering as
// the Inventory tab (see GearRingPortrait) so current gear tier is visible
// at a glance, not just implied by the "G_ -> G_" text underneath.
//
// A unit with no roster snapshot at all hasn't been unlocked/starred yet -
// gearing it isn't even possible yet, so it's shaded to flag "farm this
// first" rather than looking like a normal in-progress gearing task.
function GearUnitCard({ entry, rank, snapshots }: { entry: LocationEntry; rank: number; snapshots: Map<string, RosterSnapshot> }) {
  const { req } = entry;
  const { unit } = req;
  const snap = snapshots.get(unit.id);
  const owned = !!snap;

  return (
    <div
      className={`gear-order-card chamfered-box-sm ${owned ? '' : 'gear-order-card--unowned'}`}
      title={owned ? undefined : 'Not unlocked yet - farm shards to unlock before gearing'}
    >
      <PriorityBadge rank={rank} />
      <GearRingPortrait unit={unit} snapshot={snap} />
      <span className="unit-card-name">{unit.name}</span>
      <span className="unit-card-progress">
        {owned ? gearProgressLabel(req, snap) : 'Not unlocked yet'}
      </span>
    </div>
  );
}

export function RoadmapView({ starChart, units }: { starChart: StarChart; units: UnitWithRoster[] }) {
  const { locations, assaultBattles, journeys, shipments } = buildLocations(starChart);
  const snapshots = snapshotMap(units);
  const activeGearOrder = buildGearOrder(starChart).filter(
    (entry) => !isGearOrRelicComplete(entry.req, snapshots.get(entry.req.unit.id))
  );

  // the 4 daily-battle campaigns get the compact capped/2-col treatment;
  // every other real location (raids, legendary) keeps the uncapped list
  const activeEnergyLocations = activeGroupEntries(
    locations.filter((g) => CAMPAIGN_ORDER.includes(g.key)),
    snapshots,
    { cap: ENERGY_DISPLAY_CAP }
  );
  const activeOtherLocations = activeGroupEntries(
    locations.filter((g) => !CAMPAIGN_ORDER.includes(g.key)),
    snapshots
  );
  const activeJourneys = activeGroupEntries(journeys, snapshots);
  const activeShipments = activeGroupEntries(shipments, snapshots);
  const activeAssaultBattles = activeGroupEntries(assaultBattles, snapshots);

  return (
    <div className="roadmap">
      <p className="roadmap-intro">
        Where to farm shards, in priority order within each location - based on
        the quadrant order from the Plan tab. Real campaign nodes where known;
        generic energy/currency groups for anything not yet resolved. Units
        already at 7★ are dropped from these lists.
      </p>
      <div className="roadmap-grid">
        {[...activeEnergyLocations, ...activeOtherLocations].map(({ key, color, entries }) => {
          const isEnergy = CAMPAIGN_ORDER.includes(key);
          // Non-energy real locations here are always legendary/raid/
          // conquest (see buildLocations - "node" locations always land in
          // one of the 4 CAMPAIGN_ORDER campaigns, scheduled_event/journey
          // get their own subsections) - all random-drop rewards, no
          // meaningful priority order.
          return (
            <Card chamfered chamferSize="sm" padding="md" showDiagonalBorders diagonalBorderColor={color} className="location-group" key={key}>
              <div className="location-header" style={{ color }}>
                {key}
              </div>
              <div className={`location-card-grid ${isEnergy ? 'location-card-grid-energy' : ''}`}>
                {entries.map((entry, i) => (
                  <ShardUnitCard key={`${entry.req.id}-${i}`} entry={entry} rank={isEnergy ? i + 1 : undefined} snapshots={snapshots} />
                ))}
              </div>
            </Card>
          );
        })}
      </div>

      <RoadmapSubsection
        className="journey-section"
        headerClassName="journey-header"
        color="#7ed957"
        title="Journeys"
        intro="Story-quest farm sources - complete the journey's chapters to earn shards."
        groups={activeJourneys}
        snapshots={snapshots}
      />

      <RoadmapSubsection
        className="shipment-section"
        headerClassName="shipment-header"
        color="#8c9bd0"
        title="Shipments"
        intro="No confirmed real farming node yet - buy shards with the listed currency instead."
        groups={activeShipments}
        snapshots={snapshots}
      />

      <RoadmapSubsection
        className="assault-section"
        headerClassName="assault-header"
        color="#e0995a"
        title="Assault Battles"
        intro="Rotating event battles - a bonus shard source on top of each unit's main farm location, only available while the event is live."
        groups={activeAssaultBattles}
        snapshots={snapshots}
        showRank={false}
      />

      <Card chamfered chamferSize="md" showDiagonalBorders diagonalBorderColor="#c084fc" className="gearing-section">
        <div className="location-header gearing-header">Gearing Order</div>
        <p className="roadmap-intro">
          Who to gear up first, in priority order - same quadrant order as above.
        </p>
        <div className="location-card-grid">
          {activeGearOrder.map((entry, i) => (
            <GearUnitCard key={`${entry.req.id}-${i}`} entry={entry} rank={i + 1} snapshots={snapshots} />
          ))}
        </div>
      </Card>
    </div>
  );
}
