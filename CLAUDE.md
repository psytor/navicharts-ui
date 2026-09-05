# CLAUDE.md — navicharts-ui

Guide for Claude Code when working inside this submodule.

## Documentation currency (update when you edit docs)

**Uncommitted work (update this line once committed):** Plan tab's Squad/Fleet
Builder (`SquadBuilder.tsx`, `Quadrant.tsx`) got three related fixes,
following the same "Quadrants are independent" direction as the
`517609e` work below. (1) The default character/ship pool is now derived
from the active Quadrant's own `requirements`/`waypoints` (deduped by unit
id), not the old chart-wide/unscoped `getRequiredUnits()` call — a unit only
needed by another Quadrant, or not on any Quadrant, no longer shows up in
the default pool, only via search. `SquadBuilder` takes a `quadrant:
Quadrant` prop instead of a bare `quadrantId`; `api.getRequiredUnits` /
`GET /units/required` is now unused from the frontend. (2) "Search all
characters" moved above "Drag from pool" and now filters that same pool
grid in place (was: pool always shown unfiltered, search only appended an
untouched second list below it); a second "Other matches" section still
lists full-catalog hits the Quadrant's own pool doesn't already offer. (3)
The pool/search area is wrapped in a new scrollable `.squad-pool-scroll`
(bounded height, styled as a recessed panel) so the squad slots above it
stay on-screen once the pool is long, and `UnitDragCard` gained a
double-click handler (fills the next empty slot, special/leader first) as
a non-drag shortcut. A filled `SquadSlot` is now itself a drag source
(`SlotRef`/`getSlotUnit`/`setSlotUnit` in `SquadBuilder.tsx`) - dragging one
slot onto another swaps their units (a custom `application/x-squad-slot`
dataTransfer payload distinguishes this from a pool/catalog drag, which only
ever carries a unit id), so fixing a wrong leader pick is a drag onto a
member slot rather than clear-then-redrag. The Notes textarea also got its
own header + real styling (`.squad-notes-textarea`, was a bare unstyled
`<textarea>`).

Prior session's work, commit `517609e` (`fe08403`..`517609e`): Quadrants
became fully independent in the Plan and Visualise tabs — the only place
they chain is the Roadmap. Three changes: (1) `RoadmapView.tsx`'s
`buildLocations` dedupes to one card per unit per location box (a unit
re-listed in a later Quadrant, or farmable twice under its own event, no
longer doubles); (2) `SectorEditorPanel.tsx`'s "Feeds into" / "Unlocks"
remote picker is scoped to the **current Quadrant's** other Sectors only
(was every Quadrant's) and strips any stale cross-Quadrant absolute id
from the payload on save; (3) `flowGraph.ts`'s `deriveGraph` drops any
edge whose endpoints are in different Quadrants, and `layoutQuadrantPositions`
is now a plain left-to-right row (no dagre meta-graph, since there are no
inter-Quadrant edges to lay out). The `crossQuadrant` / `sourceQuadrantId`
/ `targetQuadrantId` fields on `RawEdge` are gone. Backend counterpart
(`navicharts`): `_assert_links_in_quadrant` 422s cross-Quadrant links,
migration `a1c4e7f9b2d3` purges existing rows.

**Docs current as of:** commit `1aedecd`. Added a `mod` role alongside `admin`
everywhere curated-chart publish/manage happens (`canModify`'s curated
branch, `canPublish`, the "All Shared" fetch/section gate — renamed from
"All Shared (Admin)"), while `ChartCard`'s `canDelete` deliberately stayed
narrower — mirroring the backend's three-tier `_can_delete` (mod: curated
only) rather than just adding `isMod` alongside `isAdmin`. Also added
owner-username display on library cards via shared-ui's new
`fetchUsernames` (batched once per render), currently blocked on that
package's `npm publish`. See "App architecture"'s new "Mod role" note and
"Owner usernames" note for the specifics.

Prior session's work, commit `3e4d3af` (on top of
`bd3f11a`): the backend gained
`PATCH /{id}/name` (rename), `POST /{id}/copy` (non-admin fork into a
private chart, Squads included), and `GET /admin/shared`; the frontend
picked up all three (inline rename in the chart header, "Create a copy"
button, an admin-only "All Shared (Admin)" library section) and, more
importantly, fixed `canModify` - it had hard-coded `curated` as always
read-only in the UI regardless of role, which had drifted out of sync with
the backend's actual `_can_modify` (which grants admins in-place edit
rights on curated charts). See the "App architecture" section below for
the corrected rule.

