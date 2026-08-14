import dagre from '@dagrejs/dagre';
import type { Node, Edge } from '@xyflow/react';
import type { StarChart, Quadrant, Sector, Reward } from './types';

// Sized for RequirementPortrait's 56px corner-badge portraits (see
// req-portrait-wrap in App.css), not DOM-measured - these are estimates fed
// to dagre + the obstacle-aware edge router below, so they need to track
// the actual rendered .squad-flow-node-req size or edges route through the
// (now much bigger) cards. Retune here first if a squad box's edges/borders
// look wrong once the corner badges are in the browser.
const SQUAD_NODE_WIDTH = 280;
const SQUAD_ROW_HEIGHT = 72;
const SQUAD_HEADER_HEIGHT = 40;
const REQS_PER_ROW = 3;
const REWARD_NODE_WIDTH = 140;
const REWARD_NODE_HEIGHT = 70;
const RANK_SEP = 70;
const NODE_SEP = 40;
const CLUSTER_PADDING = 40;
const CLUSTER_GUTTER = 160;

const OBSTACLE_MARGIN = 14;
const EDGE_STUB = 22;
const CLEAR_SEARCH_STEP = 12;
const CLEAR_SEARCH_MAX_STEPS = 250;
const EDGE_CORNER_RADIUS = 10;

function squadNodeHeight(sector: Sector): number {
  const rows = Math.max(1, Math.ceil((sector.requirements.length || 1) / REQS_PER_ROW));
  return SQUAD_HEADER_HEIGHT + rows * SQUAD_ROW_HEIGHT;
}

interface RawSectorEdge {
  id: string;
  source: string;
  target: string;
  sourceQuadrantId: number;
  targetQuadrantId: number | undefined;
  crossQuadrant: boolean;
}

interface RawRewardEdge {
  id: string;
  source: string;
  target: string;
  crossQuadrant: boolean;
}

// Walks starChart.quadrants[].sectors[] and produces the raw (unpositioned)
// graph shape: one node per Sector ("squadNode"), one node per Reward
// ("rewardNode"), grouped by their owning Quadrant. Edges come from two
// places - sector.rewards (implicit, no DB edge exists for "a sector unlocks
// its own reward") and sector.downstream_sector_ids (explicit SectorEdge
// rows, which may cross quadrants). Rewards are always edge targets, never
// sources: nothing in the data model ever originates an edge from a reward
// node.
export function deriveGraph(starChart: StarChart) {
  const sectorQuadrant = new Map<number, Quadrant>();
  starChart.quadrants.forEach((quadrant) => {
    quadrant.sectors.forEach((sector) => sectorQuadrant.set(sector.id, quadrant));
  });

  const quadrants = [...starChart.quadrants].sort((a, b) => a.order_index - b.order_index);
  const sectorEdges: RawSectorEdge[] = [];
  const rewardEdges: RawRewardEdge[] = [];

  starChart.quadrants.forEach((quadrant) => {
    quadrant.sectors.forEach((sector) => {
      sector.rewards.forEach((reward) => {
        rewardEdges.push({
          id: `r-${sector.id}-${reward.id}`,
          source: `sector-${sector.id}`,
          target: `reward-${reward.id}`,
          crossQuadrant: false,
        });
      });
      sector.downstream_sector_ids.forEach((targetId) => {
        const targetQuadrant = sectorQuadrant.get(targetId);
        sectorEdges.push({
          id: `e-${sector.id}-${targetId}`,
          source: `sector-${sector.id}`,
          target: `sector-${targetId}`,
          sourceQuadrantId: quadrant.id,
          targetQuadrantId: targetQuadrant?.id,
          crossQuadrant: !!targetQuadrant && targetQuadrant.id !== quadrant.id,
        });
      });
    });
  });

  return { quadrants, sectorEdges, rewardEdges };
}

const LANE_GUTTER = 48;

