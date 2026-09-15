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

---

## Step 4 — Remove unused dependencies

**Verification, not removal.** Phase 0's static grep already found every
dependency imported at least once. This step re-verified with a proper
dependency-analysis tool rather than trusting a simple grep, and checked for
one adjacent, easy-to-miss issue: duplicate library copies inflating the
bundle.

### Method

`depcheck` (AST-based, not text-matching) run separately against `client`
and `server`, plus `npm ls` to check for duplicate React/Leaflet versions
in the dependency tree.

### Result: zero unused dependencies

**Server:** `depcheck` reports **no issues** — all 11 dependencies
(`@supabase/supabase-js`, `@tensorflow/tfjs`, `bcryptjs`, `cookie-parser`,
`cors`, `dotenv`, `express`, `express-rate-limit`, `helmet`,
`jsonwebtoken`, `ws`) are genuinely imported and used.

**Client:** `depcheck` flagged 4 devDependencies as "unused." All 4 are
false positives, confirmed by reading the actual config files:

| Package | depcheck says | Actually |
|---|---|---|
| `tailwindcss` | unused | Referenced in `postcss.config.js` as a PostCSS plugin; Vite's CSS pipeline invokes it by name from that config, never via a JS `import`. Removing it breaks every Tailwind class in the app. |
| `postcss` | unused | The tool that `postcss.config.js` configures; invoked internally by Vite's build pipeline. |
| `autoprefixer` | unused | Same as above — a PostCSS plugin referenced only by name in config. |
| `@types/react-dom` | unused | A TypeScript-only devDependency (no `tsconfig.json` exists; the project is plain JS/JSX). It ships to editors for IntelliSense only and is never bundled — stripped entirely before build, zero runtime or bundle-size impact either way. Left in place: removing a dependency with zero performance effect, purely on a static-analysis false positive, is exactly the kind of unnecessary change rule #1 (never rewrite unnecessarily) warns against. |

`depcheck` cannot see into build-tool config files (`postcss.config.js`,
`tailwind.config.js`) or distinguish a type-only package from a bundled one
— both are known, documented limitations of the tool, not real findings.

### Duplicate-version check

