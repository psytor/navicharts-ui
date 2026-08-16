import type { Unit, SystemRequirement, FarmingLocation } from '../types';

// character_unlock/ship_unlock/capital_ship waypoints are always a specific
// catalog unit - the backend derives their `completed` from the roster
// snapshot (7*, same MAX_STARS threshold used everywhere else for "done
// farming"), so these get a read-only status indicator, not a checkbox.
// assault_battle/feature_unlock waypoints have no such signal and no manual
// tracking either - those render with no completion UI at all.
export const UNIT_WAYPOINT_TYPES = new Set(['character_unlock', 'ship_unlock', 'capital_ship']);

const currencyIcons = import.meta.glob('../assets/currency-icons/*.png', { eager: true, import: 'default' }) as Record<string, string>;

function currencyIcon(name?: string): string | undefined {
  return name ? currencyIcons[`../assets/currency-icons/${name}.png`] : undefined;
}

const IMG_RETRY_MAX = 2;
const IMG_RETRY_DELAY_MS = 500;

// Remote portrait/banner images (AE2) occasionally fail to load on the
// first attempt - a plain onError-hides-forever handler leaves that image
// permanently blank until a full page reload. Retries the same URL a
// couple of times with a short delay before giving up, since re-requesting
// is enough to recover from a transient hiccup.
export function retryableImgOnError(maxRetries: number = IMG_RETRY_MAX, delayMs: number = IMG_RETRY_DELAY_MS) {
  return (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    const attempt = Number(img.dataset.retryAttempt || '0');
    if (attempt < maxRetries) {
      img.dataset.retryAttempt = String(attempt + 1);
      const src = img.src;
      setTimeout(() => {
        img.src = '';
        img.src = src;
      }, delayMs);
    } else {
      img.style.visibility = 'hidden';
    }
  };
}

interface UnitPortraitProps {
  unit: Unit | null | undefined;
}

// unit.thumbnail_url is a ready-to-use portrait URL resolved server-side
// (astrogators-table) - no more local /units/{id}/image proxy to build.
export function UnitPortrait({ unit }: UnitPortraitProps) {
  if (!unit) return null;
  return (
    <img
      className="unit-portrait"
      src={unit.thumbnail_url ?? undefined}
      alt={unit.name}
      loading="lazy"
      onError={retryableImgOnError()}
    />
  );
}

export const ENERGY_STYLES: Record<string, { label: string; fullLabel: string; color: string }> = {
  normal: { label: 'Normal', fullLabel: 'Normal Energy', color: '#e8c85a' },
  cantina: { label: 'Cantina', fullLabel: 'Cantina Energy', color: '#d9713c' },
  ship: { label: 'Ship', fullLabel: 'Ship Energy', color: '#4fc3d9' },
};

// currency-icons/ filenames (see backend/app/extract_currency_icons.py) for
// each energy/currency/LST key - used by RequirementPortrait's corner
// badges. Not every extracted icon has a key here (e.g. data_caches.png,
// era_level_currency.png) - those have no corresponding field in the data
// model yet, so they stay unused rather than force-mapped to something wrong.
export const ENERGY_ICON_FILES: Record<string, string> = {
  normal: 'normal_energy',
  cantina: 'cantina_energy',
  ship: 'ship_energy',
};

export const CURRENCY_ICON_FILES: Record<string, string> = {
  episode_shipment: 'episode_currency',
  era_shipment: 'era_currency',
  cantina_shop: 'cantina_battle_tokens',
  squad_arena: 'squad_arena_tokens',
  galactic_war: 'galactic_war_tokens',
  fleet_arena: 'fleet_arena_tokens',
  championship: 'championship_tokens',
  shard_shop: 'shard_store_tokens',
  conquest: 'conquest_currency',
  legend: 'legend_tokens',
  raid_mk1: 'raid_tokens_mk1',
  raid_mk2: 'raid_tokens_mk2',
  raid_mk3: 'raid_tokens_mk3',
  guild_tokens: 'guild_tokens',
  guild_event_mk1: 'guild_event_tokens_mk1',
  guild_event_mk2: 'guild_event_tokens_mk2',
  guild_event_mk3: 'guild_event_tokens_mk3',
};

// "Anomalous Lightspeed Token" has no game asset anywhere in the local dump
// (checked every atlas/standalone file - see extract_currency_icons.py
// docstring) - deliberately absent here so RequirementPortrait falls back to
// a small text chip for it instead of a broken image.
export const LST_ICON_FILES: Record<string, string> = {
  'Carbonite Lightspeed Token': 'lst_carbonite',
  'Bronzium Lightspeed Token': 'lst_bronzium',
  'Chromium Lightspeed Token': 'lst_chromium',
  'Aurodium Lightspeed Token': 'lst_aurodium',
  'Kyber Lightspeed Token': 'lst_kyber',
};