interface PositionedNode {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface NodeMeta {
  width: number;
  height: number;
}

// dagre-lays-out a single connected component (one chain of sectors/rewards)
// on its own, returning node positions relative to that component alone.
function layoutComponent(nodeIds: string[], nodeMeta: Map<string, NodeMeta>, edges: [string, string][]) {
  if (nodeIds.length === 1) {
    const id = nodeIds[0];
    const { width, height } = nodeMeta.get(id)!;
    return { nodes: [{ id, x: 0, y: 0, width, height }], width, height };
  }

  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'TB', ranksep: RANK_SEP, nodesep: NODE_SEP });
  g.setDefaultEdgeLabel(() => ({}));
  nodeIds.forEach((id) => g.setNode(id, nodeMeta.get(id)!));
  edges.forEach(([a, b]) => g.setEdge(a, b));
  dagre.layout(g);

  const nodes: PositionedNode[] = [];
  let maxX = 0;
  let maxY = 0;
  g.nodes().forEach((id) => {
    const { x, y, width, height } = g.node(id);
    const left = x - width / 2;
    const top = y - height / 2;
    nodes.push({ id, x: left, y: top, width, height });
    maxX = Math.max(maxX, left + width);
    maxY = Math.max(maxY, top + height);
  });
  return { nodes, width: maxX, height: maxY };
}

// A quadrant's sectors often aren't one single chain - e.g. "Start Here" has
// two prep sectors whose only children live in OTHER quadrants, so within
// this quadrant they're leaves with nothing below them. Running one flat
// dagre pass over the whole quadrant puts every parentless sector in the
// same top rank (dagre has no reason not to), which stretches the box
// exactly as wide as the busiest rank and leaves those leaf columns' lower
// rows empty - reading as "spread across the whole box" instead of the
// reference guide's tight, self-contained lanes. So instead: find each
// weakly-connected component within the quadrant's own sector/reward graph
// (ignoring cross-quadrant edges, which are handled separately), lay each
// one out on its own, then pack the resulting lanes snugly left-to-right -
// every lane is exactly as wide as its own content, in the quadrant's
// original sector order.
function layoutQuadrantCluster(quadrant: Quadrant) {
  const sectorIds = new Set(quadrant.sectors.map((s) => `sector-${s.id}`));
  const nodeMeta = new Map<string, NodeMeta>();
  const adjacency = new Map<string, Set<string>>();
  const edgeList: [string, string][] = [];
  const laneOrder = new Map<string, number>();

  function link(a: string, b: string) {
    adjacency.get(a)!.add(b);
    adjacency.get(b)!.add(a);
  }

  quadrant.sectors.forEach((sector) => {
    const sectorKey = `sector-${sector.id}`;
    nodeMeta.set(sectorKey, { width: SQUAD_NODE_WIDTH, height: squadNodeHeight(sector) });
    adjacency.set(sectorKey, new Set());
    laneOrder.set(sectorKey, sector.order_index);

    sector.rewards.forEach((reward) => {
      const rewardKey = `reward-${reward.id}`;
      nodeMeta.set(rewardKey, { width: REWARD_NODE_WIDTH, height: REWARD_NODE_HEIGHT });
      adjacency.set(rewardKey, new Set());
      laneOrder.set(rewardKey, sector.order_index);
      edgeList.push([sectorKey, rewardKey]);
    });

    sector.downstream_sector_ids.forEach((targetId) => {
      const targetKey = `sector-${targetId}`;
      if (sectorIds.has(targetKey)) edgeList.push([sectorKey, targetKey]);
    });
  });

  edgeList.forEach(([a, b]) => link(a, b));

  const visited = new Set<string>();
  const components: string[][] = [];
  for (const id of nodeMeta.keys()) {
    if (visited.has(id)) continue;
    visited.add(id);
    const queue = [id];
    const comp: string[] = [];
    while (queue.length) {
      const cur = queue.shift()!;
      comp.push(cur);
      for (const neighbour of adjacency.get(cur)!) {
        if (!visited.has(neighbour)) {
          visited.add(neighbour);
          queue.push(neighbour);
        }
      }
    }
    components.push(comp);
  }

  components.sort(
    (a, b) => Math.min(...a.map((id) => laneOrder.get(id)!)) - Math.min(...b.map((id) => laneOrder.get(id)!))
  );

  const lanes = components.map((comp) => {
    const compSet = new Set(comp);
    const compEdges = edgeList.filter(([a, b]) => compSet.has(a) && compSet.has(b));
    const laneMeta = new Map(comp.map((id) => [id, nodeMeta.get(id)!]));
    return layoutComponent(comp, laneMeta, compEdges);
  });

  const { nodes, width, height } = packLanes(lanes);
  return { quadrant, nodes, width, height };
}

