import { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, Platform } from 'react-native';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { useAuth } from '../src/context/AuthContext';
import { citizenApi } from '../src/api/client';

export default function Home() {
  const router = useRouter();
  const { profile, logout } = useAuth();
  const [location, setLocation] = useState(null);
  const [locationError, setLocationError] = useState(null);
  const [sosSubmitting, setSosSubmitting] = useState(false);

  const requestLocation = useCallback(async () => {
    setLocationError(null);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLocationError('Location permission denied. Grant access so a drone can find you.');
        return;
      }
      const position = await Location.getCurrentPositionAsync({});
      setLocation({ lat: position.coords.latitude, lng: position.coords.longitude, accuracy_m: position.coords.accuracy });
    } catch (err) {
      setLocationError(err.message);
    }
  }, []);

  useEffect(() => { requestLocation(); }, [requestLocation]);

  const handleSOS = async () => {
    if (!location) {
      Alert.alert('Location required', 'Waiting for GPS lock — try again in a moment.', [{ text: 'Retry', onPress: requestLocation }]);
      return;
    }
    setSosSubmitting(true);
    try {
      const result = await citizenApi.submitEmergency({
        location,
        category: 'other',
        textReport: 'SOS — one-tap emergency trigger from RAPID Citizen app.',
        deviceInfo: { os: Platform.OS, model: Platform.constants?.Model || 'unknown', appVersion: '1.0.0' }
      });
      router.push(`/track/${result.incidentId}`);
    } catch (err) {
      Alert.alert('Could not send SOS', err.message);
    } finally {
      setSosSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.greeting}>Hello, {profile?.full_name?.split(' ')[0] || 'Citizen'}</Text>

      <View style={styles.locationBadge}>
        <View style={[styles.dot, { backgroundColor: location ? '#10B981' : '#F59E0B' }]} />
        <Text style={styles.locationText}>
          {location ? `GPS lock: ${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}` : (locationError || 'Acquiring GPS…')}
        </Text>
      </View>
      {locationError && (
        <TouchableOpacity onPress={requestLocation}><Text style={styles.retryText}>Tap to retry location</Text></TouchableOpacity>
      )}

      <TouchableOpacity style={styles.sosButton} onPress={handleSOS} disabled={sosSubmitting} activeOpacity={0.85}>
        <Text style={styles.sosButtonText}>{sosSubmitting ? 'SENDING…' : 'SOS'}</Text>
        <Text style={styles.sosSubtext}>Tap for immediate dispatch</Text>
      </TouchableOpacity>

      <View style={styles.optionsRow}>
        <TouchableOpacity style={styles.optionCard} onPress={() => router.push('/report-voice')}>
          <Text style={styles.optionEmoji}>🎙️</Text>
          <Text style={styles.optionLabel}>Voice Report</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.optionCard} onPress={() => router.push('/report-text')}>
          <Text style={styles.optionEmoji}>✍️</Text>
          <Text style={styles.optionLabel}>Text Report</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.optionCard} onPress={() => router.push('/contacts')}>
          <Text style={styles.optionEmoji}>📇</Text>
          <Text style={styles.optionLabel}>Contacts</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.signOut} onPress={logout}>
        <Text style={styles.signOutText}>Sign out</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B0F19', alignItems: 'center', paddingTop: 32, paddingHorizontal: 24 },
  greeting: { color: '#fff', fontSize: 18, fontWeight: '700' },
  locationBadge: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, backgroundColor: '#111827', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: '#1F2937' },
  dot: { width: 8, height: 8, borderRadius: 4 },
  locationText: { color: '#9CA3AF', fontSize: 11, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  retryText: { color: '#22D3EE', fontSize: 12, marginTop: 8, fontWeight: '600' },
  sosButton: { width: 220, height: 220, borderRadius: 110, backgroundColor: '#DC2626', alignItems: 'center', justifyContent: 'center', marginTop: 48, shadowColor: '#DC2626', shadowOpacity: 0.5, shadowRadius: 30, elevation: 10 },
  sosButtonText: { color: '#fff', fontSize: 42, fontWeight: '900', letterSpacing: 2 },
  sosSubtext: { color: '#FCA5A5', fontSize: 11, fontWeight: '600', marginTop: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
  optionsRow: { flexDirection: 'row', gap: 12, marginTop: 48, width: '100%', justifyContent: 'center' },
  optionCard: { flex: 1, backgroundColor: '#111827', borderRadius: 16, paddingVertical: 18, alignItems: 'center', borderWidth: 1, borderColor: '#1F2937' },
  optionEmoji: { fontSize: 24, marginBottom: 6 },
  optionLabel: { color: '#D1D5DB', fontSize: 11, fontWeight: '600', textAlign: 'center' },
  signOut: { marginTop: 40, padding: 10 },
  signOutText: { color: '#6B7280', fontSize: 12, fontWeight: '600' }
});
