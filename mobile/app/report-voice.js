import { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ScrollView, Platform } from 'react-native';
import { useAudioRecorder, RecordingPresets, requestRecordingPermissionsAsync } from 'expo-audio';
import { getEmergencyLocation, useLocationSharing } from '../src/context/LocationSharingContext';
import { useRouter } from 'expo-router';
import { citizenApi } from '../src/api/client';

export default function ReportVoice() {
  const router = useRouter();
  const sharing = useLocationSharing();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [isRecording, setIsRecording] = useState(false);
  const [hasRecording, setHasRecording] = useState(false);
  const [transcriptDraft, setTranscriptDraft] = useState('');
  const [location, setLocation] = useState(null);
  const [locationError, setLocationError] = useState(null);
  const [classification, setClassification] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
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

  const startRecording = async () => {
    try {
      const { granted } = await requestRecordingPermissionsAsync();
      if (!granted) {
        Alert.alert('Microphone permission required', 'Enable microphone access for Expo Go in Android Settings.');
        return;
      }
      await recorder.prepareToRecordAsync();
      recorder.record();
      setIsRecording(true);
      setHasRecording(false);
      setClassification(null);
    } catch (err) {
      Alert.alert('Could not start recording', err.message);
    }
  };

  const stopRecording = async () => {
    try {
      await recorder.stop();
      setHasRecording(true);
    } catch (err) {
      Alert.alert('Could not save recording', err.message);
    } finally {
      setIsRecording(false);
    }
  };

  const handleAnalyze = async () => {
    if (!transcriptDraft.trim()) {
      Alert.alert('Confirmation needed', "Voice-to-text isn't connected in this build yet — type what you said so it can be classified.");
      return;
    }
    setAnalyzing(true);
    try {
      const freshLocation = await getEmergencyLocation();
      setLocation(freshLocation);
      setLocationError(null);
      const result = await citizenApi.submitVoiceReport(transcriptDraft.trim(), freshLocation);
      setClassification(result);
    } catch (err) {
      Alert.alert('Analysis failed', err.message);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleConfirmSend = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const freshLocation = await getEmergencyLocation();
      setLocation(freshLocation);
      setLocationError(null);
      const result = await citizenApi.submitEmergency({
        location: freshLocation,
        category: classification?.classification?.category,
        textReport: transcriptDraft.trim(),
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
      <Text style={styles.sttNote}>Sending shares your live location while the app is open. Stop sharing from the tracking screen.</Text>
      <Text style={styles.sttNote}>{location ? `GPS: ${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}` : (locationError || 'Acquiring GPS…')}</Text>
      <View style={styles.recordSection}>
        <TouchableOpacity
          style={[styles.recordButton, isRecording && styles.recordButtonActive]}
          onPress={isRecording ? stopRecording : startRecording}
        >
          <Text style={styles.recordButtonText}>{isRecording ? '■' : '●'}</Text>
        </TouchableOpacity>
        <Text style={styles.recordHint}>
          {isRecording ? 'Recording… tap to stop' : hasRecording ? 'Recording captured' : 'Tap to start recording'}
        </Text>
      </View>

      {hasRecording && (
        <>
          <Text style={styles.label}>Confirm what you said</Text>
          <Text style={styles.sttNote}>Voice-to-text isn't connected in this build — type a quick summary so it can be classified.</Text>
          <TextInput
            style={styles.textArea}
            value={transcriptDraft}
            onChangeText={setTranscriptDraft}
            placeholder="e.g. There's a fire near the market, someone is trapped"
            placeholderTextColor="#6B7280"
            multiline
            numberOfLines={4}
          />

          <TouchableOpacity style={styles.analyzeButton} onPress={handleAnalyze} disabled={analyzing}>
            <Text style={styles.analyzeButtonText}>{analyzing ? 'Analyzing…' : 'Analyze Report'}</Text>
          </TouchableOpacity>
        </>
      )}

      {classification && (
        <View style={styles.resultCard}>
          <Text style={styles.resultTitle}>AI Classification</Text>
          <Text style={styles.resultRow}>Category: <Text style={styles.resultValue}>{classification.classification.category.toUpperCase()}</Text> ({Math.round(classification.classification.categoryConfidence * 100)}% confidence)</Text>
          <Text style={styles.resultRow}>Severity: <Text style={styles.resultValue}>{classification.classification.severity.toUpperCase()}</Text></Text>
          {classification.extractedEntities.locationMention && (
            <Text style={styles.resultRow}>Location mentioned: <Text style={styles.resultValue}>{classification.extractedEntities.locationMention}</Text></Text>
          )}
          {classification.extractedEntities.weaponsMentioned && <Text style={styles.resultWarning}>⚠ Weapon mentioned</Text>}
          <Text style={styles.resultDisclaimer}>This is only a recommendation — a human controller reviews every dispatch.</Text>

          <TouchableOpacity style={styles.submitButton} onPress={handleConfirmSend} disabled={submitting}>
            <Text style={styles.submitButtonText}>{submitting ? 'Sending…' : 'Confirm & Send'}</Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#0B0F19' },
  container: { padding: 20, paddingBottom: 48, alignItems: 'center' },
  recordSection: { alignItems: 'center', marginVertical: 24 },
  recordButton: { width: 100, height: 100, borderRadius: 50, backgroundColor: '#DC2626', alignItems: 'center', justifyContent: 'center' },
  recordButtonActive: { backgroundColor: '#7F1D1D' },
  recordButtonText: { color: '#fff', fontSize: 36 },
  recordHint: { color: '#9CA3AF', fontSize: 12, marginTop: 12, fontWeight: '600' },
  label: { color: '#9CA3AF', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 8, marginBottom: 6, alignSelf: 'flex-start' },
  sttNote: { color: '#F59E0B', fontSize: 11, marginBottom: 8, alignSelf: 'flex-start' },
  textArea: { width: '100%', backgroundColor: '#111827', borderRadius: 14, padding: 14, color: '#fff', fontSize: 14, minHeight: 90, textAlignVertical: 'top', borderWidth: 1, borderColor: '#1F2937' },
  analyzeButton: { width: '100%', backgroundColor: '#0E7490', borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 14 },
  analyzeButtonText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  resultCard: { width: '100%', backgroundColor: '#111827', borderRadius: 16, padding: 16, marginTop: 20, borderWidth: 1, borderColor: '#1F2937' },
  resultTitle: { color: '#22D3EE', fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  resultRow: { color: '#9CA3AF', fontSize: 13, marginBottom: 6 },
  resultValue: { color: '#fff', fontWeight: '700' },
  resultWarning: { color: '#F87171', fontSize: 12, fontWeight: '700', marginTop: 4 },
  resultDisclaimer: { color: '#6B7280', fontSize: 10, marginTop: 10, fontStyle: 'italic' },
  submitButton: { backgroundColor: '#DC2626', borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginTop: 16 },
  submitButtonText: { color: '#fff', fontWeight: '800', fontSize: 14 }
});
