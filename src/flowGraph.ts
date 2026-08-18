import dagre from '@dagrejs/dagre';
import type { Node, Edge } from '@xyflow/react';
import type { StarChart, Quadrant, Sector, System, Waypoint } from './types';

// Sized for RequirementPortrait's 56px corner-badge portraits (see
// req-portrait-wrap in App.css), not DOM-measured - these are estimates fed
// to dagre + the obstacle-aware edge router below, so they need to track
// the actual rendered .system-flow-node-req size or edges route through the
// (now much bigger) cards. Retune here first if a system box's edges/borders
// look wrong once the corner badges are in the browser.
const SYSTEM_NODE_WIDTH = 280;
const SYSTEM_ROW_HEIGHT = 72;
const SYSTEM_HEADER_HEIGHT = 40;
const REQS_PER_ROW = 3;
// Plain "hex" waypoints (.reward-flow-node-hex in App.css) render at this
// size. Banner-style waypoints (.reward-flow-node-banner - any waypoint
// whose resolved event has a real banner image, see WaypointFlowNode's
// isBanner) render taller and narrower instead - see waypointNodeSize below,
// which must track both these and the CSS in lockstep or the banner variant
// overflows the box the layout allocated for it.
const WAYPOINT_NODE_WIDTH = 140;
const WAYPOINT_NODE_HEIGHT = 70;
const WAYPOINT_BANNER_WIDTH = 120;
const WAYPOINT_BANNER_HEIGHT = 160;
const RANK_SEP = 70;
const NODE_SEP = 40;
// Quadrant-level (outer) clustering
const CLUSTER_PADDING = 40;
const CLUSTER_GUTTER = 160;
const QUADRANT_LABEL_SPACE = 32;
// Sector-level (inner, nested within a Quadrant) clustering - tighter than
// the quadrant level since it's a sub-grouping, not the outermost box.
const SECTOR_PADDING = 22;
const SECTOR_CLUSTER_GUTTER = 90;
const SECTOR_LABEL_SPACE = 26;

const OBSTACLE_MARGIN = 14;
const EDGE_STUB = 22;
const CLEAR_SEARCH_STEP = 12;
const CLEAR_SEARCH_MAX_STEPS = 250;
const EDGE_CORNER_RADIUS = 10;

function systemNodeHeight(system: System): number {
  const rows = Math.max(1, Math.ceil((system.requirements.length || 1) / REQS_PER_ROW));
  return SYSTEM_HEADER_HEIGHT + rows * SYSTEM_ROW_HEIGHT;
}

// Mirrors WaypointFlowNode's own isBanner check - same event.image_url
// presence decides which of the two very differently-shaped variants
// actually renders, so the layout box has to match per-waypoint, not use
// one flat size for both.
function waypointNodeSize(waypoint: Waypoint): { width: number; height: number } {
  const isBanner = !!waypoint.event?.image_url;
  return isBanner
    ? { width: WAYPOINT_BANNER_WIDTH, height: WAYPOINT_BANNER_HEIGHT }
    : { width: WAYPOINT_NODE_WIDTH, height: WAYPOINT_NODE_HEIGHT };
}

interface RawEdge {
  id: string;
  source: string;
  target: string;
  sourceSectorId: number;
  targetSectorId: number;
  sourceQuadrantId: number;
  targetQuadrantId: number;
  crossSector: boolean;
  crossQuadrant: boolean;
}

