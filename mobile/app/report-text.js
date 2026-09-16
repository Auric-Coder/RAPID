import { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ScrollView, Platform } from 'react-native';
import { getEmergencyLocation, useLocationSharing } from '../src/context/LocationSharingContext';
import { useRouter } from 'expo-router';
import { citizenApi } from '../src/api/client';

const CATEGORIES = [
  { key: null, label: 'Let AI classify from my description' },
  { key: 'medical', label: '🚑 Medical' },
  { key: 'fire', label: '🔥 Fire' },
  { key: 'assault', label: '⚠️ Assault / Threat' },
  { key: 'theft', label: '🎒 Theft / Robbery' },
  { key: 'trespass', label: '🚪 Trespass / Break-in' },
  { key: 'traffic', label: '🚗 Traffic Accident' },
  { key: 'other', label: '❓ Other' }
];

export default function ReportText() {
  const router = useRouter();
  const sharing = useLocationSharing();
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState(null);
  const [location, setLocation] = useState(null);
  const [locationError, setLocationError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getEmergencyLocation().then(value => {
      if (!cancelled) setLocation(value);
    }).catch(err => {
      if (!cancelled) setLocationError(err.message);
    });
    return () => { cancelled = true; };
  }, []);

  const handleSubmit = async () => {
    if (!description.trim()) {
      Alert.alert('Description required', 'Describe what is happening so it can be classified and dispatched correctly.');
      return;
    }
    if (submitting) return;
    setSubmitting(true);
    try {
      const freshLocation = await getEmergencyLocation();
      setLocation(freshLocation);
      setLocationError(null);
      const result = await citizenApi.submitEmergency({
        location: freshLocation,
        category: category || undefined,
        textReport: description.trim(),
        deviceInfo: { os: Platform.OS, appVersion: '1.0.0' }
      });
      sharing.startSharing(result, freshLocation);
      router.replace(`/track/${result.incidentId}`);
    } catch (err) {
      Alert.alert('Submission failed', err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.container}>
      <Text style={styles.label}>What's happening?</Text>
      <TextInput
        style={styles.textArea}
        value={description}
        onChangeText={setDescription}
        placeholder="Describe the emergency — location details, number of people involved, anything responders should know."
        placeholderTextColor="#6B7280"
        multiline
        numberOfLines={5}
      />

      <Text style={styles.label}>Category</Text>
      {CATEGORIES.map((c) => (
        <TouchableOpacity
          key={c.label}
          style={[styles.categoryRow, category === c.key && styles.categoryRowActive]}
          onPress={() => setCategory(c.key)}
        >
          <Text style={[styles.categoryText, category === c.key && styles.categoryTextActive]}>{c.label}</Text>
        </TouchableOpacity>
      ))}

      <Text style={styles.gpsNote}>
        {location ? `GPS: ${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}` : (locationError || 'Acquiring GPS…')}
      </Text>

      <Text style={styles.gpsNote}>Submitting shares your live location while the app is open. Stop sharing from the tracking screen. GPS is retried on submission.</Text>

      <TouchableOpacity style={styles.submitButton} onPress={handleSubmit} disabled={submitting}>
        <Text style={styles.submitButtonText}>{submitting ? 'Sending…' : 'Submit Report'}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#0B0F19' },
  container: { padding: 20, paddingBottom: 48 },
  label: { color: '#9CA3AF', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 20, marginBottom: 8 },
  textArea: { backgroundColor: '#111827', borderRadius: 14, padding: 14, color: '#fff', fontSize: 14, minHeight: 110, textAlignVertical: 'top', borderWidth: 1, borderColor: '#1F2937' },
  categoryRow: { backgroundColor: '#111827', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14, marginBottom: 8, borderWidth: 1, borderColor: '#1F2937' },
  categoryRowActive: { borderColor: '#22D3EE', backgroundColor: '#0E3A45' },
  categoryText: { color: '#D1D5DB', fontSize: 13 },
  categoryTextActive: { color: '#67E8F9', fontWeight: '700' },
  gpsNote: { color: '#6B7280', fontSize: 11, marginTop: 12, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  submitButton: { backgroundColor: '#DC2626', borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 24 },
  submitButtonText: { color: '#fff', fontWeight: '800', fontSize: 15 }
});
