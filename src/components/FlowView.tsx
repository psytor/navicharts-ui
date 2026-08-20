import { useEffect, useMemo, useState } from 'react';
import { ReactFlow, ReactFlowProvider, Controls, MiniMap, useNodesInitialized, useReactFlow, type Node, type Edge } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { buildFlowGraph, recomputeEdgePaths } from '../flowGraph';
import { SystemFlowNode, WaypointFlowNode, QuadrantGroupNode, SectorGroupNode, RoutedFlowEdge } from './FlowNodes';
import { SquadList } from './SquadBuilder';
import type { StarChart, Sector } from '../types';

const nodeTypes = {
  systemNode: SystemFlowNode,
  waypointNode: WaypointFlowNode,
  quadrantGroup: QuadrantGroupNode,
  sectorGroup: SectorGroupNode,
};

const edgeTypes = {
  routedEdge: RoutedFlowEdge,
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

export function FlowView({ starChart, quadrantId }: { starChart: StarChart; quadrantId?: number | null }) {
  return (
    <ReactFlowProvider>
      <FlowCanvas starChart={starChart} quadrantId={quadrantId} />
    </ReactFlowProvider>
  );
}

// Split out from FlowView so useNodesInitialized()/useReactFlow() below
// have the ReactFlowProvider context they need (those hooks only work in a
// descendant of the provider, not in the same component that also renders
// <ReactFlow> itself).
function FlowCanvas({ starChart, quadrantId }: { starChart: StarChart; quadrantId?: number | null }) {
  const built = useMemo(() => buildFlowGraph(starChart, quadrantId), [starChart, quadrantId]);
  const [edges, setEdges] = useState<Edge[]>(built.edges);
  // Resets `edges` whenever a new layout is built, without the extra
  // render an effect-based sync would cost - adjusting state during render
  // (rather than in a useEffect) for a value that's purely derived from a
  // prop/memo is the React-recommended pattern for this.
  const [syncedBuilt, setSyncedBuilt] = useState(built);
  if (built !== syncedBuilt) {
    setSyncedBuilt(built);
    setEdges(built.edges);
  }
  const { getNodes } = useReactFlow();

  // flowGraph.ts's dagre pass estimates each card's size (see its own size
  // constants comment) - those estimates can drift from the real rendered
  // CSS size, which is exactly what lets a routed edge cut through a card
  // instead of ducking around it. Once React Flow reports every node's real
  // measured size, recompute just the edge paths against corrected obstacle
  // rects - node positions are left exactly as dagre placed them, so
  // nothing visibly reflows after first paint.
  const nodesInitialized = useNodesInitialized();
  useEffect(() => {
    if (!nodesInitialized) return;
    setEdges((current) => recomputeEdgePaths(getNodes(), current, built.absoluteRects));
  }, [nodesInitialized, built, getNodes]);

  return (
    <div className="flow-view">
      <div className="flow-view-canvas chamfered-box-lg">
        <div className="chamfered-diagonal-border chamfered-diagonal-tl" style={{ color: 'var(--color-primary)' }} />
        <div className="chamfered-diagonal-border chamfered-diagonal-tr" style={{ color: 'var(--color-primary)' }} />
        <div className="chamfered-diagonal-border chamfered-diagonal-bl" style={{ color: 'var(--color-primary)' }} />
        <div className="chamfered-diagonal-border chamfered-diagonal-br" style={{ color: 'var(--color-primary)' }} />
        <ReactFlow nodes={built.nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes} fitView minZoom={0.1}>
          <Controls />
          <MiniMap pannable zoomable nodeColor={minimapNodeColor} nodeStrokeWidth={0} maskColor="rgba(0, 0, 0, 0.55)" />
        </ReactFlow>
      </div>
      <SquadList starChart={starChart} quadrantId={quadrantId} />
    </div>
  );
}
