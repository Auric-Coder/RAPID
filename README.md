<<<<<<< HEAD
# RAPID
=======
﻿# R.A.P.I.D. v1.3

> **Real-time Autonomous Police & Incident Dispatch System**  
> A mission-critical drone fleet management and emergency dispatch simulation platform designed for law enforcement, emergency responders, and multi-agency coordination.

---

##  Overview

R.A.P.I.D. models an end-to-end aerial dispatch pipeline across a national geographic hierarchy (**Nation → State → District → Base → Drone**). It features a real-time web command center, live GPS telemetry simulation, intelligent fleet decision scoring, tamper-evident cryptographic audit logs, and a mobile application for citizen SOS intake.

---

##  Architecture & Tech Stack

| Component | Stack | Responsibilities |
|---|---|---|
| **Web Command Center** (`client/`) | React 18, Vite, Tailwind CSS, Leaflet, Recharts, Zustand | Operations map, live telemetry tracking, fleet inventory, patrol routing, analytics |
| **Simulation & API Server** (`server/`) | Node.js, Express, WebSocket (`ws`), TensorFlow.js | Physics & battery model, REST API (15 modules), auto-dispatch engine, WebSocket hub |
| **Citizen Mobile App** (`mobile/`) | React Native, Expo, Expo Router | One-tap SOS emergency trigger, voice/text reporting, live responder drone tracking |
| **Database** (`supabase/`) | Supabase (PostgreSQL 15+ with RLS) | Relational persistence, RBAC accounts, airspace zones, audit trail, in-memory fallback |

---

##  Key Features

- ** Live Telemetry Physics Engine**: 1-second ticks running Haversine geodesic math, real headings, speed, altitude, and a distance-proportional battery consumption model (cruise vs. hover drain).
- ** Deterministic Fleet Decision Engine**: Evaluates available fleet assets by distance, flight feasibility, battery reserve thresholds, and airspace restrictions to recommend optimal drone assignments.
- ** AI & Reinforcement Learning Console**: Markov Decision Process (MDP) observation space and action masks built with TensorFlow.js for assisted and autonomous dispatch exploration.
- ** Tamper-Evident Evidence Logging**: Incident snapshots, recordings, and administrative events are sealed using a continuous SHA-256 cryptographic hash-chain ledger.
- ** Role-Based Access Control (RBAC)**: Secure httpOnly cookie JWT auth supporting 8 hierarchical roles (`NATIONAL_COMMANDER`, `STATE_COMMANDER`, `OPERATOR`, `AIRSPACE_AUTHORITY`, etc.) with geographic boundary filtering.
- **Citizen Emergency Intake**: Public SOS button with GPS lock, audio recording, NLP classification, and real-time drone ETA tracking.

---

##  Getting Started (Local Development)

### Prerequisites
- **Node.js**: v18.0.0 or higher
- **npm**: v9.0.0 or higher
- A **Supabase** account/project (free tier supported)

### 1. Clone & Install Dependencies
```bash
git clone https://github.com/<your-username>/rapid-v1.3.git
cd rapid-v1.3
npm run bootstrap
```
*(This command installs dependencies for both `server/` and `client/` concurrently).*

To set up the mobile application:
```bash
cd mobile
npm install
cd ..
```

### 2. Configure Environment Variables
Copy the server example environment file:
```bash
cp server/.env.example server/.env
```
Edit `server/.env` with your credentials:
```env
JWT_SECRET=your_random_hex_secret_here
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_KEY=your_service_role_key_here
PORT=5000
```
> **Note**: Always use your Supabase **service_role** secret key (not the public anon key) and the base project URL (without `/rest/v1/`).

### 3. Initialize Database
1. Open your Supabase project dashboard -> **SQL Editor**.
2. Run the script located in `supabase/schema.sql` (creates all 19 tables).
3. Start the server (Step 4). On first boot, the server will **automatically seed** the full geographic hierarchy (Goa & Punjab), bases, airspace zones, demo accounts, and all 22 drones.

