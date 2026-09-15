const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { NATION, OPERATING_AREAS } = require('./geoConfig');
require('dotenv').config();

// ============================================================
// Multi-Agency Organisations (Phase 6)
//
// All 22 existing bases are genuinely police stations, so they're all
// seeded under POLICE — the other four organisations exist as real
// entities (for RBAC + cross-org isolation to be demonstrable) but
// start with zero bases/drones of their own, which correctly proves
// isolation (an Army user sees an empty fleet because they have no
// assets yet, not because of a bug) rather than needing fabricated
// parallel fleet data.
// ============================================================
const seedOrganisations = [
  { id: crypto.randomUUID(), code: 'POLICE', name: 'State Police', operational_domain: 'law_enforcement', jurisdiction_type: 'territorial', max_altitude_m: 120, airspace_authority_level: 'consumer', cross_org_visibility: 'none' },
  { id: crypto.randomUUID(), code: 'ARMY', name: 'Indian Army', operational_domain: 'defence', jurisdiction_type: 'territorial', max_altitude_m: 400, airspace_authority_level: 'military', cross_org_visibility: 'none' },
  { id: crypto.randomUUID(), code: 'NAVY', name: 'Indian Navy', operational_domain: 'naval', jurisdiction_type: 'maritime', max_altitude_m: 400, airspace_authority_level: 'military', cross_org_visibility: 'none' },
  { id: crypto.randomUUID(), code: 'AIR_FORCE', name: 'Indian Air Force', operational_domain: 'air', jurisdiction_type: 'aerial', max_altitude_m: 3000, airspace_authority_level: 'military', cross_org_visibility: 'read_only' },
  { id: crypto.randomUUID(), code: 'AVIATION_CONTROL', name: 'Aviation Control Authority', operational_domain: 'airspace_authority', jurisdiction_type: 'combined', max_altitude_m: null, airspace_authority_level: 'authority', cross_org_visibility: 'read_only' }
];
const policeOrgId = seedOrganisations.find(o => o.code === 'POLICE').id;
const aviationControlOrgId = seedOrganisations.find(o => o.code === 'AVIATION_CONTROL').id;

// ============================================================
// Nationwide hierarchy seed (Phase 1)
//
// Nation -> State -> District -> Base is built here from the raw
// geography in geoConfig.js. Existing Goa drones (seeded below)
// are matched to their base by base_code; each new Punjab base
// gets exactly one seed drone so the demo fleet stays a manageable
// size instead of literally seeding minimum_fleet_capacity (6) per
// base, which would mean 100+ drones for Punjab alone.
// ============================================================
const seedNations = [];
const seedStates = [];
const seedDistricts = [];
const seedBases = [];
const seedAirspaceZones = [];

const DRONE_MODEL_POOL = ['DJI Matrice 300 RTK', 'PX4 Custom Hexacopter', 'ArduPilot Quadcopter', 'DJI Inspire 3', 'Custom ESP32 Searcher'];

const nationRecord = { id: crypto.randomUUID(), code: NATION.code, name: NATION.name };
seedNations.push(nationRecord);

const extraDrones = [];
let extraDroneSeq = 0;

for (const area of OPERATING_AREAS) {
  const stateRecord = {
    id: crypto.randomUUID(),
    nation_id: nationRecord.id,
    code: area.stateCode,
    name: area.stateName,
    capital_latitude: area.mapCenter.latitude,
    capital_longitude: area.mapCenter.longitude,
    operational_status: 'active'
  };
  seedStates.push(stateRecord);

  // Phase 5: seed airspace zones for this state from geoConfig's raw
  // noFlyZones (existing, unchanged) + surveillanceZones (new demo
  // patrol-eligible zones). This becomes the live, CRUD-able source of
  // truth (see routes/airspace.js) — dispatch-time enforcement and the
  // map both read from db.airspaceZones from here on, not geoConfig
  // directly, so zones created/edited after startup are actually
  // enforced rather than being decorative.
  for (const zone of area.noFlyZones || []) {
    seedAirspaceZones.push({
      id: crypto.randomUUID(),
      name: zone.name,
      type: zone.type || 'no_fly',
      state_id: stateRecord.id,
      polygon: zone.polygon,
      floor_altitude_m: null,
      ceiling_altitude_m: null,
      restriction_level: zone.restrictionLevel || 'absolute',
      is_permanent: true,
      effective_from: null,
      effective_until: null,
      clearance_required: 'none',
      active: true,
      created_at: new Date().toISOString()
    });
  }
  for (const zone of area.surveillanceZones || []) {
    seedAirspaceZones.push({
      id: crypto.randomUUID(),
      name: zone.name,
      type: zone.type || 'protected_area',
      state_id: stateRecord.id,
      polygon: zone.polygon,
      floor_altitude_m: null,
      ceiling_altitude_m: null,
      restriction_level: zone.restrictionLevel || 'advisory',
      is_permanent: true,
      effective_from: null,
      effective_until: null,
      clearance_required: 'none',
      active: true,
      created_at: new Date().toISOString()
    });
  }

  for (const district of area.districts) {
    const districtRecord = {
      id: crypto.randomUUID(),
      state_id: stateRecord.id,
      name: district.name,
      headquarters_latitude: district.headquarters.latitude,
      headquarters_longitude: district.headquarters.longitude,
      operational_status: 'active'
    };
    seedDistricts.push(districtRecord);

    for (const base of district.bases) {
      const baseRecord = {
        id: crypto.randomUUID(),
        base_code: base.baseCode,
        name: base.name,
        type: 'police_drone_base',
        organisation_id: policeOrgId,
        state_id: stateRecord.id,
        district_id: districtRecord.id,
        latitude: base.latitude,
        longitude: base.longitude,
        coverage_radius_m: base.coverage,
        operational_status: 'active',
        minimum_fleet_capacity: 6
      };
      seedBases.push(baseRecord);

      // Goa's 5 original bases keep their hand-authored drone seeds
      // below (matched by base_code); every other base gets one
      // freshly-seeded standby drone so the fleet stays demo-sized.
      if (!base.baseCode.startsWith('GA-')) {
        extraDroneSeq++;
        extraDrones.push({
          id: crypto.randomUUID(),
          call_sign: base.callSign,
          model: DRONE_MODEL_POOL[extraDroneSeq % DRONE_MODEL_POOL.length],
          status: 'Standby',
          battery_level: 90 + (extraDroneSeq % 11), // 90-100, deterministic spread
          latitude: base.latitude,
          longitude: base.longitude,
          altitude: 0.0,
          speed: 0.0,
          heading: 0.0,
          current_incident_id: null,
          base_id: baseRecord.id,
          base_latitude: base.latitude,
          base_longitude: base.longitude,
          hardware_id: `esp32-mac-${base.baseCode.toLowerCase()}`,
          mavlink_system_id: 1000 + extraDroneSeq,
          stream_url: null,
          is_hardware_active: false,
          updated_at: new Date().toISOString()
        });
      }
    }
  }
}

