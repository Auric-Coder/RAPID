import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import { Shield, Radio, Layers, FileText, BarChart3, HelpCircle, Activity, Radar, LogOut, BrainCircuit, ShieldCheck } from 'lucide-react';
import Dashboard from './pages/Dashboard';
import Fleet from './pages/Fleet';
import Incidents from './pages/Incidents';
import Analytics from './pages/Analytics';
import Surveillance from './pages/Surveillance';
import RLConsole from './pages/RLConsole';
import SecurityAudit from './pages/SecurityAudit';
import Help from './pages/Help';
import Login from './pages/Login';
import useRapidStore from './store/rapidStore';

const ROLE_LABELS = {
  NATIONAL_COMMANDER: 'National Commander',
  STATE_COMMANDER: 'State Commander',
  DISTRICT_COMMANDER: 'District Commander',
  BASE_COMMANDER: 'Base Commander',
  DISPATCHER: 'Dispatcher',
  OPERATOR: 'Operator',
  OBSERVER: 'Observer',
  AIRSPACE_AUTHORITY: 'Airspace Authority'
};

function Sidebar() {
  const location = useLocation();
  const currentUser = useRapidStore(s => s.currentUser);
  const logout = useRapidStore(s => s.logout);

  const links = [
    { to: '/dashboard', label: 'Operations Command', icon: Radio },
    { to: '/fleet', label: 'Drone Fleet', icon: Layers },
    { to: '/incidents', label: 'Incident Archive', icon: FileText },
    { to: '/analytics', label: 'Fleet Analytics', icon: BarChart3 },
    { to: '/surveillance', label: 'Surveillance', icon: Radar },
    { to: '/rl-console', label: 'RL Console', icon: BrainCircuit },
    { to: '/security-audit', label: 'Security Audit', icon: ShieldCheck },
    { to: '/help', label: 'Citizen Portal', icon: HelpCircle }
  ];

  return (
    <aside className="w-64 bg-[#111827] border-r border-[#1F2E45] flex flex-col justify-between h-screen fixed left-0 top-0 z-40">
      <div>
        {/* Brand Header */}
        <div className="p-6 border-b border-[#1F2E45] flex items-center gap-3">
          <div className="bg-cyan-500/10 p-2 rounded-lg border border-cyan-500/30 glow-cyan">
            <Shield className="h-6 w-6 text-cyan-400" />
          </div>
          <div>
            <h1 className="font-extrabold text-lg tracking-wider text-white">R.A.P.I.D.</h1>
            <p className="text-[10px] text-cyan-400 font-mono tracking-widest uppercase">Police Dispatch</p>
          </div>
        </div>

        {/* Navigation Menu */}
        <nav className="mt-8 px-4 space-y-2">
          {links.map((link) => {
            const Icon = link.icon;
            const isActive = location.pathname === link.to;
            return (
              <Link
                key={link.to}
                to={link.to}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group font-medium ${
                  isActive
                    ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800/40 border border-transparent'
                }`}
              >
                <Icon className={`h-5 w-5 ${isActive ? 'text-cyan-400' : 'text-gray-400 group-hover:text-cyan-400'}`} />
                <span>{link.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* System Status Indicators */}
      <div className="p-6 border-t border-[#1F2E45] bg-[#0F1523]/50">
        {currentUser && (
          <div className="flex items-center justify-between gap-2 mb-4 pb-4 border-b border-[#1F2E45]">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-white truncate">{currentUser.fullName}</p>
              <p className="text-[9px] uppercase text-cyan-400 font-mono tracking-wider truncate">
                {ROLE_LABELS[currentUser.role] || currentUser.role}
              </p>
            </div>
            <button
              onClick={logout}
              title="Log out"
              className="p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-colors flex-shrink-0"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        )}
        <div className="flex items-center gap-2 mb-3">
          <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></div>
          <span className="text-xs font-mono text-emerald-400">TELEMETRY SIM ACTIVE</span>
        </div>
        <div className="flex items-center justify-between text-[11px] font-mono text-gray-500">
          <span>HOST: LOCALHOST</span>
          <span>V1.0.0</span>
        </div>
      </div>
    </aside>
  );
}

function MainLayout({ children }) {
  return (
    <div className="flex min-h-screen bg-[#0B0F19]">
      <Sidebar />
      <main className="flex-1 ml-64 p-8 min-h-screen text-gray-200">
        {children}
      </main>
    </div>
  );
}

// RAPID v1.3 — Phase 6: gates the command-center routes behind the
// httpOnly-cookie session. /help (citizen portal) stays public.
function RequireAuth({ children }) {
  const currentUser = useRapidStore(s => s.currentUser);
  const authChecked = useRapidStore(s => s.authChecked);
  const location = useLocation();

  if (!authChecked) {
    return (
      <div className="min-h-screen bg-[#0B0F19] flex items-center justify-center">
        <span className="text-cyan-400 font-mono text-sm tracking-widest animate-pulse">AUTHENTICATING…</span>
      </div>
    );
  }
  if (!currentUser) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return children;
}

function App() {
  const checkAuth = useRapidStore(s => s.checkAuth);
  useEffect(() => { checkAuth(); }, [checkAuth]);

  return (
    <Router>
      <Routes>
        {/* Standalone Citizen Portal (Mobile friendly, no sidebar) */}
        <Route path="/help" element={<Help />} />

        {/* Login (public) */}
        <Route path="/login" element={<Login />} />

        {/* Protected Command Center Layout Pages */}
        <Route
          path="/dashboard"
          element={
            <RequireAuth>
              <MainLayout>
                <Dashboard />
              </MainLayout>
            </RequireAuth>
          }
        />
        <Route
          path="/fleet"
          element={
            <RequireAuth>
              <MainLayout>
                <Fleet />
              </MainLayout>
            </RequireAuth>
          }
        />
        <Route
          path="/incidents"
          element={
            <RequireAuth>
              <MainLayout>
                <Incidents />
              </MainLayout>
            </RequireAuth>
          }
        />
        <Route
          path="/analytics"
          element={
            <RequireAuth>
              <MainLayout>
                <Analytics />
              </MainLayout>
            </RequireAuth>
          }
        />
        <Route
          path="/surveillance"
          element={
            <RequireAuth>
              <MainLayout>
                <Surveillance />
              </MainLayout>
            </RequireAuth>
          }
        />
        <Route
          path="/rl-console"
          element={
            <RequireAuth>
              <MainLayout>
                <RLConsole />
              </MainLayout>
            </RequireAuth>
          }
        />
        <Route
          path="/security-audit"
          element={
            <RequireAuth>
              <MainLayout>
                <SecurityAudit />
              </MainLayout>
            </RequireAuth>
          }
        />

        {/* Fallbacks */}
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Router>
  );
}

export default App;
