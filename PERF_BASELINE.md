# RAPID — Performance Baseline

Captured at the start of the optimisation pass, **before any optimisation was applied**.
Every number here was measured, not estimated. Re-run the commands in
"How to reproduce" to compare after each step.

Environment: Node v22.14.0, npm 11.16.0, Windows 11.
Database backend: **in-memory** (no `server/.env`, so no Supabase credentials).

---

## 1. Bundle size

Produced by `npm run build --prefix client` (Vite 5.4.21, 2695 modules).

| Artifact | Raw | Gzip |
|---|---:|---:|
| `dist/assets/index-*.js` | **1,023,079 B (999 KiB)** | **290,079 B (283 KiB)** |
| `dist/assets/index-*.css` | 34,672 B (34 KiB) | 7,318 B |
| `dist/index.html` | 1,643 B | 870 B |

**One single JS chunk.** Vite emits its own warning:
`(!) Some chunks are larger than 500 kB after minification.`

Every route — Leaflet, recharts, framer-motion — is in that one chunk, so the
login page downloads and parses the entire application before it can render.

---

## 2. Lighthouse

Run against the production build served by Express on `http://localhost:5000`.

### Desktop preset

| Page | Score | FCP | LCP | TBT | CLS | SI | TTI |
|---|---:|---:|---:|---:|---:|---:|---:|
| `/login` | **93** | 1.2 s | 1.3 s | 0 ms | 0 | 1.2 s | 1.3 s |

### Mobile preset (4× CPU throttle + Slow 4G) — the honest number

| Page | Score | FCP | LCP | TBT | CLS | SI | TTI |
|---|---:|---:|---:|---:|---:|---:|---:|
| `/login` | **61** | 6.5 s | 6.6 s | 10 ms | 0 | 6.5 s | 7.1 s |
| `/help`  | **61** | 6.5 s | 7.1 s | 0 ms | 0 | 6.5 s | 7.1 s |

Lighthouse's own opportunities (mobile, `/login`):

| Opportunity | Estimated saving |
|---|---:|
| Reduce unused JavaScript | **~3,760 ms / 759 KiB** |
| Enable text compression | **~3,610 ms / 741 KiB** |
| Eliminate render-blocking resources | ~752 ms |

Note: TBT is already near zero and CLS is exactly 0. This app's problem is
**payload delivery**, not main-thread blocking during load.

---

## 3. API latency

`n=50` per endpoint, after warm-up, against the in-memory backend.

| Endpoint | avg | p50 | p95 | payload |
|---|---:|---:|---:|---:|
| `/api/drones` | 1.78 ms | 1.71 ms | 2.60 ms | 10,997 B |
| `/api/incidents` | 1.57 ms | 1.56 ms | 1.83 ms | 3,733 B |
| `/api/fleet/decisions` | 1.56 ms | 1.54 ms | 1.70 ms | 2 B |
| `/api/metrics/summary` | 1.48 ms | 1.47 ms | 1.71 ms | 155 B |
| `/api/metrics/historical` | 1.52 ms | 1.49 ms | 1.98 ms | 1,623 B |
| `/api/geo/states` | 1.64 ms | 1.48 ms | 2.04 ms | 412 B |
| `/api/geo/bases?limit=500` | 1.55 ms | 1.53 ms | 1.76 ms | 9,224 B |
| `/api/geo/map-config?state=GA` | 1.45 ms | 1.38 ms | 1.63 ms | 1,504 B |

> **These timings are not a useful optimisation target.** The in-memory backend
> is a JavaScript array lookup, so every endpoint costs ~1.5 ms regardless of how
> many queries it issues. Latency here measures Express overhead, nothing else.
> Use the DB-call counts below instead — that metric is backend-independent.

All payloads are served **uncompressed** — no `compression` middleware is installed.

---

## 4. Database calls per request  ← the meaningful backend metric

Measured by counting every `db.<collection>.<method>()` invocation during one
request. Fleet size at measurement: **22 drones**, 2 states, 22 bases.