interface Lane {
  nodes: PositionedNode[];
  width: number;
  height: number;
}

// Giving every independent chain its own full-height column (as if each were
// a column in a grid) leaves a tall dead void under any short chain sitting
// next to a much taller one - e.g. a single-step prep like "Kylo Ren" next to
// a four-step chain. A simple shelf/bin-pack (first-fit-decreasing) instead
// stacks short chains on top of each other within a column, so the box is
// only as tall as its tallest chain actually requires and short chains read
// as grouped together rather than orphaned in empty space.
function packLanes(lanes: Lane[]) {
  if (lanes.length === 0) return { nodes: [] as PositionedNode[], width: 0, height: 0 };

  const byHeight = [...lanes].sort((a, b) => b.height - a.height);
  const budget = byHeight[0].height;
  const columns: { width: number; usedHeight: number; placements: { lane: Lane; y: number }[] }[] = [];

  byHeight.forEach((lane) => {
    let column = columns.find(
      (col) => col.usedHeight + LANE_GUTTER + lane.height <= budget
    );
    if (!column) {
      column = { width: 0, usedHeight: 0, placements: [] };
      columns.push(column);
    }
    const y = column.placements.length === 0 ? 0 : column.usedHeight + LANE_GUTTER;
    column.placements.push({ lane, y });
    column.usedHeight = y + lane.height;
    column.width = Math.max(column.width, lane.width);
  });

  const nodes: PositionedNode[] = [];
  let cursorX = 0;
  let maxHeight = 0;
  columns.forEach((column) => {
    column.placements.forEach(({ lane, y }) => {
      lane.nodes.forEach((n) => nodes.push({ ...n, x: n.x + cursorX, y: n.y + y }));
    });
    cursorX += column.width + LANE_GUTTER;
    maxHeight = Math.max(maxHeight, column.usedHeight);
  });

  return { nodes, width: Math.max(0, cursorX - LANE_GUTTER), height: maxHeight };
}

type Side = 'left' | 'right' | 'top' | 'bottom';
interface Point { x: number; y: number; }
interface Rect { x: number; y: number; width: number; height: number; }

const rectSide: Record<Side, (r: Rect) => Point> = {
  right: (r) => ({ x: r.x + r.width, y: r.y + r.height / 2 }),
  left: (r) => ({ x: r.x, y: r.y + r.height / 2 }),
  bottom: (r) => ({ x: r.x + r.width / 2, y: r.y + r.height }),
  top: (r) => ({ x: r.x + r.width / 2, y: r.y }),
};

function stepOut(point: Point, side: Side, dist: number): Point {
  switch (side) {
    case 'right':
      return { x: point.x + dist, y: point.y };
    case 'left':
      return { x: point.x - dist, y: point.y };
    case 'bottom':
      return { x: point.x, y: point.y + dist };
    case 'top':
    default:
      return { x: point.x, y: point.y - dist };
  }
}

// True if a travel line at `coord` (a y if axis==="y", an x if axis==="x"),
// spanning `span` along the other axis, clears every obstacle rect by at
// least `margin`. Used to find a corridor a routed edge can run through
// without visually passing under an unrelated card.
function isCoordClear(axis: 'x' | 'y', coord: number, span: [number, number], obstacles: Rect[], margin: number): boolean {
  const [lo, hi] = span;
  return !obstacles.some((o) => {
    if (axis === 'y') {
      const oLo = o.x;
      const oHi = o.x + o.width;
      if (oHi < lo - margin || oLo > hi + margin) return false;
      return coord > o.y - margin && coord < o.y + o.height + margin;
    }
    const oLo = o.y;
    const oHi = o.y + o.height;
    if (oHi < lo - margin || oLo > hi + margin) return false;
    return coord > o.x - margin && coord < o.x + o.width + margin;
  });
}

