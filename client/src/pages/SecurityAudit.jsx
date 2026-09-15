import React, { useState, useEffect, useCallback } from 'react';
import { ShieldCheck, ShieldAlert, Lock, RefreshCw } from 'lucide-react';
import useRapidStore from '../store/rapidStore';
import { SkeletonRow } from '../components/shared/Skeleton';

// Mirrors routes/security.js's AUDIT_READ_ROLES — client-side gate is UX
// only, the server is the real authority (a non-commander hitting the API
// directly still gets a real 403, logged as its own unauthorized_attempt).
const AUDIT_READ_ROLES = ['NATIONAL_COMMANDER', 'STATE_COMMANDER'];

const ACTION_STYLE = {
  login_success: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10',
  login_failure: 'text-orange-400 border-orange-500/30 bg-orange-500/10',
  login_rate_limited: 'text-red-400 border-red-500/30 bg-red-500/10',
  logout: 'text-gray-400 border-gray-600/30 bg-gray-500/10',
  zone_created: 'text-cyan-400 border-cyan-500/30 bg-cyan-500/10',
  zone_updated: 'text-cyan-400 border-cyan-500/30 bg-cyan-500/10',
  zone_deleted: 'text-orange-400 border-orange-500/30 bg-orange-500/10',
  rl_mode_changed: 'text-purple-400 border-purple-500/30 bg-purple-500/10',
  unauthorized_attempt: 'text-red-400 border-red-500/30 bg-red-500/10'
};

function describe(entry) {
  const who = entry.actor?.username || 'unknown';
  switch (entry.action) {
    case 'login_success': return `${who} logged in.`;
    case 'login_failure': return `Failed login attempt for "${entry.details?.username || 'unknown'}".`;
    case 'login_rate_limited': return `Login rate limit hit for "${entry.details?.username || 'unknown'}" (${entry.details?.ip || 'unknown IP'}).`;
    case 'logout': return `${who} logged out.`;
    case 'zone_created': return `${who} created airspace zone "${entry.target?.name || entry.target?.zoneId}".`;
    case 'zone_updated': return `${who} updated airspace zone "${entry.target?.name || entry.target?.zoneId}".`;
    case 'zone_deleted': return `${who} deactivated airspace zone "${entry.target?.name || entry.target?.zoneId}".`;
    case 'rl_mode_changed': return `${who} switched RL mode ${entry.target?.from} → ${entry.target?.to}.`;
    case 'unauthorized_attempt': return `${who} attempted ${entry.target?.method} ${entry.target?.path} without permission (requires ${entry.details?.requiredRoles?.join('/')}).`;
    default: return entry.action;
  }
}

function SecurityAudit() {
  const currentUser = useRapidStore(s => s.currentUser);
  const allowed = currentUser && AUDIT_READ_ROLES.includes(currentUser.role);

  const [entries, setEntries] = useState([]);
  const [chainStatus, setChainStatus] = useState(null);
  const [verifying, setVerifying] = useState(false);
  // Without this, "No security events logged yet" showed during every fetch,
  // not only when the log is genuinely empty. refresh depends on `allowed`,
  // which flips once currentUser loads, so this legitimately toggles again
  // then: a real refetch, not just mount.
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!allowed) return;
    try {
      const res = await fetch('/api/security/audit-log?limit=50');
      if (res.ok) setEntries(await res.json());
    } catch (err) {
      console.error('Audit log refresh error:', err);
    }
  }, [allowed]);

  useEffect(() => {
    let ignore = false;
    const sync = async () => {
      if (ignore) return;
      setLoading(true);
      try { await refresh(); } finally { if (!ignore) setLoading(false); }
    };
    sync();
    return () => { ignore = true; };
  }, [refresh]);

  useEffect(() => {
    let ignore = false;
    const poll = async () => { if (!ignore) await refresh(); };
    const interval = setInterval(poll, 5000);
    return () => { ignore = true; clearInterval(interval); };
  }, [refresh]);

  const verifyChain = async () => {
    setVerifying(true);
    try {
      const res = await fetch('/api/security/audit-log/verify');
      if (res.ok) setChainStatus(await res.json());
    } catch (err) {
      console.error('Chain verify error:', err);
    } finally {
      setVerifying(false);
    }
  };

  if (!allowed) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <Lock className="h-10 w-10 text-gray-600 mb-4" />
        <h2 className="text-lg font-bold text-white">Commander Access Required</h2>
        <p className="text-xs text-gray-500 font-mono mt-2 max-w-md">
          The security audit log carries cross-agency sensitive detail (usernames, IP addresses, unauthorized attempts).
          Signed in as {currentUser?.role || '—'} — this page is visible to NATIONAL_COMMANDER and STATE_COMMANDER accounts only.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between border-b border-[#1F2E45] pb-4">
        <div className="flex items-center gap-3">
          <div className="bg-cyan-500/10 p-2.5 rounded-xl border border-cyan-500/20">
            <ShieldCheck className="h-6 w-6 text-cyan-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-wide text-white">Security Audit Log</h2>
            <p className="text-xs text-gray-400 font-mono mt-0.5">Hash-chained record of logins, airspace zone writes, RL mode switches, and unauthorized attempts.</p>
          </div>
        </div>
        <button
          onClick={verifyChain}
          disabled={verifying}
          className="flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-lg text-[10px] font-bold text-white uppercase tracking-wider disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${verifying ? 'animate-spin' : ''}`} />
          Verify Chain
        </button>
      </div>

      {chainStatus && (
        <div className={`p-3 rounded-xl text-xs font-mono font-bold flex items-center gap-2 ${
          chainStatus.valid ? 'bg-emerald-900/30 border border-emerald-500/30 text-emerald-400' : 'bg-red-900/30 border border-red-500/30 text-red-400'
        }`}>
          {chainStatus.valid ? <ShieldCheck className="h-4 w-4" /> : <ShieldAlert className="h-4 w-4" />}
          {chainStatus.valid ? 'Chain verified — no tampering detected.' : `Chain broken at entry ${chainStatus.brokenAt}: ${chainStatus.reason}`}
        </div>
      )}

      <div className="cyber-glass rounded-2xl p-5 border border-[#1F2E45]">
        <div className="space-y-2">
          {loading ? (
            [0, 1, 2, 3].map(i => <SkeletonRow key={i} />)
          ) : entries.map(e => (
            <div key={e.id} className="p-3 rounded-xl border border-slate-800 bg-slate-900/30 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="text-xs font-semibold text-white truncate">{describe(e)}</div>
                <div className="text-[9px] text-gray-500 font-mono">{new Date(e.timestamp).toLocaleString()}</div>
              </div>
              <span className={`flex-shrink-0 text-[9px] font-mono font-bold uppercase px-2 py-1 rounded-full border ${ACTION_STYLE[e.action] || 'text-gray-400 border-gray-600/30 bg-gray-500/10'}`}>
                {e.action.replace(/_/g, ' ')}
              </span>
            </div>
          ))}
          {!loading && entries.length === 0 && <p className="text-xs text-gray-600 font-mono text-center py-4">No security events logged yet.</p>}
        </div>
      </div>
    </div>
  );
}

export default SecurityAudit;