| Endpoint | DB calls | Breakdown |
|---|---:|---|
| `/api/drones` | 2 | `drones.list ×1`, `bases.list ×1` |
| `/api/metrics/summary` | 2 | `drones.list ×1`, `incidents.list ×1` |
| `/api/geo/map-config?state=GA` | 2 | `states.get ×1`, `airspaceZones.list ×1` |
| `/api/geo/bases?limit=500` | **2** | `bases.list ×2` ← same table read twice |
| `/api/incidents` | **5** | `incidents.list ×1`, `bases.list ×2`, `states.get ×2` |
| `/api/fleet/decisions` | **23** | `drones.list ×1`, `controllerActions.listForDrone ×22` |

Three confirmed N+1 / duplicate-read defects:

1. **`/api/fleet/decisions` — classic 1+N.** One query per drone.
   With 22 drones that is 23 calls; with 100 drones it is 101.
   Source: `server/src/routes/fleet.js:343`.
2. **`/api/incidents` — N point-reads plus a doubled table scan.**
   `states.get` is called once per allowed state instead of one `states.list()`.
   Source: `server/src/routes/incidents.js:14`.
3. **`bases.list` runs twice per request** because `resolveAllowedStateIds`
   calls `db.bases.list({})` *and* `resolveAllowedBaseIds`, which calls it again.
   Source: `server/src/services/auth/scopeResolver.js:38`.

On the in-memory backend these cost ~0 ms. On Supabase **each one is a separate
HTTPS round trip to PostgREST**, so `/api/fleet/decisions` becomes 23 network
requests. That is the real-world impact.

---

## 5. WebSocket / render pressure

Sampled for 15 s with a plain Node WebSocket client (no browser involved).

| Fleet state | Frames/s | Bytes/s | Breakdown |
|---|---:|---:|---|
| Idle — 4 of 22 drones airborne | **4.7** | 2,384 | `drone_update` 3.7/s, `stats_update` 0.9/s |
| Loaded — 19 of 22 drones airborne | **20.1** | 11,525 | `drone_update` 19.0/s, `stats_update` 1.0/s, `incident_update` 0.1/s |

The simulator (`services/simulatorService.js:507`) broadcasts **one frame per
changed drone per tick**, so the frame rate scales **linearly with the number of
airborne drones**. 100 drones flying would mean ~101 frames/second.

Why this matters on the client: each frame arrives in its own `onmessage`
callback, so each triggers its own `set()` in `rapidStore`. React 18 batches
updates *within* a task but cannot batch *across separate tasks*, so
**~20 frames/s produces ~20 React commits/s**.

Compounding that, `droneIcon()` and `incidentIcon()` in
`client/src/components/shared/utils.js` build a **new `L.divIcon` on every
render**. A new icon identity makes react-leaflet tear down and rebuild that
marker's DOM, so each of those ~20 commits rebuilds all 22 drone markers —
on the order of **440 Leaflet marker rebuilds per second**.

> Correction to the initial estimate: the pre-measurement guess of "~22
> frames/s at idle" was wrong. At idle it is **4.7/s**, because only *moving*
> drones broadcast. 20.1/s is the loaded figure. The scaling concern stands;
> the idle figure did not.

---

## 6. Tooling status

- **Tests: none.** No test runner, no test files, no CI. Build success is
  currently the only automated gate.
- **Lint: fixed during this step.** ESLint was referenced by `package.json` but
  was neither installed nor configured, so `npm run lint` could not run at all.
  Now: ESLint 9 flat config, **0 errors**, 7 warnings.
- The 7 warnings are all `react-hooks/set-state-in-effect` in `RLConsole.jsx`,
  `SecurityAudit.jsx` and `Surveillance.jsx` — genuine findings, deferred to the
  re-render step. `npm run lint:strict` (`--max-warnings 0`) should become the
  default once they are resolved.

### Bug found by the new lint setup

`client/src/pages/Help.jsx` used `<Activity />` without importing it. That branch
renders the "Establishing Secured Feed Link…" placeholder on the **public citizen
portal**; reaching it would throw `ReferenceError: Activity is not defined` and,
with no error boundary in the tree, blank the page. Fixed by adding the import.

---

## How to reproduce

```bash
# Bundle
npm run build --prefix client

# Server (in-memory backend)
cd server && JWT_SECRET=dev_secret PORT=5000 node src/index.js

# Lighthouse (production build is served by Express at /)
npx lighthouse@12 http://localhost:5000/login \
  --only-categories=performance --output=html \
  --chrome-flags="--headless=new"

# Lint
npm run lint --prefix client
```