function findBaseIdByCode(baseCode) {
  const base = seedBases.find(b => b.base_code === baseCode);
  return base ? base.id : null;
}

// ============================================================
// Demo Personnel Accounts (Phase 6)
//
// One shared demo password across all seed accounts, purely for ease
// of trying different roles/scopes — a real deployment would never do
// this. Distinct from citizen_profiles (Phase 3) — these are
// organisation personnel, not the public.
// ============================================================
const DEMO_PASSWORD_HASH = bcrypt.hashSync('rapid123', 10);
const goaStateId = seedStates.find(s => s.code === 'GA')?.id || null;
const punjabStateId = seedStates.find(s => s.code === 'PB')?.id || null;

const seedUsers = [
  { id: crypto.randomUUID(), username: 'national.commander', password_hash: DEMO_PASSWORD_HASH, full_name: 'DGP Arjun Malhotra', organisation_id: policeOrgId, role: 'NATIONAL_COMMANDER', scope_type: 'national', scope_id: null },
  { id: crypto.randomUUID(), username: 'goa.commander', password_hash: DEMO_PASSWORD_HASH, full_name: 'IGP Sunita Kamath', organisation_id: policeOrgId, role: 'STATE_COMMANDER', scope_type: 'state', scope_id: goaStateId },
  { id: crypto.randomUUID(), username: 'punjab.commander', password_hash: DEMO_PASSWORD_HASH, full_name: 'IGP Harpreet Sidhu', organisation_id: policeOrgId, role: 'STATE_COMMANDER', scope_type: 'state', scope_id: punjabStateId },
  { id: crypto.randomUUID(), username: 'operator', password_hash: DEMO_PASSWORD_HASH, full_name: 'Officer Ananya Fernandes', organisation_id: policeOrgId, role: 'OPERATOR', scope_type: 'national', scope_id: null },
  { id: crypto.randomUUID(), username: 'observer', password_hash: DEMO_PASSWORD_HASH, full_name: 'Analyst Rohan Kapoor', organisation_id: policeOrgId, role: 'OBSERVER', scope_type: 'national', scope_id: null },
  { id: crypto.randomUUID(), username: 'aviation.control', password_hash: DEMO_PASSWORD_HASH, full_name: 'Controller Meera Iyer', organisation_id: aviationControlOrgId, role: 'AIRSPACE_AUTHORITY', scope_type: 'national', scope_id: null }
];

// Standard local in-memory store for fallback/demo mode
const localDb = {
  nations: seedNations,
  states: seedStates,
  districts: seedDistricts,
  bases: seedBases,
  airspace_zones: seedAirspaceZones,
  surveillance_missions: [],
  organisations: seedOrganisations,
  users: seedUsers,
  security_audit_log: [],
  profiles: [
    { id: 'b2308e2f-5326-4ee1-b75f-b52b8b9f1d01', full_name: 'Inspector Vikram Singh', role: 'dispatcher', status: 'active' },
    { id: 'b2308e2f-5326-4ee1-b75f-b52b8b9f1d02', full_name: 'Officer Ananya Fernandes', role: 'operator', status: 'active' },
    { id: 'b2308e2f-5326-4ee1-b75f-b52b8b9f1d03', full_name: 'Dr. Ramesh Sawant', role: 'responder', status: 'offline' }
  ],
  drones: [
    {
      id: 'a3407e2f-5326-4ee1-b75f-a12b8b9f1d01',
      call_sign: 'Rakshak-01',
      model: 'DJI Matrice 300 RTK',
      status: 'Standby',
      battery_level: 100,
      latitude: 15.4909, // Panaji base
      longitude: 73.8278,
      altitude: 0.0,
      speed: 0.0,
      heading: 0.0,
      current_incident_id: null,
      base_id: findBaseIdByCode('GA-NG-PNJ'),
      base_latitude: 15.4909,
      base_longitude: 73.8278,
      hardware_id: 'esp32-mac-rakshak1',
      mavlink_system_id: 10,
      stream_url: 'https://multiplatform-f.akamaihd.net/i/multi/will/apple/loopmenu/manifest.m3u8',
      is_hardware_active: false,
      updated_at: new Date().toISOString()
    },
    {
      id: 'a3407e2f-5326-4ee1-b75f-a12b8b9f1d02',
      call_sign: 'Rakshak-02',
      model: 'PX4 Custom Hexacopter',
      status: 'Standby',
      battery_level: 94,
      latitude: 15.2736, // Margao base
      longitude: 73.9582,
      altitude: 0.0,
      speed: 0.0,
      heading: 0.0,
      current_incident_id: null,
      base_id: findBaseIdByCode('GA-SG-MRG'),
      base_latitude: 15.2736,
      base_longitude: 73.9582,
      hardware_id: 'esp32-mac-rakshak2',
      mavlink_system_id: 20,
      stream_url: 'https://cph-p2p-msl.akamaized.net/hls/live/2000341/test/master.m3u8',
      is_hardware_active: false,
      updated_at: new Date().toISOString()
    },
    {
      id: 'a3407e2f-5326-4ee1-b75f-a12b8b9f1d03',
      call_sign: 'Rakshak-03',
      model: 'ArduPilot Quadcopter',
      status: 'Standby',
      battery_level: 80,
      latitude: 15.3995, // Vasco base
      longitude: 73.8118,
      altitude: 0.0,
      speed: 0.0,
      heading: 0.0,
      current_incident_id: null,
      base_id: findBaseIdByCode('GA-SG-VSC'),
      base_latitude: 15.3995,
      base_longitude: 73.8118,
      hardware_id: 'esp32-mac-rakshak3',
      mavlink_system_id: 30,
      stream_url: null,
      is_hardware_active: false,
      updated_at: new Date().toISOString()
    },
    {
      id: 'a3407e2f-5326-4ee1-b75f-a12b8b9f1d04',
      call_sign: 'Rakshak-04',
      model: 'DJI Inspire 3',
      status: 'Standby',
      battery_level: 100,
      latitude: 15.5907, // Mapusa base
      longitude: 73.8122,
      altitude: 0.0,
      speed: 0.0,
      heading: 0.0,
      current_incident_id: null,
      base_id: findBaseIdByCode('GA-NG-MPS'),
      base_latitude: 15.5907,
      base_longitude: 73.8122,
      hardware_id: 'esp32-mac-rakshak4',
      mavlink_system_id: 40,
      stream_url: null,
      is_hardware_active: false,
      updated_at: new Date().toISOString()
    },
    {
      id: 'a3407e2f-5326-4ee1-b75f-a12b8b9f1d05',
      call_sign: 'Rakshak-05',
      model: 'Custom ESP32 Searcher',
      status: 'maintenance',
      battery_level: 15,
      latitude: 15.4018, // Ponda base
      longitude: 74.0124,
      altitude: 0.0,
      speed: 0.0,
      heading: 0.0,
      current_incident_id: null,
      base_id: findBaseIdByCode('GA-NG-PND'),
      base_latitude: 15.4018,
      base_longitude: 74.0124,
      hardware_id: 'esp32-mac-rakshak5',
      mavlink_system_id: 50,
      stream_url: null,
      is_hardware_active: false,
      updated_at: new Date().toISOString()
    },
    ...extraDrones
  ],
  incidents: [],
  telemetry_history: [],
  dispatch_logs: [],
  snapshots: [],
  mission_recordings: [],
  controller_actions: [],
  experience_buffer: [],
  citizen_profiles: [],
  voice_reports: []
};

