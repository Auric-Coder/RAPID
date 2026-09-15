import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { citizenApi, getToken, setToken } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [profile, setProfile] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const token = await getToken();
        if (token) {
          const p = await citizenApi.getProfile();
          setProfile(p);
        }
      } catch (_) {
        await setToken(null); // stale/invalid token
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const register = useCallback(async (fullName, phone, emergencyContacts) => {
    const { profile: p, token } = await citizenApi.register(fullName, phone, emergencyContacts);
    await setToken(token);
    setProfile(p);
    return p;
  }, []);

  const login = useCallback(async (phone) => {
    const { profile: p, token } = await citizenApi.login(phone);
    await setToken(token);
    setProfile(p);
    return p;
  }, []);

  const logout = useCallback(async () => {
    await setToken(null);
    setProfile(null);
  }, []);

  return (
    <AuthContext.Provider value={{ profile, isLoading, register, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
