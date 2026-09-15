import { View, Text, TouchableOpacity, StyleSheet, Linking, FlatList } from 'react-native';
import { useAuth } from '../src/context/AuthContext';

const QUICK_DIAL = [
  { label: 'Police', number: '100' },
  { label: 'Ambulance', number: '108' },
  { label: 'Fire Brigade', number: '101' }
];

export default function Contacts() {
  const { profile } = useAuth();
  const personalContacts = profile?.emergency_contacts || [];

  const call = (number) => Linking.openURL(`tel:${number}`);

  return (
    <View style={styles.container}>
      <Text style={styles.sectionLabel}>Quick Dial</Text>
      {QUICK_DIAL.map((c) => (
        <TouchableOpacity key={c.number} style={styles.row} onPress={() => call(c.number)}>
          <Text style={styles.rowLabel}>{c.label}</Text>
          <Text style={styles.rowNumber}>{c.number}</Text>
        </TouchableOpacity>
      ))}

      <Text style={styles.sectionLabel}>Your Emergency Contacts</Text>
      {personalContacts.length === 0 ? (
        <Text style={styles.empty}>No personal emergency contacts added yet.</Text>
      ) : (
        <FlatList
          data={personalContacts}
          keyExtractor={(item, idx) => `${item.phone}-${idx}`}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.row} onPress={() => call(item.phone)}>
              <Text style={styles.rowLabel}>{item.name}</Text>
              <Text style={styles.rowNumber}>{item.phone}</Text>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B0F19', padding: 20 },
  sectionLabel: { color: '#9CA3AF', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 20, marginBottom: 10 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#111827', borderRadius: 12, paddingVertical: 14, paddingHorizontal: 16, marginBottom: 8, borderWidth: 1, borderColor: '#1F2937' },
  rowLabel: { color: '#fff', fontSize: 14, fontWeight: '600' },
  rowNumber: { color: '#22D3EE', fontSize: 14, fontWeight: '700' },
  empty: { color: '#6B7280', fontSize: 12, fontStyle: 'italic' }
});