const rawSupabaseUrl = process.env.SUPABASE_URL;
const supabaseUrl = rawSupabaseUrl ? rawSupabaseUrl.replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '') : null;
const supabaseKey = process.env.SUPABASE_KEY;

const isSupabaseEnabled = !!(supabaseUrl && supabaseKey);

if (isSupabaseEnabled) {
  console.log('🔌 Database: Supabase backend connected.');
} else {
  console.log('💾 Database: Using in-memory database simulation (No Supabase credentials provided).');
}

const supabase = isSupabaseEnabled ? createClient(supabaseUrl, supabaseKey) : null;

// Database Adapter Interface
const db = {
  isSupabase: isSupabaseEnabled,

  // -------------------------------------------------------
  // Nationwide hierarchy (Phase 1) — Nation -> State -> District -> Base.
  // Read-mostly reference data; seeded once from geoConfig.js at
  // startup. Supabase branches fall back to the in-memory seed if
  // the tables don't exist yet, same pattern as missionRecordings.
  // -------------------------------------------------------
  nations: {
    async list() {
      if (isSupabaseEnabled) {
        try {
          const { data, error } = await supabase.from('nations').select('*');
          if (!error && data && data.length > 0) return data;
        } catch (_) {}
      }
      return [...localDb.nations];
    }
  },

  states: {
    async list({ nationId } = {}) {
      if (isSupabaseEnabled) {
        try {
          let query = supabase.from('states').select('*');
          if (nationId) query = query.eq('nation_id', nationId);
          const { data, error } = await query;
          if (!error && data && data.length > 0) return data;
        } catch (_) {}
      }
      return localDb.states.filter(s => !nationId || s.nation_id === nationId);
    },
    async get(id) {
      if (isSupabaseEnabled) {
        try {
          const { data, error } = await supabase.from('states').select('*').eq('id', id).single();
          if (!error) return data;
        } catch (_) {}
      }
      return localDb.states.find(s => s.id === id || s.code === id) || null;
    }
  },

  districts: {
    async list({ stateId } = {}) {
      if (isSupabaseEnabled) {
        try {
          let query = supabase.from('districts').select('*');
          if (stateId) query = query.eq('state_id', stateId);
          const { data, error } = await query;
          if (!error && data && data.length > 0) return data;
        } catch (_) {}
      }
      return localDb.districts.filter(d => !stateId || d.state_id === stateId);
    }
  },

  bases: {
    async list({ stateId, districtId } = {}) {
      if (isSupabaseEnabled) {
        try {
          let query = supabase.from('bases').select('*');
          if (stateId) query = query.eq('state_id', stateId);
          if (districtId) query = query.eq('district_id', districtId);
          const { data, error } = await query;
          if (!error && data && data.length > 0) return data;
        } catch (_) {}
      }
      return localDb.bases.filter(b =>
        (!stateId || b.state_id === stateId) &&
        (!districtId || b.district_id === districtId)
      );
    },
    async get(id) {
      if (isSupabaseEnabled) {
        try {
          const { data, error } = await supabase.from('bases').select('*').eq('id', id).single();
          if (!error) return data;
        } catch (_) {}
      }
      return localDb.bases.find(b => b.id === id) || null;
    }
  },

  // -------------------------------------------------------
  // Organisations (Phase 6) — Police/Army/Navy/Air Force/Aviation
  // Control. Reference data seeded at startup; no write routes yet
  // (creating a new organisation isn't a demo-relevant operation).
  // -------------------------------------------------------
  organisations: {
    async list() {
      if (isSupabaseEnabled) {
        const { data, error } = await supabase.from('organisations').select('*');
        if (error) throw error;
        return data;
      }
      return [...localDb.organisations];
    },
    async get(id) {
      if (isSupabaseEnabled) {
        // Two safe equality lookups (id, then code) rather than a single
        // interpolated `.or()` filter string — id/code values never come
        // from unsanitized request input in this app, but this avoids
        // ever building a PostgREST filter expression out of a variable.
        const byId = await supabase.from('organisations').select('*').eq('id', id).maybeSingle();
        if (byId.error) throw byId.error;
        if (byId.data) return byId.data;
        const byCode = await supabase.from('organisations').select('*').eq('code', id).maybeSingle();
        if (byCode.error) throw byCode.error;
        return byCode.data;
      }
      return localDb.organisations.find(o => o.id === id || o.code === id) || null;
    }
  },

  // -------------------------------------------------------
  // Users (Phase 6) — organisation personnel accounts. Distinct from
  // citizen_profiles (Phase 3's public-facing mobile app accounts).
  // -------------------------------------------------------
  users: {
    async list() {
      if (isSupabaseEnabled) {
        const { data, error } = await supabase.from('users').select('*');
        if (error) throw error;
        return data;
      }
      return [...localDb.users];
    },
    async get(id) {
      if (isSupabaseEnabled) {
        const { data, error } = await supabase.from('users').select('*').eq('id', id).maybeSingle();
        if (error) throw error;
        return data;
      }
      return localDb.users.find(u => u.id === id) || null;
    },
    async getByUsername(username) {
      if (isSupabaseEnabled) {
        const { data, error } = await supabase.from('users').select('*').eq('username', username).maybeSingle();
        if (error) throw error;
        return data;
      }
      return localDb.users.find(u => u.username === username) || null;
    }
  },

  // -------------------------------------------------------
  // Airspace Zones (Phase 5) — the live, CRUD-able source of truth for
  // no-fly/restricted/protected zones. Seeded once from geoConfig.js at
  // startup; routes/airspace.js can create/update/deactivate zones
  // afterward, and dispatch-time enforcement (rl/environment.js,
  // routes/fleet.js) reads from here, not from geoConfig directly.
  // -------------------------------------------------------
  airspaceZones: {
    async list({ stateId, type, activeOnly = true } = {}) {
      if (isSupabaseEnabled) {
        try {
          let query = supabase.from('airspace_zones').select('*');
          if (stateId) query = query.eq('state_id', stateId);
          if (type) query = query.eq('type', type);
          if (activeOnly) query = query.eq('active', true);
          const { data, error } = await query;
          if (!error && data) return data;
        } catch (_) {}
      }
      return localDb.airspace_zones.filter(z =>
        (!stateId || z.state_id === stateId) &&
        (!type || z.type === type) &&
        (!activeOnly || z.active)
      );
    },
    async get(id) {
      if (isSupabaseEnabled) {
        try {
          const { data, error } = await supabase.from('airspace_zones').select('*').eq('id', id).single();
          if (!error) return data;
        } catch (_) {}
      }
      return localDb.airspace_zones.find(z => z.id === id) || null;
    },
    async create(data) {
      const zone = {
        id: require('crypto').randomUUID(),
        name: data.name,
        type: data.type || 'protected_area',
        state_id: data.state_id,
        polygon: data.polygon,
        floor_altitude_m: data.floor_altitude_m ?? null,
        ceiling_altitude_m: data.ceiling_altitude_m ?? null,
        restriction_level: data.restriction_level || 'advisory',
        is_permanent: data.is_permanent ?? true,
        effective_from: data.effective_from || null,
        effective_until: data.effective_until || null,
        clearance_required: data.clearance_required || 'none',
        active: data.active ?? true,
        created_at: new Date().toISOString()
      };
      if (isSupabaseEnabled) {
        try {
          const { data: row, error } = await supabase.from('airspace_zones').insert([zone]).select().single();
          if (!error) return row;
        } catch (_) {}
      }
      localDb.airspace_zones.push(zone);
      return zone;
    },
    async update(id, updates) {
      if (isSupabaseEnabled) {
        try {
          const { data, error } = await supabase.from('airspace_zones').update(updates).eq('id', id).select().single();
          if (!error) return data;
        } catch (_) {}
      }
      const zone = localDb.airspace_zones.find(z => z.id === id);
      if (zone) {
        Object.assign(zone, updates);
        return { ...zone };
      }
      return null;
    }
  },

  // -------------------------------------------------------
  // Surveillance Missions (Phase 5) — patrol/waypoint mission records.
  // See services/surveillance/.
  // -------------------------------------------------------
  surveillanceMissions: {
    async list({ stateId, status } = {}) {
      if (isSupabaseEnabled) {
        try {
          let query = supabase.from('surveillance_missions').select('*');
          if (status) query = query.eq('status', status);
          const { data, error } = await query;
          if (!error && data) return data;
        } catch (_) {}
      }
      return localDb.surveillance_missions.filter(m =>
        (!stateId || m.state_id === stateId) && (!status || m.status === status)
      );
    },
    async get(id) {
      if (isSupabaseEnabled) {
        try {
          const { data, error } = await supabase.from('surveillance_missions').select('*').eq('id', id).single();
          if (!error) return data;
        } catch (_) {}
      }
      return localDb.surveillance_missions.find(m => m.id === id) || null;
    },
    async create(data) {
      const mission = {
        id: require('crypto').randomUUID(),
        type: data.type || 'patrol',
        zone_id: data.zone_id || null,
        state_id: data.state_id,
        waypoints: data.waypoints || [],
        patrol_pattern: data.patrol_pattern || 'circular',
        assigned_drone_ids: data.assigned_drone_ids || [],
        handoff_strategy: data.handoff_strategy || 'sequential',
        schedule_interval_minutes: data.schedule_interval_minutes || null,
        repeat: data.repeat ?? false,
        status: data.status || 'planned',
        current_drone_id: data.current_drone_id || null,
        current_waypoint_index: 0,
        waypoint_direction: 1,
        anomaly_detection_enabled: data.anomaly_detection_enabled ?? true,
        created_by: data.created_by || 'operator',
        mission_logs: [],
        created_at: new Date().toISOString(),
        started_at: null,
        completed_at: null,
        next_run_at: null
      };

      // Integration fix: this previously wrote to localDb only, even
      // when Supabase was enabled — list()/get() above check Supabase
      // first and would return an empty-but-successful result rather
      // than falling back, so a mission created here was silently
      // invisible to every subsequent list/get call. Write failures are
      // thrown, not swallowed, matching drones/incidents.
      if (isSupabaseEnabled) {
        const { data: row, error } = await supabase.from('surveillance_missions').insert([mission]).select().single();
        if (error) throw error;
        return row;
      }
      localDb.surveillance_missions.push(mission);
      return mission;
    },
    async update(id, updates) {
      if (isSupabaseEnabled) {
        const { data: row, error } = await supabase.from('surveillance_missions').update(updates).eq('id', id).select().single();
        if (error) throw error;
        return row;
      }
      const mission = localDb.surveillance_missions.find(m => m.id === id);
      if (mission) {
        Object.assign(mission, updates);
        return { ...mission };
      }
      return null;
    },
    async appendLog(id, logEntry) {
      if (isSupabaseEnabled) {
        const current = await this.get(id);
        if (!current) return null;
        const mission_logs = [{ ...logEntry, timestamp: new Date().toISOString() }, ...(current.mission_logs || [])].slice(0, 100);
        const { data: row, error } = await supabase.from('surveillance_missions').update({ mission_logs }).eq('id', id).select().single();
        if (error) throw error;
        return row;
      }
      const mission = localDb.surveillance_missions.find(m => m.id === id);
      if (!mission) return null;
      mission.mission_logs = [{ ...logEntry, timestamp: new Date().toISOString() }, ...mission.mission_logs].slice(0, 100);
      return { ...mission };
    }
  },

  drones: {
    async list() {
      if (isSupabaseEnabled) {
        const { data, error } = await supabase.from('drones').select('*').order('call_sign', { ascending: true });
        if (error) throw error;
        return data;
      }
      return [...localDb.drones];
    },
    async get(id) {
      if (isSupabaseEnabled) {
        const { data, error } = await supabase.from('drones').select('*').eq('id', id).single();
        if (error) throw error;
        return data;
      }
      return localDb.drones.find(d => d.id === id) || null;
    },
    async update(id, updates) {
      if (isSupabaseEnabled) {
        const safeUpdates = updates.battery_level !== undefined
          ? { ...updates, battery_level: Math.round(updates.battery_level) }
          : updates;
        const { data, error } = await supabase.from('drones').update({ ...safeUpdates, updated_at: new Date() }).eq('id', id).select().single();
        if (error) throw error;
        return data;
      }
      const drone = localDb.drones.find(d => d.id === id);
      if (drone) {
        Object.assign(drone, updates, { updated_at: new Date().toISOString() });
        return { ...drone };
      }
      return null;
    }
  },

  incidents: {
    async list() {
      if (isSupabaseEnabled) {
        const { data, error } = await supabase.from('incidents').select('*').order('created_at', { ascending: false });
        if (error) throw error;
        return data;
      }
      return [...localDb.incidents].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    },
    async get(id) {
      if (isSupabaseEnabled) {
        const { data, error } = await supabase.from('incidents').select('*').eq('id', id).single();
        if (error) throw error;
        return data;
      }
      return localDb.incidents.find(i => i.id === id) || null;
    },
    async create(incidentData) {
      const newId = incidentData.id || require('crypto').randomUUID();
      const newIncident = {
        id: newId,
        title: incidentData.title,
        description: incidentData.description || '',
        category: incidentData.category,
        severity: incidentData.severity || 'medium',
        status: incidentData.status || 'reported',
        latitude: parseFloat(incidentData.latitude),
        longitude: parseFloat(incidentData.longitude),
        assigned_drone_id: incidentData.assigned_drone_id || null,
        reporter_id: incidentData.reporter_id || null,
        citizen_name: incidentData.citizen_name || null,
        citizen_phone: incidentData.citizen_phone || null,
        created_at: new Date().toISOString(),
        resolved_at: null
      };

      if (isSupabaseEnabled) {
        const { data, error } = await supabase.from('incidents').insert([newIncident]).select().single();
        if (error) throw error;
        return data;
      }
      localDb.incidents.push(newIncident);
      return newIncident;
    },
    async update(id, updates) {
      if (isSupabaseEnabled) {
        const { data, error } = await supabase.from('incidents').update(updates).eq('id', id).select().single();
        if (error) throw error;
        return data;
      }
      const incident = localDb.incidents.find(i => i.id === id);
      if (incident) {
        Object.assign(incident, updates);
        return { ...incident };
      }
      return null;
    }
  },

  telemetry: {
    async create(historyData) {
      const newLog = {
        id:            require('crypto').randomUUID(),
        drone_id:      historyData.drone_id,
        // latitude  = north/south (positive = north)
        // longitude = east/west   (positive = east)
        latitude:      parseFloat(historyData.latitude),
        longitude:     parseFloat(historyData.longitude),
        altitude:      parseFloat(historyData.altitude   || 0.0),
        speed:         parseFloat(historyData.speed      || 0.0),
        heading:       parseFloat(historyData.heading    || 0.0),
        battery_level: parseInt(historyData.battery_level),
        timestamp:     new Date().toISOString()
      };

      if (isSupabaseEnabled) {
        const { data, error } = await supabase.from('telemetry_history').insert([newLog]).select();
        if (error) throw error;
        return data;
      }
      localDb.telemetry_history.push(newLog);
      // Keep local history capped to avoid memory leak
      if (localDb.telemetry_history.length > 500) {
        localDb.telemetry_history.shift();
      }
      return [newLog];
    },
    async getHistory(droneId, limit = 50) {
      if (isSupabaseEnabled) {
        const { data, error } = await supabase.from('telemetry_history').select('*').eq('drone_id', droneId).order('timestamp', { ascending: false }).limit(limit);
        if (error) throw error;
        return data;
      }
      return localDb.telemetry_history.filter(h => h.drone_id === droneId).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, limit);
    }
  },

  dispatchLogs: {
    async create(logData) {
      const newLog = {
        id: require('crypto').randomUUID(),
        incident_id: logData.incident_id,
        drone_id: logData.drone_id || null,
        dispatcher_id: logData.dispatcher_id || null,
        action: logData.action,
        timestamp: new Date().toISOString(),
        notes: logData.notes || ''
      };

      if (isSupabaseEnabled) {
        const { data, error } = await supabase.from('dispatch_logs').insert([newLog]).select();
        if (error) throw error;
        return data;
      }
      localDb.dispatch_logs.push(newLog);
      return [newLog];
    },
    async listForIncident(incidentId) {
      if (isSupabaseEnabled) {
        const { data, error } = await supabase.from('dispatch_logs').select('*').eq('incident_id', incidentId).order('timestamp', { ascending: true });
        if (error) throw error;
        return data;
      }
      return localDb.dispatch_logs.filter(l => l.incident_id === incidentId).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    }
  },

  snapshots: {
    async create(snapData) {
      const newSnap = {
        id: require('crypto').randomUUID(),
        incident_id: snapData.incident_id,
        drone_id: snapData.drone_id,
        label: snapData.label,
        latitude: parseFloat(snapData.latitude),
        longitude: parseFloat(snapData.longitude),
        timestamp: new Date().toISOString(),
        image_url: snapData.image_url,
        // Extended Command 2 metadata
        heading: snapData.heading != null ? parseFloat(snapData.heading) : null,
        altitude: snapData.altitude != null ? parseFloat(snapData.altitude) : null,
        reason: snapData.reason || 'manual',
        target: snapData.target || null,
        // Phase 4 evidence integrity — sealed by services/camera/cameraManager.js
        night_vision_active: snapData.night_vision_active ?? null,
        previous_hash: snapData.previous_hash ?? null,
        entry_hash: snapData.entry_hash ?? null,
        hash_payload: snapData.hash_payload ?? null
      };

      if (isSupabaseEnabled) {
        const { data, error } = await supabase.from('snapshots').insert([newSnap]).select().single();
        if (error) throw error;
        return data;
      }
      localDb.snapshots.push(newSnap);
      return newSnap;
    },
    async listForIncident(incidentId) {
      if (isSupabaseEnabled) {
        const { data, error } = await supabase.from('snapshots').select('*').eq('incident_id', incidentId).order('timestamp', { ascending: true });
        if (error) throw error;
        return data;
      }
      return localDb.snapshots.filter(s => s.incident_id === incidentId);
    }
  },

  // -------------------------------------------------------
  // Mission Recordings — demo recording state architecture.
  // Tracks recording lifecycle per mission/drone.
  // Architecture allows real recording integration later.
  // -------------------------------------------------------
  missionRecordings: {
    async create(data) {
      const newRec = {
        id: require('crypto').randomUUID(),
        mission_id: data.mission_id,         // incident ID
        drone_id: data.drone_id,
        rakshak_id: data.rakshak_id,         // call_sign for display
        status: data.status || 'recording',  // 'recording' | 'finalized' | 'aborted'
        source: data.source || 'DEMO_SIMULATION',  // 'DEMO_SIMULATION' | 'LIVE_DRONE'
        recording_start: data.recording_start || new Date().toISOString(),
        recording_end: data.recording_end || null,
        duration_seconds: data.duration_seconds || null,
        stream_url: data.stream_url || null,
        created_at: new Date().toISOString(),
        // Phase 4 evidence integrity — set at finalization, not creation
        // (a "recording" row is still mutable, so it can't be sealed yet).
        previous_hash: null,
        entry_hash: null,
        hash_payload: null
      };

      if (isSupabaseEnabled) {
        const { data: row, error } = await supabase.from('mission_recordings').insert([newRec]).select().single();
        if (error) {
          // Table may not exist in Supabase yet — fall through to in-memory
          localDb.mission_recordings.push(newRec);
          return newRec;
        }
        return row;
      }
      localDb.mission_recordings.push(newRec);
      return newRec;
    },

    async getForMission(missionId) {
      if (isSupabaseEnabled) {
        try {
          const { data, error } = await supabase.from('mission_recordings').select('*').eq('mission_id', missionId).order('created_at', { ascending: false }).limit(1);
          if (!error && data && data.length > 0) return data[0];
        } catch (_) {}
      }
      const recs = localDb.mission_recordings.filter(r => r.mission_id === missionId);
      return recs.length > 0 ? recs[recs.length - 1] : null;
    },

    async getForDrone(droneId) {
      if (isSupabaseEnabled) {
        try {
          const { data, error } = await supabase.from('mission_recordings').select('*').eq('drone_id', droneId).order('created_at', { ascending: false }).limit(1);
          if (!error && data && data.length > 0) return data[0];
        } catch (_) {}
      }
      const recs = localDb.mission_recordings.filter(r => r.drone_id === droneId && r.status === 'recording');
      return recs.length > 0 ? recs[recs.length - 1] : null;
    },

    async listForMission(missionId) {
      if (isSupabaseEnabled) {
        try {
          const { data, error } = await supabase.from('mission_recordings').select('*').eq('mission_id', missionId).order('created_at', { ascending: true });
          if (!error && data) return data;
        } catch (_) {}
      }
      return localDb.mission_recordings.filter(r => r.mission_id === missionId).sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    },

    async update(id, updates) {
      if (isSupabaseEnabled) {
        try {
          const { data, error } = await supabase.from('mission_recordings').update(updates).eq('id', id).select().single();
          if (!error) return data;
        } catch (_) {}
      }
      const rec = localDb.mission_recordings.find(r => r.id === id);
      if (rec) {
        Object.assign(rec, updates);
        return { ...rec };
      }
      return null;
    },

    async listAll() {
      if (isSupabaseEnabled) {
        try {
          const { data, error } = await supabase.from('mission_recordings').select('*').order('created_at', { ascending: false });
          if (!error) return data;
        } catch (_) {}
      }
      return [...localDb.mission_recordings].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    }
  },

  // -------------------------------------------------------
  // Controller Actions — operator action audit log.
  // Every command issued by the human controller is logged.
  // This becomes the foundation for AI/RL feedback (Command 3+).
  // -------------------------------------------------------
  controllerActions: {
    async create(data) {
      const newAction = {
        id: require('crypto').randomUUID(),
        mission_id: data.mission_id || null,
        drone_id: data.drone_id,
        rakshak_id: data.rakshak_id,
        action: data.action,               // e.g. 'rakshak_selected', 'camera_mode_change'
        parameters: data.parameters || {}, // action-specific params
        result: data.result || 'ok',       // 'ok' | 'error' | 'rejected'
        error_message: data.error_message || null,
        timestamp: new Date().toISOString()
      };

      if (isSupabaseEnabled) {
        try {
          const { data: row, error } = await supabase.from('controller_actions').insert([newAction]).select().single();
          if (!error) return row;
        } catch (_) {}
      }
      localDb.controller_actions.push(newAction);
      // Cap in-memory log to avoid leak
      if (localDb.controller_actions.length > 500) {
        localDb.controller_actions.shift();
      }
      return newAction;
    },

    async listForDrone(droneId, limit = 50) {
      if (isSupabaseEnabled) {
        try {
          const { data, error } = await supabase.from('controller_actions').select('*').eq('drone_id', droneId).order('timestamp', { ascending: false }).limit(limit);
          if (!error) return data;
        } catch (_) {}
      }
      return localDb.controller_actions
        .filter(a => a.drone_id === droneId)
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .slice(0, limit);
    },

    /**
     * Most recent controller actions across the whole fleet, newest first.
     *
     * Exists so routes/fleet.js's decision feed can issue ONE query instead
     * of one listForDrone() per drone (a 1+N: 23 calls for a 22-drone fleet,
     * each a separate PostgREST round trip under Supabase). Sorting and
     * truncation happen in the database rather than in Node, so only `limit`
     * rows cross the wire instead of (drones x perDroneLimit) rows.
     */
    async listRecent(limit = 100, droneIds = null) {
      // droneIds restricts the feed to a caller's in-scope drones. Passing
      // null means no restriction - callers that have already established
      // the caller may see the whole fleet should pass null rather than a
      // list of every id, to keep the PostgREST query string short.
      if (droneIds && droneIds.length === 0) return [];

      if (isSupabaseEnabled) {
        try {
          let query = supabase
            .from('controller_actions')
            .select('*');
          if (droneIds) query = query.in('drone_id', droneIds);
          const { data, error } = await query
            .order('timestamp', { ascending: false })
            .limit(limit);
          if (!error) return data;
        } catch (_) {}
      }
      const allowed = droneIds ? new Set(droneIds) : null;
      return localDb.controller_actions
        .filter(a => !allowed || allowed.has(a.drone_id))
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .slice(0, limit);
    },

    async listForMission(missionId, limit = 50) {
      if (isSupabaseEnabled) {
        try {
          const { data, error } = await supabase.from('controller_actions').select('*').eq('mission_id', missionId).order('timestamp', { ascending: false }).limit(limit);
          if (!error) return data;
        } catch (_) {}
      }
      return localDb.controller_actions
        .filter(a => a.mission_id === missionId)
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .slice(0, limit);
    }
  },

  // -------------------------------------------------------
  // RL Experience Buffer (Phase 2) — (state, action, reward, next_state)
  // tuples from every completed mission. Phase 7's neuralPolicy trains on
  // this (see rl/trainer.js) via rl/featureEncoder.js, which reconstructs
  // per-candidate features from the stored `state` snapshot.
  // -------------------------------------------------------
  experienceBuffer: {
    async create(data) {
      const entry = {
        id: require('crypto').randomUUID(),
        state: data.state,
        action: data.action,
        reward: data.reward,
        reward_components: data.rewardComponents || {},
        outcome: data.outcome || {},
        next_state: data.nextState,
        controller_feedback: data.controllerFeedback || null,
        shadow_comparison: data.shadowComparison || null,
        timestamp: new Date().toISOString()
      };

      if (isSupabaseEnabled) {
        try {
          const { data: row, error } = await supabase.from('experience_buffer').insert([entry]).select().single();
          if (!error) return row;
        } catch (_) {}
      }
      localDb.experience_buffer.push(entry);
      if (localDb.experience_buffer.length > 500) {
        localDb.experience_buffer.shift();
      }
      return entry;
    },

    async list(limit = 50) {
      if (isSupabaseEnabled) {
        try {
          const { data, error } = await supabase.from('experience_buffer').select('*').order('timestamp', { ascending: false }).limit(limit);
          if (!error) return data;
        } catch (_) {}
      }
      return [...localDb.experience_buffer].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, limit);
    }
  },

  // -------------------------------------------------------
  // Security Audit Log (Phase 8) — SHA-256 hash-chained security events
  // (login attempts, airspace zone writes, RL mode switches, unauthorized
  // role-gated attempts). See services/security/securityAuditLogger.js,
  // which reuses camera/evidenceHasher.js's chaining logic unchanged
  // rather than re-deriving it. Capped like experience_buffer — a real
  // deployment would persist this rather than cap it in memory.
  // -------------------------------------------------------
  securityAuditLog: {
    async create(data) {
      const entry = {
        id: require('crypto').randomUUID(),
        action: data.action,
        actor: data.actor || null,
        target: data.target || null,
        details: data.details || {},
        previous_hash: data.previousHash || null,
        entry_hash: data.entryHash,
        hash_payload: data.hashPayload,
        timestamp: data.timestamp || new Date().toISOString()
      };

      if (isSupabaseEnabled) {
        try {
          const { data: row, error } = await supabase.from('security_audit_log').insert([entry]).select().single();
          if (!error) return row;
        } catch (_) {}
      }
      localDb.security_audit_log.push(entry);
      if (localDb.security_audit_log.length > 2000) {
        localDb.security_audit_log.shift();
      }
      return entry;
    },

    // Most-recent-first, matching experienceBuffer's convention.
    async list(limit = 50) {
      if (isSupabaseEnabled) {
        try {
          const { data, error } = await supabase.from('security_audit_log').select('*').order('timestamp', { ascending: false }).limit(limit);
          if (!error) return data;
        } catch (_) {}
      }
      return [...localDb.security_audit_log].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, limit);
    }
  },

  // -------------------------------------------------------
  // Citizen Profiles (Phase 3) — RAPID Citizen mobile app accounts.
  // Auth here is a deliberate placeholder (phone-only lookup, no
  // password verification) — real auth is Phase 6 (R02). Do not
  // treat this as a security boundary.
  // -------------------------------------------------------
  citizenProfiles: {
    async create(data) {
      const existing = localDb.citizen_profiles.find(p => p.phone === data.phone);
      if (existing) return existing;

      const profile = {
        id: require('crypto').randomUUID(),
        full_name: data.fullName,
        phone: data.phone,
        emergency_contacts: data.emergencyContacts || [],
        medical_info: data.medicalInfo || null,
        created_at: new Date().toISOString()
      };

      if (isSupabaseEnabled) {
        try {
          const { data: row, error } = await supabase.from('citizen_profiles').insert([profile]).select().single();
          if (!error) return row;
        } catch (_) {}
      }
      localDb.citizen_profiles.push(profile);
      return profile;
    },

    async get(id) {
      if (isSupabaseEnabled) {
        try {
          const { data, error } = await supabase.from('citizen_profiles').select('*').eq('id', id).single();
          if (!error) return data;
        } catch (_) {}
      }
      return localDb.citizen_profiles.find(p => p.id === id) || null;
    },

    async getByPhone(phone) {
      if (isSupabaseEnabled) {
        try {
          const { data, error } = await supabase.from('citizen_profiles').select('*').eq('phone', phone).single();
          if (!error) return data;
        } catch (_) {}
      }
      return localDb.citizen_profiles.find(p => p.phone === phone) || null;
    },

    async update(id, updates) {
      if (isSupabaseEnabled) {
        try {
          const { data, error } = await supabase.from('citizen_profiles').update(updates).eq('id', id).select().single();
          if (!error) return data;
        } catch (_) {}
      }
      const profile = localDb.citizen_profiles.find(p => p.id === id);
      if (profile) {
        Object.assign(profile, updates);
        return { ...profile };
      }
      return null;
    }
  },

  // -------------------------------------------------------
  // Voice Reports (Phase 3) — audit trail for citizen voice/text
  // emergency reports, per architecture Section 7.2's "audit" block.
  // -------------------------------------------------------
  voiceReports: {
    async create(data) {
      const report = {
        id: require('crypto').randomUUID(),
        citizen_id: data.citizenId || null,
        incident_id: data.incidentId || null,
        transcript: data.transcript,
        is_simulated_transcript: !!data.isSimulatedTranscript,
        classification: data.classification || {},
        extracted_entities: data.extractedEntities || {},
        audio_hash: data.audit?.audioHash || null,
        transcript_hash: data.audit?.transcriptHash || null,
        model_version: data.audit?.modelVersion || null,
        processing_time_ms: data.audit?.processingTimeMs || null,
        created_at: new Date().toISOString()
      };

      if (isSupabaseEnabled) {
        try {
          const { data: row, error } = await supabase.from('voice_reports').insert([report]).select().single();
          if (!error) return row;
        } catch (_) {}
      }
      localDb.voice_reports.push(report);
      return report;
    },

    async list(limit = 50) {
      if (isSupabaseEnabled) {
        try {
          const { data, error } = await supabase.from('voice_reports').select('*').order('created_at', { ascending: false }).limit(limit);
          if (!error) return data;
        } catch (_) {}
      }
      return [...localDb.voice_reports].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, limit);
    }
  }
};
// ============================================================
// Supabase seeding � runs at startup when Supabase is configured.
// Step 1: Orgs + demo users (must run first � bases FK to org IDs).
// Step 2: Full geographic hierarchy + drone fleet (first boot only,
//         guarded by checking if nations AND drones tables are empty).
// ============================================================

