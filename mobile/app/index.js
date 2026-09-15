import { View, ActivityIndicator, StyleSheet, Text } from 'react-native';
import { Redirect } from 'expo-router';
import { useAuth } from '../src/context/AuthContext';

export default function Index() {
  const { profile, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#06B6D4" />
        <Text style={styles.text}>RAPID Citizen</Text>
      </View>
    );
  }

  return <Redirect href={profile ? '/home' : '/register'} />;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B0F19', alignItems: 'center', justifyContent: 'center', gap: 12 },
  text: { color: '#9CA3AF', fontWeight: '600', letterSpacing: 1 }
});
