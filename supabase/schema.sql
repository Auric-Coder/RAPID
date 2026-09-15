-- RAPID System Database Schema

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Profiles (Authentication system extension)
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY,
    full_name TEXT NOT NULL,
    role TEXT CHECK (role IN ('dispatcher', 'operator', 'responder')) DEFAULT 'dispatcher',
    status TEXT CHECK (status IN ('active', 'offline')) DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 0a. Multi-Agency Organisations (Phase 6)
CREATE TABLE IF NOT EXISTS organisations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code TEXT CHECK (code IN ('POLICE', 'ARMY', 'NAVY', 'AIR_FORCE', 'AVIATION_CONTROL')) NOT NULL UNIQUE,
    name TEXT NOT NULL,
    operational_domain TEXT,
    jurisdiction_type TEXT,
    max_altitude_m DOUBLE PRECISION,
    airspace_authority_level TEXT CHECK (airspace_authority_level IN ('consumer', 'authority', 'military')) DEFAULT 'consumer',
    cross_org_visibility TEXT CHECK (cross_org_visibility IN ('none', 'read_only', 'coordinate')) DEFAULT 'none'
);

-- 0b. Personnel Accounts (Phase 6) — organisation personnel, distinct
-- from citizen_profiles (Phase 3's public mobile-app accounts).
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    full_name TEXT NOT NULL,
    organisation_id UUID REFERENCES organisations(id) ON DELETE CASCADE,
    role TEXT CHECK (role IN ('NATIONAL_COMMANDER', 'STATE_COMMANDER', 'DISTRICT_COMMANDER', 'BASE_COMMANDER', 'DISPATCHER', 'OPERATOR', 'OBSERVER', 'AIRSPACE_AUTHORITY')) NOT NULL,
    scope_type TEXT CHECK (scope_type IN ('national', 'state', 'district', 'base', 'none')) DEFAULT 'none',
    scope_id UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_organisation ON users(organisation_id);

-- 0. Nationwide Hierarchy (Phase 1) — Nation -> State -> District -> Base
CREATE TABLE IF NOT EXISTS nations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS states (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nation_id UUID REFERENCES nations(id) ON DELETE CASCADE,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    capital_latitude DOUBLE PRECISION,
    capital_longitude DOUBLE PRECISION,
    operational_status TEXT CHECK (operational_status IN ('active', 'standby', 'offline')) DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS districts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    state_id UUID REFERENCES states(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    headquarters_latitude DOUBLE PRECISION,
    headquarters_longitude DOUBLE PRECISION,
    operational_status TEXT CHECK (operational_status IN ('active', 'standby', 'offline')) DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS bases (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    base_code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    type TEXT CHECK (type IN ('police_station', 'police_drone_base', 'defence_base', 'military_airfield', 'naval_base', 'air_force_base', 'airport', 'authorised_drone_facility')) DEFAULT 'police_drone_base',
    organisation_id UUID REFERENCES organisations(id) ON DELETE SET NULL,
    state_id UUID REFERENCES states(id) ON DELETE CASCADE,
    district_id UUID REFERENCES districts(id) ON DELETE CASCADE,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    coverage_radius_m DOUBLE PRECISION DEFAULT 2500,
    operational_status TEXT CHECK (operational_status IN ('active', 'standby', 'offline', 'decommissioned')) DEFAULT 'active',
    minimum_fleet_capacity INT DEFAULT 6
);

CREATE INDEX IF NOT EXISTS idx_states_nation ON states(nation_id);
CREATE INDEX IF NOT EXISTS idx_districts_state ON districts(state_id);
CREATE INDEX IF NOT EXISTS idx_bases_state_district ON bases(state_id, district_id);

-- 2. Drones (The core hardware tracking table)
CREATE TABLE IF NOT EXISTS drones (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    call_sign TEXT NOT NULL UNIQUE,
    model TEXT NOT NULL,
    status TEXT CHECK (status IN ('Standby', 'Dispatched', 'En Route', 'On Scene', 'AI Monitoring', 'Following Target', 'Hovering', 'Orbiting', 'Awaiting Controller', 'Returning', 'Charging', 'Mission Complete', 'Patrolling', 'idle', 'dispatching', 'on_site', 'maintenance')) DEFAULT 'Standby',
    battery_level INT CHECK (battery_level BETWEEN 0 AND 100) DEFAULT 100,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    altitude DOUBLE PRECISION DEFAULT 0.0,
    speed DOUBLE PRECISION DEFAULT 0.0,
    heading DOUBLE PRECISION DEFAULT 0.0,
    current_incident_id UUID,
    base_id UUID REFERENCES bases(id) ON DELETE SET NULL,
    base_latitude DOUBLE PRECISION NOT NULL,
    base_longitude DOUBLE PRECISION NOT NULL,
    hardware_id TEXT UNIQUE,
    mavlink_system_id INT UNIQUE,
    stream_url TEXT,
    is_hardware_active BOOLEAN DEFAULT FALSE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_drones_base ON drones(base_id);

-- 3. Incidents (Emergency Events)
CREATE TABLE IF NOT EXISTS incidents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    description TEXT,
    category TEXT CHECK (category IN ('trespass', 'fire', 'theft', 'assault', 'traffic', 'medical', 'other')) NOT NULL,
    severity TEXT CHECK (severity IN ('low', 'medium', 'high', 'critical')) NOT NULL,
    status TEXT CHECK (status IN ('reported', 'dispatched', 'active', 'resolved', 'cancelled')) DEFAULT 'reported',
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    assigned_drone_id UUID REFERENCES drones(id) ON DELETE SET NULL,
    reporter_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    citizen_name TEXT,
    citizen_phone TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP WITH TIME ZONE
);

-- Circular references fallback mapping in drones table
ALTER TABLE drones DROP CONSTRAINT IF EXISTS fk_current_incident;
ALTER TABLE drones ADD CONSTRAINT fk_current_incident FOREIGN KEY (current_incident_id) REFERENCES incidents(id) ON DELETE SET NULL;

-- 4. Telemetry History (For historical flight tracing logs)
CREATE TABLE IF NOT EXISTS telemetry_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    drone_id UUID NOT NULL REFERENCES drones(id) ON DELETE CASCADE,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    altitude DOUBLE PRECISION NOT NULL,
    speed DOUBLE PRECISION DEFAULT 0,
    heading DOUBLE PRECISION DEFAULT 0,
    battery_level INT NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- speed/heading were missing from this table while the telemetry simulator
-- has always written them, so every insert failed against Supabase with
-- "Could not find the 'heading' column" and telemetry_history stayed empty.
-- These two statements bring an already-deployed database up to date; they
-- are safe to re-run.
ALTER TABLE telemetry_history ADD COLUMN IF NOT EXISTS speed DOUBLE PRECISION DEFAULT 0;
ALTER TABLE telemetry_history ADD COLUMN IF NOT EXISTS heading DOUBLE PRECISION DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_telemetry_drone_time ON telemetry_history(drone_id, timestamp DESC);

-- 5. Dispatch Logs
CREATE TABLE IF NOT EXISTS dispatch_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    incident_id UUID REFERENCES incidents(id) ON DELETE CASCADE,
    drone_id UUID REFERENCES drones(id) ON DELETE SET NULL,
    dispatcher_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    action TEXT CHECK (action IN ('launch', 'arrival', 'return_to_base', 'abort', 'control', 'snapshot', 'fleet_decision')) NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    notes TEXT
);

-- 6. Snapshots (Evidence Capture)
CREATE TABLE IF NOT EXISTS snapshots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    incident_id UUID REFERENCES incidents(id) ON DELETE CASCADE,
    drone_id UUID REFERENCES drones(id) ON DELETE CASCADE,
    label TEXT,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    image_url TEXT,
    heading DOUBLE PRECISION,
    altitude DOUBLE PRECISION,
    reason TEXT DEFAULT 'manual',
    target TEXT,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    -- Phase 4 evidence integrity (see services/camera/cameraManager.js)
    night_vision_active BOOLEAN,
    previous_hash TEXT,
    entry_hash TEXT,
    hash_payload TEXT
);

CREATE INDEX IF NOT EXISTS idx_snapshots_incident ON snapshots(incident_id);
CREATE INDEX IF NOT EXISTS idx_snapshots_drone ON snapshots(drone_id);

-- 7. Mission Recordings (Evidence & Audit Lifecycle)
CREATE TABLE IF NOT EXISTS mission_recordings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    mission_id UUID REFERENCES incidents(id) ON DELETE CASCADE,
    drone_id UUID REFERENCES drones(id) ON DELETE CASCADE,
    rakshak_id TEXT NOT NULL,
    status TEXT CHECK (status IN ('recording', 'finalized', 'aborted', 'none')) DEFAULT 'recording',
    source TEXT DEFAULT 'DEMO_SIMULATION',
    recording_start TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    recording_end TIMESTAMP WITH TIME ZONE,
    duration_seconds INT,
    stream_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    -- Phase 4 evidence integrity — sealed at finalization, not creation
    previous_hash TEXT,
    entry_hash TEXT,
    hash_payload TEXT
);

