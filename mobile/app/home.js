import { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, Platform, ScrollView } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getEmergencyLocation, useLocationSharing } from '../src/context/LocationSharingContext';
import { useRouter } from 'expo-router';
import { useAuth } from '../src/context/AuthContext';
import { citizenApi } from '../src/api/client';

const ACTIVE_SOS_KEY = '@rapid_active_sos';

export default function Home() {
  const router = useRouter();
  const { profile, logout } = useAuth();
  const sharing = useLocationSharing();

  const [location, setLocation] = useState(null);
  const [locationError, setLocationError] = useState(null);
  const [sosSubmitting, setSosSubmitting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [activeIncident, setActiveIncident] = useState(null);

  // Load active emergency state on mount if one is already in progress
  useEffect(() => {
    (async () => {
      try {
        const storedActive = await AsyncStorage.getItem(ACTIVE_SOS_KEY);
        if (storedActive) {
          const parsed = JSON.parse(storedActive);
          if (parsed && parsed.incidentId) {
            setActiveIncident(parsed);
            // Verify if incident is still active on the server
            try {
              const tracking = await citizenApi.trackEmergency(parsed.incidentId);
              if (['resolved', 'cancelled'].includes(tracking?.status)) {
                await AsyncStorage.removeItem(ACTIVE_SOS_KEY);
                setActiveIncident(null);
              }
            } catch (_) {
              // Network offline — maintain stored state
            }
          }
        }
      } catch (e) {
        console.warn('Failed to load active SOS state:', e);
      }
    })();
  }, []);

  const requestLocation = useCallback(async () => {
    setLocationError(null);
    try {
      setLocation(await getEmergencyLocation());
    } catch (err) {
      setLocationError(err.message);
    }
  }, []);

  useEffect(() => {
    requestLocation();
  }, [requestLocation]);

  const isSosActive = Boolean(activeIncident || sosSubmitting);

  // Handle Cancel SOS with confirmation
  const handleCancelSOS = () => {
    if (!activeIncident || cancelling) return;

    Alert.alert(
      'Cancel Emergency SOS?',
      'Are you sure you want to cancel this emergency request? Any dispatched drones will immediately return to base.',
      [
        { text: 'Keep Active', style: 'cancel' },
        {
          text: 'Yes, Cancel SOS',
          style: 'destructive',
          onPress: async () => {
            setCancelling(true);
            try {
              await citizenApi.cancelEmergency(
                activeIncident.incidentId,
                activeIncident.locationToken || sharing.locationToken
              );
              sharing.finishSharing();
              await AsyncStorage.removeItem(ACTIVE_SOS_KEY);
              setActiveIncident(null);

              Alert.alert(
                'SOS Cancelled',
                'Your emergency request was cancelled. Dispatched drones have been recalled and are returning to base.'
              );
            } catch (err) {
              if (err.message && (err.message.includes('ended') || err.message.includes('cancelled'))) {
                sharing.finishSharing();
                await AsyncStorage.removeItem(ACTIVE_SOS_KEY);
                setActiveIncident(null);
              }
              Alert.alert('Notice', err.message || 'Could not communicate cancellation to server.');
            } finally {
              setCancelling(false);
            }
          }
        }
      ]
    );
  };

  // Main button handler:
  // - When Red: Sends SOS and turns Green
  // - When Green: Prompts confirmation to Cancel SOS and turns Red on cancel
  const handleButtonPress = async () => {
    if (sosSubmitting || cancelling) return;

    // If already active and green, clicking the button cancels the SOS
    if (isSosActive) {
      handleCancelSOS();
      return;
    }

    // Otherwise, dispatch new SOS
    setSosSubmitting(true);
    try {
      const freshLocation = await getEmergencyLocation();
      setLocation(freshLocation);

      const result = await citizenApi.submitEmergency({
        location: freshLocation,
        category: 'other',
        textReport: 'SOS — one-tap emergency trigger from RAPID Citizen app.',
        deviceInfo: { os: Platform.OS, model: Platform.constants?.Model || 'unknown', appVersion: '1.0.0' }
      });

      const incidentInfo = {
        incidentId: result.incidentId,
        locationToken: result.locationToken,
        timestamp: Date.now()
      };

      await AsyncStorage.setItem(ACTIVE_SOS_KEY, JSON.stringify(incidentInfo));
      setActiveIncident(incidentInfo);
      sharing.startSharing(result, freshLocation);

      Alert.alert(
        '🚨 SOS Dispatched!',
        'Emergency response initiated. Dispatched drone is en route to your live GPS coordinates.\n\nThe button has turned GREEN. Tap it at any time if you need to cancel this request.',
        [{ text: 'OK' }]
      );
    } catch (err) {
      Alert.alert('Could not send SOS', err.message);
    } finally {
      setSosSubmitting(false);
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#0B0F19' }} contentContainerStyle={styles.container}>
      <Text style={styles.greeting}>Hello, {profile?.full_name?.split(' ')[0] || 'Citizen'}</Text>

      {/* GPS Status Badge */}
      <View style={styles.locationBadge}>
        <View style={[styles.dot, { backgroundColor: location ? '#10B981' : '#F59E0B' }]} />
        <Text style={styles.locationText}>
          {location ? `GPS lock: ${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}` : (locationError || 'Acquiring GPS…')}
        </Text>
      </View>
      {locationError && (
        <TouchableOpacity onPress={requestLocation}>
          <Text style={styles.retryText}>Tap to retry location</Text>
        </TouchableOpacity>
      )}

      {/* DYNAMIC SOS ROUND BUTTON:
          - RED by default (sends SOS)
          - GREEN when active (taps to cancel SOS) */}
      <TouchableOpacity
        style={[
          styles.sosButton,
          isSosActive && styles.sosButtonActive
        ]}
        onPress={handleButtonPress}
        disabled={sosSubmitting || cancelling}
        activeOpacity={0.85}
      >
        <Text style={[styles.sosButtonText, isSosActive && styles.sosButtonTextActive]}>
          {sosSubmitting
            ? 'DISPATCHING…'
            : cancelling
            ? 'CANCELLING…'
            : isSosActive
            ? 'CANCEL SOS'
            : 'SOS'}
        </Text>
        <Text style={[styles.sosSubtext, isSosActive && styles.sosSubtextActive]}>
          {sosSubmitting
            ? 'Acquiring responder drone…'
            : cancelling
            ? 'Recalling drone to base…'
            : isSosActive
            ? 'Drone Dispatched • Tap to Cancel'
            : 'Tap for immediate dispatch'}
        </Text>
      </TouchableOpacity>

      {/* Active emergency info & live tracking link below button */}
      {isSosActive ? (
        <View style={styles.activeContainer}>
          <View style={styles.activeStatusBadge}>
            <View style={styles.pulseDot} />
            <Text style={styles.activeStatusText}>
              Emergency active • Dispatched drone en route
            </Text>
          </View>

          {activeIncident?.incidentId && (
            <TouchableOpacity
              style={styles.trackLinkButton}
              onPress={() => router.push(`/track/${activeIncident.incidentId}`)}
            >
              <Text style={styles.trackLinkText}>🛰️ View Live Tracking & Drone Map →</Text>
            </TouchableOpacity>
          )}

          <Text style={styles.helperText}>
            Tap the green button above to cancel this SOS and recall the drone.
          </Text>
        </View>
      ) : (
        <Text style={styles.sharingNote}>
          Tap the red SOS button to dispatch the nearest emergency response drone to your live location.
        </Text>
      )}

      {/* Additional Report Options */}
      <View style={styles.optionsRow}>
        <TouchableOpacity
          style={styles.optionCard}
          onPress={() => router.push('/report-voice')}
        >
          <Text style={styles.optionEmoji}>🎙️</Text>
          <Text style={styles.optionLabel}>Voice Report</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.optionCard}
          onPress={() => router.push('/report-text')}
        >
          <Text style={styles.optionEmoji}>✍️</Text>
          <Text style={styles.optionLabel}>Text Report</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.optionCard}
          onPress={() => router.push('/contacts')}
        >
          <Text style={styles.optionEmoji}>📇</Text>
          <Text style={styles.optionLabel}>Contacts</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.signOut} onPress={logout}>
        <Text style={styles.signOutText}>Sign out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    paddingBottom: 32,
    backgroundColor: '#0B0F19',
    alignItems: 'center',
    paddingTop: 32,
    paddingHorizontal: 24
  },
  greeting: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700'
  },
  locationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    backgroundColor: '#111827',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#1F2937'
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4
  },
  locationText: {
    flexShrink: 1,
    color: '#9CA3AF',
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace'
  },
  retryText: {
    color: '#22D3EE',
    fontSize: 12,
    marginTop: 8,
    fontWeight: '600'
  },

  // Ready State: Red Round Button
  sosButton: {
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: '#DC2626',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 40,
    shadowColor: '#DC2626',
    shadowOpacity: 0.6,
    shadowRadius: 30,
    elevation: 12,
    borderWidth: 4,
    borderColor: 'rgba(255, 255, 255, 0.25)'
  },
  sosButtonText: {
    color: '#fff',
    fontSize: 44,
    fontWeight: '900',
    letterSpacing: 2
  },
  sosSubtext: {
    color: '#FCA5A5',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    textAlign: 'center',
    paddingHorizontal: 16
  },

  // Active State: Green Round Button
  sosButtonActive: {
    backgroundColor: '#059669',
    shadowColor: '#10B981',
    shadowOpacity: 0.8,
    shadowRadius: 36,
    elevation: 16,
    borderColor: '#34D399'
  },
  sosButtonTextActive: {
    fontSize: 24,
    letterSpacing: 1.5
  },
  sosSubtextActive: {
    color: '#D1FAE5'
  },

  // Active status section below button
  activeContainer: {
    width: '100%',
    alignItems: 'center',
    marginTop: 24,
    gap: 10
  },
  activeStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)'
  },
  pulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10B981'
  },
  activeStatusText: {
    color: '#10B981',
    fontSize: 12,
    fontWeight: '700'
  },
  trackLinkButton: {
    paddingVertical: 8,
    paddingHorizontal: 16
  },
  trackLinkText: {
    color: '#22D3EE',
    fontSize: 13,
    fontWeight: '700'
  },
  helperText: {
    color: '#9CA3AF',
    fontSize: 11,
    textAlign: 'center',
    marginTop: 2
  },

  sharingNote: {
    color: '#9CA3AF',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 24,
    lineHeight: 18,
    paddingHorizontal: 12
  },

  // Secondary Options
  optionsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 36,
    width: '100%',
    justifyContent: 'center'
  },
  optionCard: {
    flex: 1,
    backgroundColor: '#111827',
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1F2937'
  },
  optionEmoji: {
    fontSize: 24,
    marginBottom: 6
  },
  optionLabel: {
    color: '#D1D5DB',
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center'
  },
  signOut: {
    marginTop: 32,
    padding: 10
  },
  signOutText: {
    color: '#6B7280',
    fontSize: 12,
    fontWeight: '600'
  }
});