Prior session's work (on top of
`c39dbca`): the Visualise tab's flow graph (`flowGraph.ts`) got two related
changes. First, a routing fix - unlock edges (System->Waypoint) used to be
a plain unrouted `smoothstep`, unlike prerequisite edges, so a line could
cut straight through an unrelated card; both edge kinds now share one
obstacle-aware `routedEdge` type (`buildRoutedFlowEdge`), and edge paths
are recomputed once via `recomputeEdgePaths` after React Flow reports real
measured node sizes (`FlowView.tsx`'s `useNodesInitialized`), since the
dagre layout's own hand-estimated card sizes can drift from the rendered
CSS. Second, a goal-centered radial layout: `detectGoalSector` derives a
Quadrant's convergence point purely from its existing unlock-edge
structure (no schema change - the Waypoint with the highest unlock
in-degree, gated on also living in its own dedicated Sector with 0
Systems), and `layoutSectorPositionsRadial` arranges the Quadrant's other
Sectors as spokes around it (with a two-ring fallback past
`MAX_SECTORS_PER_RING` Sectors, split by which Sectors directly unlock the
goal). `layoutQuadrantCluster` picks radial vs. the original linear
`layoutSectorPositions` per-Quadrant; a Quadrant with no clear convergence
point (still sparse, or genuinely no goal shape) falls back to the linear
layout untouched. The goal Sector's `SectorGroupNode` renders with a
`sector-group-node--hub` CSS variant (solid border) instead of the usual
dashed outline.

Prior session's work (on top of `c39dbca`): scoped `Squad Builder` to a
Quadrant instead of the whole chart. It used to render once, at the very bottom of the
entire Plan tab (after every Quadrant card), backed by a `Squad` model
that was deliberately chart/Quadrant-agnostic. Now `Squad` has a required
`quadrant_id`, `SquadBuilder` renders inside each `Quadrant` card
(`Quadrant.tsx`, after its sector list), and creating a squad tags it to
that Quadrant. The Visualise tab's `SquadList` now groups squads by
Quadrant when the Quadrant nav bar has none selected, and narrows to one
Quadrant's squads when it does - mirroring the flow graph's own filtering.
`SquadForm`'s drag pool was chart-wide at this point (`getRequiredUnits`,
unscoped) with a "Search all characters" box (`getUnitCatalog`) added
alongside it for anything not in that pool - since superseded by the
Quadrant-scoped pool described at the top of this section.

Prior session's work (`d7f0e2f`..`79810bf`): restructured the app around a
`library`/`chart` split —
`/navicharts/` with no `?chart=` param now lands on a Star Chart **library**
(Curated/Mine/Guild/Bookmarked) instead of auto-resuming whatever chart was
last open via `localStorage`; opening a chart is a deliberate action, and
the URL's `?chart=<id>` is now the single source of truth for which chart
is open (no more `localStorage.activeStarChartId`). Bookmark and, for
owners of Shared charts, Copy-link now live directly in the chart header
instead of only inside the library grid, since that's where you actually
land after following a share link. `StarChartPicker.tsx` (the old corner
dropdown + inline creation form) was retired; `ManageStarCharts.tsx` was
renamed to `StarChartLibrary.tsx` and is now the home screen, not a fifth
tab bolted onto the per-chart view switcher. `f1f5852` then fixed two
login-gated actions ("+ New Star Chart", Bookmark) that were rendering
unconditionally instead of only when a user is actually logged in.

When you make a change that affects documented behavior, update this note
to the commit you've brought the docs level with, so the next session can
`git log <hash>..HEAD` to see what isn't documented yet.

## Scope rule (read first)

This is a **submodule**. Everything you change must stay inside
`navicharts-ui/`. Do not edit, read as authoritative, or make assumptions
based on sibling submodules (`navicharts`, `astrogators-table`,
`astrogators-hub`, `astrogators-shared-ui`, `mod-ledger-ui`, `nightwatcher`)
or the parent `astro-table/` workspace root. If a task seems to require
changes outside this folder, stop and ask first.

## What this service is

React 19 + Vite 8 + TypeScript SPA — the frontend for `navicharts` (the
SWGOH farming-roadmap planner backend). Two things live here:

- **Star Chart library + viewer** — browse Curated/Mine/Guild/Bookmarked
  charts, open one, and view/edit it across four tabs (Roadmap, Plan,
  Visualise, Inventory).