export const OMICRON_ICON_FILE = 'omicron_material';

export const CURRENCY_LABELS: Record<string, string> = {
  episode_shipment: 'Episode Currency',
  era_shipment: 'Era Shipment Currency',
  cantina_shop: 'Cantina Battle Tokens',
  squad_arena: 'Squad Arena Tokens',
  galactic_war: 'Galactic War Tokens',
  fleet_arena: 'Fleet Arena Tokens',
  championship: 'Championship Tokens',
  shard_shop: 'Shard Store Tokens',
  conquest: 'Conquest Credits',
  legend: 'Legend Tokens',
  raid_mk1: 'Mk I Raid Tokens',
  raid_mk2: 'Mk II Raid Tokens',
  raid_mk3: 'Mk III Raid Tokens',
  guild_tokens: 'Guild Tokens',
  guild_event_mk1: 'Mk I Guild Event Tokens',
  guild_event_mk2: 'Mk II Guild Event Tokens',
  guild_event_mk3: 'Mk III Guild Event Tokens',
};

// the in-game shop each currency is spent in - shown as a tooltip next to
// the currency itself (several currencies share a shop, e.g. all 4 Guild
// Activity tokens, so this stays a separate map rather than folded into the label)
export const CURRENCY_SHOPS: Record<string, string> = {
  episode_shipment: 'Episode Shipment',
  era_shipment: 'Era Shipment',
  cantina_shop: 'Cantina Battles',
  squad_arena: 'Squad Arena',
  galactic_war: 'Galactic War',
  fleet_arena: 'Fleet Arena',
  championship: 'Grand Arena',
  shard_shop: 'Shard Shop',
  conquest: 'Conquest',
  legend: 'Legend Tokens',
  raid_mk1: 'Guild Activity',
  raid_mk2: 'Guild Activity',
  raid_mk3: 'Guild Activity',
  guild_tokens: 'Guild Activity',
  guild_event_mk1: 'Guild Events',
  guild_event_mk2: 'Guild Events',
  guild_event_mk3: 'Guild Events',
};

export function currencyLabel(key: string): string {
  return CURRENCY_LABELS[key] || key.replace(/_/g, ' ');
}

// Advisory only (not a farming requirement) - see SystemRequirement.lst_tiers.
// Ordered lowest to highest grant power (Carbonite's Gear 12/3★ is below
// even Bronzium's Relic 1/4★ - Anomalous is the odd one out, quest-only and
// not on this purchasable ladder, so it stays last regardless).
export const LST_TIERS: string[] = [
  'Carbonite Lightspeed Token',
  'Bronzium Lightspeed Token',
  'Chromium Lightspeed Token',
  'Aurodium Lightspeed Token',
  'Kyber Lightspeed Token',
  'Anomalous Lightspeed Token',
];

// Optional per-tier detail for tooltips - not filled in for every tier yet.
export const LST_TIER_INFO: Record<string, { grants: string; caveat?: string }> = {
  'Carbonite Lightspeed Token': {
    grants: 'Level 85, Gear Tier 12, 3★, abilities to level 3 (excludes Zeta/Omicron)',
  },
  'Bronzium Lightspeed Token': {
    grants: 'Level 85, Relic Tier 1, 4★, abilities to level 4 (excludes Zeta/Omicron)',
  },
  'Chromium Lightspeed Token': {
    grants: 'Level 85, Relic Tier 3, 5★, abilities to level 5 (excludes Zeta/Omicron)',
  },
  'Aurodium Lightspeed Token': {
    grants: 'Level 85, Relic Tier 5, 6★, abilities to level 6 (excludes Zeta/Omicron)',
  },
  // derived from raw bundle JSON, calibrated against Aurodium's confirmed
  // values: Rarity -> stars and SkillTier -> ability level map 1:1, but
  // RelicTier needs -2 (Aurodium's raw RelicTier 7 = confirmed Relic 5)
  'Kyber Lightspeed Token': {
    grants: 'Level 85, Relic Tier 6, 7★, abilities to level 7 (excludes Zeta/Omicron)',
  },
  'Anomalous Lightspeed Token': {
    grants: 'Level 85, Gear Tier 13, 7★, abilities to level 8 (includes Zeta, excludes Omicron)',
    caveat: 'Quest-gated, not purchasable - confirmed available until November 2026, uncertain after.',
  },
};

