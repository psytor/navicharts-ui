import dagre from '@dagrejs/dagre';
import type { Node, Edge, SmoothStepPathOptions } from '@xyflow/react';
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

// detectGoalSector's activation gate (see that function) - deliberately
// conservative so a Quadrant with no real convergence point (e.g. still
// sparse) falls back to the plain layout instead of picking a false center.
const GOAL_MIN_INDEGREE = 3;
const GOAL_MIN_SOURCE_SECTORS = 2;
// layoutSectorPositionsRadial's single-ring/two-ring threshold and the gap
// between rings when it splits - see that function.
const MAX_SECTORS_PER_RING = 8;
const RING_GUTTER = 120;

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

export interface GoalSector {
  sectorId: number;
  waypointId: number;
}

// Identifies the Sector a Quadrant's Systems structurally converge on, if
// one exists - e.g. a chart's "Leia Organa" Sector, unlocked by several
// Systems spread across several other Sectors. Nothing in the data model
// marks this explicitly (no "is_goal" field) - it's derived purely from
// unlock edges already on the fetched Quadrant (Waypoint.unlocked_by), so
// it works for any Quadrant with no per-chart configuration and no schema
// change.
//
// All three conditions below are a hard gate, not just corroborating
// signals: a plain "highest in-degree" heuristic always returns *something*,
// even on a graph with no real convergence point (e.g. a Quadrant that's
// still sparse), and a radial layout built around a false center reads
// worse than today's plain layout. Returning null here is what lets
// layoutQuadrantCluster fall back to the existing linear layout untouched.
function detectGoalSector(quadrant: Quadrant): GoalSector | null {
  const systemSectorId = new Map<number, number>();
  quadrant.sectors.forEach((sector) => {
    sector.systems.forEach((system) => systemSectorId.set(system.id, sector.id));
  });

  interface Candidate {
    sector: Sector;
    waypoint: Waypoint;
    indegree: number;
    sourceSectors: number;
  }
  const candidates: Candidate[] = [];
  quadrant.sectors.forEach((sector) => {
    sector.waypoints.forEach((waypoint) => {
      const sourceSectorIds = new Set(
        waypoint.unlocked_by.map((s) => systemSectorId.get(s.id)).filter((id): id is number => id != null)
      );
      candidates.push({ sector, waypoint, indegree: waypoint.unlocked_by.length, sourceSectors: sourceSectorIds.size });
    });
  });
  if (candidates.length === 0) return null;

  const best = candidates.reduce((a, b) => {
    if (b.indegree !== a.indegree) return b.indegree > a.indegree ? b : a;
    return b.sourceSectors > a.sourceSectors ? b : a;
  });

  const isDedicatedContainer = best.sector.systems.length === 0 && best.sector.waypoints.length === 1;
  if (best.indegree < GOAL_MIN_INDEGREE || best.sourceSectors < GOAL_MIN_SOURCE_SECTORS || !isDedicatedContainer) {
    return null;
  }

  return { sectorId: best.sector.id, waypointId: best.waypoint.id };
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

// Places a Quadrant's goal Sector (detectGoalSector) at the center and
// arranges every other Sector as a spoke radiating outward from it, instead
// of layoutSectorPositions's plain left-to-right flow. Reuses
// layoutSectorCluster's per-Sector internal dagre layout completely
// unmodified for each spoke's own content - "radiating outward" comes
// purely from *position*, not from rotating card content (which would break
// text readability and the axis-aligned-rect assumptions routeOrthogonal's
// obstacle math depends on).
function layoutSectorPositionsRadial(
  hubCluster: ReturnType<typeof layoutSectorCluster>,
  spokeClusters: ReturnType<typeof layoutSectorCluster>[],
  crossSectorEdges: RawEdge[],
  goalWaypointId: number
): Map<number, { x: number; y: number }> {
  const positions = new Map<number, { x: number; y: number }>();

  const hubWidth = hubCluster.width + SECTOR_PADDING * 2;
  const hubHeight = hubCluster.height + SECTOR_PADDING * 2 + SECTOR_LABEL_SPACE;
  const hubHalfExtent = Math.max(hubWidth, hubHeight) / 2;
  positions.set(hubCluster.sector.id, { x: -hubWidth / 2, y: -hubHeight / 2 });

  if (spokeClusters.length === 0) {
    positions.set(hubCluster.sector.id, { x: 0, y: 0 });
    return positions;
  }

  // Angular order: reuse the same cross-sector-edge-weighted meta-graph
  // layoutSectorPositions already builds, run through dagre exactly as
  // today (same crossing-minimization the codebase already trusts), then
  // map the resulting linear order onto the circle - spokes that connect to
  // each other land angularly close, the same way they'd land horizontally
  // adjacent in the linear layout.
  const spokeIds = new Set(spokeClusters.map((c) => c.sector.id));
  const orderMeta = new dagre.graphlib.Graph();
  orderMeta.setGraph({ rankdir: 'LR', ranksep: SECTOR_CLUSTER_GUTTER, nodesep: SECTOR_CLUSTER_GUTTER });
  orderMeta.setDefaultEdgeLabel(() => ({}));
  spokeClusters.forEach((cluster) => {
    orderMeta.setNode(String(cluster.sector.id), {
      width: cluster.width + SECTOR_PADDING * 2,
      height: cluster.height + SECTOR_PADDING * 2 + SECTOR_LABEL_SPACE,
    });
  });
  crossSectorEdges.forEach((e) => {
    if (e.crossQuadrant) return;
    const a = e.sourceSectorId;
    const b = e.targetSectorId;
    if (a === b || !spokeIds.has(a) || !spokeIds.has(b)) return;
    orderMeta.setEdge(String(a), String(b));
  });
  dagre.layout(orderMeta);

  const orderedSpokes = [...spokeClusters].sort(
    (a, b) => orderMeta.node(String(a.sector.id)).x - orderMeta.node(String(b.sector.id)).x
  );

  // Beyond MAX_SECTORS_PER_RING spokes a single ring gets too crowded to
  // stay legible (this Quadrant is headed toward ~15 Sectors) - split into
  // two rings, keyed to real edge data rather than an arbitrary count: a
  // Sector goes in the inner ring only if one of its own Systems directly
  // unlocks the goal Waypoint (it's on the direct path to the goal);
  // everything else sits in a second, larger-radius outer ring.
  let innerRing = orderedSpokes;
  let outerRing: typeof orderedSpokes = [];
  if (orderedSpokes.length > MAX_SECTORS_PER_RING) {
    const direct = orderedSpokes.filter((c) =>
      c.sector.systems.some((s) => s.unlocks.some((w) => w.id === goalWaypointId))
    );
    if (direct.length > 0) {
      innerRing = direct;
      outerRing = orderedSpokes.filter((c) => !direct.includes(c));
    }
  }

  // Places one ring's spokes at equal angular spacing starting at
  // `baseRadius` from the origin, relaxing each outward (same "search
  // outward until clear" idiom pickClearCoord uses for edge routing below)
  // if it still overlaps an already-placed spoke in this ring. Returns the
  // ring's outer extent, so a second ring can start beyond it.
  const placeRing = (ring: typeof orderedSpokes, baseRadius: number): number => {
    if (ring.length === 0) return baseRadius;
    const angleStep = (2 * Math.PI) / ring.length;
    const placed: { x: number; y: number; halfWidth: number; halfHeight: number }[] = [];
    let outerExtent = baseRadius;

    ring.forEach((cluster, i) => {
      const width = cluster.width + SECTOR_PADDING * 2;
      const height = cluster.height + SECTOR_PADDING * 2 + SECTOR_LABEL_SPACE;
      const halfWidth = width / 2;
      const halfHeight = height / 2;
      const ownHalfExtent = Math.max(halfWidth, halfHeight);
      const angle = i * angleStep;
      const dirX = Math.cos(angle);
      const dirY = Math.sin(angle);

      let radius = baseRadius + ownHalfExtent;
      let cx = dirX * radius;
      let cy = dirY * radius;

      const overlaps = () =>
        placed.some(
          (p) =>
            Math.abs(cx - p.x) < halfWidth + p.halfWidth + SECTOR_CLUSTER_GUTTER &&
            Math.abs(cy - p.y) < halfHeight + p.halfHeight + SECTOR_CLUSTER_GUTTER
        );

      let steps = 0;
      while (overlaps() && steps < CLEAR_SEARCH_MAX_STEPS) {
        radius += CLEAR_SEARCH_STEP;
        cx = dirX * radius;
        cy = dirY * radius;
        steps += 1;
      }

      placed.push({ x: cx, y: cy, halfWidth, halfHeight });
      positions.set(cluster.sector.id, { x: cx - halfWidth, y: cy - halfHeight });
      outerExtent = Math.max(outerExtent, radius + ownHalfExtent);
    });

    return outerExtent;
  };

  const innerOuterExtent = placeRing(innerRing, hubHalfExtent + SECTOR_CLUSTER_GUTTER);
  if (outerRing.length > 0) placeRing(outerRing, innerOuterExtent + RING_GUTTER);

  // Polar coordinates are naturally centered on the hub and span negative
  // x/y - layoutGraph's node-emission loop computes sectorRelX/Y assuming
  // sx/sy >= 0 (every node uses parentId + extent:'parent', so a negative
  // relative position gets silently clipped by React Flow's parent-extent
  // containment rather than just misplaced). Normalize before returning.
  let minX = Infinity;
  let minY = Infinity;
  positions.forEach(({ x, y }) => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
  });
  positions.forEach((pos, id) => positions.set(id, { x: pos.x - minX, y: pos.y - minY }));

  return positions;
}