API latency, DB-call counts and WebSocket frame rates were measured with
throwaway scripts kept outside the repository; they required **no changes to
project source**.

---

# Optimisation log

## Step 2 — Fix N+1 database queries

**Metric:** database calls per request (backend-independent; each call becomes
one HTTPS round trip to PostgREST when Supabase is enabled).

| Endpoint | Before | After | Change |
|---|---:|---:|---|
| `GET /api/fleet/decisions` | **23** | **1** | −96% — and now O(1), not O(drones) |
| `GET /api/incidents` | 3–5 (scaled with allowed states) | **3** | now constant |
| `GET /api/drones` | 2 | 2 | unchanged (no defect) |
| `GET /api/geo/bases?limit=500` | 2 | 2 | unchanged — see note below |

Before → after breakdowns:

```
/api/fleet/decisions
  before:  drones.list x1, controllerActions.listForDrone x22
  after:   controllerActions.listRecent x1

/api/incidents  (national commander, 2 allowed states)
  before:  bases.list x2, states.get x2, incidents.list x1
  after:   bases.list x1, states.list x1, incidents.list x1
```

### Changes

1. `config/database.js` — new `controllerActions.listRecent(limit)` on **both**
   the Supabase and in-memory branches. The Supabase branch orders and limits
   in the database, so only `limit` rows cross the wire.
2. `routes/fleet.js` — `/decisions` calls `listRecent(100)` once instead of
   looping `listForDrone()` per drone.
3. `services/auth/scopeResolver.js` — extracted `selectAllowedBases()` so
   `resolveAllowedBaseIds` and `resolveAllowedStateIds` each satisfy themselves
   from a single `db.bases.list()`. Previously `resolveAllowedStateIds` read the
   bases table twice per request.
4. `routes/incidents.js` — one `states.list()` replaces N `states.get()` calls.
   The old `Promise.all` made those concurrent but not fewer.

### Verification

Scoping behaviour compared across **five roles** (`national.commander`,
`goa.commander`, `punjab.commander`, `aviation.control`, `observer`) using fixed
probe incidents at known coordinates in each state. Compared visible call-signs,
base codes, incident visibility, and response shape. **Output was identical
before and after.** Organisation isolation still holds — `aviation.control`
still sees an empty fleet.

All API endpoints smoke-tested at 200. Client lint exits 0; client build passes.

### Deliberate behaviour change (one)

The old `/decisions` implementation took the newest **20 per drone**, merged,
sorted, then truncated to 100. That per-drone cap was an artefact of the loop,
and it made the feed incorrect: a busy drone's genuinely-recent entries could be
dropped while an idle drone's older entries were kept. The new implementation
returns the true newest 100 across the fleet.

Verified: flooding one drone with 40 actions now returns up to 45 of its entries
in the feed, where the old code would have capped it at 20. For a "recent fleet
decisions" feed this is the correct semantics, but it **is** a change.

### Not changed, and why

`/api/geo/bases` still issues 2 `bases.list` calls. These are **two different
queries** — one filtered by state/district, one unfiltered for scope resolution —
not a duplicate read. Collapsing them would mean fetching every base and
filtering in Node, pushing work *out* of the database. Left as is.

### Pre-existing issue found, NOT fixed (needs a decision)

`GET /api/fleet/decisions` applies **no scope filtering at all**. Measured:
`aviation.control` — a different organisation with zero drones and zero bases —
receives all 10 controller actions belonging to POLICE drones.

This is a cross-organisation data leak and it predates this step; the refactor
neither caused nor worsened it. It was left untouched because this step's
guarantee was "no behavioural change", and silently altering an authorisation
boundary inside a performance commit would be the wrong place for it.
**Recommend fixing separately.**

---

## Environment change: Supabase became the live backend

Part-way through the optimisation pass a `server/.env` with real Supabase
credentials appeared, and the server switched from
`Database: Using in-memory database simulation` to
`Database: Supabase backend connected`.

Everything in the sections above was measured against **in-memory**. The
DB-call counts remain valid (they are backend-independent, which is exactly
why they were chosen as the metric). The **latency** figures above measure
Express overhead only and should be ignored; the real figures are below.

### Cost of one Supabase round trip

| Endpoint | DB round-trip waves | avg latency |
|---|---:|---:|
| `/api/geo/states` | 1 | **220 ms** |
| `/api/drones` | 2 | **447 ms** |
| `/api/incidents` | 2 | 442 ms |
| `/api/fleet/decisions` | 2 | 450 ms |