- **Squad Builder** — example-team widget scoped to a single Quadrant,
  rendered inside that Quadrant's own card in the Plan tab (`Quadrant.tsx`).
  A squad belongs to the Quadrant it's an example for, since it's gated by
  which characters are unlocked by that point. The Visualise tab's
  `SquadList` shows the same squads read-only, grouped by Quadrant unless
  the Quadrant nav bar has one filtered.

It has **no router** (no `react-router` dependency) — the whole app is one
component (`App.tsx`) driven by a handful of `useState` values, not routed
pages. See "App architecture" below before assuming a router-based mental
model.

It consumes `astrogators-shared-ui` (npm) for `AuthProvider`/`useAuth`,
`NavBar`, and the design-system components (`Card`, `Badge`, `Select`,
`Button`, `Input`) — do not fork auth or hand-roll a second API client; see
that package's own `CLAUDE.md`.

## Single-origin rule

Same as every other frontend in this workspace: served through the
workspace nginx at one origin (`http://localhost/` dev,
`https://astrotable.org/` prod). Every `VITE_*_URL` must go through
that proxy — never a direct backend port — or auth state (localStorage,
scoped per origin) breaks across apps.

## Stack

- Node 24, React 19.2, Vite 8, TypeScript 6
- `@xyflow/react` + `@dagrejs/dagre` — the Visualise tab's flow diagram
- No router, no state-management library — plain `useState`/`useCallback`
  in `App.tsx`, prop-drilled down

## Common commands

```bash
npm install
npm run dev             # :5176, served under /navicharts/ via nginx
npm run build            # tsc -b && vite build -> ./dist
npm run type-check       # tsc --noEmit
docker compose -f docker/docker-compose.yml --env-file .env up -d --build
```

Prefer `scripts/start_frontends.sh` (workspace root) over a bare `npm run
dev` in the background — it runs every frontend in its own named tmux
session (`tmux ls` / `tmux attach -t navicharts-ui` / `tmux kill-session -t
navicharts-ui`) and refuses to double-start or steal a claimed port.

## App architecture

`App.tsx` holds two independent state machines:

- **`appMode: 'library' | 'chart'`** — which top-level screen is showing.
  Initialized once from the URL (`chartIdFromUrl()` — a `?chart=<id>` query
  param means `'chart'`, its absence means `'library'`) and only changed by
  `openChart(id)` (library → chart) or `goToLibrary()` (chart → library,
  strips `?chart=` via `history.replaceState`). Nothing auto-picks a
  default chart to show — an empty library is a normal empty state, not a
  blocking app-level error.
- **`view: 'roadmap' | 'plan' | 'visualise' | 'inventory'`** — which tab is
  active *inside* chart mode. Irrelevant while `appMode === 'library'`.

**The URL is the single source of truth for which chart is open.**
`activeStarChartId` changes are mirrored into `?chart=<id>` via
`replaceState` (not `pushState` — switching charts isn't meant to build
back/forward history), so a page reload naturally lands back on the same
chart. There is deliberately no `localStorage`-based "resume last chart"
fallback — a bare visit to `/navicharts/` always lands on the library.

**`StarChartLibrary.tsx`** (`Curated`/`Mine`/`Guild`/`Bookmarked` sections,
each a grid of `ChartCard`s) is the only place chart creation happens
(`+ New Star Chart`) and the only screen an anonymous visitor sees
anything from — every login-gated action (`+ New Star Chart`, Bookmark,
visibility changes, Delete, Publish) must check `isLoggedIn`/`userId`, not
just "am I the owner," since an anonymous visitor also isn't the owner of
anything and would otherwise see actions that just 401.

**Bookmark and Copy-link also live in the chart header** (`App.tsx`'s
`app-header` Card), not only on library cards — reachable the moment you
land on a chart via a share link, without a detour through the library.

**`canModify`** mirrors the backend's `_can_modify` exactly: `private`/
`guild`/`shared` are owner-only, `curated` is admin-OR-mod (not owner-gated -
curated charts have no owner). An admin/mod edits curated content **in
place** here, the same tree UI as any other chart - this was previously
(2026-05-19–2026-08-20) hard-coded to treat `curated` as unconditionally
read-only regardless of role, which had drifted from the backend after it
gained the admin bypass; fixed once the drift was noticed. If you touch
`canModify` again, keep it in sync with `navicharts/src/api/v1/endpoints/
star_charts.py`'s `_can_modify` - there's no shared source of truth
between the two services for this rule, just convention.