export function lstTierTitle(tier: string): string {
  const info = LST_TIER_INFO[tier];
  if (!info) return 'Consider using this instead of farming';
  return `Consider using this instead of farming. Grants: ${info.grants}.${info.caveat ? ` ${info.caveat}` : ''}`;
}

interface TierBadgeProps {
  gearTier: number | null;
  relicTier: number | null;
}

export function TierBadge({ gearTier, relicTier }: TierBadgeProps) {
  if (relicTier != null) {
    return <span className="badge badge-relic">R{relicTier}</span>;
  }
  if (gearTier != null) {
    return <span className="badge badge-gear">G{gearTier}</span>;
  }
  return null;
}

// `energyTypes` is always an array: 0 items renders nothing, multiple items
// render one badge each (a unit's checked energy_locations can span more
// than one underlying energy type, e.g. both Cantina and Light Side).
export function EnergyBadge({ energyTypes }: { energyTypes: string[] }) {
  const types = energyTypes || [];
  if (types.length === 0) return null;
  return (
    <>
      {types.map((energyType) => {
        const style = ENERGY_STYLES[energyType] || { label: energyType, color: '#999' };
        return (
          <span
            key={energyType}
            className="badge badge-energy"
            style={{ borderColor: style.color, color: style.color }}
          >
            {style.label}
          </span>
        );
      })}
    </>
  );
}

export function CurrencyBadge({ currencyTypes }: { currencyTypes: string[] }) {
  const types = currencyTypes || [];
  if (types.length === 0) return null;
  return (
    <>
      {types.map((currencyType) => (
        <span key={currencyType} className="badge badge-currency" title={CURRENCY_SHOPS[currencyType]}>
          {currencyLabel(currencyType)}
        </span>
      ))}
    </>
  );
}

// Single-currency version of the bottom-right corner overlay
// RequirementPortrait stamps on a unit's portrait (see CornerIcon below) -
// reused as-is here so the Star Charts Shipments section's "which currency"
// pin looks the same as it does everywhere else in the app, instead of
// inventing a second visual language for the same information. Caller wraps
// the portrait in a same-sized, position:relative box (see
// .unit-card-portrait-wrap in App.css) for this to land on correctly.
export function CurrencyCornerBadge({ currencyType }: { currencyType?: string | null }) {
  if (!currencyType) return null;
  return (
    <CornerIcon
      corner="currency"
      src={currencyIcon(CURRENCY_ICON_FILES[currencyType])}
      label={currencyLabel(currencyType)}
    />
  );
}

interface OmicronBadgeProps {
  unit: Unit | null | undefined;
  omicronAbilityIds: string[];
}

// req.omicron_ability_ids holds skill_ids; resolve display names against the
// unit's own abilities list (same "derive from real data at render time"
// pattern EnergyBadge uses via derivedEnergyTypes). No Greek-letter symbol
// here (unlike Energy/Currency) - the capital Omicron glyph (Ο) is visually
// indistinguishable from a Latin "O", so a plain text label avoids confusion.
export function OmicronBadge({ unit, omicronAbilityIds }: OmicronBadgeProps) {
  const ids = omicronAbilityIds || [];
  if (ids.length === 0) return null;
  const abilities = unit?.abilities || [];
  return (
    <>
      {ids.map((skillId) => {
        const ability = abilities.find((a) => a.skill_id === skillId);
        return (
          <span key={skillId} className="badge badge-omicron" title="Needs Omicron Material">
            Omicron: {ability?.name || skillId}
          </span>
        );
      })}
    </>
  );
}

// Advisory, not a requirement - styled distinctly from OmicronBadge so it
// doesn't read as "needed."
export function LstBadge({ lstTiers }: { lstTiers: string[] }) {
  const tiers = lstTiers || [];
  if (tiers.length === 0) return null;
  return (
    <>
      {tiers.map((tier) => (
        <span key={tier} className="badge badge-lst" title={lstTierTitle(tier)}>
          Consider: {tier}
        </span>
      ))}
    </>
  );
}

export function StatusDot({ met }: { met: boolean }) {
  return <span className={`status-dot ${met ? 'status-met' : 'status-unmet'}`} />;
}

// A real campaign node's energy type is unambiguous - these are the only
// 4 daily-battle campaigns comlink reports, see import_farming_locations.py.
export const CAMPAIGN_ENERGY: Record<string, string> = {
  'Cantina Battles': 'cantina',
  'Light Side Battles': 'normal',
  'Dark Side Battles': 'normal',
  'Fleet Battles': 'ship',
};