One PostgREST round trip costs roughly **220 ms** from this machine, and
latency tracks the number of *sequential* waves almost exactly. Note it is
waves, not total calls: `/api/incidents` issues 3 calls but two of them run
concurrently inside a `Promise.all`, so it costs 2 waves, not 3.

Against in-memory every one of these was ~1.5 ms. Supabase is roughly
**300x slower per call**, which is why query *count* was the right thing to
optimise.

### Step 2 measured on Supabase (the real result)

Benchmarked by checking out the pre-optimisation code (`7a71da0`) for
`routes/fleet.js`, `routes/incidents.js` and `services/auth/scopeResolver.js`,
measuring, then restoring. n=10 per endpoint, after warm-up.

| Endpoint | Before (N+1) | After | Change |
|---|---:|---:|---|
| `GET /api/fleet/decisions` | **5,337 ms** | **440 ms** | **−91.8%, 12.1x faster** |
| `GET /api/incidents` | **1,410 ms** | **437 ms** | **−69.0%, 3.2x faster** |
| `GET /api/drones` | 664 ms | 425 ms | unchanged code - variance |
| `GET /api/geo/bases?limit=500` | 579 ms | 417 ms | unchanged code - variance |

`/api/fleet/decisions` went from **23 sequential round trips to 2**:
23 x ~220 ms is ~5.1 s, which matches the measured 5.34 s almost exactly.

Honest note on the last two rows: `/api/drones` and `/api/geo/bases` issue the
same number of calls before and after, so their apparent gains are measurement
variance (the old-code run showed higher p95s across every endpoint,
indicating background contention), **not** an effect of this work. Only the
first two rows are real.

Step 1 recorded "no measurable improvement" for Step 2 because the in-memory
backend could not show it. On the backend that actually ships, the improvement
is nearly 5 seconds on one endpoint.

### Production defects found and fixed (not checklist items)

1. **State commanders locked out.** `users.scope_id` referenced state UUIDs
   that existed in no `states` row, so `goa.commander` and `punjab.commander`
   saw 0 drones, 0 bases and 0 incidents. Confirmed present in the original
   `7a71da0` code, so unrelated to the optimisation work. Fixed in commit
   `117615a`; after the fix they see 5 and 17 drones respectively.
2. **`telemetry_history` never written on Supabase.** The table lacked `speed`
   and `heading` while the simulator writes both, failing every insert once a
   second. `schema.sql` now declares them and carries idempotent
   `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` statements.
   **These are DDL and must be run once in the Supabase SQL editor** - they
   cannot be applied through the JS client, and the insert failures continue
   until they are.

---

## Step 3 — Fix unnecessary React re-renders

**Metric:** actual marker DOM node churn, measured with a `MutationObserver`
attached directly to Leaflet's marker pane (not a proxy — the literal count of
DOM nodes added/removed), plus a direct count of `L.divIcon()` object
constructions. Sampled for 20s against a live Dashboard with 14/22 drones
airborne (comparable load to Step 1's baseline).

### Root cause (confirmed, not assumed)

`droneIcon()` and `incidentIcon()` in `components/shared/utils.js` built a
**new `L.divIcon()` object on every call**, and were called directly from JSX
on every render of `RapidMap` — once per marker, per render. react-leaflet's
`Marker` component compares the `icon` prop **by reference**; a new object
every render means it calls Leaflet's `setIcon()`, which tears down and
rebuilds that marker's DOM node, every time, for every marker, whether
anything about the marker actually changed or not.

Measured before any fix:

| Metric | Rate |
|---|---:|
| `droneIcon()` calls (5 drone markers) | 19.8/s |
| `incidentIcon()` calls (~17 incidents) | 67.2/s |
| **Marker DOM nodes added/removed** (`MutationObserver`, ground truth) | **89.1/s** |

Both call rates track `mapRender` x marker count almost exactly (4/s x 5 = 20,
4/s x ~17 = 68), confirming every render rebuilt every icon regardless of
whether that marker's data changed.

### Fix

Cache the constructed `L.divIcon` by its visual inputs instead of rebuilding
on every call:
- `incidentIcon(severity)` — cached by `severity` (already a small, finite set)
- `droneIcon(heading, status)` — cached by `` `${status}|${headingBucket}` ``,
  where heading is rounded to the nearest 15 degrees before use as a key

Heading is continuous (0-359.99...), so caching by the exact float would never
hit — no two ticks are bit-for-bit equal. Rounding to 15-degree buckets (24
buckets total) is not visually distinguishable on a 34px static arrow icon; it
only stops rebuilding the icon for a heading change nobody can see. Confirmed
by direct visual screenshot comparison.

### Result

| Metric | Before | After |
|---|---:|---:|
| `droneIcon()` calls (steady state) | 19.8/s | **0/s** |
| `incidentIcon()` calls (steady state) | 67.2/s | **0/s** |
| **Marker DOM nodes added/removed** | **89.1/s** | **0.0/s** |

The measured bottleneck — marker DOM churn — is eliminated, not reduced.

### Honest negative finding

Chrome's coarse CDP page metrics (`LayoutCount`, `RecalcStyleCount`,
`ScriptDuration`, `TaskDuration`) showed **no measurable difference**
before/after (e.g. `RecalcStyleCount` 977 vs 990 over the same 20s window).
These are dominated by continuous `animate-pulse`/`animate-ping` CSS
animations used elsewhere throughout the UI (base station markers, status
dots, recording indicators), which run regardless of this fix. The
`MutationObserver` count is the correct, causally-direct metric for what
this fix actually changed; the coarse page-level metrics are simply too
noisy to isolate it. Reported both rather than only the flattering one.