`npm ls react react-dom leaflet` shows every transitive dependency
(`framer-motion`, `react-leaflet`, `recharts`, `react-router-dom`, etc.)
resolving to the **same single copy** of React 18.3.1 and Leaflet 1.9.4
(`deduped` in npm's output) — no second copy of either library is being
shipped in the bundle.

### Conclusion

No dependency was removed. **This is not a step being skipped — it is a
step that was run in full and found nothing to fix**, which is itself a
useful, honest result: the codebase was already clean here before this
optimisation pass began.

---

## Step 5 — API response caching

**Scope:** an in-process response cache in front of 4 of the 5 `/api/geo/*`
endpoints — deliberately narrow, per the caching-safety rules stated up
front (cache key / TTL / invalidation / stale-data risk, never cache
user-scoped data).

### What's cached, and why each one is safe

| Endpoint | TTL | Why safe |
|---|---:|---|
| `GET /api/geo/nations` | 10 min | Zero mutation routes exist anywhere in the app; not user-scoped |
| `GET /api/geo/states` | 10 min | Same |
| `GET /api/geo/districts?state=X` | 10 min | Same |
| `GET /api/geo/map-config?state=X` | 60s + active invalidation | Not user-scoped, but its `noFlyZones` field reads live, mutable `airspace_zones` data. `routes/airspace.js`'s create/update/delete zone routes now call `invalidate('geo:map-config:')` directly, so an edited no-fly zone is reflected on the very next fetch — the 60s TTL is a backstop, not the primary correctness mechanism, given this is safety-relevant drone-operations data. |

### Deliberately NOT cached

`GET /api/geo/bases` — this route filters through
`resolveAllowedBaseIds(req.user)`. Two different users hitting the
identical URL get different, organisation-scoped results; caching it by
URL would leak one organisation's base list to another. Documented
in-line in `routes/geo.js` rather than silently left out.

### Implementation

`server/src/middleware/apiCache.js` — a small, dependency-free in-memory
`Map`. No Redis, no new package: the app is a single Express process (one
Render web service, no horizontal scaling — confirmed in `render.yaml`),
so an in-process cache is the simplest *correct* choice today. The module
states explicitly that it would need to become a shared store the moment
a second instance runs behind a load balancer (Step 20's territory).

### Verification

Automated: request each cacheable endpoint twice, assert `X-Cache: MISS`
then `X-Cache: HIT`.

```
[OK] /api/geo/nations                       1st=MISS 2nd=HIT
[OK] /api/geo/states                        1st=MISS 2nd=HIT
[OK] /api/geo/districts?state=GA            1st=MISS 2nd=HIT
[OK] /api/geo/map-config?state=GA           1st=MISS 2nd=HIT
```

Scoping safety, proven rather than assumed: fetched `/api/geo/bases` as
`goa.commander` and `punjab.commander` in the same test run — 5 bases vs
17 bases, confirming the route is genuinely per-user and correctly
excluded from caching (no `X-Cache` header present at all).

Invalidation, proven under load: created a real airspace zone via
`POST /api/airspace/zones`, confirmed the warm `map-config` cache (which
had just returned `HIT`) flipped to `MISS` on the very next request —
i.e. the write correctly busted the cache rather than waiting out the
60-second TTL.

Full endpoint smoke test (12 routes) — all 200 after the change. Client
`lint`/`build` unaffected and still pass (server-only change).

### A bug this verification surfaced (not fixed here — see below)

While proving invalidation, the newly created zone did not appear in
`noFlyZones` even after the cache correctly refreshed. Traced to a
pre-existing defect in `db.states.get(id)` (`config/database.js`) that
predates this optimisation pass and is unrelated to the cache: on
Supabase, it filters by `.eq('id', id)` even when called with a *state
code* like `'GA'` (as 9 call sites across the app do), which can never
match a UUID column, and silently falls through to an in-memory fallback
seeded with fresh random UUIDs on every process boot. The `code`/`name`
fields it returns are correct; `.id` is not, and downstream foreign-key
filtering against Supabase (districts, bases, airspace zones) built from
that `.id` silently returns zero rows. Full details reported separately;
not fixed as part of Step 5 per the one-issue-per-step rule.

---

## Fix — `db.states.get()` silently resolved codes to the wrong row on Supabase

Fixes the bug found while verifying Step 5's cache invalidation. This is
a pre-existing data-correctness defect, not a performance item; recorded
here because it directly affected what Step 5's map-config caching was
serving.

### Root cause

`db.states.get(id)` filtered Supabase with a single `.eq('id', id)`. Nine
call sites across the app (`routes/geo.js`, `routes/airspace.js`,
`routes/surveillance.js`, `routes/fleet.js`, `rl/environment.js`) call it
with a human-readable **code** (`'GA'`, `'PB'`), not a UUID. That can never
match the UUID primary key, so the Supabase query always failed and the
function silently fell through to an **in-memory fallback seeded with a
fresh random UUID on every process boot**. The fallback's `code`/`name`
fields were correct (same static seed data), which is exactly why this
went unnoticed — anything reading `.name` or `.code` worked fine. Only
`.id`, used as a foreign key for filtering districts/bases/zones against
the real database, was silently wrong, and it changed on every restart.

Proven with live data before the fix:

```
REAL Supabase GA id:          9fec1674-...
db.states.get('GA') returned: 57d03680-...   (wrong, process-random)

districts matching the WRONG id: 0   (real count: 2)
bases matching the WRONG id:     0   (real count: 5)
```

This is the same class of bug as the `scope_id` mismatch fixed earlier in
this pass — a code passed to a lookup that only correctly resolves a real
Supabase UUID, silently falling back to a fabricated one.

### Fix

Matched the codebase's own established pattern for exactly this problem —
`organisations.get()` (a few lines below `states.get()` in the same file)
already does two safe equality lookups (id, then code) rather than one.
`states.get()` now does the same.

### Verified

| Check | Before | After |
|---|---:|---:|
| `states.get('GA').id` vs. real Supabase id | mismatch | **exact match** |
| `states.get(<real UUID>)` | (untested — moot, this path already worked) | still works |
| `states.get('bogus code')` | — | returns `null`, not a wrong record |
| `districts?state=GA` | 0 (wrong) | **2** (matches Supabase) |
| `bases?state=GA` | 0 (wrong) | **5** (matches Supabase) |
| `map-config?state=GA` noFlyZones | 0 (wrong — hid all 3 pre-seeded zones) | **3**, then 4 with a newly created test zone |
| `map-config?state=PB` noFlyZones | 0 (wrong) | **1** |

The impact was larger than the single failing test that surfaced it: this
bug hid **every pre-existing seeded no-fly zone for every state**, not
just newly created ones — a real, silent gap in a safety-relevant feature
(drone no-fly zone enforcement/display) that had been present since
Supabase was first connected.

Full 17-endpoint smoke test after the fix: all 200. Client lint/build
unaffected (server-only change).

---

## Step 6 — Cache expensive database queries

**Scope:** distinct from Step 5 (HTTP response caching). This targets one
specific internal query — `db.bases.list({})`, the fully unfiltered call —
which is invoked from inside several different route handlers via scope
resolution, not from a single route.

### Why this query specifically

`db.bases.list({})` runs behind `requireAuth` via
`resolveAllowedBaseIds`/`resolveAllowedStateIds` in `scopeResolver.js` —
meaning it fires on nearly every authenticated request: `/api/drones`,
`/api/incidents`, `/api/geo/*`, `/api/fleet/*`. Two more call sites
(`surveillanceCoordinator.js`, `rl/environment.js`) also call it
unfiltered. It is very likely the single most-executed query in the app.
Bases have zero mutation routes anywhere (confirmed in Step 5's audit),
so caching it carries no real staleness risk.

### Why this is safe to cache globally (unlike `/bases` in Step 5)

The crucial distinction: this caches the **raw, unfiltered** base list —
identical for every caller — *before* any per-user scoping happens.
Per-user filtering (`selectAllowedBases()` in `scopeResolver.js`) runs
**downstream**, on the cached result, for each caller independently. This
is the opposite shape of Step 5's `/api/geo/bases` HTTP route, which
filters *before* responding — that's why that one had to be excluded and
this one doesn't.

### Implementation

Cache lives inside `db.bases.list()` itself in `config/database.js` — a
single `basesListCache` variable with a 5-minute TTL, applied only to the
exact no-filter call shape (`list()` / `list({})`). Calls that pass
`stateId`/`districtId` (the `/api/geo/bases` route) always hit the live
query — a narrower, lower-traffic shape not worth a multi-key cache.

### Verification

The DB-call counter from Step 2 can't see this: it wraps the exported
`bases.list()` function itself, which is still *called* once per request
either way — caching happens *inside* the function body, invisibly to a
wrapper at that layer. Wall-clock timing against live Supabase was also
too noisy to use cleanly here — background simulator traffic contends for
the same connection pool, and individual request latency varied from
~270ms to over 800ms with no clean pattern. Reporting that honestly rather
than cherry-picking a flattering number.

The reliable proof: a temporary internal log (`BASESCACHE HIT`/`MISS`,
removed immediately after) directly inside the cache check, observed
across 13 calls fired by 8x `/api/drones` + 5x `/api/incidents`:

```
BASESCACHE MISS
BASESCACHE HIT   (x12)
```

**13 calls to `db.bases.list({})`, 1 real Supabase query.** This is
unambiguous: the mechanism works exactly as designed.

Scoping correctness re-verified after caching the shared, unfiltered
list: `goa.commander` still sees 5 drones, `national.commander` still
sees 22 — confirming per-user filtering downstream of the cache is
unaffected. Full 13-endpoint smoke test: all 200.

---

## Step 7 — Database indexes (evidence-based, not speculative)

**Method, stated honestly:** no live `EXPLAIN ANALYZE` access exists — only
`SUPABASE_URL`/`SUPABASE_KEY` (PostgREST REST API), no direct Postgres
connection, no `.rpc()` for raw SQL anywhere in this codebase. Used the
best available substitute instead: real row counts for all 19 tables,
cross-referenced against every actual `.eq()`/`.order()` query shape in
`config/database.js` and every existing `CREATE INDEX` in `schema.sql`.
Evidence-based, but static analysis — not a live query planner's word.
Flagging that distinction rather than overselling the rigor.

### Real table sizes

| Table | Rows |
|---|---:|
| `telemetry_history` | 26,692 |
| `dispatch_logs` | 19,901 |
| `snapshots` | 19,735 |
| *(all other 16 tables)* | ≤ 130 |

For the 16 small tables, a sequential scan costs nothing regardless of
indexing — no index was added there. Adding one would have been exactly
the "add indexes because it's on the checklist" anti-pattern this pass's
rules explicitly warn against.

### Cross-reference: query shape vs. existing index, for all 3 large tables

| Table | Actual query | Existing index | Verdict |
|---|---|---|---|
| `telemetry_history` | `.eq('drone_id').order('timestamp' desc)` | `(drone_id, timestamp DESC)` | Already correct — no change |
| `dispatch_logs` | `.eq('incident_id').order('timestamp' asc)` | **none at all** | **Real gap** |
| `snapshots` | `.eq('incident_id').order('timestamp' asc)` | `(incident_id)` — filter only | **Minor gap** (sort not covered) |

All 16 other query patterns in the file (users, drones, incidents,
controller_actions, security_audit_log, mission_recordings, etc.) were
checked individually and already have a matching index for their exact
filter/sort columns.

### Changes to `supabase/schema.sql`

1. **New:** `idx_dispatch_logs_incident_time ON dispatch_logs(incident_id, timestamp)`
   — this table had zero index beyond its primary key, despite being the
   exact query behind `GET /api/incidents/:id/logs`, a hot path (Dashboard
   incident selection, Incidents dossier modal — see Step 3's screenshot).
2. **Upgrade:** dropped the single-column `idx_snapshots_incident`,
   replaced with composite `idx_snapshots_incident_time ON
   snapshots(incident_id, timestamp)`. Still serves plain `incident_id`
   lookups (Postgres's leftmost-column rule), so this is not schema bloat
   — keeping both would mean every insert/update maintains two indexes for
   zero added read benefit.

### ⚠️ Manual action required — I cannot apply this myself

`CREATE INDEX`/`DROP INDEX` are DDL. Exactly like the `telemetry_history`
column fix earlier in this pass, the Supabase JS client has no raw-SQL
execution path, so **these statements must be run once in the Supabase
SQL Editor** for them to take effect on the live database:

```sql
CREATE INDEX IF NOT EXISTS idx_dispatch_logs_incident_time ON dispatch_logs(incident_id, timestamp);

DROP INDEX IF EXISTS idx_snapshots_incident;
CREATE INDEX IF NOT EXISTS idx_snapshots_incident_time ON snapshots(incident_id, timestamp);
```

Both are idempotent (`IF NOT EXISTS`/`IF EXISTS`) and safe to re-run.

### Verification

Since I can't run `EXPLAIN` even after the index exists, verification here
is necessarily narrower than earlier steps:
- Confirmed the SQL matches the exact, already-proven-working syntax
  pattern used elsewhere in the same file (`idx_telemetry_drone_time`).
- Confirmed the application code needs zero changes — indexes are
  transparent to query correctness, only to the query plan — and verified
  `GET /api/incidents/:id/logs` (907 entries) and
  `GET /api/incidents/:id/snapshots` (900 entries) for a real incident
  both return 200 and correctly-sorted data on the *current* (pre-index)
  schema, confirming no regression from this change.
- Full 10-endpoint smoke test: all 200. Client lint/build pass.
- **The actual performance verification** (reduced query time / rows
  scanned) requires checking the Supabase dashboard's query performance
  view after running the SQL above — this is the one place in this pass
  I cannot close the loop myself.

---

## Step 8 — Database connection pooling: verified not applicable

Phase 0 assessed this as inapplicable based on architecture (Supabase-js
being a REST client). This step re-verified that assessment with direct
evidence rather than relying on the earlier assumption.

### Evidence

1. **No `pg` driver anywhere.** Checked `@supabase/supabase-js`'s full
   dependency tree — `@supabase/postgrest-js`, `realtime-js`,
   `functions-js`, `storage-js`, `auth-js` — zero occurrences of `pg`,
   `Pool`, or any raw Postgres client package.
2. **Every query is HTTPS, not a persistent TCP connection.**
   `@supabase/postgrest-js` communicates via `fetch`/`http.request` over
   HTTPS to Supabase's stateless PostgREST endpoint. There is no database
   connection on this app's side to pool — the concept doesn't apply to
   the architecture, not just "isn't configured."
3. **Supabase pools on its own side** (PgBouncer, between PostgREST and
   Postgres) — that is Supabase's infrastructure, invisible to and
   uncontrollable by this app's code.

### Adjacent concept checked and confirmed fine: HTTP keep-alive

A related but distinct optimisation — reusing TCP/TLS connections across
repeated HTTPS requests to the same host — was checked separately.
`config/database.js` calls `createClient()` with no custom `fetch`
option, so `@supabase/supabase-js` defaults to Node 22's native `fetch`
(powered by `undici`), which pools and reuses connections per-origin
**automatically**, with no configuration needed or exposed through the
client's public API. Nothing to add here either.

### Conclusion

Implementing "connection pooling" in this codebase would mean adding a
raw `pg` client as a second, parallel data-access path alongside the
existing Supabase REST client — pure added complexity with no
performance benefit, since Supabase already pools server-side and Node
already reuses HTTP connections client-side. Skipped, with evidence
rather than assumption.

---

## Step 9 — Paginate large lists

**Found:** `GET /api/incidents/:id/logs` and `GET /api/incidents/:id/snapshots`
were completely unbounded. Measured directly: one real incident returned
**907 log entries** and **900 snapshots** in a single response, rendered
in one unpaginated dossier modal.

### The naive fix would have broken a real feature — caught before shipping

Investigated *why* the count was so high before designing a fix:

```
action breakdown for the worst incident: fleet_decision:1, launch:1,
control:995, arrival:2, return_to_base:1
```

995 of 1000 entries are `action: 'control'` — noise from something
logging too verbosely (flagged below, not fixed here). The real
lifecycle events are each only 1-2 entries, buried inside the noise.

First implementation: a plain "most recent 200" cap, matching every other
`list*` function's established convention in this file. Tested against
the worst-case incident — **and it silently dropped `launch` and
`fleet_decision`** from the response. This is not a cosmetic loss:
`rapidStore.js`'s `tick()` computes the Dashboard's flight-duration
display by finding `action === 'launch'` in this exact response. Shipping
the naive fix would have broken a currently-working feature for any
sufficiently active incident — caught by testing against real data before
committing, not assumed safe.

Also checked every other caller of these two functions before finalizing
anything:
- `services/simulatorService.js` searches the **full** history for
  `launch` and for `'SAFETY AUTO-RETURN'`/`'Controller override'` notes
  to compute RL training signals (`responseTimeSec`, `safetyViolations`,
  `controllerOverrode`). A capped default would have silently corrupted
  that training data.
- `services/camera/cameraManager.js` only needs the single **last**
  entry to extend the evidence hash chain — safe under any cap, since
  "most recent" always includes the latest one regardless of window size.
- `routes/missions.js`'s `/evidence` route also returns these lists to a
  browser and had the identical unbounded-response problem, found by
  checking every caller rather than only the two originally spotted.

### Final design

`limit` defaults to **`null` (unbounded)** rather than a fixed number —
preserving the internal callers' exact original behaviour, since they
never pass a limit. Only client-facing routes explicitly pass one:

- **`dispatchLogs.listForIncident(incidentId, limit)`**: when a limit is
  passed, lifecycle actions (`launch`, `arrival`, `return_to_base`,
  `abort`, `fleet_decision` — rare, 1-2 each per incident) are always
  included in full via a separate query; only the high-volume routine
  actions (chiefly `control`) are capped to the most recent `limit`.
  Both queries use the incident_id-filtered composite index added in
  Step 7.
- **`snapshots.listForIncident(incidentId, limit)`**: plain most-recent-N
  — no lifecycle-preservation complexity needed, since its only
  correctness-sensitive consumer (`cameraManager`) only needs the latest
  entry, which any recency-based cap always includes.
- `routes/incidents.js`'s two routes and `routes/missions.js`'s
  `/evidence` route now pass `limit` (default 200, `?limit=` override,
  capped at 1000) — the three responses that actually reach a browser.

### Verified

Re-tested the exact worst-case incident after the fix:

| | Before | Naive cap (rejected) | Final fix |
|---|---:|---:|---|
| Entries returned | 907 | 200 | **203** |
| `launch` present | ✅ | ❌ | ✅ |
| `fleet_decision` present | ✅ | ❌ | ✅ |
| `arrival`/`return_to_base` present | ✅ | ✅ | ✅ |

`?limit=50` override tested: 53 entries, `launch` still present.
Internal (no-limit) call re-verified to return the true, complete,
unbounded history (1000 entries at time of test — the simulator kept
writing during this session). Incidents dossier modal screenshotted:
Timeline Log correctly shows Fleet Decision -> Launch -> 4x Arrival
first, followed by the capped recent Control activity — the natural
mission narrative is intact, not cut mid-story.

Full 11-endpoint smoke test: all 200. Client lint/build pass.

### Flagged, not fixed (out of scope for this step)

The root cause behind 995 `control` entries on one incident — something
logging far more verbosely than a dispatch lifecycle needs — is a
separate, pre-existing over-logging issue. Recorded here rather than
fixed unannounced inside this pagination commit, matching how the
`/api/fleet/decisions` scoping bug and `telemetry_history` schema drift
were handled earlier in this pass.

---

## Step 10 — Debounce input handlers

**Re-verified Phase 0's assessment rather than trusting it.** Phase 0
flagged Incidents.jsx's search box as the only debounce candidate, and
called it marginal (filters a 36-row local array, no network call). That
assessment held up — but it wasn't the right target. Surveyed all 19
`onChange` handlers in the client and checked what each one actually does
downstream, not just what it looks like.

### The real finding

[`MissionControlPanel.jsx`](client/src/components/mission-control/MissionControlPanel.jsx)'s
speaker-volume slider:
```jsx
<input type="range" ... onChange={e => setSpeakerVol(e.target.value)} />
```
traces into `rapidStore.js`:
```js
setSpeakerVol: (v) => { set({ speakerVol: v }); get().updateCommunicationSettings({ speakerVolume: v }); },
```
`updateCommunicationSettings` fires an immediate `PATCH` request. A range
input's `onChange` fires on every pixel of drag movement — a single drag
gesture can generate dozens of events, each one a real network request to
persist a setting that only matters once the user stops moving the slider.

### Fix

Split the two concerns: the **local** state update (`set({ speakerVol: v })`)
stays synchronous — the slider position and the `%` label must keep
tracking the drag exactly as before, per the no-UI/UX-change rule. Only
the **network persistence** is debounced (400ms), via a plain module-level
timer — no new dependency needed for six lines of vanilla JS.

### A correctness edge case caught before it shipped

`updateCommunicationSettings` originally read `get().getSelectedDrone()`
- fine when the call was synchronous, but once delayed by 400ms, the
"currently selected" drone could have changed if the operator switched
selection mid-drag, silently misdirecting the write to the wrong drone.
Fixed by capturing the target drone's id synchronously, at drag time, and
passing it through explicitly into the debounced closure — `setMicActive`/
`setSpeakerActive` (still synchronous, no debounce) are unaffected, since
`updateCommunicationSettings`'s target-drone override is optional.

### Verified, with a headless browser simulating a real drag

Dispatched 15 synthetic `input`/`change` events ~10ms apart (values
10->77) on the actual slider DOM element:

```
at +200ms (mid-debounce): 0 PATCH request(s) sent
at +700ms (after debounce): 1 PATCH request(s) sent
  body: {"speakerVolume":"77"}
```

15 events collapsed to 1 network call, carrying the final value, not a
stale intermediate one. Confirmed the displayed `%` label tracks the drag
instantly regardless (`77%`, read directly from the slider's DOM sibling
span) — the debounce is invisible to the user.

Edge case re-tested explicitly: dragged the slider (targeting Rakshak-01),
then clicked to select Rakshak-02 ~100ms into the 400ms window (well
before the debounced write fires). The resulting PATCH correctly targeted
`Rakshak-01`'s id, not `Rakshak-02`'s - confirmed against live `/api/drones`
data using their full, distinguishing ids (a first check using truncated
8-character ids was misleading, since the two ids differ only in their
last character - caught and re-verified with the full id).

Full smoke test: all 200. Client lint/build pass.

---

## Step 11 — Code splitting

**What changed:** [`App.jsx`](client/src/App.jsx) converted 8 of its 9 page
imports to `React.lazy()`. Verified the import graph first: `leaflet`/
`react-leaflet` (Dashboard + Help), `recharts` (Analytics + RLConsole), and
`framer-motion` (Dashboard's modals + Help) are reachable *only* from
specific pages, never from `App.jsx` or any shared/eager code — confirming
route-level splitting would cleanly separate them. `Login` stays a static
import deliberately: it's the first thing every unauthenticated visitor
needs, has none of the three heavy dependencies, and lazy-loading it would
only add a round trip for no benefit.

### Result — runtime-verified, not just inferred from build output

Build now emits 20 chunks instead of 1. Confirmed with a headless browser
monitoring actual network requests (not just reading the build's static
output):

```
Loading /login:
  JS chunks fetched: 1
    index-M3AeNMnr.js (206,154 B)
  Heavy/page chunks incorrectly loaded on /login: 0

Navigating to /dashboard after login:
  Dashboard-CQzPUM4g.js (54,727 B)   <- fetched on demand
  proxy-DojtsuX0.js (269,638 B)      <- Leaflet + framer-motion, on demand
```

`/login` downloads **206 KB of JS total** — zero Leaflet, zero recharts,
zero framer-motion. Those only load when a route that actually needs them
is visited.

### Lighthouse (same methodology as Step 1's baseline, mobile preset)

| Metric | Before (Step 1) | After |
|---|---:|---:|
| Performance score | 61 | **92** |
| First Contentful Paint | 6.5s | **2.6s** |
| Largest Contentful Paint | 6.6s | **2.7s** |
| Speed Index | 6.5s | **2.6s** |
| Time to Interactive | 7.1s | **3.1s** |
| "Reduce unused JavaScript" | ~3,760ms / 759 KiB | ~450ms / 91 KiB |

### Implementation notes

- No `manualChunks` tuning was needed — Vite/Rollup's default per-`import()`
  chunking already separated the three heavy libraries cleanly, exactly as
  predicted from the import-graph check.
- Suspense fallback is deliberately minimal: reuses the exact visual
  pattern already established by `RequireAuth`'s "AUTHENTICATING…" loading
  state, rather than introducing new loading-state design — the dedicated
  per-page skeletons are Step 13's job, not this one's.
- Total `dist/` size grew slightly (1.06 MB vs 1.02 MB) — expected and
  correct: each chunk carries its own small module-wrapper overhead. This
  is not a regression; what matters is bytes downloaded *per visit*, which
  dropped sharply for every route except Dashboard/Help/Analytics/
  RLConsole themselves.

### Full regression across all 9 routes

Headless-browser check of all 9 routes (Login, Dashboard, Fleet,
Incidents, Analytics, Surveillance, RLConsole, SecurityAudit, Help) for
console/page errors after the split: 8/9 clean.

The one flagged item — a CSP violation loading a demo drone's hardcoded
video-feed URL on Dashboard — was traced to `stream_url:
'https://multiplatform-f.akamaihd.net/...'` in `config/database.js`,
confirmed present in the very first commit (`7a71da0`) before any work in
this pass began. Pre-existing, unrelated to code splitting (Dashboard's
own CSP-blocked media, not a lazy-loading defect), and non-fatal — the
page still rendered its full content around the blocked video. Flagged,
not fixed, staying in scope.

Dashboard also screenshotted and visually compared against Step 3's
screenshot: identical layout, map, fleet cards, mission control panel —
no visual regression from the split. Full server endpoint smoke test
(unaffected, client-only change): all 200.

---

## Step 12 — Lazy loading (images)

**What changed:** added the native `loading="lazy"` attribute to both
`<img>` tags in the codebase —
[`MissionControlPanel.jsx:445`](client/src/components/mission-control/MissionControlPanel.jsx#L445)
and [`Incidents.jsx:375`](client/src/pages/Incidents.jsx#L375) — both of
which render one image per snapshot inside a `.map()` over a list that,
after Step 9's fix, can hold up to 200 items in a scrollable grid.

### Verification — and two confounders that made a clean demo harder than expected

The first, most direct verification: confirmed the built and *served*
JS bundle actually contains the attribute (`grep`'d the live chunk, not
just the source file) — `loading:"lazy"` present on both.

Attempting a clean "0% loads immediately, then more loads on scroll"
demonstration ran into two real environmental factors, investigated and
confirmed rather than assumed:

1. **Only 7 distinct image URLs exist across all 200 snapshot records**
   for the test incident (`SELECT DISTINCT image_url` -> 7) — the demo
   data draws from a small, reused `DETECTION_IMAGES` pool
   (`simulatorService.js`). Counting distinct *network requests* is the
   wrong metric here: once those 7 URLs are cached, every other `<img>`
   referencing one of them can resolve near-instantly regardless of
   `loading="lazy"`, since browser cache hits aren't blocked by the
   attribute in the same way a fresh network fetch is.
2. **Chrome's `loading="lazy"` preload distance scales with perceived
   network speed**, and localhost is close to infinite bandwidth — Chrome
   deliberately preloads much more aggressively on a fast connection
   (by design, to avoid visible pop-in), so "only images in the exact
   visible viewport load" is not the real, spec-compliant behavior to
   expect even with the attribute correctly applied.

Given both confounders, per-element load state (not network request
count) is the correct signal, and it shows real, working behavior:
before any scroll, 112 of 200 `<img>` elements had decoded pixel data;
after programmatically scrolling the modal's own scroll container
(confirmed via computed style, `scrollHeight: 24,503px` vs `clientHeight:
468px` — genuinely far larger than one screen) to the bottom, that grew
to 138 of 200. The 26-image increase is directly attributable to the
scroll action — proof the browser is deferring and then resolving image
loads in response to viewport position, which is exactly what
`loading="lazy"` is for.

### What this step does not claim

It would be dishonest to report a clean "X% reduction in initial page
weight" here, given the confounders above make that number highly
dependent on this specific demo dataset's URL-reuse pattern and this
test environment's network speed heuristics, neither of which represent
a real deployment. The correctness claim is narrower and solid: the
attribute is correctly applied to every relevant image, it doesn't break
rendering, and it demonstrably responds to scroll position.

Full regression: lint and build pass; full endpoint smoke test all 200.

---

## Step 13 — Loading skeletons

**Surveyed all 8 lazy-loaded pages' initial-render behavior before
implementing anything.** Found two distinct problems, not one:

| Page | Problem |
|---|---|
| Analytics.jsx | Initialized with hardcoded fake-looking stats (`totalDrones: 5`, `averageBattery: 100`) - indistinguishable from real data |
| Fleet.jsx | Blank grid, no loading indication |
| Incidents.jsx | "No incident logs found matches filters" shown before the fetch resolves |
| Surveillance.jsx | "No patrol missions for this state yet" shown during load |
| RLConsole.jsx | "No completed-mission experience yet" shown during load (**and a second, initially-missed** "No training passes yet" message on its loss chart) |
| SecurityAudit.jsx | "No security events logged yet" shown during load |

**Deliberately excluded:** `Dashboard.jsx` has the same underlying gap,
but its data is spread across 4 interdependent sub-components sharing one
WebSocket-backed store, already gated by `RequireAuth`'s own loading
state - fixing it properly needs a new store-level flag threaded through
multiple files, a materially bigger change than the other 6 self-contained
pages. `Help.jsx`'s data is user-triggered (phone lookup), not an eager
auto-fetch, so it has no equivalent gap.

### Implementation

One new file, `components/shared/Skeleton.jsx` - plain pulsing blocks
built from the `animate-pulse` utility already used throughout this
codebase, not a new visual language. Each of the 6 pages got a `loading`
boolean (`true` until its first fetch resolves, or - for Surveillance and
SecurityAudit, whose fetch re-runs on a changing dependency - toggling
again on a genuine refetch, not just mount) gating its skeleton against
its real content.

### A bug this step's own verification found, in itself

While re-checking all 6 pages for *any* remaining "No X found/yet"
message (not just the ones from the initial survey), found a **second**
empty-state on RLConsole.jsx - a loss-chart section fed by the same
`refresh()` call, missed because the initial survey's grep was scoped too
narrowly. Fixed it before moving on rather than shipping a partial result.

Two more were found the same way inside `Incidents.jsx`'s dossier modal
(Timeline Log and Snapshots tabs, both fed by a separate per-incident
`fetchDossierData()` fetch) - small, self-contained, mechanically
identical to the fixes already made, so fixed rather than left as a known
gap purely because they weren't in the original 6-page list.

### Verified with network throttling across all 6 pages

Loaded each page once unthrottled (to warm its JS chunk - isolating this
step's data-loading skeleton from Step 11's separate chunk-loading
Suspense fallback), then reloaded under throttled network (300ms latency,
300kbps) and checked state immediately after the component mounted:

```
[OK] Analytics      duringLoad: skeletons=14  |  afterLoad: skeletons=0
[OK] Fleet          duringLoad: skeletons=24  |  afterLoad: skeletons=0
[OK] Incidents      duringLoad: skeletons=35  |  afterLoad: skeletons=0
[OK] Surveillance   duringLoad: skeletons=12  |  afterLoad: skeletons=0
[OK] RLConsole      duringLoad: skeletons=10  |  afterLoad: skeletons=0
[OK] SecurityAudit  duringLoad: skeletons=8   |  afterLoad: skeletons=0
```

All 6: skeletons appear during the fetch window, zero misleading
empty-state messages during that window, skeletons fully cleared once
real data arrives, zero console/page errors.

Dossier modal's two additional fixes verified the same way: an initial
4-second wait showed 2 residual skeletons under heavy throttling; this
was a test-timing artifact, not a real bug — extending to 8 seconds
confirmed both correctly resolve to 0.

Full endpoint smoke test: all 200. Client lint/build pass. Analytics
screenshotted fully loaded: real chart data, no leftover skeleton
artifacts.