**Mod role: publish/manage parity with admin, delete does NOT match.**
`isMod` (`user?.role === 'mod'`) now sits alongside `isAdmin` everywhere
curated-chart publish/manage happens: `canModify`'s curated branch, the
library's `canPublish` and the "All Shared" section fetch/visibility gate.
**`ChartCard`'s `canDelete` in `StarChartLibrary.tsx` deliberately does
NOT become `isOwner || isAdmin || isMod`** - it mirrors the backend's
three-tier `_can_delete` exactly: `isOwner || isAdmin || (isMod &&
chart.visibility === 'curated')`. A mod can delete/un-publish a curated
chart (that's what un-publishing means here) but not another user's
private/guild/shared chart - admins keep their existing broader
any-chart delete power alone. If you touch `canDelete` again, keep this
three-way split in sync with the backend's `_can_delete`, same convention
caveat as `canModify` above.

**`POST /{id}/copy`** (any authenticated user, any chart they can view) is
the non-admin counterpart to Publish - forks into a new **private** chart
the caller owns. Both Copy and Publish clone Squads too (as of
2026-08-20 - Publish originally excluded them, changed after a user found
squads missing from a curated chart). "Create a copy" in the chart header,
shown whenever you're viewing a chart
you don't own. Unlike Bookmark, this has no toggle/undo state - it's a
one-shot action that switches you straight into the new copy.

**Chart rename** (`PATCH /{id}/name`) lives inline in the chart header -
click the pencil next to the title (only rendered when `canModify`) to
swap the `<h1>` for an `Input` + Save/Cancel. No dedicated editor
component for this like `QuadrantBuilder` - a single string field didn't
warrant one.

**`GET /star-charts/admin/shared`** backs the "All Shared" library section
(`StarChartLibrary.tsx`) - the one place an admin or mod can browse every
Shared chart across every owner, since Shared is otherwise link-only.
Fetched when `user.role === 'admin' || user.role === 'mod'` (renamed from
"All Shared (Admin)" now that mods see it too).

**Owner usernames** render via shared-ui's `fetchUsernames` — batched once
per `StarChartLibrary` render over every distinct `owner_user_id` across
all five sections (not per-card), stored in a local `usernames` map and
passed down through `sectionProps`. `ChartCard` shows "by {username}"
under the chart name whenever it isn't the viewer's own chart and a
username resolved. **Requires `astrogators-shared-ui` >= 0.11.0** — built
and version-bumped in that submodule but not yet `npm publish`ed (needs
the user's interactive npm login). Until published and this app's
dependency is bumped + reinstalled, `StarChartLibrary.tsx`'s
`fetchUsernames` import fails type-check.

**Delete confirmation** uses an established arm-then-confirm pattern
(local `confirmingDelete` boolean, button relabels to "Confirm?" for 3s via
`setTimeout`, second click within the window fires the real delete) — used
identically in `Quadrant.tsx`, `SectorGroup.tsx`, `SquadBuilder.tsx`, and
`StarChartLibrary.tsx`'s `ChartCard`. Reuse this, not a `Modal` confirm
dialog, for any new destructive action.

## Critical rules

**No camelCase translation layer.** `api.ts`/`types.ts` mirror the
backend's field names verbatim (snake_case) — this app's original
standalone-project convention. Don't introduce a mapping layer.

**`Card`/`Badge`/`Select`/`Button`/`Input` come from `astrogators-shared-ui`
only.** Don't hand-roll a second design system; if a shared component is
missing something, extend it there (see that package's `CLAUDE.md`) and
bump the version — don't fork.

**Literal routes before dynamic routes on the backend mean the same on the
frontend's `api.ts`:** `getGuildStarCharts`/`getBookmarkedStarCharts` etc.
hit fixed backend paths (`/star-charts/guild`, `/bookmarks`) — if you add a
new list endpoint, confirm the backend registered it before the
`{star_chart_id}` dynamic route (see `navicharts/CLAUDE.md`).

## Configuration

`.env` (gitignored; `.env.example` is committed) is inlined at **build**
time by Vite — changing it requires a rebuild, not just a restart.

- `VITE_NAVICHARTS_URL` — navicharts backend, full URL incl.
  `SERVICE_PREFIX`.
- `VITE_ASTROGATORS_TABLE_URL` — astrogators-table backend (auth), same
  convention.

`vite.config.ts`'s `base: '/navicharts/'` must match the prod mount point
— don't change it unless the deployment URL changes.

## When adding dependencies

Use `npm install` (not yarn/pnpm). Commit both `package.json` and
`package-lock.json`. Rebuild the Docker image after dependency changes.
