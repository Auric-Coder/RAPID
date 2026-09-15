import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../src/context/AuthContext';

export default function Register() {
  const router = useRouter();
  const { register, login } = useAuth();
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [emergencyContactPhone, setEmergencyContactPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleRegister = async () => {
    if (!fullName.trim() || !phone.trim()) {
      Alert.alert('Missing details', 'Please enter your name and phone number.');
      return;
    }
    setSubmitting(true);
    try {
      const contacts = emergencyContactPhone.trim() ? [{ name: 'Emergency Contact', phone: emergencyContactPhone.trim() }] : [];
      await register(fullName.trim(), phone.trim(), contacts);
      router.replace('/home');
    } catch (err) {
      Alert.alert('Registration failed', err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleExistingUser = async () => {
    if (!phone.trim()) {
      Alert.alert('Phone required', 'Enter the phone number you registered with.');
      return;
    }
    setSubmitting(true);
    try {
      await login(phone.trim());
      router.replace('/home');
    } catch (err) {
      Alert.alert('Sign-in failed', err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.brand}>R.A.P.I.D.</Text>
        <Text style={styles.subtitle}>Citizen Emergency Network</Text>

        <View style={styles.card}>
          <Text style={styles.label}>Full Name</Text>
          <TextInput style={styles.input} value={fullName} onChangeText={setFullName} placeholder="Your name" placeholderTextColor="#6B7280" />

          <Text style={styles.label}>Phone Number</Text>
          <TextInput style={styles.input} value={phone} onChangeText={setPhone} placeholder="Your phone number" placeholderTextColor="#6B7280" keyboardType="phone-pad" />

          <Text style={styles.label}>Emergency Contact (optional)</Text>
          <TextInput style={styles.input} value={emergencyContactPhone} onChangeText={setEmergencyContactPhone} placeholder="A trusted contact's number" placeholderTextColor="#6B7280" keyboardType="phone-pad" />

          <TouchableOpacity style={styles.primaryButton} onPress={handleRegister} disabled={submitting}>
            <Text style={styles.primaryButtonText}>{submitting ? 'Please wait…' : 'Register'}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.secondaryButton} onPress={handleExistingUser} disabled={submitting}>
            <Text style={styles.secondaryButtonText}>Already registered — sign in with phone</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#0B0F19' },
  container: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  brand: { color: '#fff', fontSize: 28, fontWeight: '800', letterSpacing: 4 },
  subtitle: { color: '#22D3EE', fontSize: 12, fontWeight: '600', letterSpacing: 1.5, marginTop: 4, marginBottom: 28, textTransform: 'uppercase' },
  card: { width: '100%', maxWidth: 420, backgroundColor: '#111827', borderRadius: 24, padding: 20, borderWidth: 1, borderColor: '#1F2937' },
  label: { color: '#9CA3AF', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6, marginTop: 14 },
  input: { backgroundColor: '#1F2937', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, color: '#fff', fontSize: 15, borderWidth: 1, borderColor: '#374151' },
  primaryButton: { backgroundColor: '#DC2626', borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginTop: 24 },
  primaryButtonText: { color: '#fff', fontWeight: '800', fontSize: 15, letterSpacing: 0.5 },
  secondaryButton: { alignItems: 'center', marginTop: 16, padding: 6 },
  secondaryButtonText: { color: '#22D3EE', fontSize: 13, fontWeight: '600' }
});
