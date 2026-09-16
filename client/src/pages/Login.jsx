import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Shield, Lock, User } from 'lucide-react';
import useRapidStore from '../store/rapidStore';

export default function Login() {
  const login = useRapidStore(s => s.login);
  const authError = useRapidStore(s => s.authError);
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    const ok = await login(username, password);
    setSubmitting(false);
    if (ok) {
      const dest = location.state?.from || '/dashboard';
      navigate(dest, { replace: true });
    }
  };

  return (
    <div className="min-h-screen bg-page flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="bg-accent/10 p-3 rounded-xl border border-accent/30 mb-4">
            <Shield className="h-8 w-8 text-accent" />
          </div>
          <h1 className="font-extrabold text-2xl tracking-wider text-text">R.A.P.I.D.</h1>
          <p className="text-[11px] text-accent font-mono tracking-widest uppercase mt-1">Police Dispatch — Command Centre</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-surface border border-border rounded-xl p-6 space-y-4">
          <div>
            <label className="text-[10px] uppercase text-muted font-bold tracking-wider mb-1 block">Username</label>
            <div className="flex items-center gap-2 bg-page border border-border-strong rounded-lg px-3 py-2 focus-within:border-accent">
              <User className="h-4 w-4 text-muted" />
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoFocus
                autoComplete="username"
                className="bg-transparent outline-none text-text text-sm flex-1"
                placeholder="e.g. goa.commander"
              />
            </div>
          </div>

          <div>
            <label className="text-[10px] uppercase text-muted font-bold tracking-wider mb-1 block">Password</label>
            <div className="flex items-center gap-2 bg-page border border-border-strong rounded-lg px-3 py-2 focus-within:border-accent">
              <Lock className="h-4 w-4 text-muted" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                className="bg-transparent outline-none text-text text-sm flex-1"
                placeholder="••••••••"
              />
            </div>
          </div>

          {authError && (
            <div className="text-status-critical text-xs bg-status-critical/10 border border-status-critical/30 rounded-lg px-3 py-2">
              {authError}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || !username || !password}
            className="w-full bg-accent hover:bg-accent/90 border border-accent text-on-solid font-semibold text-sm rounded-lg py-2.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {submitting ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        <p className="text-center text-[10px] text-muted font-mono mt-4">
          Demo prototype — credentials issued by system administrator
        </p>
      </div>
    </div>
  );
}
