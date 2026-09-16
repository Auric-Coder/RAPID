import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { GoogleMap, useJsApiLoader, OverlayView, Circle, Polygon, Polyline } from '@react-google-maps/api';
import { useShallow } from 'zustand/react/shallow';
import useRapidStore from '../../store/rapidStore';
import { policeStationIcon, rapidBaseIcon, incidentIcon, droneIcon, FLYING_STATUSES } from '../shared/utils';

const FALLBACK_CENTER = { lat: 15.3995, lng: 73.8800 };
const FALLBACK_ZOOM = 11;

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
// A single Map ID styles both themes for now. If a dedicated dark-mode Map
// ID is ever configured in the Google Cloud Console, set
// VITE_GOOGLE_MAPS_DARK_MAP_ID and the light/dark follow-theme behaviour
// below picks it up automatically — Google Maps styling lives on the Map ID
// itself (Cloud-side), not in a local JS styles array, so it can't be
// switched purely at runtime the way the old CARTO tile URLs were.
const GOOGLE_MAPS_MAP_ID = import.meta.env.VITE_GOOGLE_MAPS_MAP_ID;
const GOOGLE_MAPS_DARK_MAP_ID = import.meta.env.VITE_GOOGLE_MAPS_DARK_MAP_ID || GOOGLE_MAPS_MAP_ID;

const MAP_LIBRARIES = [];

// No theme toggle ships in this pass, but the token system underneath
// already supports one (see [data-theme="dark"] in index.css) — this just
// makes the map follow it whenever one is added, via the data-theme
// attribute on <html> rather than a prop drilled down from a toggle that
// doesn't exist yet.
function useIsDarkTheme() {
  const [isDark, setIsDark] = useState(
    typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'dark'
  );
  useEffect(() => {
    const root = document.documentElement;
    const sync = () => setIsDark(root.getAttribute('data-theme') === 'dark');
    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);
  return isDark;
}

// Renders a divIcon-style { html, iconSize } marker descriptor (shared with
// Help.jsx's separate Leaflet map via shared/utils.js) as a real DOM node
// positioned over the map, so the exact same Tailwind-classed markup and
// CSS custom properties keep resolving correctly under Google Maps too.
function DivMarker({ position, icon, onClick, zIndex }) {
  const [w, h] = icon.iconSize;
  return (
    <OverlayView position={position} mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}>
      <div
        className={icon.className}
        style={{ width: w, height: h, marginLeft: -w / 2, marginTop: -h / 2, cursor: 'pointer', zIndex }}
        onClick={onClick}
        dangerouslySetInnerHTML={{ __html: icon.html }}
      />
    </OverlayView>
  );
}

function InfoCard({ position, onClose, children }) {
  return (
    <OverlayView position={position} mapPaneName={OverlayView.FLOAT_PANE}>
      <div
        className="relative -translate-x-1/2 -translate-y-[calc(100%+18px)] bg-white rounded-md shadow-xl px-2.5 py-2 text-xs font-mono text-black whitespace-nowrap"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
        <button
          className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-slate-800 text-white text-[10px] leading-4 text-center"
          onClick={onClose}
        >
          &times;
        </button>
        <div className="absolute left-1/2 -bottom-1.5 -translate-x-1/2 h-3 w-3 bg-white rotate-45" />
      </div>
    </OverlayView>
  );
}