// Nearest coordinate to `desired` (searching outward in both directions)
// that keeps the travel line clear of every obstacle along `span`.
function pickClearCoord(axis: 'x' | 'y', desired: number, span: [number, number], obstacles: Rect[], margin: number): number {
  if (isCoordClear(axis, desired, span, obstacles, margin)) return desired;
  for (let i = 1; i <= CLEAR_SEARCH_MAX_STEPS; i++) {
    const forward = desired + i * CLEAR_SEARCH_STEP;
    if (isCoordClear(axis, forward, span, obstacles, margin)) return forward;
    const backward = desired - i * CLEAR_SEARCH_STEP;
    if (isCoordClear(axis, backward, span, obstacles, margin)) return backward;
  }
  return desired;
}

function dist(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

// Turns a polyline into an SVG path string with small rounded corners, so a
// manually-routed edge reads visually the same as the smoothstep edges
// elsewhere in the graph instead of looking like a distinct, sharper style.
function roundedPathFromPoints(points: Point[], radius: number): string {
  const pts = points.filter((p, i) => i === 0 || dist(p, points[i - 1]) > 0.5);
  if (pts.length < 2) return '';
  if (pts.length === 2) return `M ${pts[0].x} ${pts[0].y} L ${pts[1].x} ${pts[1].y}`;

  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const prev = pts[i - 1];
    const curr = pts[i];
    const next = pts[i + 1];
    const r = Math.min(radius, dist(prev, curr) / 2, dist(curr, next) / 2);
    const toPrev = { x: curr.x + ((prev.x - curr.x) / dist(prev, curr)) * r, y: curr.y + ((prev.y - curr.y) / dist(prev, curr)) * r };
    const toNext = { x: curr.x + ((next.x - curr.x) / dist(next, curr)) * r, y: curr.y + ((next.y - curr.y) / dist(next, curr)) * r };
    d += ` L ${toPrev.x} ${toPrev.y} Q ${curr.x} ${curr.y} ${toNext.x} ${toNext.y}`;
  }
  const last = pts[pts.length - 1];
  d += ` L ${last.x} ${last.y}`;
  return d;
}

// Builds an orthogonal path from `source` to `target` that actively avoids
// every rect in `obstacles` - unlike React Flow's built-in smoothstep, which
// only knows about the two endpoints and will happily route a line straight
// through (behind) an unrelated card sitting between them. Exit/entry side
// is chosen by which axis actually dominates the source->target direction
// (instead of every edge being forced out the bottom and in the top), and
// the connecting travel line is nudged, via pickClearCoord, into whatever
// nearby gutter is actually free of cards - mirroring how the reference
// guide's hand-routed lines duck around cards instead of crossing them.
function routeOrthogonal(source: Rect, target: Rect, obstacles: Rect[]): Point[] {
  const sCenter = { x: source.x + source.width / 2, y: source.y + source.height / 2 };
  const tCenter = { x: target.x + target.width / 2, y: target.y + target.height / 2 };
  const dx = tCenter.x - sCenter.x;
  const dy = tCenter.y - sCenter.y;
  const horizontal = Math.abs(dx) >= Math.abs(dy);

  let exitSide: Side, entrySide: Side;
  if (horizontal) {
    exitSide = dx >= 0 ? 'right' : 'left';
    entrySide = dx >= 0 ? 'left' : 'right';
  } else {
    exitSide = dy >= 0 ? 'bottom' : 'top';
    entrySide = dy >= 0 ? 'top' : 'bottom';
  }

  const exit = rectSide[exitSide](source);
  const entry = rectSide[entrySide](target);
  const exitStub = stepOut(exit, exitSide, EDGE_STUB);
  const entryStub = stepOut(entry, entrySide, EDGE_STUB);

  let mid: Point[];
  if (horizontal) {
    const span: [number, number] = [Math.min(exitStub.x, entryStub.x), Math.max(exitStub.x, entryStub.x)];
    const clearY = pickClearCoord('y', (exitStub.y + entryStub.y) / 2, span, obstacles, OBSTACLE_MARGIN);
    mid = [
      { x: exitStub.x, y: clearY },
      { x: entryStub.x, y: clearY },
    ];
  } else {
    const span: [number, number] = [Math.min(exitStub.y, entryStub.y), Math.max(exitStub.y, entryStub.y)];
    const clearX = pickClearCoord('x', (exitStub.x + entryStub.x) / 2, span, obstacles, OBSTACLE_MARGIN);
    mid = [
      { x: clearX, y: exitStub.y },
      { x: clearX, y: entryStub.y },
    ];
  }

  return [exit, exitStub, ...mid, entryStub, entry];
}

