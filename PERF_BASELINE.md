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