// Walks starChart.quadrants[].sectors[] and produces the raw (unpositioned)
// graph shape: one node per System ("systemNode"), one node per Waypoint
// ("waypointNode"), grouped by Sector within Quadrant. Edges come from two
// places: system.unlocks (a System unlocking a Waypoint) and
// system.prerequisites (a System that must be built before this one) -
// either can cross Sector and/or Quadrant boundaries. Waypoints are always
// edge targets, never sources: nothing in the data model ever originates an
// edge from a Waypoint node.
export function deriveGraph(starChart: StarChart) {
  const systemLocation = new Map<number, { sector: Sector; quadrant: Quadrant }>();
  const waypointLocation = new Map<number, { sector: Sector; quadrant: Quadrant }>();
  starChart.quadrants.forEach((quadrant) => {
    quadrant.sectors.forEach((sector) => {
      sector.systems.forEach((s) => systemLocation.set(s.id, { sector, quadrant }));
      sector.waypoints.forEach((w) => waypointLocation.set(w.id, { sector, quadrant }));
    });
  });

  const quadrants = [...starChart.quadrants].sort((a, b) => a.order_index - b.order_index);
  const prerequisiteEdges: RawEdge[] = [];
  const unlockEdges: RawEdge[] = [];

  starChart.quadrants.forEach((quadrant) => {
    quadrant.sectors.forEach((sector) => {
      sector.systems.forEach((system) => {
        system.unlocks.forEach((waypoint) => {
          const target = waypointLocation.get(waypoint.id);
          unlockEdges.push({
            id: `u-${system.id}-${waypoint.id}`,
            source: `system-${system.id}`,
            target: `waypoint-${waypoint.id}`,
            sourceSectorId: sector.id,
            targetSectorId: target?.sector.id ?? sector.id,
            sourceQuadrantId: quadrant.id,
            targetQuadrantId: target?.quadrant.id ?? quadrant.id,
            crossSector: !!target && target.sector.id !== sector.id,
            crossQuadrant: !!target && target.quadrant.id !== quadrant.id,
          });
        });
        system.prerequisites.forEach((prereq) => {
          const source = systemLocation.get(prereq.id);
          prerequisiteEdges.push({
            id: `p-${prereq.id}-${system.id}`,
            source: `system-${prereq.id}`,
            target: `system-${system.id}`,
            sourceSectorId: source?.sector.id ?? sector.id,
            targetSectorId: sector.id,
            sourceQuadrantId: source?.quadrant.id ?? quadrant.id,
            targetQuadrantId: quadrant.id,
            crossSector: !!source && source.sector.id !== sector.id,
            crossQuadrant: !!source && source.quadrant.id !== quadrant.id,
          });
        });
      });
    });
  });

  return { quadrants, prerequisiteEdges, unlockEdges };
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

// dagre-lays-out a single connected component (one chain of systems/
// waypoints) on its own, returning node positions relative to that
// component alone.
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

// Shared by both clustering levels below: given a flat pool of nodes and the
// edges that stay entirely within that pool, groups them into weakly-
// connected components (each laid out independently via dagre), then packs
// those components into snug lanes - see packLanes' docstring for why a
// single flat dagre pass over the whole pool doesn't work.
function clusterNodes(nodeIds: string[], nodeMeta: Map<string, NodeMeta>, internalEdges: [string, string][], laneOrder: Map<string, number>) {
  const adjacency = new Map<string, Set<string>>();
  nodeIds.forEach((id) => adjacency.set(id, new Set()));
  internalEdges.forEach(([a, b]) => {
    adjacency.get(a)?.add(b);
    adjacency.get(b)?.add(a);
  });

  const visited = new Set<string>();
  const components: string[][] = [];
  for (const id of nodeIds) {
    if (visited.has(id)) continue;
    visited.add(id);
    const queue = [id];
    const comp: string[] = [];
    while (queue.length) {
      const cur = queue.shift()!;
      comp.push(cur);
      for (const neighbour of adjacency.get(cur) ?? []) {
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
    const compEdges = internalEdges.filter(([a, b]) => compSet.has(a) && compSet.has(b));
    const laneMeta = new Map(comp.map((id) => [id, nodeMeta.get(id)!]));
    return layoutComponent(comp, laneMeta, compEdges);
  });

  return packLanes(lanes);
}

// Lays out one Sector's own Systems/Waypoints as a self-contained cluster,
// ignoring edges that leave the Sector (those are handled one level up, by
// layoutSectorPositions pulling connected Sectors near each other, and
// ultimately by the obstacle-avoiding router once every position is
// absolute) - same "ignore boundary-crossing edges when forming components"
// approach the Quadrant level below uses.
function layoutSectorCluster(sector: Sector) {
  const nodeMeta = new Map<string, NodeMeta>();
  const laneOrder = new Map<string, number>();
  const nodeIds: string[] = [];

  sector.systems.forEach((system) => {
    const key = `system-${system.id}`;
    nodeMeta.set(key, { width: SYSTEM_NODE_WIDTH, height: systemNodeHeight(system) });
    laneOrder.set(key, system.order_index);
    nodeIds.push(key);
  });
  sector.waypoints.forEach((waypoint) => {
    const key = `waypoint-${waypoint.id}`;
    nodeMeta.set(key, waypointNodeSize(waypoint));
    laneOrder.set(key, 0);
    nodeIds.push(key);
  });

  const nodeIdSet = new Set(nodeIds);
  const internalEdges: [string, string][] = [];
  sector.systems.forEach((system) => {
    system.unlocks.forEach((waypoint) => {
      const target = `waypoint-${waypoint.id}`;
      if (nodeIdSet.has(target)) internalEdges.push([`system-${system.id}`, target]);
    });
    system.prerequisites.forEach((prereq) => {
      const source = `system-${prereq.id}`;
      if (nodeIdSet.has(source)) internalEdges.push([source, `system-${system.id}`]);
    });
  });

  const { nodes, width, height } = clusterNodes(nodeIds, nodeMeta, internalEdges, laneOrder);
  return { sector, nodes, width, height };
}

// Arranges a Quadrant's Sector clusters relative to each other using dagre,
// pulled together by edges that cross Sectors but stay within this
// Quadrant - same "connected things land adjacent" idea
// layoutQuadrantPositions uses one level up for Quadrants themselves.
function layoutSectorPositions(sectorClusters: ReturnType<typeof layoutSectorCluster>[], crossSectorEdges: RawEdge[]): Map<number, { x: number; y: number }> {
  const meta = new dagre.graphlib.Graph();
  meta.setGraph({ rankdir: 'LR', ranksep: SECTOR_CLUSTER_GUTTER, nodesep: SECTOR_CLUSTER_GUTTER });
  meta.setDefaultEdgeLabel(() => ({}));

  sectorClusters.forEach((cluster) => {
    meta.setNode(String(cluster.sector.id), {
      width: cluster.width + SECTOR_PADDING * 2,
      height: cluster.height + SECTOR_PADDING * 2 + SECTOR_LABEL_SPACE,
    });
  });

  crossSectorEdges.forEach((e) => {
    if (e.crossQuadrant) return;
    const a = String(e.sourceSectorId);
    const b = String(e.targetSectorId);
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

// Combines a Quadrant's Sector clusters into one bounding box, positioning
// each Sector within it via layoutSectorPositions.
function layoutQuadrantCluster(quadrant: Quadrant, allEdges: RawEdge[]) {
  const sectorClusters = quadrant.sectors.map(layoutSectorCluster);
  const crossSectorEdges = allEdges.filter((e) => !e.crossQuadrant);
  const sectorPositions = layoutSectorPositions(sectorClusters, crossSectorEdges);

  let maxX = 0;
  let maxY = 0;
  const sectors = sectorClusters.map((cluster) => {
    const pos = sectorPositions.get(cluster.sector.id) ?? { x: 0, y: 0 };
    const width = cluster.width + SECTOR_PADDING * 2;
    const height = cluster.height + SECTOR_PADDING * 2 + SECTOR_LABEL_SPACE;
    maxX = Math.max(maxX, pos.x + width);
    maxY = Math.max(maxY, pos.y + height);
    return { cluster, x: pos.x, y: pos.y };
  });

  return { quadrant, sectors, width: maxX, height: maxY };
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

function buildRoutedPrerequisiteEdgePath(source: Rect, target: Rect, obstacles: Rect[]): string {
  return roundedPathFromPoints(routeOrthogonal(source, target, obstacles), EDGE_CORNER_RADIUS);
}

// Arranges quadrant clusters using dagre again, this time treating each
// whole quadrant as a single meta-node sized to its cluster's bounding box,
// with one meta-edge per pair of quadrants that has a real cross-quadrant
// edge between them. Without this, a naive grid pack (row-major by
// order_index) places quadrants with no regard for which ones actually
// connect, so a cross-quadrant line from column 0 to column 2 has no choice
// but to cut straight through column 1's box - exactly the "lines passing
// under each other" problem. Laying out the meta-graph with LR (quadrants
// connect left-to-right) while each quadrant's own internal content stays
// TB (top-to-bottom) means connected quadrants land adjacent to each other,
// so most cross-quadrant edges only have to bridge a short gap between
// neighbouring boxes instead of crossing unrelated ones.
function layoutQuadrantPositions(clusters: ReturnType<typeof layoutQuadrantCluster>[], allEdges: RawEdge[]): Map<number, { x: number; y: number }> {
  const meta = new dagre.graphlib.Graph();
  meta.setGraph({ rankdir: 'LR', ranksep: CLUSTER_GUTTER, nodesep: CLUSTER_GUTTER });
  meta.setDefaultEdgeLabel(() => ({}));

  clusters.forEach((cluster) => {
    meta.setNode(String(cluster.quadrant.id), {
      width: cluster.width + CLUSTER_PADDING * 2,
      height: cluster.height + CLUSTER_PADDING * 2 + QUADRANT_LABEL_SPACE,
    });
  });

  allEdges.forEach((e) => {
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
  prerequisiteEdges: RawEdge[];
  unlockEdges: RawEdge[];
}

export function layoutGraph({ quadrants, prerequisiteEdges, unlockEdges }: DeriveGraphResult): { nodes: Node[]; edges: Edge[] } {
  const allEdges = [...prerequisiteEdges, ...unlockEdges];
  const clusters = quadrants.map((q) => layoutQuadrantCluster(q, allEdges));

  const nodes: Node[] = [];
  // absolute (canvas-space) rect per system/waypoint node, filled in below as
  // each node's position is resolved - used after the loop to route
  // prerequisite edges around every card that isn't their own endpoint.
  const absoluteRects = new Map<string, Rect>();
  // color lives on Sector, not Quadrant - used for prerequisite-edge color
  // (the Sector box itself carries the color visually, see 'sectorGroup').
  const nodeColorById = new Map<string, string>();
  const systemById = new Map<string, System>();
  const waypointById = new Map<string, Waypoint>();
  quadrants.forEach((q) => {
    q.sectors.forEach((sec) => {
      const color = sec.color || '#666';
      sec.systems.forEach((s) => {
        nodeColorById.set(`system-${s.id}`, color);
        systemById.set(`system-${s.id}`, s);
      });
      sec.waypoints.forEach((w) => {
        nodeColorById.set(`waypoint-${w.id}`, color);
        waypointById.set(`waypoint-${w.id}`, w);
      });
    });
  });

  const quadrantPositions = layoutQuadrantPositions(clusters, allEdges);

  clusters.forEach((qCluster) => {
    const groupId = `quadrant-${qCluster.quadrant.id}`;
    const groupWidth = qCluster.width + CLUSTER_PADDING * 2;
    const groupHeight = qCluster.height + CLUSTER_PADDING * 2 + QUADRANT_LABEL_SPACE;
    const { x: groupX, y: groupY } = quadrantPositions.get(qCluster.quadrant.id) ?? { x: 0, y: 0 };

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
      data: { quadrant: qCluster.quadrant },
      draggable: false,
      selectable: false,
      zIndex: -1,
    });

    qCluster.sectors.forEach(({ cluster: sCluster, x: sx, y: sy }) => {
      const sectorGroupId = `sector-${sCluster.sector.id}`;
      const sectorRelX = CLUSTER_PADDING + sx;
      const sectorRelY = CLUSTER_PADDING + QUADRANT_LABEL_SPACE + sy;
      const sectorWidth = sCluster.width + SECTOR_PADDING * 2;
      const sectorHeight = sCluster.height + SECTOR_PADDING * 2 + SECTOR_LABEL_SPACE;

      nodes.push({
        id: sectorGroupId,
        type: 'sectorGroup',
        parentId: groupId,
        extent: 'parent',
        position: { x: sectorRelX, y: sectorRelY },
        style: { width: sectorWidth, height: sectorHeight },
        width: sectorWidth,
        height: sectorHeight,
        data: { sector: sCluster.sector },
        draggable: false,
        selectable: false,
        zIndex: -0.5,
      });

      sCluster.nodes.forEach((n) => {
        const relX = SECTOR_PADDING + n.x;
        const relY = SECTOR_PADDING + SECTOR_LABEL_SPACE + n.y;
        absoluteRects.set(n.id, {
          x: groupX + sectorRelX + relX,
          y: groupY + sectorRelY + relY,
          width: n.width,
          height: n.height,
        });

        if (systemById.has(n.id)) {
          nodes.push({
            id: n.id,
            type: 'systemNode',
            parentId: sectorGroupId,
            extent: 'parent',
            position: { x: relX, y: relY },
            style: { width: n.width },
            width: n.width,
            height: n.height,
            data: { system: systemById.get(n.id)! },
            // above every edge (see below), so a card's own content always
            // paints over a line that happens to pass near/behind it
            zIndex: 1,
          });
        } else if (waypointById.has(n.id)) {
          nodes.push({
            id: n.id,
            type: 'waypointNode',
            parentId: sectorGroupId,
            extent: 'parent',
            position: { x: relX, y: relY },
            style: { width: n.width },
            width: n.width,
            height: n.height,
            data: { waypoint: waypointById.get(n.id)! },
            zIndex: 1,
          });
        }
      });
    });
  });

  // Unlock edges are usually a short same-sector drop from a System straight
  // down to its own Waypoint - dagre already lays those out with nothing
  // else in between, so the plain built-in smoothstep is fine as-is. A
  // System can unlock a Waypoint outside its own Sector/Quadrant too though
  // (e.g. a capital ship reward that lives in a different Sector than the
  // crew System that unlocks it) - animated the same way a boundary-
  // crossing prerequisite edge is, so "this line leaves the box" reads the
  // same regardless of which edge kind it is. Colored by the *target*
  // Waypoint's Sector too, same "inbound to sector X" rule prerequisite
  // edges use below, instead of a flat neutral grey.
  const unlockFlowEdges: Edge[] = unlockEdges.map((e) => {
    const color = nodeColorById.get(e.target) ?? nodeColorById.get(e.source) ?? '#666';
    return {
      id: e.id,
      source: e.source,
      target: e.target,
      type: 'smoothstep',
      pathOptions: { borderRadius: 12 },
      animated: e.crossQuadrant || e.crossSector,
      zIndex: 0,
      style: { stroke: color, strokeWidth: 2 },
    };
  });

  // Prerequisite edges (especially cross-sector/cross-quadrant ones)
  // routinely have to travel past OTHER systems/waypoints that sit between
  // source and target - React Flow's built-in smoothstep has no idea those
  // cards exist and will draw straight through/behind them, which reads as
  // "the line got lost" or "everything looks connected". routeOrthogonal
  // knows the exact rect of every card on the canvas (including Sector
  // boxes' own footprint, via their member cards) and detours the line
  // around whichever ones are in the way, the same way the reference
  // guide's hand-routed lines duck around cards instead of crossing them.
  // Colored by the *target* System's Sector, so a line reads as "this is
  // inbound to sector X."
  const prerequisiteFlowEdges: Edge[] = prerequisiteEdges.map((e) => {
    const sourceRect = absoluteRects.get(e.source);
    const targetRect = absoluteRects.get(e.target);
    const color = nodeColorById.get(e.target) ?? nodeColorById.get(e.source) ?? '#666';
    const baseStyle = { stroke: color, strokeWidth: 2 };
    const crossesBoundary = e.crossQuadrant || e.crossSector;

    if (!sourceRect || !targetRect) {
      // shouldn't happen (every system has a resolved rect), but degrade to
      // the plain router rather than dropping the edge
      return {
        id: e.id,
        source: e.source,
        target: e.target,
        type: 'smoothstep',
        pathOptions: { borderRadius: 12 },
        animated: crossesBoundary,
        zIndex: crossesBoundary ? 0.5 : 0,
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
      type: 'routedPrerequisite',
      data: { path: buildRoutedPrerequisiteEdgePath(sourceRect, targetRect, obstacles) },
      animated: crossesBoundary,
      zIndex: crossesBoundary ? 0.5 : 0,
      style: baseStyle,
    };
  });

  return { nodes, edges: [...unlockFlowEdges, ...prerequisiteFlowEdges] };
}

// quadrantId narrows the rendered graph down to one Quadrant's subtree
// (its quadrantGroup node + descendant sectorGroup/system/waypoint nodes),
// pruning any edge that loses an endpoint in the process (a prerequisite/
// unlock crossing into a now-hidden Quadrant). The full graph is still
// laid out first and only pruned after - cheaper to compute than it looks
// (chart sizes are small) and it means the layout math (positions, cross-
// boundary routing) never has to special-case "this Quadrant is filtered
// out", it just always sees the whole chart. fitView on the canvas takes
// care of re-centering on whatever subset ends up visible.
export function buildFlowGraph(starChart: StarChart, quadrantId?: number | null): { nodes: Node[]; edges: Edge[] } {
  const { nodes, edges } = layoutGraph(deriveGraph(starChart));
  if (quadrantId == null) return { nodes, edges };

  const groupId = `quadrant-${quadrantId}`;
  const keptSectorIds = new Set(
    nodes.filter((n) => n.type === 'sectorGroup' && n.parentId === groupId).map((n) => n.id)
  );
  const filteredNodes = nodes.filter((n) => {
    if (n.id === groupId) return true;
    if (n.type === 'sectorGroup') return n.parentId === groupId;
    return !!n.parentId && keptSectorIds.has(n.parentId);
  });
  const keptIds = new Set(filteredNodes.map((n) => n.id));
  const filteredEdges = edges.filter((e) => keptIds.has(e.source) && keptIds.has(e.target));
  return { nodes: filteredNodes, edges: filteredEdges };
}
