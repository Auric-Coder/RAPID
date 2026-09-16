import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { citizenApi } from '../../src/api/client';
import { useLocationSharing } from '../../src/context/LocationSharingContext';

const STEPS = [
  { key: 'reported', label: 'Reported' },
  { key: 'dispatched', label: 'Dispatched' },
  { key: 'on_scene', label: 'On Scene' },
  { key: 'resolved', label: 'Resolved' }
];

function stepIndex(status) {
  const idx = STEPS.findIndex(s => s.key === status);
  return idx === -1 ? 0 : idx;
}

function formatEta(seconds) {
  if (seconds == null) return null;
  if (seconds <= 0) return 'Arrived on scene';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export default function Track() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const sharing = useLocationSharing();
  const isSharingIncident = sharing.incidentId === id;
  const [tracking, setTracking] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    let busy = false;
    const controller = new AbortController();

    const poll = async () => {
      if (busy) return;
      busy = true;
      try {
        const result = await citizenApi.trackEmergency(id, controller.signal);
        if (!cancelled) {
          setTracking(result);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        busy = false;
      }
    };

    poll();
    const interval = setInterval(poll, 3000);
    return () => { cancelled = true; controller.abort(); clearInterval(interval); };
  }, [id]);

  const currentStep = tracking ? stepIndex(tracking.status) : 0;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#0B0F19' }} contentContainerStyle={styles.container}>
      <Text style={styles.title}>{tracking?.status === 'resolved' ? 'Emergency closed' : 'Emergency reported'}</Text>
      <Text style={styles.incidentId}>Tracking ID: {String(id).slice(0, 8).toUpperCase()}</Text>

      <View style={styles.stepper}>
        {STEPS.map((step, idx) => (
          <View key={step.key} style={styles.stepItem}>
            <View style={[styles.stepDot, idx <= currentStep && styles.stepDotDone]} />
            <Text style={[styles.stepLabel, idx <= currentStep && styles.stepLabelDone]}>{step.label}</Text>
          </View>
        ))}
      </View>

      {tracking && (
        <View style={styles.card}>
          {tracking.droneCallSign ? (
            <>
              <Text style={styles.cardRow}>Responder: <Text style={styles.cardValue}>{tracking.droneCallSign}</Text></Text>
              {tracking.droneEtaSeconds != null && (
                <Text style={styles.cardRow}>ETA: <Text style={styles.cardValue}>{formatEta(tracking.droneEtaSeconds)}</Text></Text>
              )}
            </>
          ) : (
            <Text style={styles.cardRow}>Waiting for a responder drone to be assigned…</Text>
          )}
        </View>
      )}

      <View style={styles.card}>
        <Text style={styles.cardValue}>Your live location</Text>
        <Text style={styles.cardRow}>{isSharingIncident ? sharing.status : 'No active location sharing for this report.'}</Text>
        {isSharingIncident && sharing.location && (
          <>
            <Text style={styles.cardRow}>{sharing.location.lat.toFixed(5)}, {sharing.location.lng.toFixed(5)}</Text>
            {sharing.location.accuracy_m != null && <Text style={styles.cardRow}>GPS accuracy: {Math.round(sharing.location.accuracy_m)} m</Text>}
          </>
        )}
        {isSharingIncident && <Text style={styles.cardRow}>Last server update: {sharing.lastUpdated ? new Date(sharing.lastUpdated).toLocaleTimeString() : 'No live update confirmed yet'}</Text>}
        <Text style={styles.cardRow}>Keep Expo Go open and the screen unlocked. Sharing pauses in the background and resumes when you return. Stopping sharing does not cancel your SOS or erase the last location.</Text>
        {isSharingIncident && sharing.error && <Text style={styles.error}>{sharing.error}</Text>}
        {isSharingIncident && sharing.canShare && tracking?.status !== 'resolved' && tracking?.status !== 'cancelled' && (
          <TouchableOpacity style={styles.shareToggleButton} onPress={sharing.enabled ? sharing.stopSharing : sharing.resumeSharing}>
            <Text style={styles.shareToggleText}>{sharing.enabled ? 'Stop sharing live location' : 'Retry / resume sharing'}</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Cancel SOS Request Button if incident is still open */}
      {tracking && tracking.status !== 'resolved' && tracking.status !== 'cancelled' && (
        <TouchableOpacity
          style={styles.cancelButton}
          onPress={() => {
            Alert.alert(
              'Cancel Emergency SOS?',
              'Are you sure you want to cancel this emergency request? Any dispatched drones will immediately return to base.',
              [
                { text: 'Keep Active', style: 'cancel' },
                {
                  text: 'Yes, Cancel SOS',
                  style: 'destructive',
                  onPress: async () => {
                    try {
                      await citizenApi.cancelEmergency(id, sharing.locationToken);
                      sharing.finishSharing();
                      await AsyncStorage.removeItem('@rapid_active_sos');
                      Alert.alert('SOS Cancelled', 'Emergency cancelled. Dispatched drones are returning to base.');
                      router.replace('/home');
                    } catch (err) {
                      Alert.alert('Notice', err.message || 'Could not cancel emergency.');
                    }
                  }
                }
              ]
            );
          }}
        >
          <Text style={styles.cancelButtonText}>❌ Cancel SOS Request (Recall Drone)</Text>
          <Text style={styles.cancelButtonSubtext}>Accidentally triggered? Drone will return to base</Text>
        </TouchableOpacity>
      )}

      {error && <Text style={styles.error}>{error}</Text>}

      <TouchableOpacity style={styles.homeButton} onPress={() => router.replace('/home')}>
        <Text style={styles.homeButtonText}>← Back to Home</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, backgroundColor: '#0B0F19', padding: 24, paddingTop: 40, alignItems: 'center' },
  title: { color: '#fff', fontSize: 20, fontWeight: '800' },
  incidentId: { color: '#6B7280', fontSize: 11, fontFamily: 'monospace', marginTop: 4 },
  stepper: { flexDirection: 'row', width: '100%', justifyContent: 'space-between', marginTop: 32 },
  stepItem: { alignItems: 'center', flex: 1 },
  stepDot: { width: 14, height: 14, borderRadius: 7, backgroundColor: '#1F2937', marginBottom: 6 },
  stepDotDone: { backgroundColor: '#10B981' },
  stepLabel: { color: '#4B5563', fontSize: 10, fontWeight: '700', textAlign: 'center' },
  stepLabelDone: { color: '#10B981' },
  card: { width: '100%', backgroundColor: '#111827', borderRadius: 16, padding: 18, marginTop: 24, borderWidth: 1, borderColor: '#1F2937' },
  cardRow: { color: '#9CA3AF', fontSize: 13, marginBottom: 6 },
  cardValue: { color: '#fff', fontWeight: '700' },
  error: { color: '#F87171', fontSize: 12, marginTop: 16 },
  shareToggleButton: { marginTop: 12, paddingVertical: 8, alignItems: 'center' },
  shareToggleText: { color: '#22D3EE', fontSize: 12, fontWeight: '600' },
  cancelButton: {
    width: '100%',
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderWidth: 1.5,
    borderColor: '#EF4444',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
    marginTop: 20
  },
  cancelButtonText: { color: '#F87171', fontSize: 14, fontWeight: '800' },
  cancelButtonSubtext: { color: '#9CA3AF', fontSize: 11, marginTop: 4, textAlign: 'center' },
  homeButton: { marginTop: 24, padding: 12 },
  homeButtonText: { color: '#9CA3AF', fontSize: 13, fontWeight: '700' }
});