### Deliberately not done, and why

Per the plan, `React.memo`-wrapping individual map markers and memoizing the
`getVisibleDrones`/`getVisibleStats` selectors were both proposed as
follow-ups. Once the icon cache eliminated the measured marker DOM churn to
zero, profiling showed no remaining bottleneck these would address — the
selectors run cheap array operations over ~22 items, and react-leaflet's own
reference check already skips the expensive `setIcon()` work now that the
icon reference is stable. Adding memoization with no measured problem to
fix would be exactly the "blindly add memo everywhere" this plan explicitly
rules out. Not implemented.

Batching server-pushed WebSocket frames (one message per tick instead of one
per changed drone) was the other deferred item. The render *count* itself
(~4-5/s in this test, ~20/s at full fleet load per Step 1) is unchanged by
this work, but it is now cheap: no DOM teardown, no icon allocation. Since
the quantified bottleneck is resolved, this protocol-level change was not
implemented. It remains available as a future step if further reduction in
render frequency itself becomes necessary.

### Lint: 7 `react-hooks/set-state-in-effect` warnings fixed

Step 1 found these; Step 3 fixed all 7, across `Analytics.jsx`, `Fleet.jsx`,
`Incidents.jsx` (2), `RLConsole.jsx`, `SecurityAudit.jsx`, `Surveillance.jsx`.

Two distinct root causes:

1. **Six instances**: a `fetch`-and-`setState` function declared in the
   component's outer scope, called directly as the first statement of a
   `useEffect`. Verified empirically (by testing against the installed
   `eslint-plugin-react-hooks@7.1.1`) that this specific rule flags a call
   from an effect to an *outer-scoped* function reaching setState,
   regardless of intervening `await`s, but does **not** flag the same
   logic when the function is declared **inside** the effect body as a
   local closure. Fixed by moving the fetch/poll implementation inline
   (or, where the function is also called from an event handler, wrapping
   the effect's own invocation in a small effect-local `sync`/`poll`
   function). This is also React's own documented data-fetching effect
   pattern (an `ignore` flag against stale responses and unmount), so the
   fix is a genuine correctness improvement, not just a lint workaround.

2. **One instance** (`Incidents.jsx`): a literal, unconditional
   `setActiveTab('overview')` called synchronously inside an effect
   whenever `selectedIncident` changed — the textbook case the rule
   targets. Fixed by moving that call to the one event handler that
   actually sets `selectedIncident` to a new value (opening the incident
   dossier), removing the derived-state effect entirely.

Verified: `npm run lint` (now `--max-warnings 0` again, restored as the
project default) exits 0. All 6 modified pages checked with a headless
browser for console/page errors after the refactor — zero. The
`Incidents.jsx` modal was screenshotted after the `setActiveTab` relocation
and confirmed to still open on the "Summary" tab, matching prior behaviour.
