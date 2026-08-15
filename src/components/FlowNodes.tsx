import { BaseEdge, Handle, Position } from '@xyflow/react';
import {
  UnitPortrait, RequirementPortrait, StatusDot, derivedEnergyTypes, currencyLabel, UNIT_REWARD_TYPES,
} from './Badge';
import type { Sector, Reward, SectorRequirement, Quadrant } from '../types';

// Path is precomputed in flowGraph.ts's routeOrthogonal (full canvas
// geometry, obstacle-aware) rather than derived from this edge's own
// source/target handle positions, so it can duck around unrelated cards -
// something React Flow's built-in path helpers can't do since they only ever
// see the two endpoints.
interface RoutedSectorEdgeProps {
  data?: { path: string };
  style?: React.CSSProperties;
  markerEnd?: string;
  markerStart?: string;
}

export function RoutedSectorEdge({ data, style, markerEnd, markerStart }: RoutedSectorEdgeProps) {
  return <BaseEdge path={data?.path ?? ''} style={style} markerEnd={markerEnd} markerStart={markerStart} />;
}

function requirementTitle(req: SectorRequirement): string {
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

export function SquadFlowNode({ data }: { data: { sector: Sector } }) {
  const { sector } = data;
  return (
    <div className={`squad-flow-node ${sector.status ? 'squad-flow-node-complete' : ''}`}>
      <Handle type="target" position={Position.Top} id="in" />
      {sector.squad_name && <div className="squad-flow-node-header">{sector.squad_name}</div>}
      <div className="squad-flow-node-reqs">
        {sector.requirements.map((req) => (
          <div className="squad-flow-node-req" key={req.id} title={requirementTitle(req)}>
            <StatusDot met={req.met} />
            <RequirementPortrait req={req} />
          </div>
        ))}
      </div>
      <Handle type="source" position={Position.Bottom} id="out" />
    </div>
  );
}

// No manual toggle for any reward type - unit-shaped rewards
// (character_unlock/ship_unlock/capital_ship) show the "complete" styling
// derived server-side from the roster snapshot (7*); assault_battle/
// feature_unlock rewards have no completion signal at all, so they never
// get that styling regardless of the stored (now-unused) flag.
export function RewardFlowNode({ data }: { data: { reward: Reward } }) {
  const { reward } = data;
  const isComplete = UNIT_REWARD_TYPES.has(reward.reward_type) && reward.completed;

  // reward.event is resolved backend-side: either the reward's own picked
  // event (assault_battle) or, for unit-linked reward types, its unit's
  // real unlock event (Legendary/Journey/Galactic Legend/Fleet Mastery) -
  // so any reward type can end up with real banner art, not just
  // assault_battle.
  const isBanner = !!reward.event?.image_url;

  return (
    <div
      className={`reward-flow-node ${isComplete ? 'reward-flow-node-complete' : ''}`}
      title={`${reward.name} (${reward.reward_type.replace(/_/g, ' ')})`}
    >
      <Handle type="target" position={Position.Top} id="in" />
      {isBanner ? (
        <div className="reward-flow-node-banner">
          <img
            className="reward-flow-node-banner-img"
            src={reward.event!.image_url ?? undefined}
            alt={reward.name}
            loading="lazy"
            onError={(e) => {
              (e.target as HTMLImageElement).style.visibility = 'hidden';
            }}
          />
          <span className="reward-flow-node-banner-name">{reward.name}</span>
        </div>
      ) : (
        <div className="reward-flow-node-hex">
          <UnitPortrait unit={reward.unit} />
          <span className="reward-flow-node-name">{reward.name}</span>
          <span className="reward-flow-node-type">{reward.reward_type.replace(/_/g, ' ')}</span>
        </div>
      )}
    </div>
  );
}

export function QuadrantGroupNode({ data }: { data: { quadrant: Quadrant } }) {
  const { quadrant } = data;
  const color = quadrant.color || '#666';
  return (
    <div className="quadrant-group-node" style={{ color }}>
      <div className="quadrant-group-node-label">
        <span className="quadrant-index">{String(quadrant.order_index + 1).padStart(2, '0')}</span>
        <span className="quadrant-dot" style={{ background: color }} />
        <span className="quadrant-name">{quadrant.name}</span>
      </div>
    </div>
  );
}
