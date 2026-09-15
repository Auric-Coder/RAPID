# RAPID

A drone fleet management and emergency dispatch platform for police and government agencies. It runs a simulated fleet of drones across a national geographic hierarchy (Nation → State → District → Base → Drone), with a web command centre for operators and a public citizen SOS portal.

---

## Tech Stack

| Component | Stack | Purpose |
|---|---|---|
| Web Command Centre (`client/`) | React 18, Vite, Tailwind CSS, Leaflet, Recharts, Zustand | Operations map, live telemetry, fleet inventory, patrol routing, analytics |
| API Server (`server/`) | Node.js, Express, WebSocket (`ws`), TensorFlow.js | Physics and battery model, REST API (15 modules), auto-dispatch engine, WebSocket hub |
| Citizen Mobile App (`mobile/`) | React Native, Expo, Expo Router | One-tap SOS trigger, voice/text reporting, live drone tracking |
| Database (`supabase/`) | Supabase (PostgreSQL 15 with RLS) | Relational persistence, RBAC accounts, airspace zones, audit trail, in-memory fallback |

---

## Getting Started

### Prerequisites
- Node.js v18 or higher
- npm v9 or higher
- A Supabase account (free tier is fine)

### 1. Clone and install

```bash
git clone https://github.com/<your-username>/rapid.git
cd rapid
npm run bootstrap
```

This installs dependencies for both `server/` and `client/` in one step.

For the mobile app:

```bash
cd mobile
npm install
cd ..
```

### 2. Configure environment variables

```bash
cp server/.env.example server/.env
```

Edit `server/.env`:

```env
JWT_SECRET=your_random_hex_secret_here
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_KEY=your_service_role_key_here
PORT=5000
```

Use the Supabase **service_role** key (not the public anon key) and the base project URL without `/rest/v1/`.

### 3. Initialise the database

1. Open your Supabase project dashboard → **SQL Editor**.
2. Run `supabase/schema.sql` (creates all 19 tables).
3. On first boot, the server automatically seeds the geographic hierarchy (Goa and Punjab), bases, airspace zones, demo accounts, and all 22 drones.

### 4. Run locally

```bash
npm run dev
```

Or individually:

```bash
# Terminal 1: API server and telemetry simulator (port 5000)
npm run server

# Terminal 2: Web command centre (port 3000)
npm run client

# Terminal 3: Citizen mobile app (Expo)
cd mobile && npx expo start
```

- Web dashboard: http://localhost:3000
- API health check: http://localhost:5000/health
- Citizen portal: http://localhost:3000/help

---

## Demo Accounts

All demo accounts use the password `rapid123`.

| Username | Role | Scope |
|---|---|---|
| `national.commander` | `NATIONAL_COMMANDER` | Full national visibility |
| `goa.commander` | `STATE_COMMANDER` | Goa state |
| `punjab.commander` | `STATE_COMMANDER` | Punjab state |
| `operator` | `OPERATOR` | Fleet command, manual override, dispatch |
| `aviation.control` | `AIRSPACE_AUTHORITY` | Airspace restriction zones |
| `observer` | `OBSERVER` | Read-only analytics and audit |

---

## Repository Layout

```
├── client/                   # React 18 + Vite frontend
│   ├── src/
│   │   ├── components/       # Map, command bar, mission panels, modals
│   │   ├── pages/            # Dashboard, Fleet, Incidents, Analytics, Surveillance, RLConsole
│   │   └── store/            # Zustand global state and WebSocket listeners
│   └── vite.config.js
│
├── server/                   # Node.js + Express backend
│   ├── src/
│   │   ├── config/           # Database adapter, geoConfig, energyConfig
│   │   ├── middleware/       # JWT auth and role gates
│   │   ├── routes/           # 15 REST endpoints
│   │   ├── services/         # Simulator, decision engine, camera, voiceAI, security
│   │   └── rl/               # MDP environment, policy definitions, mode manager
│   └── .env.example
│
├── mobile/                   # React Native (Expo) citizen app
│   ├── app/                  # Expo Router screens
│   └── src/                  # API client and storage context
│
├── supabase/
│   ├── schema.sql            # Database schema (19 tables + RLS)
│   └── seed.sql              # Reference seed queries
│
├── render.yaml               # One-click deployment for Render
├── package.json              # Workspace scripts (bootstrap, dev, build, start)
└── .gitignore
```

---

## Production Build and Deployment

### Build

```bash
npm run build
```

Compiles the React client into `client/dist/`, which Express serves directly.

### Deploy to Render

1. Push to GitHub.
2. In Render, create a new Web Service pointing to this repository.
3. Render detects `render.yaml` automatically (build: `npm run build`, start: `npm start`).
4. Set these environment variables in the Render dashboard:
   - `SUPABASE_URL`
   - `SUPABASE_KEY`
   - `JWT_SECRET`
   - `CORS_ORIGINS` (your Render service URL)

---

## Licence

Proprietary. Developed for demonstration and operational prototyping.
