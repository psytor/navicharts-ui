# CLAUDE.md — navicharts-ui

Guide for Claude Code when working inside this submodule.

## Documentation currency (update when you edit docs)

**Docs current as of:** commit `c39dbca`. That session's work (this
session, on top of `c39dbca`): scoped `Squad Builder` to a Quadrant instead
of the whole chart. It used to render once, at the very bottom of the
entire Plan tab (after every Quadrant card), backed by a `Squad` model
that was deliberately chart/Quadrant-agnostic. Now `Squad` has a required
`quadrant_id`, `SquadBuilder` renders inside each `Quadrant` card
(`Quadrant.tsx`, after its sector list), and creating a squad tags it to
that Quadrant. The Visualise tab's `SquadList` now groups squads by
Quadrant when the Quadrant nav bar has none selected, and narrows to one
Quadrant's squads when it does - mirroring the flow graph's own filtering.
`SquadForm`'s drag pool stayed chart-wide (`getRequiredUnits`, unscoped) by
design - it was never "every character in the game," only units your own
charts already reference as a requirement or reward. A "Search all
characters" box was added alongside it (queries `getUnitCatalog`, the full
game roster, filtered client-side by name) so a squad can still include a
unit your farming plan doesn't itself name - the default pool list is
unchanged, search is purely additive.

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
`https://astrotable.dynv6.net/` prod). Every `VITE_*_URL` must go through
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

**`canModify`** mirrors the backend's `_can_modify` exactly: `curated` is
always read-only in the UI regardless of role — an admin edits curated
content indirectly, by publishing a new snapshot from the library, never
by mutating an already-curated chart in place.

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