function buildRoutedSectorEdgePath(source: Rect, target: Rect, obstacles: Rect[]): string {
  return roundedPathFromPoints(routeOrthogonal(source, target, obstacles), EDGE_CORNER_RADIUS);
}

// Arranges quadrant clusters using dagre again, this time treating each
// whole quadrant as a single meta-node sized to its cluster's bounding box,
// with one meta-edge per pair of quadrants that has a real cross-quadrant
// SectorEdge between them. Without this, a naive grid pack (row-major by
// order_index) places quadrants with no regard for which ones actually
// connect, so a cross-quadrant line from column 0 to column 2 has no choice
// but to cut straight through column 1's box - exactly the "lines passing
// under each other" problem. Laying out the meta-graph with LR (quadrants
// connect left-to-right) while each quadrant's own internal squad chain
// stays TB (top-to-bottom) means connected quadrants land adjacent to each
// other, so most cross-quadrant edges only have to bridge a short gap
// between neighbouring boxes instead of crossing unrelated ones.
function layoutQuadrantPositions(clusters: ReturnType<typeof layoutQuadrantCluster>[], sectorEdges: RawSectorEdge[], labelSpace: number): Map<number, { x: number; y: number }> {
  const meta = new dagre.graphlib.Graph();
  meta.setGraph({ rankdir: 'LR', ranksep: CLUSTER_GUTTER, nodesep: CLUSTER_GUTTER });
  meta.setDefaultEdgeLabel(() => ({}));

  clusters.forEach((cluster) => {
    meta.setNode(String(cluster.quadrant.id), {
      width: cluster.width + CLUSTER_PADDING * 2,
      height: cluster.height + CLUSTER_PADDING * 2 + labelSpace,
    });
  });

  sectorEdges.forEach((e) => {
    if (!e.crossQuadrant) return;
    const a = String(e.sourceQuadrantId);
    const b = String(e.targetQuadrantId);
    if (a !== b && meta.hasNode(a) && meta.hasNode(b)) meta.setEdge(a, b);
  });

  dagre.layout(meta);

  const positions = new Map<number, { x: number; y: number }>();
  meta.nodes().forEach((id) => {
    const { x, y, width, height } = meta.node(id);
    positions.set(Number(id), { x: x - width / 2, y: y - height / 2 });
  });
  return positions;
}

interface DeriveGraphResult {
  quadrants: Quadrant[];
  sectorEdges: RawSectorEdge[];
  rewardEdges: RawRewardEdge[];
}