async function seedOrganisationsAndUsersInSupabase() {
  try {
    const orgPayload = seedOrganisations.map(({ id, ...rest }) => rest);
    const { error: orgError } = await supabase.from('organisations').upsert(orgPayload, { onConflict: 'code' });
    if (orgError) throw orgError;

    const { data: liveOrgs, error: fetchOrgError } = await supabase.from('organisations').select('id, code');
    if (fetchOrgError) throw fetchOrgError;
    const orgIdByCode = Object.fromEntries(liveOrgs.map(o => [o.code, o.id]));

    const userPayload = seedUsers.map(({ id, organisation_id, ...rest }) => {
      const code = seedOrganisations.find(o => o.id === organisation_id)?.code;
      return { ...rest, organisation_id: orgIdByCode[code] };
    });
    const { error: userError } = await supabase.from('users').upsert(userPayload, { onConflict: 'username' });
    if (userError) throw userError;

    console.log('?? Auth: Organisations + demo personnel accounts synced to Supabase.');
  } catch (err) {
    console.error('??  Failed to sync organisations/users into Supabase � auth may fail:', err.message);
  }
}

async function seedGeographyAndFleetToSupabase() {
  try {
    // Guard: check both nations (geo) and drones (fleet) independently
    const { data: existingNations } = await supabase.from('nations').select('id').limit(1);
    const { data: existingDrones }  = await supabase.from('drones').select('id').limit(1);
    const geoSeeded    = existingNations && existingNations.length > 0;
    const dronesSeeded = existingDrones  && existingDrones.length  > 0;

    if (geoSeeded && dronesSeeded) {
      console.log('?? Seed: All Supabase data present � skipping seed.');
      return;
    }

    // Always fetch live bases (needed for drone->base FK resolution)
    const { data: liveBasesCheck } = await supabase.from('bases').select('id, base_code');
    let baseIdByCode = Object.fromEntries((liveBasesCheck || []).map(b => [b.base_code, b.id]));

    if (!geoSeeded) {
      console.log('?? Seed: First boot � seeding geographic hierarchy to Supabase...');

      // 1. Nations
      const { error: natErr } = await supabase.from('nations')
        .upsert(seedNations.map(({ id, ...r }) => r), { onConflict: 'code' });
      if (natErr) throw new Error(`nations: ${natErr.message}`);
      const { data: liveNations } = await supabase.from('nations').select('id, code');
      const nationIdByCode = Object.fromEntries(liveNations.map(n => [n.code, n.id]));

      // 2. States
      const { error: stateErr } = await supabase.from('states').upsert(
        seedStates.map(({ id, nation_id, ...r }) => ({
          ...r, nation_id: nationIdByCode[seedNations.find(n => n.id === nation_id)?.code]
        })), { onConflict: 'code' });
      if (stateErr) throw new Error(`states: ${stateErr.message}`);
      const { data: liveStates } = await supabase.from('states').select('id, code');
      const stateIdByCode = Object.fromEntries(liveStates.map(s => [s.code, s.id]));

      // 3. Districts (no unique DB constraint � use insert, ignore duplicates)
      const districtPayload = seedDistricts.map(({ id, state_id, ...r }) => ({
        ...r, state_id: stateIdByCode[seedStates.find(s => s.id === state_id)?.code]
      }));
      const { error: distErr } = await supabase.from('districts').insert(districtPayload);
      if (distErr && distErr.code !== '23505') throw new Error(`districts: ${distErr.message}`);
      const { data: liveDistricts } = await supabase.from('districts').select('id, name, state_id');
      const localToLiveDistrictId = {};
      for (const d of seedDistricts) {
        const liveStateId = stateIdByCode[seedStates.find(s => s.id === d.state_id)?.code];
        const live = liveDistricts.find(x => x.name === d.name && x.state_id === liveStateId);
        if (live) localToLiveDistrictId[d.id] = live.id;
      }

      // 4. Organisations (already seeded � fetch stable IDs)
      const { data: liveOrgs } = await supabase.from('organisations').select('id, code');
      const orgIdByCode = Object.fromEntries(liveOrgs.map(o => [o.code, o.id]));

      // 5. Bases
      const { error: baseErr } = await supabase.from('bases').upsert(
        seedBases.map(({ id, state_id, district_id, organisation_id, ...r }) => ({
          ...r,
          state_id: stateIdByCode[seedStates.find(s => s.id === state_id)?.code],
          district_id: localToLiveDistrictId[district_id] || null,
          organisation_id: orgIdByCode[seedOrganisations.find(o => o.id === organisation_id)?.code] || null
        })), { onConflict: 'base_code' });
      if (baseErr) throw new Error(`bases: ${baseErr.message}`);
      const { data: liveBases } = await supabase.from('bases').select('id, base_code');
      baseIdByCode = Object.fromEntries(liveBases.map(b => [b.base_code, b.id]));

      // 6. Airspace Zones
      const { error: zoneErr } = await supabase.from('airspace_zones').insert(
        seedAirspaceZones.map(({ id, state_id, ...r }) => ({
          ...r, state_id: stateIdByCode[seedStates.find(s => s.id === state_id)?.code]
        })));
      if (zoneErr && zoneErr.code !== '23505') throw new Error(`airspace_zones: ${zoneErr.message}`);

      console.log(`   Nations: ${seedNations.length} | States: ${seedStates.length} | Districts: ${seedDistricts.length} | Bases: ${seedBases.length} | Zones: ${seedAirspaceZones.length}`);
    }

    if (!dronesSeeded) {
      console.log('?? Seed: Seeding drone fleet to Supabase...');
      const dronePayload = localDb.drones.map(({ base_id, current_incident_id, ...rest }) => {
        const localBase = seedBases.find(b => b.id === base_id);
        return { ...rest, base_id: localBase ? (baseIdByCode[localBase.base_code] || null) : null, current_incident_id: null };
      });
      const { error: droneErr } = await supabase.from('drones').upsert(dronePayload, { onConflict: 'call_sign' });
      if (droneErr) throw new Error(`drones: ${droneErr.message}`);
      console.log(`   Drones: ${dronePayload.length}`);
    }

    console.log('? Seed: Supabase seed complete.');
  } catch (err) {
    console.error('??  Supabase seed failed:', err.message);
    console.error('    Server will use in-memory fallback for any unseeded tables.');
  }
}

if (isSupabaseEnabled) {
  seedOrganisationsAndUsersInSupabase().then(() => seedGeographyAndFleetToSupabase());
}

module.exports = db;