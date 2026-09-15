import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { citizenApi } from '../../src/api/client';

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
  const [tracking, setTracking] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    const poll = async () => {
      try {
        const result = await citizenApi.trackEmergency(id);
        if (!cancelled) setTracking(result);
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
    };

    poll();
    const interval = setInterval(poll, 3000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [id]);

  const currentStep = tracking ? stepIndex(tracking.status) : 0;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Help is on the way</Text>
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

      {error && <Text style={styles.error}>{error}</Text>}

      <TouchableOpacity style={styles.homeButton} onPress={() => router.replace('/home')}>
        <Text style={styles.homeButtonText}>Back to Home</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B0F19', padding: 24, paddingTop: 40, alignItems: 'center' },
  title: { color: '#fff', fontSize: 20, fontWeight: '800' },
  incidentId: { color: '#6B7280', fontSize: 11, fontFamily: 'monospace', marginTop: 4 },
  stepper: { flexDirection: 'row', width: '100%', justifyContent: 'space-between', marginTop: 32 },
  stepItem: { alignItems: 'center', flex: 1 },
  stepDot: { width: 14, height: 14, borderRadius: 7, backgroundColor: '#1F2937', marginBottom: 6 },
  stepDotDone: { backgroundColor: '#10B981' },
  stepLabel: { color: '#4B5563', fontSize: 10, fontWeight: '700', textAlign: 'center' },
  stepLabelDone: { color: '#10B981' },
  card: { width: '100%', backgroundColor: '#111827', borderRadius: 16, padding: 18, marginTop: 32, borderWidth: 1, borderColor: '#1F2937' },
  cardRow: { color: '#9CA3AF', fontSize: 13, marginBottom: 6 },
  cardValue: { color: '#fff', fontWeight: '700' },
  error: { color: '#F87171', fontSize: 12, marginTop: 16 },
  homeButton: { marginTop: 40, padding: 12 },
  homeButtonText: { color: '#22D3EE', fontSize: 13, fontWeight: '700' }
});