export function layoutGraph({ quadrants, sectorEdges, rewardEdges }: DeriveGraphResult): { nodes: Node[]; edges: Edge[] } {
  const clusters = quadrants.map(layoutQuadrantCluster);

  const nodes: Node[] = [];
  // absolute (canvas-space) rect per sector/reward node, filled in below as
  // each node's position is resolved - used after the loop to route sector
  // edges around every card that isn't their own endpoint.
  const absoluteRects = new Map<string, Rect>();
  const quadrantColorById = new Map(quadrants.map((q) => [q.id, q.color || '#666']));
  // room reserved at the top of each group's local space for the quadrant label
  const LABEL_SPACE = 32;
  const quadrantPositions = layoutQuadrantPositions(clusters, sectorEdges, LABEL_SPACE);

  clusters.forEach((cluster) => {
    const groupId = `quadrant-${cluster.quadrant.id}`;
    const groupWidth = cluster.width + CLUSTER_PADDING * 2;
    const groupHeight = cluster.height + CLUSTER_PADDING * 2 + LABEL_SPACE;
    const { x: groupX, y: groupY } = quadrantPositions.get(cluster.quadrant.id)!;

    nodes.push({
      id: groupId,
      type: 'quadrantGroup',
      position: { x: groupX, y: groupY },
      style: { width: groupWidth, height: groupHeight },
      // MiniMap only draws a node once it has an explicit numeric width/height
      // (it doesn't fall back to the auto-measured size the way the main
      // canvas does), so these need to be set on top of the CSS-facing style.
      width: groupWidth,
      height: groupHeight,
      data: { quadrant: cluster.quadrant },
      draggable: false,
      selectable: false,
      zIndex: -1,
    });

    const sectorById = new Map(cluster.quadrant.sectors.map((s) => [`sector-${s.id}`, s]));
    const rewardById = new Map(
      cluster.quadrant.sectors.flatMap((s) => s.rewards.map((r): [string, Reward] => [`reward-${r.id}`, r]))
    );

    cluster.nodes.forEach((n) => {
      const relX = CLUSTER_PADDING + n.x;
      const relY = CLUSTER_PADDING + LABEL_SPACE + n.y;
      absoluteRects.set(n.id, { x: groupX + relX, y: groupY + relY, width: n.width, height: n.height });

      if (sectorById.has(n.id)) {
        const sector = sectorById.get(n.id)!;
        nodes.push({
          id: n.id,
          type: 'squadNode',
          parentId: groupId,
          extent: 'parent',
          position: { x: relX, y: relY },
          style: { width: n.width },
          width: n.width,
          height: n.height,
          data: { sector, quadrantColor: cluster.quadrant.color },
          // above every edge (see below), so a card's own content always
          // paints over a line that happens to pass near/behind it
          zIndex: 1,
        });
      } else if (rewardById.has(n.id)) {
        const reward = rewardById.get(n.id)!;
        nodes.push({
          id: n.id,
          type: 'rewardNode',
          parentId: groupId,
          extent: 'parent',
          position: { x: relX, y: relY },
          style: { width: n.width },
          width: n.width,
          height: n.height,
          data: { reward, quadrantColor: cluster.quadrant.color },
          zIndex: 1,
        });
      }
    });
  });

  // Reward edges are always a short same-quadrant drop from a sector straight
  // down to its own reward - dagre already lays those out with nothing else
  // in between, so the plain built-in smoothstep is fine as-is.
  const rewardFlowEdges: Edge[] = rewardEdges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    type: 'smoothstep',
    pathOptions: { borderRadius: 12 },
    animated: false,
    zIndex: 0,
    style: { stroke: 'var(--text-dim)' },
  }));

  // Sector edges (especially cross-quadrant ones) routinely have to travel
  // past OTHER sectors/rewards that sit between source and target - React
  // Flow's built-in smoothstep has no idea those cards exist and will draw
  // straight through/behind them, which reads as "the line got lost" or
  // "everything looks connected". routeOrthogonal knows the exact rect of
  // every card on the canvas and detours the line around whichever ones are
  // in the way, the same way the reference guide's hand-routed lines duck
  // around cards instead of crossing them. Colored by the *target* quadrant,
  // so a line reads as "this is inbound to quadrant X" rather than a single
  // undifferentiated amber for every cross-quadrant connection.
  const sectorFlowEdges: Edge[] = sectorEdges.map((e) => {
    const sourceRect = absoluteRects.get(e.source);
    const targetRect = absoluteRects.get(e.target);
    const color =
      (e.targetQuadrantId != null ? quadrantColorById.get(e.targetQuadrantId) : undefined) ??
      quadrantColorById.get(e.sourceQuadrantId) ??
      '#666';
    const baseStyle = { stroke: color, strokeWidth: 2 };

    if (!sourceRect || !targetRect) {
      // shouldn't happen (every sector has a resolved rect), but degrade to
      // the plain router rather than dropping the edge
      return {
        id: e.id,
        source: e.source,
        target: e.target,
        type: 'smoothstep',
        pathOptions: { borderRadius: 12 },
        animated: e.crossQuadrant,
        zIndex: e.crossQuadrant ? 0.5 : 0,
        style: baseStyle,
      };
    }

    const obstacles = [...absoluteRects.entries()]
      .filter(([id]) => id !== e.source && id !== e.target)
      .map(([, rect]) => rect);

    return {
      id: e.id,
      source: e.source,
      target: e.target,
      type: 'routedSector',
      data: { path: buildRoutedSectorEdgePath(sourceRect, targetRect, obstacles) },
      animated: e.crossQuadrant,
      zIndex: e.crossQuadrant ? 0.5 : 0,
      style: baseStyle,
    };
  });

  return { nodes, edges: [...rewardFlowEdges, ...sectorFlowEdges] };
}

export function buildFlowGraph(starChart: StarChart): { nodes: Node[]; edges: Edge[] } {
  return layoutGraph(deriveGraph(starChart));
}