### 4. Run Locally
Start both the backend API and the frontend dashboard concurrently:
```bash
npm run dev
```

Or run services individually:
```bash
# Terminal 1: Backend API & Telemetry Simulator (:5000)
npm run server

# Terminal 2: Web Command Center (:3000)
npm run client

# Terminal 3: Citizen Mobile App (Expo)
cd mobile && npx expo start
```

- **Web Dashboard**: [http://localhost:3000](http://localhost:3000)
- **API Health Check**: [http://localhost:5000/health](http://localhost:5000/health)
- **Citizen Portal (Web)**: [http://localhost:3000/help](http://localhost:3000/help)

---

##  Default Demo Accounts

All demo accounts share the password: `rapid123`

| Username | Role | Operational Scope |
|---|---|---|
| `national.commander` | `NATIONAL_COMMANDER` | Full national visibility (all states & bases) |
| `goa.commander` | `STATE_COMMANDER` | Goa state operations & fleet |
| `punjab.commander` | `STATE_COMMANDER` | Punjab state operations & fleet |
| `operator` | `OPERATOR` | Fleet command, manual flight override, dispatch |
| `aviation.control` | `AIRSPACE_AUTHORITY` | Airspace restriction zones & no-fly management |
| `observer` | `OBSERVER` | Read-only analytics & fleet audit monitoring |

---

##  Repository Layout

```
├── client/                   # React 18 + Vite frontend application
│   ├── src/
│   │   ├── components/       # Map, TopCommandBar, mission panels, modals
│   │   ├── pages/            # Dashboard, Fleet, Incidents, Analytics, Surveillance, RLConsole
│   │   └── store/            # Zustand global state & WebSocket listeners
│   └── vite.config.js        # Vite dev server & proxy settings
│
├── server/                   # Node.js + Express backend & simulation core
│   ├── src/
│   │   ├── config/           # Database adapter (Supabase), geoConfig, energyConfig
│   │   ├── middleware/       # JWT auth & role authorization gates
│   │   ├── routes/           # 15 REST endpoints (drones, incidents, fleet, rl, etc.)
│   │   ├── services/         # Simulator, decision engine, camera, voiceAI, security
│   │   └── rl/               # MDP environment, policy definitions, mode manager
│   └── .env.example          # Environment variable template
│
├── mobile/                   # React Native (Expo) Citizen SOS application
│   ├── app/                  # Expo Router screens (SOS home, voice report, live track)
│   └── src/                  # Citizen API client & storage context
│
├── supabase/                 # PostgreSQL schema and seed migrations
│   ├── schema.sql            # Core database schema (19 tables + RLS)
│   └── seed.sql              # Reference seed queries
│
├── render.yaml               # One-click cloud deployment blueprint for Render
├── package.json              # Workspace scripts (bootstrap, dev, build, start)
└── .gitignore                # Git ignore configuration
```

---

##  Building for Production & Cloud Deployment

### 1. Build Production Assets
```bash
npm run build
```
This compiles the React client bundle into `client/dist/`, which is directly served by the Express backend on a single origin.

### 2. Deploy to Render (or Similar PaaS)
1. Push this repository to GitHub.
2. In [Render](https://render.com), click **New Web Service** and select your repository.
3. Render will detect `render.yaml` automatically:
   - **Build Command**: `npm run build`
   - **Start Command**: `npm start`
4. Set the following environment variables in your Render dashboard:
   - `SUPABASE_URL`: `https://<your-project>.supabase.co`
   - `SUPABASE_KEY`: `<your-supabase-service-role-key>`
   - `JWT_SECRET`: `<your-random-jwt-secret>`
   - `CORS_ORIGINS`: `https://<your-service>.onrender.com`

---

##  License
This project is proprietary and confidential. Developed for demonstration, evaluation, and operational prototyping.
>>>>>>> d0c2cae (Public Repository Initialized)