// A repeating short line-segment symbol stands in for Leaflet's dashArray —
// Google's Polyline has no native dash-pattern string, only this icons-based
// repeat trick. Kept as a helper since two lines below use it (route line
// and GPS trail), matching their original dash cadence roughly 1:1.
function dashedLineOptions({ color, weight = 1.5, opacity = 1, repeat = '12px', scale = 3 }) {
  return {
    strokeOpacity: 0,
    strokeColor: color,
    strokeWeight: weight,
    zIndex: 1,
    icons: [{
      icon: { path: 'M 0,-1 0,1', strokeOpacity: opacity, strokeColor: color, scale },
      offset: '0',
      repeat
    }]
  };
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

  const mapCenter = mapConfig ? { lat: mapConfig.mapCenter.latitude, lng: mapConfig.mapCenter.longitude } : FALLBACK_CENTER;
  const mapZoom = mapConfig ? mapConfig.mapZoom : FALLBACK_ZOOM;
  const policeStations = mapConfig ? mapConfig.policeStations : [];
  const noFlyZones = mapConfig ? mapConfig.noFlyZones : [];

  const activeIncidents = incidents.filter(i => ['reported', 'dispatched', 'active', 'resolved'].includes(i.status));
  const isDark = useIsDarkTheme();

  const { isLoaded, loadError } = useJsApiLoader({
    id: 'rapid-google-map-script',
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
    libraries: MAP_LIBRARIES
  });

  const mapRef = useRef(null);
  const onMapLoad = useCallback((map) => { mapRef.current = map; }, []);
  const onMapUnmount = useCallback(() => { mapRef.current = null; }, []);

  // GoogleMap (unlike react-leaflet's MapContainer) re-applies `center` on
  // every render where the prop's object identity changes — and since
  // mapCenter above is a fresh object literal every render, that was
  // firing an instant map.setCenter() snap on every drone/incident
  // telemetry tick, fighting any manual pan/zoom/drag mid-interaction.
  // So `center`/`zoom` below are only ever the value at first mount; all
  // camera movement after that is driven imperatively here instead, via
  // panTo/setZoom, exactly like the old MapRecenter component did.
  const [initialCenter] = useState(() => mapCenter);
  const [initialZoom] = useState(() => mapZoom);
  useEffect(() => {
    if (mapRef.current && mapCenter) {
      mapRef.current.panTo(mapCenter);
      mapRef.current.setZoom(mapZoom);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapCenter.lat, mapCenter.lng, mapZoom, activeState]);

  const [openInfo, setOpenInfo] = useState(null); // { type, id }
  const closeInfo = () => setOpenInfo(null);

  // Memoized for the same reason as initialCenter/initialZoom above — a
  // fresh object every render would re-trigger map.setOptions() on every
  // telemetry tick instead of only when the theme actually changes.
  const mapOptions = useMemo(() => ({
    mapId: isDark ? GOOGLE_MAPS_DARK_MAP_ID : GOOGLE_MAPS_MAP_ID,
    disableDefaultUI: false,
    zoomControl: true,
    streetViewControl: false,
    mapTypeControl: false,
    fullscreenControl: false
  }), [isDark]);

  return (
    <section className="col-span-6 relative border-r border-border flex flex-col min-h-0 z-10">
      {/* Map overlays control */}
      <div className="absolute top-4 right-4 z-20 bg-surface border border-border p-2.5 rounded-xl text-[10px] font-mono text-muted space-y-1.5 select-none max-w-[160px]">
        <span className="text-[9px] text-accent font-bold uppercase block tracking-wider mb-1">Map Overlays</span>
        {[
          [showPoliceStations, setShowPoliceStations, 'Police Stations'],
          [showNoFlyZones, setShowNoFlyZones, 'No-Fly Zones'],
          [showCoverageRadius, setShowCoverageRadius, 'RAPID Bases']
        ].map(([val, setter, label]) => (
          <label key={label} className="flex items-center gap-1.5 cursor-pointer hover:text-text">
            <input type="checkbox" checked={val} onChange={e => setter(e.target.checked)} className="accent-[var(--color-accent)]" />
            {label}
          </label>
        ))}
      </div>

      {/* Google map */}
      <div className="flex-1 w-full h-full relative z-10">
        {loadError && (
          <div className="h-full w-full flex items-center justify-center text-xs font-mono text-status-critical bg-surface">
            Failed to load Google Maps. Check VITE_GOOGLE_MAPS_API_KEY.
          </div>
        )}
        {!loadError && !isLoaded && (
          <div className="h-full w-full flex items-center justify-center text-xs font-mono text-muted bg-surface">
            Loading map…
          </div>
        )}
        {!loadError && isLoaded && (
          <GoogleMap
            mapContainerStyle={{ height: '100%', width: '100%' }}
            center={initialCenter}
            zoom={initialZoom}
            options={mapOptions}
            onLoad={onMapLoad}
            onUnmount={onMapUnmount}
            onClick={closeInfo}
          >
            {showPoliceStations && policeStations.map((ps, i) => {
              const pos = { lat: ps.latitude, lng: ps.longitude };
              return (
                <React.Fragment key={`ps-${i}`}>
                  <DivMarker position={pos} icon={policeStationIcon} onClick={() => setOpenInfo({ type: 'ps', id: i })} />
                  {openInfo?.type === 'ps' && openInfo.id === i && (
                    <InfoCard position={pos} onClose={closeInfo}>
                      <div className="font-bold">{ps.name}</div>
                    </InfoCard>
                  )}
                </React.Fragment>
              );
            })}

            {bases.map((b) => {
              const pos = { lat: b.latitude, lng: b.longitude };
              return (
                <React.Fragment key={`base-${b.id}`}>
                  <DivMarker position={pos} icon={rapidBaseIcon} onClick={() => setOpenInfo({ type: 'base', id: b.id })} />
                  {openInfo?.type === 'base' && openInfo.id === b.id && (
                    <InfoCard position={pos} onClose={closeInfo}>
                      <div className="font-semibold">
                        <p className="font-extrabold text-accent">{b.name}</p>
                        <p>Drones Docked: {drones.filter(d => d.base_id === b.id && d.status === 'Standby').length}</p>
                      </div>
                    </InfoCard>
                  )}
                  {showCoverageRadius && (
                    <Circle center={pos} radius={b.coverage_radius_m} options={{ strokeColor: '#1E3A8A', strokeWeight: 1, fillOpacity: 0.03, fillColor: '#1E3A8A', clickable: false }} />
                  )}
                </React.Fragment>
              );
            })}

            {showNoFlyZones && noFlyZones.map((nfz, i) => {
              // Phase 5: colour by restriction level — absolute (hard
              // block) reads as more urgent than an advisory patrol zone.
              // Restriction level is also spelled out in the popup text
              // below, never conveyed by colour alone (DIRECTION.md §3).
              const zoneColor = nfz.restrictionLevel === 'advisory' ? '#A15C00' : nfz.restrictionLevel === 'conditional' ? '#B5461A' : '#A3211D';
              const key = nfz.id || `nfz-${i}`;
              const path = nfz.polygon.map(p => ({ lat: p.latitude, lng: p.longitude }));
              const centroid = path.reduce((acc, p) => ({ lat: acc.lat + p.lat / path.length, lng: acc.lng + p.lng / path.length }), { lat: 0, lng: 0 });
              return (
                <React.Fragment key={key}>
                  <Polygon
                    paths={path}
                    options={{ strokeColor: zoneColor, strokeWeight: 1.5, fillColor: zoneColor, fillOpacity: 0.15 }}
                    onClick={() => setOpenInfo({ type: 'nfz', id: key })}
                  />
                  {openInfo?.type === 'nfz' && openInfo.id === key && (
                    <InfoCard position={centroid} onClose={closeInfo}>
                      <div className="font-bold" style={{ color: zoneColor }}>{nfz.name} ({nfz.restrictionLevel || 'restricted'})</div>
                    </InfoCard>
                  )}
                </React.Fragment>
              );
            })}

            {activeIncidents.map((inc) => {
              const pos = { lat: inc.latitude, lng: inc.longitude };
              return (
                <React.Fragment key={`inc-${inc.id}`}>
                  <DivMarker position={pos} icon={incidentIcon(inc.severity)} onClick={() => setOpenInfo({ type: 'incident', id: inc.id })} />
                  {openInfo?.type === 'incident' && openInfo.id === inc.id && (
                    <InfoCard position={pos} onClose={closeInfo}>
                      <div className="font-semibold">
                        <p className="font-bold text-status-critical">{inc.title}</p>
                        <p>Status: {inc.status.toUpperCase()}</p>
                        <p>Severity: {inc.severity.toUpperCase()}</p>
                      </div>
                    </InfoCard>
                  )}
                  {inc.status !== 'resolved' && (
                    <Circle center={pos} radius={800} options={{ strokeColor: '#A3211D', strokeWeight: 1, fillOpacity: 0.04, fillColor: '#A3211D', clickable: false }} />
                  )}
                </React.Fragment>
              );
            })}

            {drones.map((drone) => {
              const pos = { lat: drone.latitude, lng: drone.longitude };
              return (
                <React.Fragment key={`drone-${drone.id}`}>
                  <DivMarker
                    position={pos}
                    icon={droneIcon(drone.heading, drone.status)}
                    onClick={() => { selectDrone(drone); setOpenInfo({ type: 'drone', id: drone.id }); }}
                  />
                  {openInfo?.type === 'drone' && openInfo.id === drone.id && (
                    <InfoCard position={pos} onClose={closeInfo}>
                      <div className="font-semibold">
                        <p className="font-bold text-accent">{drone.call_sign}</p>
                        <p>Status: {drone.status}</p>
                        <p>Battery: {drone.battery_level.toFixed(0)}% | Alt: {drone.altitude.toFixed(0)}m</p>
                        <p>Speed: {drone.speed.toFixed(0)} m/s | Hdg: {drone.heading.toFixed(0)}°</p>
                      </div>
                    </InfoCard>
                  )}
                </React.Fragment>
              );
            })}

            {/* Route lines. Dashed, static — the earlier flowing-dash
                animation was decorative motion with no reduced-motion guard;
                direction of travel is already legible from the drone's own
                heading arrow, so a static dash pattern loses no information
                (see the animation budget in index.css). */}
            {drones.map((drone) => {
              if (FLYING_STATUSES.includes(drone.status) && drone.current_incident_id) {
                const inc = incidents.find(i => i.id === drone.current_incident_id);
                if (inc && !['On Scene', 'AI Monitoring', 'Hovering', 'Orbiting', 'Following Target', 'Awaiting Controller'].includes(drone.status)) {
                  return (
                    <Polyline
                      key={`line-${drone.id}`}
                      path={[{ lat: drone.latitude, lng: drone.longitude }, { lat: inc.latitude, lng: inc.longitude }]}
                      options={dashedLineOptions({ color: '#1E3A8A', weight: 1.5 })}
                    />
                  );
                }
              }
              if (drone.status === 'Returning') {
                return (
                  <Polyline
                    key={`ret-${drone.id}`}
                    path={[{ lat: drone.latitude, lng: drone.longitude }, { lat: drone.base_latitude, lng: drone.base_longitude }]}
                    options={dashedLineOptions({ color: '#A15C00', weight: 1.5 })}
                  />
                );
              }
              return null;
            })}

            {/* GPS trail */}
            {selectedDroneId && droneHistory.length > 1 && (
              <Polyline
                path={[...droneHistory].reverse().map(h => ({ lat: h.latitude, lng: h.longitude }))}
                options={dashedLineOptions({ color: '#1E3A8A', weight: 1.2, opacity: 0.5, repeat: '7px' })}
              />
            )}
          </GoogleMap>
        )}
      </div>

      <footer className="h-10 bg-surface border-t border-border flex items-center px-4 justify-between font-mono text-[9px] text-muted select-none flex-shrink-0">
        <span>FLEET DECISION ENGINE: ACTIVE</span>
        <div className="flex gap-4">
          <span>ENERGY MODEL: SIMULATED</span>
          <span>SAFETY RESERVE: 20%</span>
        </div>
      </footer>
    </section>
  );
}
