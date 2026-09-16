/**
 * RAPID v1.3 — Centralised State Store (Zustand)
 *
 * Phase 0: Replaces 30+ useState declarations from Dashboard.jsx.
 * All state and handlers are centralised here for maintainability.
 */
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { haversineDistance } from '../config/geoConfig';

const ACTIVE_STATUSES = ['Dispatched', 'En Route', 'On Scene', 'AI Monitoring', 'Hovering', 'Orbiting', 'Following Target', 'Awaiting Controller', 'Returning', 'Patrolling'];

const useRapidStore = create(
  immer((set, get) => ({
    // ── Fleet State ──
    drones: [],
    selectedDroneId: null,
    droneHistory: [],
    batteryStatus: null,

    // ── Incident State ──
    incidents: [],
    selectedIncidentId: null,
    incidentLogs: [],
    snapshots: [],
    evidenceChain: null,

    // ── Mission Control ──
    recording: null,
    recordingTick: 0,
    cameraMode: 'auto',
    pttActive: false,
    pttLog: [],
    micActive: true,
    speakerActive: true,
    speakerVol: 70,
    controllerActions: [],
    isFullscreen: false,
    mcTab: 'telemetry',

    // ── Fleet Intelligence ──
    fleetEval: null,
    overrideModal: null,
    cmdFeedback: null,

    // ── Map Controls ──
    showPoliceStations: true,
    showNoFlyZones: true,
    showCoverageRadius: true,

    // ── Manual Incident Form ──
    showManualForm: false,
    manualTitle: '',
    manualCategory: 'trespass',
    manualSeverity: 'medium',
    manualLat: '15.4909',
    manualLng: '73.8278',

    // ── System ──
    currentTime: new Date(),
    demoGenerating: false,
    demoError: null,
    flightTimeSec: 0,
    stats: { availableFleet: 0, activeMissions: 0, healthStatus: 'NOMINAL', aiStatus: 'ONLINE / IDLE' },

    // ── WebSocket ──
    wsConnected: false,
    wsRef: null,

    // ── Geo Hierarchy (Phase 1) ──
    activeState: 'GA',
    states: [],
    bases: [],
    mapConfigByState: {},

    // ── Auth (Phase 6) ──
    currentUser: null,
    authChecked: false,
    authError: null,

    // ── Computed Getters ──
    getSelectedDrone: () => {
      const state = get();
      return state.drones.find(d => d.id === state.selectedDroneId) || null;
    },
    getSelectedIncident: () => {
      const state = get();
      return state.incidents.find(i => i.id === state.selectedIncidentId) || null;
    },
    getActiveIncidents: () => {
      return get().incidents.filter(i => ['reported', 'dispatched', 'active', 'resolved'].includes(i.status));
    },

    // Bases belonging to the currently active state.
    getVisibleBases: () => {
      const state = get();
      const stateRecord = state.states.find(s => s.code === state.activeState);
      if (!stateRecord) return state.bases;
      return state.bases.filter(b => b.state_id === stateRecord.id);
    },
    // Drones stationed at a base within the active state.
    getVisibleDrones: () => {
      const state = get();
      const baseIds = new Set(state.getVisibleBases().map(b => b.id));
      if (baseIds.size === 0) return state.drones;
      return state.drones.filter(d => !d.base_id || baseIds.has(d.base_id));
    },
    // Incidents whose coordinates fall inside the active state's bounds.
    getVisibleIncidents: () => {
      const state = get();
      const cfg = state.mapConfigByState[state.activeState];
      if (!cfg) return state.incidents;
      const { bounds } = cfg;
      return state.incidents.filter(i =>
        i.latitude >= bounds.south && i.latitude <= bounds.north &&
        i.longitude >= bounds.west && i.longitude <= bounds.east
      );
    },
    getActiveMapConfig: () => {
      const state = get();
      return state.mapConfigByState[state.activeState] || null;
    },
    // Fleet stats scoped to the active state (the WS-pushed `stats` field
    // stays national — this is what the header actually displays).
    getVisibleStats: () => {
      const state = get();
      const visible = state.getVisibleDrones();
      const available = visible.filter(d => ['Standby', 'Charging'].includes(d.status)).length;
      const activeCount = visible.filter(d => ACTIVE_STATUSES.includes(d.status)).length;
      return {
        availableFleet: available,
        activeMissions: activeCount,
        healthStatus: visible.some(d => d.battery_level < 20) ? 'WARNING' : 'NOMINAL',
        aiStatus: activeCount > 0 ? 'ONLINE / TRACKING' : 'ONLINE / IDLE'
      };
    },

    // ── Actions ──

    setDrones: (drones) => set({ drones }),
    setIncidents: (incidents) => set({ incidents }),

    selectDrone: (droneOrNull) => {
      if (!droneOrNull) {
        set({
          selectedDroneId: null,
          selectedIncidentId: null,
          snapshots: [],
          evidenceChain: null,
          incidentLogs: [],
          fleetEval: null,
          batteryStatus: null,
          recording: null,
          droneHistory: [],
          controllerActions: [],
          mcTab: 'telemetry',
          cmdFeedback: null,
        });
        return;
      }
      const state = get();
      set({ selectedDroneId: droneOrNull.id, mcTab: 'telemetry', cmdFeedback: null });

      if (droneOrNull.current_incident_id) {
        const inc = state.incidents.find(i => i.id === droneOrNull.current_incident_id);
        if (inc) set({ selectedIncidentId: inc.id });
      } else {
        set({ selectedIncidentId: null, snapshots: [], evidenceChain: null, incidentLogs: [] });
      }

      // Log controller action
      get().logControllerAction(droneOrNull.id, droneOrNull.call_sign, 'rakshak_selected', { callSign: droneOrNull.call_sign }, 'ok', droneOrNull.current_incident_id);
      get().fetchCommunicationSession(droneOrNull.id);
      // Secondary per-drone/per-incident data (recording, snapshots,
      // evidence chain, battery, fleet eval) only ever loads inside
      // fetchData() — once the WebSocket connects, the HTTP poll that
      // used to call it repeatedly stops, so it must be triggered
      // explicitly here or switching drones shows stale/empty panels.
      get().fetchData();
    },

    selectIncident: (inc) => {
      if (!inc) {
        set({ selectedIncidentId: null, snapshots: [], evidenceChain: null, incidentLogs: [], fleetEval: null });
        return;
      }
      const state = get();
      set({ selectedIncidentId: inc.id });
      const assigned = state.drones.find(d => d.current_incident_id === inc.id);
      if (assigned) get().selectDrone(assigned);
      else get().fetchData();
    },

    setMcTab: (tab) => set({ mcTab: tab }),
    setCameraMode: (mode) => set({ cameraMode: mode }),
    setIsFullscreen: (v) => set({ isFullscreen: v }),
    toggleFullscreen: () => set(state => { state.isFullscreen = !state.isFullscreen; }),
    setShowManualForm: (v) => set({ showManualForm: v }),
    setManualTitle: (v) => set({ manualTitle: v }),
    setManualCategory: (v) => set({ manualCategory: v }),
    setManualSeverity: (v) => set({ manualSeverity: v }),
    setManualLat: (v) => set({ manualLat: v }),
    setManualLng: (v) => set({ manualLng: v }),
    setOverrideModal: (v) => set({ overrideModal: v }),
    setShowPoliceStations: (v) => set({ showPoliceStations: v }),
    setShowNoFlyZones: (v) => set({ showNoFlyZones: v }),
    setShowCoverageRadius: (v) => set({ showCoverageRadius: v }),

    // ── Feedback ──
    showFeedback: (type, msg, duration = 4000) => {
      set({ cmdFeedback: { type, msg } });
      setTimeout(() => set({ cmdFeedback: null }), duration);
    },

    // ── Controller Action Logger ──
    logControllerAction: async (droneId, callSign, action, params = {}, result = 'ok', missionId = null) => {
      try {
        await fetch(`/api/missions/${droneId}/controller-actions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, parameters: params, result, mission_id: missionId })
        });
      } catch (_) { /* non-critical */ }
    },

    // ── UAV Command ──
    handleUavCommand: async (command, value = null) => {
      const state = get();
      const selectedDrone = state.getSelectedDrone();
      if (!selectedDrone) return;

      if (command === 'return_home') {
        if (['Standby', 'Charging', 'maintenance'].includes(selectedDrone.status)) {
          state.showFeedback('error', `Return Home unavailable: ${selectedDrone.call_sign} is not on a mission.`); return;
        }
        if (selectedDrone.status === 'Returning') {
          state.showFeedback('error', `Return Home unavailable: ${selectedDrone.call_sign} is already returning.`); return;
        }
        if (state.batteryStatus?.returnStatus === 'CRITICAL') {
          state.showFeedback('warn', `⚠️ Critical battery — emergency return initiated for ${selectedDrone.call_sign}.`);
        }
      }
      if (command === 'dispatch' && selectedDrone.status !== 'Standby') {
        state.showFeedback('error', `Dispatch unavailable: ${selectedDrone.call_sign} is not on standby.`); return;
      }

      try {
        const res = await fetch(`/api/drones/${selectedDrone.id}/command`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ command, value })
        });
        const data = await res.json();
        if (!res.ok) { state.showFeedback('error', data.error || 'Command failed.'); return; }

        await state.logControllerAction(selectedDrone.id, selectedDrone.call_sign, `cmd_${command}`, { value }, 'ok', selectedDrone.current_incident_id);
        state.showFeedback('ok', `✓ ${command.replace(/_/g, ' ').toUpperCase()} sent to ${selectedDrone.call_sign}.`);
        state.fetchData();
      } catch (err) {
        state.showFeedback('error', 'Network error — command not sent.');
      }
    },

    // ── Camera Mode ──
    handleCameraMode: async (mode) => {
      set({ cameraMode: mode });
      const state = get();
      const selectedDrone = state.getSelectedDrone();
      if (!selectedDrone) return;
      await state.handleUavCommand('camera_mode', mode);
      await state.logControllerAction(selectedDrone.id, selectedDrone.call_sign, 'camera_mode_change', { mode }, 'ok', selectedDrone.current_incident_id);
    },

    // ── Snapshot ──
    handleSnapshot: async () => {
      const state = get();
      const selectedDrone = state.getSelectedDrone();
      if (!selectedDrone) return;
      try {
        const res = await fetch(`/api/drones/${selectedDrone.id}/snapshot`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ label: 'Manual Capture', reason: 'manual' })
        });
        if (res.ok) {
          await state.logControllerAction(selectedDrone.id, selectedDrone.call_sign, 'snapshot_captured', {
            gps: [selectedDrone.latitude, selectedDrone.longitude],
            heading: selectedDrone.heading, altitude: selectedDrone.altitude
          }, 'ok', selectedDrone.current_incident_id);
          state.showFeedback('ok', `📸 Snapshot captured from ${selectedDrone.call_sign}.`);
          state.fetchData();
        }
      } catch (err) { state.showFeedback('error', 'Snapshot failed.'); }
    },

    // ── PTT (Phase 4: backed by services/communication/communicationService.js) ──
    pttStartedAt: null,

    fetchCommunicationSession: async (droneId) => {
      if (!droneId) return;
      try {
        const res = await fetch(`/api/communication/${droneId}`);
        if (!res.ok) return;
        const session = await res.json();
        set({
          micActive: session.mic_active,
          speakerActive: session.speaker_active,
          speakerVol: session.speaker_volume,
          pttActive: session.status === 'transmitting'
        });
      } catch (_) { /* non-critical */ }
    },

    handlePttDown: async () => {
      set({ pttActive: true, pttStartedAt: Date.now() });
      const state = get();
      const selectedDrone = state.getSelectedDrone();
      if (!selectedDrone) return;
      try {
        await fetch(`/api/communication/${selectedDrone.id}/ptt/start`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ missionId: selectedDrone.current_incident_id })
        });
      } catch (_) { /* non-critical */ }
      set(s => { s.pttLog = [{ time: new Date().toLocaleTimeString([], { hour12: false }), event: `TRANSMITTING → ${selectedDrone.call_sign}` }, ...s.pttLog.slice(0, 19)]; });
    },

    handlePttUp: async () => {
      const state = get();
      const durationMs = state.pttStartedAt ? Date.now() - state.pttStartedAt : null;
      set({ pttActive: false, pttStartedAt: null });
      const selectedDrone = state.getSelectedDrone();
      if (!selectedDrone) return;
      try {
        await fetch(`/api/communication/${selectedDrone.id}/ptt/end`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ missionId: selectedDrone.current_incident_id, durationMs })
        });
      } catch (_) { /* non-critical */ }
      set(s => { s.pttLog = [{ time: new Date().toLocaleTimeString([], { hour12: false }), event: 'TRANSMISSION ENDED' }, ...s.pttLog.slice(0, 19)]; });
    },

    updateCommunicationSettings: async (settings) => {
      const selectedDrone = get().getSelectedDrone();
      if (!selectedDrone) return;
      try {
        await fetch(`/api/communication/${selectedDrone.id}/settings`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(settings)
        });
      } catch (_) { /* non-critical */ }
    },

    setMicActive: (v) => { set({ micActive: v }); get().updateCommunicationSettings({ micActive: v }); },
    setSpeakerActive: (v) => { set({ speakerActive: v }); get().updateCommunicationSettings({ speakerActive: v }); },
    setSpeakerVol: (v) => { set({ speakerVol: v }); get().updateCommunicationSettings({ speakerVolume: v }); },

    // ── Demo Emergency ──
    generateSimulatedEmergency: async () => {
      const state = get();
      if (state.demoGenerating) return;
      set({ demoGenerating: true, demoError: null });
      try {
        const res = await fetch(`/api/demo/generate?state=${state.activeState}`, { method: 'POST' });
        const data = await res.json();
        if (!res.ok) { set({ demoError: data.error || 'Failed.' }); }
        else {
          if (data.dispatch && !data.dispatch.success) {
            set({ demoError: `Incident created — ${data.dispatch.message}` });
          }
          state.fetchData();
        }
      } catch { set({ demoError: 'Network error — server may be offline.' }); }
      finally { set({ demoGenerating: false }); }
    },

    // ── Manual Incident ──
    handleManualIncidentSubmit: async (e) => {
      e.preventDefault();
      const state = get();
      try {
        const res = await fetch('/api/incidents', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: state.manualTitle, category: state.manualCategory,
            severity: state.manualSeverity,
            latitude: parseFloat(state.manualLat), longitude: parseFloat(state.manualLng),
            description: 'Manual dispatch from Command Console.'
          })
        });
        if (res.ok) { set({ showManualForm: false, manualTitle: '' }); state.fetchData(); }
      } catch (err) { console.error(err); }
    },

    // ── Override ──
    handleManualDispatch: async (candidate, incident, force = false) => {
      const state = get();
      try {
        const recommended = state.fleetEval?.best;
        const res = await fetch('/api/fleet/override', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            incidentId: incident.id,
            recommendedRakshakId: recommended?.droneId || null,
            selectedRakshakId: candidate.droneId,
            reason: 'Controller manual selection',
            force
          })
        });
        const data = await res.json();
        if (res.status === 409 && data.requiresForce) {
          set({ overrideModal: { candidate, incident } });
          return;
        }
        if (!res.ok) { state.showFeedback('error', data.error || 'Override failed.'); return; }

        set({ overrideModal: null });
        state.showFeedback('ok', `✓ ${candidate.callSign} dispatched by controller override.`);
        state.fetchData();
      } catch { state.showFeedback('error', 'Override request failed.'); }
    },

    // ── Night Vision ──
    isNightVisionActive: () => {
      const state = get();
      if (state.cameraMode === 'night') return true;
      if (state.cameraMode === 'day') return false;
      const h = state.currentTime.getHours();
      return h < 6 || h >= 19;
    },

    // ── Data Fetching (HTTP fallback) ──
    fetchData: async () => {
      const state = get();
      try {
        const [droneRes, incRes] = await Promise.all([
          fetch('/api/drones'), fetch('/api/incidents')
        ]);
        if (!droneRes.ok || !incRes.ok) return;

        const droneData = await droneRes.json();
        const incData = await incRes.json();

        const available = droneData.filter(d => ['Standby', 'Charging'].includes(d.status)).length;
        const active = droneData.filter(d => ACTIVE_STATUSES.includes(d.status)).length;

        set({
          drones: droneData,
          incidents: incData,
          stats: {
            availableFleet: available,
            activeMissions: active,
            healthStatus: droneData.some(d => d.battery_level < 20) ? 'WARNING' : 'NOMINAL',
            aiStatus: active > 0 ? 'ONLINE / TRACKING' : 'ONLINE / IDLE'
          }
        });

        const visibleDrones = get().getVisibleDrones();
        const fallbackDrone = visibleDrones.length > 0 ? visibleDrones[0] : droneData[0];
        const currentId = state.selectedDroneId || (fallbackDrone ? fallbackDrone.id : null);
        if (currentId) {
          const fresh = droneData.find(d => d.id === currentId);
          if (fresh) {
            set({ selectedDroneId: fresh.id });
            const [histRes, batRes, recRes, actRes] = await Promise.all([
              fetch(`/api/drones/${fresh.id}/history`),
              fetch(`/api/fleet/battery-status/${fresh.id}`),
              fetch(`/api/missions/${fresh.id}/recording`),
              fetch(`/api/missions/${fresh.id}/controller-actions`)
            ]);
            if (histRes.ok) set({ droneHistory: await histRes.json() });
            if (batRes.ok) set({ batteryStatus: await batRes.json() });
            if (recRes.ok) { const r = await recRes.json(); set({ recording: r?.status ? r : null }); }
            if (actRes.ok) set({ controllerActions: await actRes.json() });
          }
        }

        const selIncId = state.selectedIncidentId;
        if (selIncId) {
          const fresh = incData.find(i => i.id === selIncId);
          if (fresh) {
            const [snapRes, logRes, evalRes, chainRes] = await Promise.all([
              fetch(`/api/incidents/${fresh.id}/snapshots`),
              fetch(`/api/incidents/${fresh.id}/logs`),
              fetch(`/api/fleet/evaluation/${fresh.id}`),
              fetch(`/api/evidence/chain/${fresh.id}`)
            ]);
            if (snapRes.ok) set({ snapshots: await snapRes.json() });
            if (logRes.ok) set({ incidentLogs: await logRes.json() });
            if (evalRes.ok) set({ fleetEval: await evalRes.json() });
            if (chainRes.ok) set({ evidenceChain: await chainRes.json() });
          }
        }
      } catch (err) {
        console.error('Fetch error:', err);
      }
    },

    // ── Tick Updaters ──
    tick: () => {
      const state = get();
      const updates = { currentTime: new Date() };

      if (state.recording && state.recording.status === 'recording') {
        updates.recordingTick = Math.round((Date.now() - new Date(state.recording.recording_start).getTime()) / 1000);
      }

      if (state.selectedIncidentId && state.selectedDroneId && state.incidentLogs?.length > 0) {
        const launch = state.incidentLogs.find(l => l.action === 'launch');
        if (launch) {
          updates.flightTimeSec = Math.max(0, Math.floor((Date.now() - new Date(launch.timestamp)) / 1000));
        } else if (state.flightTimeSec !== 0) {
          updates.flightTimeSec = 0;
        }
      } else if (state.flightTimeSec !== 0) {
        updates.flightTimeSec = 0;
      }

      set(updates);
    },
    updateClock: () => set({ currentTime: new Date() }),
    updateRecordingTick: () => {
      const { recording } = get();
      if (recording && recording.status === 'recording') {
        set({ recordingTick: Math.round((Date.now() - new Date(recording.recording_start).getTime()) / 1000) });
      }
    },
    updateFlightTime: () => {
      const state = get();
      if (state.selectedIncidentId && state.selectedDroneId && state.incidentLogs.length > 0) {
        const launch = state.incidentLogs.find(l => l.action === 'launch');
        if (launch) set({ flightTimeSec: Math.max(0, Math.floor((Date.now() - new Date(launch.timestamp)) / 1000)) });
        else set({ flightTimeSec: 0 });
      } else {
        set({ flightTimeSec: 0 });
      }
    },

    // ── WebSocket Handlers ──
    handleWsMessage: (msg) => {
      const state = get();
      if (msg.type === 'drone_update') {
        set(s => {
          const idx = s.drones.findIndex(d => d.id === msg.payload.id);
          if (idx >= 0) {
            Object.assign(s.drones[idx], msg.payload);
          } else {
            s.drones.push(msg.payload);
          }

          // Live update GPS trail for selected drone
          if (s.selectedDroneId === msg.payload.id && msg.payload.latitude && msg.payload.longitude) {
            const last = s.droneHistory[s.droneHistory.length - 1];
            if (!last || last.latitude !== msg.payload.latitude || last.longitude !== msg.payload.longitude) {
              s.droneHistory.push({
                latitude: msg.payload.latitude,
                longitude: msg.payload.longitude,
                altitude: msg.payload.altitude,
                speed: msg.payload.speed,
                heading: msg.payload.heading,
                battery_level: msg.payload.battery_level,
                timestamp: new Date().toISOString()
              });
              if (s.droneHistory.length > 100) s.droneHistory.shift();
            }
          }
        });
      } else if (msg.type === 'incident_update') {
        set(s => {
          const idx = s.incidents.findIndex(i => i.id === msg.payload.id);
          if (idx >= 0) Object.assign(s.incidents[idx], msg.payload);
          else s.incidents.push(msg.payload);
        });
      } else if (msg.type === 'incident_created') {
        set(s => {
          const exists = s.incidents.some(i => i.id === msg.payload.id);
          if (!exists) s.incidents.push(msg.payload);
        });
      } else if (msg.type === 'stats_update') {
        set({ stats: msg.payload });
      }
    },
    setWsConnected: (v) => set({ wsConnected: v }),
    setWsRef: (ref) => set({ wsRef: ref }),

    // ── Geo Hierarchy (Phase 1) ──
    fetchGeoConfig: async () => {
      try {
        const [statesRes, basesRes] = await Promise.all([
          fetch('/api/geo/states'),
          fetch('/api/geo/bases?limit=500')
        ]);
        const states = statesRes.ok ? await statesRes.json() : [];
        const basesPayload = basesRes.ok ? await basesRes.json() : { bases: [] };
        set({ states, bases: basesPayload.bases || [] });

        const configs = await Promise.all(states.map(async (s) => {
          const res = await fetch(`/api/geo/map-config?state=${s.code}`);
          return res.ok ? [s.code, await res.json()] : null;
        }));
        const mapConfigByState = {};
        configs.filter(Boolean).forEach(([code, cfg]) => { mapConfigByState[code] = cfg; });
        set({ mapConfigByState });
      } catch (err) {
        console.error('Failed to fetch geo config:', err);
      }
    },

    setActiveState: (code) => {
      set({
        activeState: code,
        selectedDroneId: null,
        selectedIncidentId: null,
        snapshots: [],
        evidenceChain: null,
        incidentLogs: [],
        fleetEval: null,
        batteryStatus: null,
        recording: null,
        controllerActions: [],
        mcTab: 'telemetry',
        cmdFeedback: null,
      });
      const visible = get().getVisibleDrones();
      if (visible.length > 0) get().selectDrone(visible[0]);
    },

    // ── Auth (Phase 6) ──
    checkAuth: async () => {
      try {
        const res = await fetch('/api/auth/me');
        if (res.ok) {
          const data = await res.json();
          set({ currentUser: data.user, authChecked: true });
        } else {
          set({ currentUser: null, authChecked: true });
        }
      } catch {
        set({ currentUser: null, authChecked: true });
      }
    },
    login: async (username, password) => {
      set({ authError: null });
      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password })
        });
        const data = await res.json();
        if (!res.ok) { set({ authError: data.error || 'Login failed.' }); return false; }
        set({ currentUser: data.user, authChecked: true, authError: null });
        return true;
      } catch {
        set({ authError: 'Could not reach server.' });
        return false;
      }
    },
    logout: async () => {
      try { await fetch('/api/auth/logout', { method: 'POST' }); } catch { /* ignore */ }
      set({ currentUser: null });
    },
  }))
);

export default useRapidStore;
