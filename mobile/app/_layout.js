import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from '../src/context/AuthContext';

export default function RootLayout() {
  return (
    <AuthProvider>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerStyle: { backgroundColor: '#0D1626' }, headerTintColor: '#fff', headerTitleStyle: { fontWeight: '700' } }}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="register" options={{ title: 'RAPID Citizen — Register' }} />
        <Stack.Screen name="home" options={{ title: 'RAPID Citizen', headerBackVisible: false }} />
        <Stack.Screen name="report-text" options={{ title: 'Text Report' }} />
        <Stack.Screen name="report-voice" options={{ title: 'Voice Report' }} />
        <Stack.Screen name="track/[id]" options={{ title: 'Tracking' }} />
        <Stack.Screen name="contacts" options={{ title: 'Emergency Contacts' }} />
      </Stack>
    </AuthProvider>
  );
}
