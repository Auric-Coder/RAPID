import { Platform } from 'react-native';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * RAPID Citizen API client — talks to the same Express server as the
 * web dashboard, at /api/v1/citizen/* (see server/src/routes/citizen.js).
 *
 * Base URL resolution, in priority order:
 *   1. EXPO_PUBLIC_API_URL — a full URL (e.g. "https://rapid-server.onrender.com")
 *      for a real deployed server. Baked into the JS bundle at `eas build`
 *      time, so set it in the same shell as that command, not at runtime.
 *   2. EXPO_PUBLIC_API_HOST — a bare LAN IP (e.g. "192.168.1.42") for local
 *      dev against a server running on your own machine, port 5000.
 *   3. Expo's LAN host for physical devices on the same Wi-Fi.
 *      With Expo tunnel mode, set EXPO_PUBLIC_API_URL explicitly: the
 *      Metro tunnel does not proxy the API server on port 5000.
 *   4. Emulator/localhost defaults when there is no LAN host.
 */
function resolveApiBase() {
  const fullUrlOverride = process.env.EXPO_PUBLIC_API_URL;
  if (fullUrlOverride) return fullUrlOverride.replace(/\/$/, '');
  const hostOverride = process.env.EXPO_PUBLIC_API_HOST;
  if (hostOverride) return `http://${hostOverride}:5000`;
  const expoHost = Constants.expoConfig?.hostUri?.split(':')[0];
  if (__DEV__ && expoHost && /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(expoHost)) {
    return `http://${expoHost}:5000`;
  }
  if (Platform.OS === 'android') return 'http://10.0.2.2:5000';
  return 'http://localhost:5000';
}

export const API_BASE = resolveApiBase();
const TOKEN_KEY = 'rapid_citizen_token';

export async function getToken() {
  return AsyncStorage.getItem(TOKEN_KEY);
}

export async function setToken(token) {
  if (token) await AsyncStorage.setItem(TOKEN_KEY, token);
  else await AsyncStorage.removeItem(TOKEN_KEY);
}

async function request(path, { method = 'GET', body, auth = false, signal } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth) {
    const token = await getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort);
  if (signal?.aborted) controller.abort();
  const timeout = setTimeout(abort, 15000);
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      signal: controller.signal,
      body: body ? JSON.stringify(body) : undefined
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const error = new Error(data.error || `Request failed (${res.status})`);
      error.status = res.status;
      throw error;
    }
    return data;
  } catch (error) {
    if (error.name === 'AbortError' && !signal?.aborted) {
      throw new Error('Server request timed out. Check your connection and API address.');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abort);
  }
}

export const citizenApi = {
  register: (fullName, phone, emergencyContacts) =>
    request('/api/v1/citizen/register', { method: 'POST', body: { fullName, phone, emergencyContacts } }),

  login: (phone) =>
    request('/api/v1/citizen/login', { method: 'POST', body: { phone } }),

  getProfile: () =>
    request('/api/v1/citizen/profile', { auth: true }),

  updateProfile: (updates) =>
    request('/api/v1/citizen/profile', { method: 'PATCH', body: updates, auth: true }),

  submitVoiceReport: (transcript, location) =>
    request('/api/v1/citizen/voice-report', { method: 'POST', body: { transcript, location } }),

  submitEmergency: ({ location, category, textReport, deviceInfo }) =>
    request('/api/v1/citizen/emergency', {
      method: 'POST',
      auth: true,
      body: { location, category, textReport, deviceInfo }
    }),

  updateLocation: (incidentId, locationToken, location, signal) =>
    request(`/api/v1/citizen/emergency/${encodeURIComponent(incidentId)}/location`, {
      method: 'PATCH', auth: true, body: { locationToken, location }, signal
    }),

  cancelEmergency: (incidentId, locationToken, signal) =>
    request(`/api/v1/citizen/emergency/${encodeURIComponent(incidentId)}/cancel`, {
      method: 'POST', auth: true, body: { locationToken }, signal
    }),

  trackEmergency: (incidentId, signal) =>
    request(`/api/v1/citizen/emergency/${encodeURIComponent(incidentId)}`, { signal })
};