// Energy types reflect the unit's real farming_locations filtered by which
// ones were checked (req.energy_locations) - null means "Any" (untouched
// default, show every real energy type); [] means explicitly none were
// checked (don't show any). Units with no real energy locations at all fall
// back to the manually-set energy_type.
export function derivedEnergyTypes(req: SystemRequirement): string[] {
  const locs = req.unit?.farming_locations || [];
  const energyLocs = locs.filter((l) => CAMPAIGN_ENERGY[l.campaign_name]);
  if (energyLocs.length === 0) {
    return req.energy_type ? [req.energy_type] : [];
  }
  const selected =
    req.energy_locations == null
      ? energyLocs
      : energyLocs.filter((l) => req.energy_locations!.includes(l.campaign_name));
  return [...new Set(selected.map((l) => CAMPAIGN_ENERGY[l.campaign_name]))];
}

interface CornerIconProps {
  corner: string;
  src: string | undefined;
  label: string;
  stackIndex?: number;
  textFallback?: string;
}

// One small overlaid icon, absolutely positioned at a corner of
// .req-portrait-wrap. `stackIndex` offsets later icons in the same corner's
// cascade further out + on top of earlier ones (see .req-corner-stack in
// App.css) - 0 is the back of the stack, higher is more in front.
function CornerIcon({ corner, src, label, stackIndex = 0, textFallback }: CornerIconProps) {
  const style = { '--stack-index': stackIndex } as React.CSSProperties;
  return (
    <span className={`req-corner-badge req-corner-badge--${corner}`} style={style} title={label}>
      {src ? <img src={src} alt="" /> : <span className="req-corner-badge-text">{textFallback}</span>}
    </span>
  );
}

// The 4-corner requirement card used by the Visualise (Flow) view's squad
// nodes - top-left required gear/relic tier, top-right Omicron material (if
// needed), bottom-left farming energy type(s), bottom-right purchase
// currency/currencies then any advisory LST shortcut(s) on top. Mirrors what
// StepCard's RequirementRow shows as text pills, just as portrait overlays.
export function RequirementPortrait({ req }: { req: SystemRequirement }) {
  const { unit, gear_tier: gearTier, relic_tier: relicTier } = req;
  const tierLabel = relicTier != null ? `R${relicTier}` : gearTier != null ? `G${gearTier}` : null;
  const tierVariant = relicTier != null ? 'relic' : 'gear';

  const energyTypes = derivedEnergyTypes(req);
  const currencyTypes = req.currency_types || [];
  const lstTiers = req.lst_tiers || [];
  const omicronIds = req.omicron_ability_ids || [];

  return (
    <div className="req-portrait-wrap">
      <UnitPortrait unit={unit} />
      {tierLabel && (
        <span className={`req-corner-badge req-corner-badge--tier req-corner-badge--${tierVariant}`}>
          {tierLabel}
        </span>
      )}
      {omicronIds.length > 0 && (
        <CornerIcon corner="omicron" src={currencyIcon(OMICRON_ICON_FILE)} label="Needs Omicron Material" />
      )}
      {energyTypes.map((energyType, i) => (
        <CornerIcon
          key={energyType}
          corner="energy"
          stackIndex={i}
          src={currencyIcon(ENERGY_ICON_FILES[energyType])}
          label={ENERGY_STYLES[energyType]?.fullLabel || energyType}
        />
      ))}
      {currencyTypes.map((currencyType, i) => (
        <CornerIcon
          key={currencyType}
          corner="currency"
          stackIndex={i}
          src={currencyIcon(CURRENCY_ICON_FILES[currencyType])}
          label={currencyLabel(currencyType)}
        />
      ))}
      {lstTiers.map((tier, i) => (
        <CornerIcon
          key={tier}
          corner="currency"
          stackIndex={currencyTypes.length + i}
          src={currencyIcon(LST_ICON_FILES[tier])}
          label={lstTierTitle(tier)}
          textFallback="LST"
        />
      ))}
    </div>
  );
}

export function locationDetailLabel(loc: FarmingLocation | null | undefined): string | null {
  if (!loc) return null;
  const tableNum = loc.table_id ? parseInt(loc.table_id.replace(/^M/, ''), 10) : null;

  const parts: string[] = [];
  if (tableNum && loc.node_letter) {
    parts.push(`Node ${tableNum}-${loc.node_letter}`);
  } else if (tableNum) {
    parts.push(`T${tableNum}`);
  }
  if (loc.difficulty) parts.push(loc.difficulty);
  return parts.join(' · ') || null;
}
