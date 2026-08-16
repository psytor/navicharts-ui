import { BaseEdge, Handle, Position } from '@xyflow/react';
import {
  UnitPortrait, RequirementPortrait, StatusDot, derivedEnergyTypes, currencyLabel, UNIT_WAYPOINT_TYPES,
  retryableImgOnError,
} from './Badge';
import type { System, Waypoint, SystemRequirement, Quadrant, Sector } from '../types';

// Path is precomputed in flowGraph.ts's routeOrthogonal (full canvas
// geometry, obstacle-aware) rather than derived from this edge's own
// source/target handle positions, so it can duck around unrelated cards -
// something React Flow's built-in path helpers can't do since they only ever
// see the two endpoints.
interface RoutedPrerequisiteEdgeProps {
  data?: { path: string };
  style?: React.CSSProperties;
  markerEnd?: string;
  markerStart?: string;
}

export function RoutedPrerequisiteEdge({ data, style, markerEnd, markerStart }: RoutedPrerequisiteEdgeProps) {
  return <BaseEdge path={data?.path ?? ''} style={style} markerEnd={markerEnd} markerStart={markerStart} />;
}

function requirementTitle(req: SystemRequirement): string {
  const parts = [req.unit.name];
  if (req.relic_tier != null) parts.push(`R${req.relic_tier}`);
  else if (req.gear_tier != null) parts.push(`G${req.gear_tier}`);
  if (req.target_stars != null) parts.push(`${req.target_stars}★`);

  const energyTypes = derivedEnergyTypes(req);
  if (energyTypes.length > 0) parts.push(energyTypes.join('/'));
  (req.currency_types || []).forEach((c) => parts.push(currencyLabel(c)));
  (req.lst_tiers || []).forEach((t) => parts.push(`Consider: ${t}`));

  return parts.join(' · ');
}

export function SystemFlowNode({ data }: { data: { system: System } }) {
  const { system } = data;
  return (
    <div className={`system-flow-node chamfered-box-sm ${system.status ? 'system-flow-node-complete' : ''}`}>
      {system.status && (
        <>
          <div className="chamfered-diagonal-border chamfered-diagonal-tl" style={{ color: 'var(--met)' }} />
          <div className="chamfered-diagonal-border chamfered-diagonal-tr" style={{ color: 'var(--met)' }} />
          <div className="chamfered-diagonal-border chamfered-diagonal-bl" style={{ color: 'var(--met)' }} />
          <div className="chamfered-diagonal-border chamfered-diagonal-br" style={{ color: 'var(--met)' }} />
        </>
      )}
      <Handle type="target" position={Position.Top} id="in" />
      {system.name && <div className="system-flow-node-header">{system.name}</div>}
      <div className="system-flow-node-reqs">
        {system.requirements.map((req) => (
          <div className="system-flow-node-req" key={req.id} title={requirementTitle(req)}>
            <StatusDot met={req.met} />
            <RequirementPortrait req={req} />
          </div>
        ))}
      </div>
      <Handle type="source" position={Position.Bottom} id="out" />
    </div>
  );
}

// No manual toggle for any waypoint type - unit-shaped waypoints
// (character_unlock/ship_unlock/capital_ship) show the "complete" styling
// derived server-side from the roster snapshot (7*); assault_battle/
// feature_unlock waypoints have no completion signal at all, so they never
// get that styling regardless of the stored (now-unused) flag.
export function WaypointFlowNode({ data }: { data: { waypoint: Waypoint } }) {
  const { waypoint } = data;
  const isComplete = UNIT_WAYPOINT_TYPES.has(waypoint.waypoint_type) && waypoint.completed;

  // waypoint.event is resolved backend-side: either the waypoint's own
  // picked event (assault_battle) or, for unit-linked waypoint types, its
  // unit's real unlock event (Legendary/Journey/Galactic Legend/Fleet
  // Mastery) - so any waypoint type can end up with real banner art, not
  // just assault_battle.
  const isBanner = !!waypoint.event?.image_url;

  return (
    <div
      className={`reward-flow-node ${isComplete ? 'reward-flow-node-complete' : ''}`}
      title={`${waypoint.name} (${waypoint.waypoint_type.replace(/_/g, ' ')})`}
    >
      <Handle type="target" position={Position.Top} id="in" />
      {isBanner ? (
        <div className="reward-flow-node-banner">
          <img
            className="reward-flow-node-banner-img"
            src={waypoint.event!.image_url ?? undefined}
            alt={waypoint.name}
            loading="lazy"
            onError={retryableImgOnError()}
          />
          <span className="reward-flow-node-banner-name">{waypoint.name}</span>
        </div>
      ) : (
        <div className="reward-flow-node-hex">
          <UnitPortrait unit={waypoint.unit} />
          <span className="reward-flow-node-name">{waypoint.name}</span>
          <span className="reward-flow-node-type">{waypoint.waypoint_type.replace(/_/g, ' ')}</span>
        </div>
      )}
    </div>
  );
}

// A Quadrant ("Episode") has no color of its own - that's a Sector-level
// property now (see SectorGroupNode below) - so the group label is neutral,
// just the index/name.
export function QuadrantGroupNode({ data }: { data: { quadrant: Quadrant } }) {
  const { quadrant } = data;
  return (
    <div className="quadrant-group-node">
      <div className="quadrant-group-node-label">
        <span className="quadrant-index">{String(quadrant.order_index + 1).padStart(2, '0')}</span>
        <span className="quadrant-name">{quadrant.name}</span>
      </div>
    </div>
  );
}

// One Sector's dashed box, nested inside its Quadrant's box - same visual
// language as QuadrantGroupNode used to have on its own before color moved
// down a level, just colored per-Sector instead of per-Quadrant now.
export function SectorGroupNode({ data }: { data: { sector: Sector } }) {
  const { sector } = data;
  const color = sector.color || '#666';
  return (
    <div className="sector-group-node" style={{ color }}>
      <div className="sector-group-node-label">
        <span className="quadrant-dot" style={{ background: color }} />
        <span className="quadrant-name">{sector.name}</span>
      </div>
    </div>
  );
}