// Combines a Quadrant's Sector clusters into one bounding box, positioning
// each Sector within it via layoutSectorPositions - or, when this Quadrant
// has a detectable goal Sector, via the goal-centered
// layoutSectorPositionsRadial instead. Everything downstream of this
// function (layoutGraph's node-emission loop, layoutQuadrantPositions)
// only ever consumes the {cluster, x, y} shape returned here, so neither
// layout path needs any special-casing beyond this one branch.
function layoutQuadrantCluster(quadrant: Quadrant, allEdges: RawEdge[]) {
  const sectorClusters = quadrant.sectors.map(layoutSectorCluster);
  const crossSectorEdges = allEdges.filter((e) => !e.crossQuadrant);
  const goal = detectGoalSector(quadrant);

  const sectorPositions = goal
    ? layoutSectorPositionsRadial(
        sectorClusters.find((c) => c.sector.id === goal.sectorId)!,
        sectorClusters.filter((c) => c.sector.id !== goal.sectorId),
        crossSectorEdges,
        goal.waypointId
      )
    : layoutSectorPositions(sectorClusters, crossSectorEdges);

  let maxX = 0;
  let maxY = 0;
  const sectors = sectorClusters.map((cluster) => {
    const pos = sectorPositions.get(cluster.sector.id) ?? { x: 0, y: 0 };
    const width = cluster.width + SECTOR_PADDING * 2;
    const height = cluster.height + SECTOR_PADDING * 2 + SECTOR_LABEL_SPACE;
    maxX = Math.max(maxX, pos.x + width);
    maxY = Math.max(maxY, pos.y + height);
    return { cluster, x: pos.x, y: pos.y, isHub: cluster.sector.id === goal?.sectorId };
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

function buildRoutedEdgePath(source: Rect, target: Rect, obstacles: Rect[]): string {
  return roundedPathFromPoints(routeOrthogonal(source, target, obstacles), EDGE_CORNER_RADIUS);
}

// Shared by both edge kinds below (unlock and prerequisite) - a System's
// unlock into a Waypoint routinely has to cross the same kind of "other
// cards in the way" territory a cross-Sector prerequisite does (most
// visibly, every unlock edge converging on a Quadrant's goal Waypoint from
// several different Sectors), so both need the same obstacle-aware
// routing rather than only prerequisite edges getting it.
function buildRoutedFlowEdge(e: RawEdge, absoluteRects: Map<string, Rect>, nodeColorById: Map<string, string>): Edge {
  const sourceRect = absoluteRects.get(e.source);
  const targetRect = absoluteRects.get(e.target);
  const color = nodeColorById.get(e.target) ?? nodeColorById.get(e.source) ?? '#666';
  const baseStyle = { stroke: color, strokeWidth: 2 };
  const crossesBoundary = e.crossQuadrant || e.crossSector;

  if (!sourceRect || !targetRect) {
    // shouldn't happen (every system/waypoint has a resolved rect), but
    // degrade to the plain router rather than dropping the edge.
    // pathOptions only exists on the 'smoothstep' edge variant, not the
    // base Edge type buildRoutedFlowEdge returns - typed explicitly here
    // so the object literal is checked against a type that actually
    // declares it, rather than tripping an excess-property error.
    const fallbackEdge: Edge & { pathOptions?: SmoothStepPathOptions } = {
      id: e.id,
      source: e.source,
      target: e.target,
      type: 'smoothstep',
      pathOptions: { borderRadius: 12 },
      animated: crossesBoundary,
      zIndex: crossesBoundary ? 0.5 : 0,
      style: baseStyle,
    };
    return fallbackEdge;
  }

  const obstacles = [...absoluteRects.entries()]
    .filter(([id]) => id !== e.source && id !== e.target)
    .map(([, rect]) => rect);

  return {
    id: e.id,
    source: e.source,
    target: e.target,
    type: 'routedEdge',
    data: { path: buildRoutedEdgePath(sourceRect, targetRect, obstacles) },
    animated: crossesBoundary,
    zIndex: crossesBoundary ? 0.5 : 0,
    style: baseStyle,
  };
}

// Rebuilds just the routed-edge paths (not node positions) once React
// Flow reports every node's real measured size - see flowGraph.ts's size
// constants comment: the dagre pass above uses hand-estimated card sizes,
// so the obstacle rects routing was originally computed against can drift
// from the real rendered CSS size, which is exactly what lets a line cut
// through a card instead of ducking around it. `liveNodes` should come
// from React Flow's own node store (e.g. useReactFlow().getNodes()) after
// useNodesInitialized() is true, not the static nodes array layoutGraph
// returned, since that's the only place real `.measured` sizes live.
// Node *positions* are deliberately left exactly as dagre placed them -
// only obstacle rects (and therefore edge paths) get corrected, so nothing
// visibly reflows after first paint.
export function recomputeEdgePaths(liveNodes: Node[], edges: Edge[], absoluteRects: Map<string, Rect>): Edge[] {
  const measuredRects = new Map<string, Rect>();
  liveNodes.forEach((n) => {
    const base = absoluteRects.get(n.id);
    if (!base) return;
    measuredRects.set(n.id, {
      x: base.x,
      y: base.y,
      width: n.measured?.width ?? n.width ?? base.width,
      height: n.measured?.height ?? n.height ?? base.height,
    });
  });

  return edges.map((e) => {
    if (e.type !== 'routedEdge') return e;
    const sourceRect = measuredRects.get(e.source);
    const targetRect = measuredRects.get(e.target);
    if (!sourceRect || !targetRect) return e;

    const obstacles = [...measuredRects.entries()]
      .filter(([id]) => id !== e.source && id !== e.target)
      .map(([, rect]) => rect);

    return { ...e, data: { path: buildRoutedEdgePath(sourceRect, targetRect, obstacles) } };
  });
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

export interface FlowLayoutResult {
  nodes: Node[];
  edges: Edge[];
  // exposed so FlowView can call recomputeEdgePaths once real node sizes
  // are known - see that function's own comment.
  absoluteRects: Map<string, Rect>;
  nodeColorById: Map<string, string>;
}

export function layoutGraph({ quadrants, prerequisiteEdges, unlockEdges }: DeriveGraphResult): FlowLayoutResult {
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

    qCluster.sectors.forEach(({ cluster: sCluster, x: sx, y: sy, isHub }) => {
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
        data: { sector: sCluster.sector, isHub },
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

  // Both edge kinds get the same obstacle-aware routing via
  // buildRoutedFlowEdge - a System's unlock into a Waypoint crosses just as
  // much "other cards in the way" territory as a prerequisite edge does,
  // most visibly the several unlock edges that converge on a Quadrant's
  // goal Waypoint from different Sectors. Colored by the *target* node's
  // Sector in both cases, so a line reads as "this is inbound to sector X"
  // regardless of which edge kind it is.
  const unlockFlowEdges: Edge[] = unlockEdges.map((e) => buildRoutedFlowEdge(e, absoluteRects, nodeColorById));
  const prerequisiteFlowEdges: Edge[] = prerequisiteEdges.map((e) => buildRoutedFlowEdge(e, absoluteRects, nodeColorById));

  return { nodes, edges: [...unlockFlowEdges, ...prerequisiteFlowEdges], absoluteRects, nodeColorById };
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
export function buildFlowGraph(starChart: StarChart, quadrantId?: number | null): FlowLayoutResult {
  const { nodes, edges, absoluteRects, nodeColorById } = layoutGraph(deriveGraph(starChart));
  if (quadrantId == null) return { nodes, edges, absoluteRects, nodeColorById };

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
  // absoluteRects/nodeColorById are left unfiltered (whole-chart) -
  // recomputeEdgePaths only ever looks up ids present in the currently
  // rendered node list, so harmless extra entries for hidden Quadrants
  // just go unused.
  return { nodes: filteredNodes, edges: filteredEdges, absoluteRects, nodeColorById };
}
