import { useMemo } from 'react';
import { ReactFlow, Controls, MiniMap } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { buildFlowGraph } from '../flowGraph';
import { SquadFlowNode, RewardFlowNode, QuadrantGroupNode, RoutedSectorEdge } from './FlowNodes';
import { SquadList } from './SquadBuilder';
import type { StarChart } from '../types';

const nodeTypes = {
  squadNode: SquadFlowNode,
  rewardNode: RewardFlowNode,
  quadrantGroup: QuadrantGroupNode,
};

const edgeTypes = {
  routedSector: RoutedSectorEdge,
};

export function FlowView({ starChart }: { starChart: StarChart }) {
  const { nodes, edges } = useMemo(() => buildFlowGraph(starChart), [starChart]);

  return (
    <div className="flow-view">
      <div className="flow-view-canvas bracket-panel">
        <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes} fitView minZoom={0.1}>
          <Controls />
          <MiniMap pannable zoomable />
        </ReactFlow>
      </div>
      <SquadList />
    </div>
  );
}
