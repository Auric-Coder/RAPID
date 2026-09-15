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
    <div className="min-h-screen bg-[#0B0F19] flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="bg-cyan-500/10 p-3 rounded-xl border border-cyan-500/30 glow-cyan mb-4">
            <Shield className="h-8 w-8 text-cyan-400" />
          </div>
          <h1 className="font-extrabold text-2xl tracking-wider text-white">R.A.P.I.D.</h1>
          <p className="text-[11px] text-cyan-400 font-mono tracking-widest uppercase mt-1">Police Dispatch Command Login</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-[#111827] border border-[#1F2E45] rounded-xl p-6 space-y-4">
          <div>
            <label className="text-[10px] uppercase text-gray-500 font-bold tracking-wider mb-1 block">Username</label>
            <div className="flex items-center gap-2 bg-[#0B0F19] border border-[#1F2E45] rounded-lg px-3 py-2 focus-within:border-cyan-500/50">
              <User className="h-4 w-4 text-gray-500" />
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoFocus
                autoComplete="username"
                className="bg-transparent outline-none text-white text-sm flex-1"
                placeholder="e.g. goa.commander"
              />
            </div>
          </div>

          <div>
            <label className="text-[10px] uppercase text-gray-500 font-bold tracking-wider mb-1 block">Password</label>
            <div className="flex items-center gap-2 bg-[#0B0F19] border border-[#1F2E45] rounded-lg px-3 py-2 focus-within:border-cyan-500/50">
              <Lock className="h-4 w-4 text-gray-500" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                className="bg-transparent outline-none text-white text-sm flex-1"
                placeholder="••••••••"
              />
            </div>
          </div>

          {authError && (
            <div className="text-red-400 text-xs bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
              {authError}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || !username || !password}
            className="w-full bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-cyan-400 font-semibold text-sm rounded-lg py-2.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {submitting ? 'Authenticating…' : 'Sign In'}
          </button>
        </form>

        <p className="text-center text-[10px] text-gray-600 font-mono mt-4">
          Demo prototype — credentials issued by system administrator
        </p>
      </div>
    </div>
  );
}
