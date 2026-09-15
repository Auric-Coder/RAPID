import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, Circle, Polygon, useMap } from 'react-leaflet';
// Leaflet's CSS is imported here rather than linked from index.html, so Vite
// bundles it into this component's lazy chunk. It is fetched only when the
// Dashboard is visited, and from the npm package rather than a CDN.
import 'leaflet/dist/leaflet.css';
import { useShallow } from 'zustand/react/shallow';
import useRapidStore from '../../store/rapidStore';
import { policeStationIcon, rapidBaseIcon, incidentIcon, droneIcon, FLYING_STATUSES } from '../shared/utils';

const FALLBACK_CENTER = [15.3995, 73.8800];
const FALLBACK_ZOOM = 11;

// react-leaflet only honours MapContainer's center/zoom props on first
// mount — this component drives the camera on later changes (i.e. when
// the operator switches the active state).
function MapRecenter({ center, zoom }) {
  const map = useMap();
  useEffect(() => {
    if (center) map.flyTo(center, zoom, { duration: 0.8 });
  }, [center, zoom, map]);
  return null;
}

export default function RapidMap() {
  const droneHistory = useRapidStore(s => s.droneHistory);
  const selectedDroneId = useRapidStore(s => s.selectedDroneId);
  const showPoliceStations = useRapidStore(s => s.showPoliceStations);
  const showNoFlyZones = useRapidStore(s => s.showNoFlyZones);
  const showCoverageRadius = useRapidStore(s => s.showCoverageRadius);
  const setShowPoliceStations = useRapidStore(s => s.setShowPoliceStations);
  const setShowNoFlyZones = useRapidStore(s => s.setShowNoFlyZones);
  const setShowCoverageRadius = useRapidStore(s => s.setShowCoverageRadius);
  const selectDrone = useRapidStore(s => s.selectDrone);

  const activeState = useRapidStore(s => s.activeState);
  const bases = useRapidStore(useShallow(s => s.getVisibleBases()));
  const drones = useRapidStore(useShallow(s => s.getVisibleDrones()));
  const incidents = useRapidStore(useShallow(s => s.getVisibleIncidents()));
  const mapConfig = useRapidStore(s => s.getActiveMapConfig());

  const mapCenter = mapConfig ? [mapConfig.mapCenter.latitude, mapConfig.mapCenter.longitude] : FALLBACK_CENTER;
  const mapZoom = mapConfig ? mapConfig.mapZoom : FALLBACK_ZOOM;
  const policeStations = mapConfig ? mapConfig.policeStations : [];
  const noFlyZones = mapConfig ? mapConfig.noFlyZones : [];

  const activeIncidents = incidents.filter(i => ['reported', 'dispatched', 'active', 'resolved'].includes(i.status));

  return (
    <section className="col-span-6 relative border-r border-[#1F2E45] flex flex-col min-h-0 z-10">
      {/* Map overlays control */}
      <div className="absolute top-4 right-4 z-20 cyber-glass p-2.5 rounded-xl text-[10px] font-mono text-gray-400 space-y-1.5 select-none max-w-[160px]">
        <span className="text-[9px] text-cyan-400 font-bold uppercase block tracking-wider mb-1">Map Overlays</span>
        {[
          [showPoliceStations, setShowPoliceStations, 'Police Stations'],
          [showNoFlyZones, setShowNoFlyZones, 'No-Fly Zones'],
          [showCoverageRadius, setShowCoverageRadius, 'RAPID Bases']
        ].map(([val, setter, label]) => (
          <label key={label} className="flex items-center gap-1.5 cursor-pointer hover:text-white">
            <input type="checkbox" checked={val} onChange={e => setter(e.target.checked)} className="accent-cyan-400" />
            {label}
          </label>
        ))}
      </div>

      {/* Leaflet map */}
      <div className="flex-1 w-full h-full relative z-10">
        <MapContainer center={mapCenter} zoom={mapZoom} style={{ height: '100%', width: '100%' }} zoomControl>
          <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
          <MapRecenter center={mapCenter} zoom={mapZoom} key={activeState} />

          {showPoliceStations && policeStations.map((ps, i) => (
            <Marker key={`ps-${i}`} position={[ps.latitude, ps.longitude]} icon={policeStationIcon}>
              <Popup><div className="text-xs font-mono font-bold text-black">{ps.name}</div></Popup>
            </Marker>
          ))}

          {bases.map((b) => (
            <React.Fragment key={`base-${b.id}`}>
              <Marker position={[b.latitude, b.longitude]} icon={rapidBaseIcon}>
                <Popup><div className="text-xs font-mono font-semibold text-black"><p className="font-extrabold text-cyan-600">{b.name}</p><p>Drones Docked: {drones.filter(d => d.base_id === b.id && d.status === 'Standby').length}</p></div></Popup>
              </Marker>
              {showCoverageRadius && <Circle center={[b.latitude, b.longitude]} radius={b.coverage_radius_m} pathOptions={{ color: '#06B6D4', weight: 1, fillOpacity: 0.03, dashArray: '4,8' }} />}
            </React.Fragment>
          ))}

          {showNoFlyZones && noFlyZones.map((nfz, i) => {
            // Phase 5: colour by restriction level — absolute (hard
            // block) reads as more urgent than an advisory patrol zone.
            const zoneColor = nfz.restrictionLevel === 'advisory' ? '#EAB308' : nfz.restrictionLevel === 'conditional' ? '#F97316' : '#EF4444';
            return (
              <Polygon key={nfz.id || `nfz-${i}`} positions={nfz.polygon.map(p => [p.latitude, p.longitude])} pathOptions={{ color: zoneColor, weight: 1.5, fillColor: zoneColor, fillOpacity: 0.15 }}>
                <Popup><div className="text-xs font-mono font-bold" style={{ color: zoneColor }}>{nfz.name} ({nfz.restrictionLevel || 'restricted'})</div></Popup>
              </Polygon>
            );
          })}

          {activeIncidents.map((inc) => (
            <React.Fragment key={`inc-${inc.id}`}>
              <Marker position={[inc.latitude, inc.longitude]} icon={incidentIcon(inc.severity)}>
                <Popup>
                  <div className="text-xs font-mono text-black font-semibold">
                    <p className="font-bold text-red-600">{inc.title}</p>
                    <p>Status: {inc.status.toUpperCase()}</p>
                    <p>Severity: {inc.severity.toUpperCase()}</p>
                  </div>
                </Popup>
              </Marker>
              {inc.status !== 'resolved' && <Circle center={[inc.latitude, inc.longitude]} radius={800} pathOptions={{ color: '#EF4444', weight: 1, fillOpacity: 0.04 }} />}
            </React.Fragment>
          ))}

          {drones.map((drone) => (
            <Marker key={`drone-${drone.id}`} position={[drone.latitude, drone.longitude]} icon={droneIcon(drone.heading, drone.status)}
              eventHandlers={{ click: () => selectDrone(drone) }}>
              <Popup>
                <div className="text-xs font-mono text-black font-semibold">
                  <p className="font-bold text-cyan-600">{drone.call_sign}</p>
                  <p>Status: {drone.status}</p>
                  <p>Battery: {drone.battery_level.toFixed(0)}% | Alt: {drone.altitude.toFixed(0)}m</p>
                  <p>Speed: {drone.speed.toFixed(0)} m/s | Hdg: {drone.heading.toFixed(0)}°</p>
                </div>
              </Popup>
            </Marker>
          ))}

          {/* Route lines */}
          {drones.map((drone) => {
            if (FLYING_STATUSES.includes(drone.status) && drone.current_incident_id) {
              const inc = incidents.find(i => i.id === drone.current_incident_id);
              if (inc && !['On Scene', 'AI Monitoring', 'Hovering', 'Orbiting', 'Following Target', 'Awaiting Controller'].includes(drone.status)) {
                return <Polyline key={`line-${drone.id}`} positions={[[drone.latitude, drone.longitude], [inc.latitude, inc.longitude]]} pathOptions={{ color: '#06B6D4', weight: 1.5, className: 'animated-route-path' }} />;
              }
            }
            if (drone.status === 'Returning') {
              return <Polyline key={`ret-${drone.id}`} positions={[[drone.latitude, drone.longitude], [drone.base_latitude, drone.base_longitude]]} pathOptions={{ color: '#F59E0B', weight: 1.5, className: 'animated-route-path' }} />;
            }
            return null;
          })}

          {/* GPS trail */}
          {selectedDroneId && droneHistory.length > 1 && (
            <Polyline positions={[...droneHistory].reverse().map(h => [h.latitude, h.longitude])} pathOptions={{ color: '#22d3ee', weight: 1.2, opacity: 0.5, dashArray: '2,5' }} />
          )}
        </MapContainer>
      </div>

      <footer className="h-10 bg-[#09101C] border-t border-[#1F2E45] flex items-center px-4 justify-between font-mono text-[9px] text-gray-500 select-none flex-shrink-0">
        <span>FLEET DECISION ENGINE: ACTIVE</span>
        <div className="flex gap-4">
          <span>ENERGY MODEL: SIMULATED</span>
          <span>SAFETY RESERVE: 20%</span>
        </div>
      </footer>
    </section>
  );
}
