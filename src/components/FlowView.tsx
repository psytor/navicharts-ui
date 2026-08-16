import { useMemo } from 'react';
import { ReactFlow, Controls, MiniMap, type Node } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { buildFlowGraph } from '../flowGraph';
import { SystemFlowNode, WaypointFlowNode, QuadrantGroupNode, SectorGroupNode, RoutedPrerequisiteEdge } from './FlowNodes';
import { SquadList } from './SquadBuilder';
import type { StarChart, Sector } from '../types';

const nodeTypes = {
  systemNode: SystemFlowNode,
  waypointNode: WaypointFlowNode,
  quadrantGroup: QuadrantGroupNode,
  sectorGroup: SectorGroupNode,
};

const edgeTypes = {
  routedPrerequisite: RoutedPrerequisiteEdge,
};

// The MiniMap fills every node with a flat color of its own - with no
// nodeColor given, that's the same shade for a whole Quadrant box, its
// nested Sector boxes, and every card inside, so it reads as one solid
// block instead of showing the real Sector groupings. Sector boxes get
// their real color (already a valid CSS color name, e.g. "purple");
// Quadrant boxes stay transparent (they're just the outer wrapper); leaf
// cards stay faint so the Sector color underneath is what actually reads.
function minimapNodeColor(node: Node): string {
  if (node.type === 'sectorGroup') return (node.data.sector as Sector).color || '#666';
  if (node.type === 'quadrantGroup') return 'transparent';
  return 'rgba(255, 255, 255, 0.18)';
}

export function FlowView({ starChart }: { starChart: StarChart }) {
  const { nodes, edges } = useMemo(() => buildFlowGraph(starChart), [starChart]);

  return (
    <div className="flow-view">
      <div className="flow-view-canvas chamfered-box-lg">
        <div className="chamfered-diagonal-border chamfered-diagonal-tl" style={{ color: 'var(--amber)' }} />
        <div className="chamfered-diagonal-border chamfered-diagonal-tr" style={{ color: 'var(--amber)' }} />
        <div className="chamfered-diagonal-border chamfered-diagonal-bl" style={{ color: 'var(--amber)' }} />
        <div className="chamfered-diagonal-border chamfered-diagonal-br" style={{ color: 'var(--amber)' }} />
        <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes} fitView minZoom={0.1}>
          <Controls />
          <MiniMap pannable zoomable nodeColor={minimapNodeColor} nodeStrokeWidth={0} maskColor="rgba(0, 0, 0, 0.55)" />
        </ReactFlow>
      </div>
      <SquadList />
    </div>
  );
}
