import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { GoogleMap, useJsApiLoader, OverlayView, Circle, Polygon, Polyline } from '@react-google-maps/api';
import { useShallow } from 'zustand/react/shallow';
import useRapidStore from '../../store/rapidStore';
import { policeStationIcon, rapidBaseIcon, incidentIcon, droneIcon, FLYING_STATUSES } from '../shared/utils';

const FALLBACK_CENTER = { lat: 15.3995, lng: 73.8800 };
const FALLBACK_ZOOM = 11;
// Stable references for the no-mapConfig fallback, so downstream useMemo
// deps don't see a "changed" array (a fresh [] literal) on every render.
const EMPTY_LIST = [];

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

// Google's Circle/Polygon/Polyline wrappers apply their `options`/`center`/
// `path` props the same reference-equality way GoogleMap applies center
// (see the note on initialCenter below) — a fresh options object on every
// render forces a real setOptions() call on the underlying shape even when
// nothing about it actually changed. For the icon-repeat dashed Polylines
// especially (drone routes, only present while responding to an incident)
// that recomputes the whole repeated-symbol pattern along the line on every
// telemetry tick, which is what made the map feel glitchy specifically once
// an emergency was active. Hoisting the static option objects to constants
// keeps their reference stable so only genuinely-changing props (a moving
// drone's path) trigger a real Maps API update.
const BASE_COVERAGE_OPTIONS = { strokeColor: '#1E3A8A', strokeWeight: 1, fillOpacity: 0.03, fillColor: '#1E3A8A', clickable: false };
const INCIDENT_RADIUS_OPTIONS = { strokeColor: '#A3211D', strokeWeight: 1, fillOpacity: 0.04, fillColor: '#A3211D', clickable: false };
const NFZ_OPTIONS_BY_LEVEL = {
  advisory: { strokeColor: '#A15C00', strokeWeight: 1.5, fillColor: '#A15C00', fillOpacity: 0.15 },
  conditional: { strokeColor: '#B5461A', strokeWeight: 1.5, fillColor: '#B5461A', fillOpacity: 0.15 },
  absolute: { strokeColor: '#A3211D', strokeWeight: 1.5, fillColor: '#A3211D', fillOpacity: 0.15 }
};
const ROUTE_LINE_OPTIONS = dashedLineOptions({ color: '#1E3A8A', weight: 1.5 });
const RETURN_LINE_OPTIONS = dashedLineOptions({ color: '#A15C00', weight: 1.5 });
const GPS_TRAIL_OPTIONS = dashedLineOptions({ color: '#1E3A8A', weight: 1.2, opacity: 0.5, repeat: '7px' });

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
  const policeStations = mapConfig ? mapConfig.policeStations : EMPTY_LIST;
  const noFlyZones = mapConfig ? mapConfig.noFlyZones : EMPTY_LIST;
  const isDark = useIsDarkTheme();

  // bases/incidents/policeStations are already referentially stable across
  // unrelated re-renders (useShallow / a direct store reference — see the
  // options-hoisting note above) — but recomputing derived {lat,lng} pos
  // objects and dashed-polygon shapes inline in .map() on every render
  // defeats that stability, since Circle/Polygon read `center`/`paths` the
  // same reference-equality way. Memoizing on the stable source array keeps
  // Maps API updates limited to when a base, incident, or zone truly changes.
  const activeIncidents = useMemo(
    () => incidents.filter(i => ['reported', 'dispatched', 'active', 'resolved'].includes(i.status)),
    [incidents]
  );
  const policeStationMarkers = useMemo(
    () => policeStations.map(ps => ({ ...ps, pos: { lat: ps.latitude, lng: ps.longitude } })),
    [policeStations]
  );
  const baseMarkers = useMemo(
    () => bases.map(b => ({ ...b, pos: { lat: b.latitude, lng: b.longitude } })),
    [bases]
  );
  const incidentMarkers = useMemo(
    () => activeIncidents.map(inc => ({ ...inc, pos: { lat: inc.latitude, lng: inc.longitude } })),
    [activeIncidents]
  );
  const noFlyZoneShapes = useMemo(() => noFlyZones.map((nfz, i) => {
    const path = nfz.polygon.map(p => ({ lat: p.latitude, lng: p.longitude }));
    const centroid = path.reduce((acc, p) => ({ lat: acc.lat + p.lat / path.length, lng: acc.lng + p.lng / path.length }), { lat: 0, lng: 0 });
    const level = nfz.restrictionLevel === 'advisory' ? 'advisory' : nfz.restrictionLevel === 'conditional' ? 'conditional' : 'absolute';
    return { ...nfz, key: nfz.id || `nfz-${i}`, path, centroid, options: NFZ_OPTIONS_BY_LEVEL[level] };
  }), [noFlyZones]);
  const gpsTrailPath = useMemo(
    () => (selectedDroneId && droneHistory.length > 1 ? [...droneHistory].reverse().map(h => ({ lat: h.latitude, lng: h.longitude })) : null),
    [selectedDroneId, droneHistory]
  );

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
            {showPoliceStations && policeStationMarkers.map((ps, i) => (
              <React.Fragment key={`ps-${i}`}>
                <DivMarker position={ps.pos} icon={policeStationIcon} onClick={() => setOpenInfo({ type: 'ps', id: i })} />
                {openInfo?.type === 'ps' && openInfo.id === i && (
                  <InfoCard position={ps.pos} onClose={closeInfo}>
                    <div className="font-bold">{ps.name}</div>
                  </InfoCard>
                )}
              </React.Fragment>
            ))}

            {baseMarkers.map((b) => (
              <React.Fragment key={`base-${b.id}`}>
                <DivMarker position={b.pos} icon={rapidBaseIcon} onClick={() => setOpenInfo({ type: 'base', id: b.id })} />
                {openInfo?.type === 'base' && openInfo.id === b.id && (
                  <InfoCard position={b.pos} onClose={closeInfo}>
                    <div className="font-semibold">
                      <p className="font-extrabold text-accent">{b.name}</p>
                      <p>Drones Docked: {drones.filter(d => d.base_id === b.id && d.status === 'Standby').length}</p>
                    </div>
                  </InfoCard>
                )}
                {showCoverageRadius && (
                  <Circle center={b.pos} radius={b.coverage_radius_m} options={BASE_COVERAGE_OPTIONS} />
                )}
              </React.Fragment>
            ))}

            {/* Phase 5: colour by restriction level — absolute (hard block)
                reads as more urgent than an advisory patrol zone. Restriction
                level is also spelled out in the popup text below, never
                conveyed by colour alone (DIRECTION.md §3). */}
            {showNoFlyZones && noFlyZoneShapes.map((nfz) => (
              <React.Fragment key={nfz.key}>
                <Polygon
                  paths={nfz.path}
                  options={nfz.options}
                  onClick={() => setOpenInfo({ type: 'nfz', id: nfz.key })}
                />
                {openInfo?.type === 'nfz' && openInfo.id === nfz.key && (
                  <InfoCard position={nfz.centroid} onClose={closeInfo}>
                    <div className="font-bold" style={{ color: nfz.options.strokeColor }}>{nfz.name} ({nfz.restrictionLevel || 'restricted'})</div>
                  </InfoCard>
                )}
              </React.Fragment>
            ))}

            {incidentMarkers.map((inc) => (
              <React.Fragment key={`inc-${inc.id}`}>
                <DivMarker position={inc.pos} icon={incidentIcon(inc.severity)} onClick={() => setOpenInfo({ type: 'incident', id: inc.id })} />
                {openInfo?.type === 'incident' && openInfo.id === inc.id && (
                  <InfoCard position={inc.pos} onClose={closeInfo}>
                    <div className="font-semibold">
                      <p className="font-bold text-status-critical">{inc.title}</p>
                      <p>Status: {inc.status.toUpperCase()}</p>
                      <p>Severity: {inc.severity.toUpperCase()}</p>
                    </div>
                  </InfoCard>
                )}
                {inc.status !== 'resolved' && (
                  <Circle center={inc.pos} radius={800} options={INCIDENT_RADIUS_OPTIONS} />
                )}
              </React.Fragment>
            ))}

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
                      options={ROUTE_LINE_OPTIONS}
                    />
                  );
                }
              }
              if (drone.status === 'Returning') {
                return (
                  <Polyline
                    key={`ret-${drone.id}`}
                    path={[{ lat: drone.latitude, lng: drone.longitude }, { lat: drone.base_latitude, lng: drone.base_longitude }]}
                    options={RETURN_LINE_OPTIONS}
                  />
                );
              }
              return null;
            })}

            {/* GPS trail */}
            {gpsTrailPath && <Polyline path={gpsTrailPath} options={GPS_TRAIL_OPTIONS} />}
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