CREATE INDEX IF NOT EXISTS idx_recordings_drone ON mission_recordings(drone_id);
CREATE INDEX IF NOT EXISTS idx_recordings_mission ON mission_recordings(mission_id);

-- 8. Controller Actions (Operator Audit Trail & Future RL Training Data)
CREATE TABLE IF NOT EXISTS controller_actions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    mission_id UUID REFERENCES incidents(id) ON DELETE SET NULL,
    drone_id UUID REFERENCES drones(id) ON DELETE CASCADE,
    rakshak_id TEXT NOT NULL,
    action TEXT NOT NULL,
    parameters JSONB DEFAULT '{}'::jsonb,
    result TEXT DEFAULT 'ok',
    error_message TEXT,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_controller_actions_drone ON controller_actions(drone_id);
CREATE INDEX IF NOT EXISTS idx_controller_actions_mission ON controller_actions(mission_id);

-- 9. Citizen Profiles (Phase 3 — RAPID Citizen mobile app)
CREATE TABLE IF NOT EXISTS citizen_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    full_name TEXT NOT NULL,
    phone TEXT NOT NULL UNIQUE,
    emergency_contacts JSONB DEFAULT '[]'::jsonb,
    medical_info TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 10. Voice Reports (Phase 3 — citizen voice/text report audit trail)
