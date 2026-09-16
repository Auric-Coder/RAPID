import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import * as Location from 'expo-location';
import { citizenApi } from '../api/client';
import { useAuth } from './AuthContext';

const SharingContext = createContext(null);
const UPDATE_INTERVAL = 5000;

function coordinates(position) {
  return {
    lat: position.coords.latitude,
    lng: position.coords.longitude,
    accuracy_m: position.coords.accuracy,
    timestamp: position.timestamp
  };
}

async function requireLocationPermission() {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (!permission.granted) {
    throw new Error('Location permission denied. Enable location for Expo Go in Android Settings, then retry.');
  }
  if (!(await Location.hasServicesEnabledAsync())) {
    throw new Error('Location services are off. Turn on Android Location, then retry.');
  }
}

// Never substitute fabricated or stale coordinates for an emergency location.
export async function getEmergencyLocation() {
  await requireLocationPermission();
  let timer;
  try {
    const position = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('GPS timed out. Move to an open area and retry.')), 20000);
      })
    ]);
    return coordinates(position);
  } finally {
    clearTimeout(timer);
  }
}

// App-level scope keeps sharing alive across navigation, but never in the background.
export function LocationSharingProvider({ children }) {
  const { profile } = useAuth();
  const [session, setSession] = useState(null);
  const [enabled, setEnabled] = useState(false);
  const [appState, setAppState] = useState(AppState.currentState);
  const [location, setLocation] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [status, setStatus] = useState('Not sharing');
  const [error, setError] = useState(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const listener = AppState.addEventListener('change', setAppState);
    return () => listener.remove();
  }, []);

  useEffect(() => {
    if (!profile || (session && session.citizenId !== profile.id)) {
      setEnabled(false);
      setSession(null);
      setLocation(null);
      setLastUpdated(null);
      setError(null);
      setStatus('Not sharing');
    }
  }, [profile?.id, session]);

  const startSharing = useCallback((result, initialLocation) => {
    setSession({ incidentId: result.incidentId, locationToken: result.locationToken, citizenId: profile?.id });
    setLocation(initialLocation);
    setLastUpdated(null);
    setError(result.locationToken ? null : 'SOS was sent, but this server needs the live-location update installed.');
    setStatus(result.locationToken ? 'Starting location sharing' : 'Live sharing unavailable');
    setEnabled(Boolean(result.locationToken));
  }, [profile?.id]);

  const stopSharing = useCallback(() => {
    setEnabled(false);
    setStatus('Sharing stopped');
    setError(null);
  }, []);

  const finishSharing = useCallback(() => {
    setEnabled(false);
    setSession(null);
    setStatus('Not sharing');
    setError(null);
  }, []);

  const resumeSharing = useCallback(() => {
    if (!session?.locationToken) return;
    setError(null);
    setEnabled(true);
    setRetry(value => value + 1);
  }, [session]);

  useEffect(() => {
    if (!enabled || !session || !profile || session.citizenId !== profile.id) return;
    if (appState !== 'active') {
      setStatus('Paused while app is in background');
      return;
    }
    let disposed = false;
    let subscription;
    let interval;
    let latest = null;
    let busy = false;
    const controller = new AbortController();
    const finish = () => {
      setEnabled(false);
      setSession(null);
      setStatus('Emergency closed. Sharing ended.');
      setError(null);
    };

    // Serial requests: poor connectivity must not accumulate a queue of old fixes.
    const send = async () => {
      if (disposed || busy) return;
      busy = true;
      try {
        const tracking = await citizenApi.trackEmergency(session.incidentId, controller.signal);
        if (disposed) return;
        if (tracking.status === 'resolved' || tracking.status === 'cancelled') {
          finish();
          return;
        }
        if (!latest || Date.now() - latest.timestamp > 30000) {
          setStatus('Waiting for fresh GPS');
          return;
        }
        const fix = latest;
        const result = await citizenApi.updateLocation(session.incidentId, session.locationToken, fix, controller.signal);
        if (disposed) return;
        setLocation(fix);
        setLastUpdated(result.lastUpdated);
        setStatus('Sharing live location');
        setError(null);
      } catch (err) {
        if (disposed) return;
        if (err.status === 409) {
          finish();
        } else if ([401, 403, 404].includes(err.status)) {
          setEnabled(false);
          setStatus('Sharing stopped');
          setError(err.message);
        } else {
          setStatus('Update failed. Retrying');
          setError(err.message);
        }
      } finally {
        busy = false;
      }
    };

    setStatus('Acquiring live GPS');
    setError(null);
    (async () => {
      try {
        await requireLocationPermission();
        if (disposed) return;
        subscription = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.High, timeInterval: UPDATE_INTERVAL, distanceInterval: 0 },
          position => {
            if (disposed) return;
            latest = coordinates(position);
            setLocation(latest);
          },
          message => {
            if (disposed) return;
            latest = null;
            setStatus('GPS unavailable');
            setError(message);
          }
        );
        if (disposed) {
          subscription.remove();
          return;
        }
        send();
        interval = setInterval(send, UPDATE_INTERVAL);
      } catch (err) {
        if (disposed) return;
        setEnabled(false);
        setStatus('Location sharing unavailable');
        setError(err.message);
      }
    })();

    return () => {
      disposed = true;
      controller.abort();
      clearInterval(interval);
      subscription?.remove();
    };
  }, [session, enabled, profile?.id, appState, retry]);

  return (
    <SharingContext.Provider value={{
      incidentId: session?.incidentId,
      locationToken: session?.locationToken,
      canShare: Boolean(session?.locationToken),
      enabled,
      location,
      lastUpdated,
      status,
      error,
      startSharing,
      stopSharing,
      finishSharing,
      resumeSharing
    }}>
      {children}
    </SharingContext.Provider>
  );
}

export function useLocationSharing() {
  const context = useContext(SharingContext);
  if (!context) throw new Error('useLocationSharing must be used within LocationSharingProvider');
  return context;
}
