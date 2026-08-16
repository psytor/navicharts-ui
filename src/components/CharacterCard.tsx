import { Card } from 'astrogators-shared-ui';
import { UnitPortrait } from './Badge';
import type { Unit, UnitWithRoster, RosterSnapshot } from '../types';

const icons = import.meta.glob('../assets/gear-icons/*.png', { eager: true, import: 'default' }) as Record<string, string>;

function icon(name: string): string {
  return icons[`../assets/gear-icons/${name}.png`];
}

// Confirmed by cropping: these 3 tiers are already a baked left+right pair
// (104px wide, MirrorHorizontal: false in the sprite JSON) - every other
// tier is a single 52-60px crescent (MirrorHorizontal: true) meant to be
// mirrored into the other half.
const BAKED_PAIR_TIERS = new Set([5, 8, 10]);

// Crescent gear tiers split into two real groups by their actual authored
// Unity 9-slice Border value (tmp/game_assets/OutPut/shared/sprites/
// unit_atlas/unit_atlas.json, TierHighlight1..12 - BorderLeft/BorderRight,
// equal both sides for every one of these): tiers 1/2/3 are Border 18;
// tiers 4/6/7/9/11/12 are all Border 16 - one single group, not split
// across two CSS treatments the way an earlier pass here had it (which
// wrongly lumped 4/6/7 in with 1/2/3 instead of 9/11/12). Every tier in the
// same real group gets the exact same pull-in offset - no per-tier tuning.
const CRESCENT_FLUSH_TIERS = new Set([4, 6, 7, 9, 11, 12]);
const PAIR_FLUSH_TIERS = new Set([8, 10]);

function alignmentSuffix(unit: Unit): string {
  if (unit.alignment === 'dark') return 'dark';
  if (unit.alignment === 'light') return 'light';
  return 'neutral';
}

interface RingSource {
  mode: 'mirror' | 'pair';
  variant: 'gear' | 'alignment';
  src: string;
  muted: boolean;
  flush: boolean;
}

// gear_level 1-12 while not relic-unlocked -> tier-colored crescent (real
// per-tier color from the sprite). gear_level >= 13 OR any relic_tier > 0
// -> alignment-colored tier-13 crescent (red/dark, blue/light, grey/neutral).
function ringSource(unit: Unit, snap: RosterSnapshot | null | undefined): RingSource {
  if (!snap) {
    return { mode: 'mirror', variant: 'gear', src: icon('gear_ring_1'), muted: true, flush: false };
  }
  const gearLevel = snap.gear_level ?? 1;
  const relicTier = snap.relic_tier ?? 0;
  if (gearLevel >= 13 || relicTier > 0) {
    return {
      mode: 'mirror',
      variant: 'alignment',
      src: icon(`gear_ring_13_${alignmentSuffix(unit)}`),
      muted: false,
      flush: false,
    };
  }
  const tier = Math.min(Math.max(gearLevel, 1), 12);
  const isPair = BAKED_PAIR_TIERS.has(tier);
  return {
    mode: isPair ? 'pair' : 'mirror',
    variant: 'gear',
    src: icon(`gear_ring_${tier}`),
    muted: false,
    flush: isPair ? PAIR_FLUSH_TIERS.has(tier) : CRESCENT_FLUSH_TIERS.has(tier),
  };
}

interface BottomBadge {
  kind: 'relic' | 'level';
  src: string;
  number: number | string;
}

// Small badge over the portrait's bottom edge - carries whichever number is
// currently relevant (relic tier once relic-unlocked, otherwise character
// level). The relic badge is alignment-colored; the level badge is a single
// fixed color (LevelWidgetBG) with its own Galactic Legend gold variant.
// Takes `snapshot` directly (not `unit.latest_snapshot`) for the same reason
// as ringSource above - callers outside Inventory don't have it on `unit`.
function bottomBadge(unit: Unit, snapshot: RosterSnapshot | null | undefined): BottomBadge {
  const relicTier = snapshot?.relic_tier ?? 0;
  if (relicTier > 0) {
    if (unit.is_galactic_legend) return { kind: 'relic', src: icon('relic_badge_gl'), number: relicTier };
    if (unit.alignment === 'dark') return { kind: 'relic', src: icon('relic_badge_dark'), number: relicTier };
    if (unit.alignment === 'light') return { kind: 'relic', src: icon('relic_badge_light'), number: relicTier };
    return { kind: 'relic', src: icon('relic_badge_neutral'), number: relicTier };
  }
  return {
    kind: 'level',
    src: unit.is_galactic_legend ? icon('level_badge_gl') : icon('level_badge'),
    number: snapshot?.level ?? '',
  };
}

interface GearRingPortraitProps {
  unit: Unit;
  snapshot: RosterSnapshot | null | undefined;
}

// The portrait + gear ring + relic/level badge block - the piece of
// CharacterCard that actually shows current gear/relic progress at a
// glance. Split out so other views (e.g. Roadmap's Gearing Order) can reuse
// the exact same rendering instead of a plain portrait. `snapshot` is passed
// explicitly rather than read off `unit.latest_snapshot` because callers
// outside Inventory (where units come from a separate roster-annotated
// fetch) only have a snapshot via their own unit-id -> snapshot map.
export function GearRingPortrait({ unit, snapshot }: GearRingPortraitProps) {
  const owned = !!snapshot;
  const badge = owned ? bottomBadge(unit, snapshot) : null;

  const ring = ringSource(unit, snapshot);
  const ringClass = `character-card-ring${ring.muted ? ' character-card-ring--muted' : ''}`;
  const flushClass = ring.flush ? ' character-card-ring--flush' : '';

  return (
    <div className="character-card-portrait-wrap">
      <UnitPortrait unit={unit} />
      {ring.mode === 'pair' ? (
        <img className={`character-card-ring-pair ${ringClass}${flushClass}`} src={ring.src} alt="" />
      ) : (
        <>
          <span
            className={`character-card-ring-crescent character-card-ring-crescent--left character-card-ring-crescent--${ring.variant} ${ringClass}${flushClass}`}
          >
            <img src={ring.src} alt="" />
          </span>
          <span
            className={`character-card-ring-crescent character-card-ring-crescent--right character-card-ring-crescent--${ring.variant} ${ringClass}${flushClass}`}
          >
            <img src={ring.src} alt="" />
          </span>
        </>
      )}
      {badge ? (
        <>
          <img
            className={`character-card-relic-badge character-card-relic-badge--${badge.kind}`}
            src={badge.src}
            alt=""
          />
          <span className="character-card-number character-card-number--badge">{badge.number}</span>
        </>
      ) : (
        <span className="character-card-number character-card-number--center">–</span>
      )}
    </div>
  );
}

export function CharacterCard({ unit }: { unit: UnitWithRoster }) {
  const snap = unit.latest_snapshot;
  const owned = !!snap;
  const stars = snap?.stars ?? 0;

  return (
    <Card chamfered chamferSize="sm" hoverable padding="sm" className={`character-card ${owned ? '' : 'character-card--unowned'}`}>
      <GearRingPortrait unit={unit} snapshot={snap} />
      <div className="character-card-stars">
        {Array.from({ length: 7 }, (_, i) => (
          <img key={i} src={i < stars ? icon('rarity_star') : icon('rarity_star_empty')} alt="" />
        ))}
      </div>
      <span className="character-card-name">{unit.name}</span>
    </Card>
  );
}