CREATE TABLE IF NOT EXISTS voice_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    citizen_id UUID REFERENCES citizen_profiles(id) ON DELETE SET NULL,
    incident_id UUID REFERENCES incidents(id) ON DELETE SET NULL,
    transcript TEXT,
    is_simulated_transcript BOOLEAN DEFAULT FALSE,
    classification JSONB DEFAULT '{}'::jsonb,
    extracted_entities JSONB DEFAULT '{}'::jsonb,
    audio_hash TEXT,
    transcript_hash TEXT,
    model_version TEXT,
    processing_time_ms INT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_voice_reports_citizen ON voice_reports(citizen_id);
CREATE INDEX IF NOT EXISTS idx_voice_reports_incident ON voice_reports(incident_id);

-- 11. Airspace Zones (Phase 5) — the live, CRUD-able source of truth for
-- no-fly/restricted/protected zones. Seeded from geoConfig.js at startup.
CREATE TABLE IF NOT EXISTS airspace_zones (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    type TEXT CHECK (type IN ('no_fly', 'restricted', 'temporary_restriction', 'airport_protection', 'military_airspace', 'border_zone', 'protected_area', 'geofence')) DEFAULT 'protected_area',
    state_id UUID REFERENCES states(id) ON DELETE CASCADE,
    polygon JSONB NOT NULL,
    floor_altitude_m DOUBLE PRECISION,
    ceiling_altitude_m DOUBLE PRECISION,
    restriction_level TEXT CHECK (restriction_level IN ('absolute', 'conditional', 'advisory')) DEFAULT 'advisory',
    is_permanent BOOLEAN DEFAULT TRUE,
    effective_from TIMESTAMP WITH TIME ZONE,
    effective_until TIMESTAMP WITH TIME ZONE,
    clearance_required TEXT DEFAULT 'none',
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_airspace_zones_state ON airspace_zones(state_id);

-- 12. Surveillance Missions (Phase 5) — patrol/waypoint mission records.
-- In-memory only in the current in-memory DB adapter (see
-- db.surveillanceMissions in database.js) — this table is defined for
-- future Supabase parity, not yet read/written by that adapter.
CREATE TABLE IF NOT EXISTS surveillance_missions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    type TEXT CHECK (type IN ('patrol', 'waypoint', 'scheduled', 'alert_response', 'coverage')) DEFAULT 'patrol',
    zone_id UUID REFERENCES airspace_zones(id) ON DELETE SET NULL,
    state_id UUID REFERENCES states(id) ON DELETE CASCADE,
    waypoints JSONB DEFAULT '[]'::jsonb,
    patrol_pattern TEXT CHECK (patrol_pattern IN ('linear', 'circular', 'grid', 'random')) DEFAULT 'circular',
    assigned_drone_ids JSONB DEFAULT '[]'::jsonb,
    handoff_strategy TEXT DEFAULT 'sequential',
    schedule_interval_minutes INT,
    repeat BOOLEAN DEFAULT FALSE,
    status TEXT CHECK (status IN ('planned', 'active', 'paused', 'complete', 'aborted')) DEFAULT 'planned',
    current_drone_id UUID REFERENCES drones(id) ON DELETE SET NULL,
    current_waypoint_index INT DEFAULT 0,
    waypoint_direction INT DEFAULT 1,
    anomaly_detection_enabled BOOLEAN DEFAULT TRUE,
    created_by TEXT DEFAULT 'operator',
    mission_logs JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    next_run_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_surveillance_missions_state ON surveillance_missions(state_id);
CREATE INDEX IF NOT EXISTS idx_surveillance_missions_zone ON surveillance_missions(zone_id);

-- Phase 8: hash-chained security audit log (see
-- services/security/securityAuditLogger.js) — reuses the same
-- previous_hash/entry_hash/hash_payload chaining columns Phase 4
-- introduced for snapshots/mission_recordings, applied to security
-- events instead of evidence records.
CREATE TABLE IF NOT EXISTS security_audit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    action TEXT CHECK (action IN (
        'login_success', 'login_failure', 'login_rate_limited', 'logout',
        'zone_created', 'zone_updated', 'zone_deleted',
        'rl_mode_changed', 'unauthorized_attempt'
    )) NOT NULL,
    actor JSONB,
    target JSONB,
    details JSONB DEFAULT '{}'::jsonb,
    previous_hash TEXT,
    entry_hash TEXT,
    hash_payload TEXT,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_security_audit_log_timestamp ON security_audit_log(timestamp);
CREATE INDEX IF NOT EXISTS idx_security_audit_log_action ON security_audit_log(action);

-- Automatic triggers for updated_at column tracking
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_drones_updated_at ON drones;
CREATE TRIGGER update_drones_updated_at 
BEFORE UPDATE ON drones 
FOR EACH ROW 
EXECUTE PROCEDURE update_updated_at_column();

-- ============================================================
-- Row Level Security (production hardening — see security review
-- preceding this block). The only consumer of this database is the
-- RAPID Express server, always connecting with the Supabase
-- service_role key, which bypasses RLS unconditionally regardless of
-- policies. Neither the web client nor the mobile app ever queries
-- Supabase directly (confirmed by inspection). Enabling RLS with no
-- policies therefore denies all access to the `anon`/`authenticated`
-- roles by default — closing off PostgREST's automatic public API
-- exposure of every table — with zero functional impact on the app.
--
-- No CREATE POLICY statements are added: absence of any policy for a
-- role already means that role gets zero rows on every operation.
-- ============================================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE organisations ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE nations ENABLE ROW LEVEL SECURITY;
ALTER TABLE states ENABLE ROW LEVEL SECURITY;
ALTER TABLE districts ENABLE ROW LEVEL SECURITY;
ALTER TABLE bases ENABLE ROW LEVEL SECURITY;
ALTER TABLE drones ENABLE ROW LEVEL SECURITY;
ALTER TABLE incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE telemetry_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE dispatch_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE mission_recordings ENABLE ROW LEVEL SECURITY;
ALTER TABLE controller_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE citizen_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE voice_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE airspace_zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE surveillance_missions ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_audit_log ENABLE ROW LEVEL SECURITY;
