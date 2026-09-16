import React, { useState, useEffect, useCallback } from 'react';
import { BrainCircuit, Zap, History, Radio, CheckCircle2, XCircle } from 'lucide-react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import useRapidStore from '../store/rapidStore';

// Mirrors the server-side requireRole lists in routes/rl.js — duplicated
// client-side (same pattern as App.jsx's ROLE_LABELS) purely to disable
// controls a request would 403 on anyway; the server remains the real
// authority, this is UX only.
const MODE_SWITCH_ROLES = ['NATIONAL_COMMANDER', 'STATE_COMMANDER'];

const MODE_STYLE = {
  LIVE: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10',
  TRAINING: 'text-cyan-400 border-cyan-500/30 bg-cyan-500/10',
  EVALUATION: 'text-purple-400 border-purple-500/30 bg-purple-500/10'
};

const MODE_DESCRIPTIONS = {
  LIVE: 'Production dispatch — always the frozen, explainable heuristic engine. Never trainable.',
  TRAINING: 'The neural policy drives real dispatch decisions and trains from the experience buffer every ~8s in the background.',
  EVALUATION: 'The neural policy drives real dispatch decisions read-only, logged alongside what the heuristic would have picked.'
};

function RLConsole() {
  const currentUser = useRapidStore(s => s.currentUser);
  const canSwitchMode = currentUser && MODE_SWITCH_ROLES.includes(currentUser.role);

  const [mode, setMode] = useState('LIVE');
  const [history, setHistory] = useState([]);
  const [trainingStatus, setTrainingStatus] = useState(null);
  const [experience, setExperience] = useState([]);
  const [drones, setDrones] = useState([]);
  const [feedback, setFeedback] = useState(null);
  const [switching, setSwitching] = useState(false);
  const [training, setTraining] = useState(false);

  const showFeedback = (type, msg) => {
    setFeedback({ type, msg });
    setTimeout(() => setFeedback(null), 5000);
  };

  const refresh = useCallback(async () => {
    try {
      const [modeRes, statusRes, expRes, dronesRes] = await Promise.all([
        fetch('/api/rl/mode'),
        fetch('/api/rl/training-status'),
        fetch('/api/rl/experience?limit=8'),
        fetch('/api/drones')
      ]);
      if (modeRes.ok) { const m = await modeRes.json(); setMode(m.mode); setHistory(m.history || []); }
      if (statusRes.ok) setTrainingStatus(await statusRes.json());
      if (expRes.ok) setExperience(await expRes.json());
      if (dronesRes.ok) setDrones(await dronesRes.json());
    } catch (err) {
      console.error('RL console refresh error:', err);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    const interval = setInterval(refresh, 4000);
    return () => clearInterval(interval);
  }, [refresh]);

  const callSignFor = (droneId) => drones.find(d => d.id === droneId)?.call_sign || droneId?.slice(0, 8) || '—';

  const switchMode = async (newMode) => {
    setSwitching(true);
    try {
      const res = await fetch('/api/rl/mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: newMode, reason: `Switched from RL Console by ${currentUser?.fullName || 'operator'}.` })
      });
      const data = await res.json();
      if (!res.ok) { showFeedback('error', data.error || 'Mode switch failed.'); return; }
      showFeedback('ok', `Switched to ${newMode}.`);
      refresh();
    } catch {
      showFeedback('error', 'Network error — mode not switched.');
    } finally {
      setSwitching(false);
    }
  };

  const triggerTraining = async () => {
    setTraining(true);
    try {
      const res = await fetch('/api/rl/train', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      const data = await res.json();
      if (!res.ok) { showFeedback('error', data.error || 'Training failed.'); return; }
      if (!data.trained) { showFeedback('error', data.reason); return; }
      showFeedback('ok', `Trained on ${data.batchSize} samples — loss ${data.loss.toFixed(4)}.`);
      refresh();
    } catch {
      showFeedback('error', 'Network error — training not triggered.');
    } finally {
      setTraining(false);
    }
  };

  const lossChartData = (trainingStatus?.neuralPolicy?.lossHistory || []).map(h => ({ step: h.step, loss: h.loss }));

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center gap-3 border-b border-[#1F2E45] pb-4">
        <div className="bg-cyan-500/10 p-2.5 rounded-xl border border-cyan-500/20">
          <BrainCircuit className="h-6 w-6 text-cyan-400" />
        </div>
        <div>
          <h2 className="text-xl font-bold tracking-wide text-white">RL Training &amp; Evaluation Console</h2>
          <p className="text-xs text-gray-400 font-mono mt-0.5">Mode safety interlock, neural policy training progress, and heuristic-vs-neural comparison.</p>
        </div>
      </div>

      {feedback && (
        <div className={`p-3 rounded-xl text-xs font-mono font-bold ${feedback.type === 'ok' ? 'bg-emerald-900/30 border border-emerald-500/30 text-emerald-400' : 'bg-red-900/30 border border-red-500/30 text-red-400'}`}>
          {feedback.msg}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Mode Control */}
        <div className="bg-surface rounded-2xl p-5 border border-border">
          <div className="flex items-center gap-2 mb-4">
            <Radio className="h-4 w-4 text-cyan-400" />
            <h3 className="font-bold text-sm text-white uppercase tracking-wider">Dispatch Mode</h3>
          </div>

          <div className={`p-3 rounded-xl border mb-4 ${MODE_STYLE[mode]}`}>
            <div className="text-sm font-extrabold uppercase tracking-wider">{mode}</div>
            <p className="text-[10px] font-mono mt-1 opacity-80">{MODE_DESCRIPTIONS[mode]}</p>
          </div>

          <div className="grid grid-cols-3 gap-2 mb-2">
            {['LIVE', 'TRAINING', 'EVALUATION'].map(m => (
              <button
                key={m}
                disabled={!canSwitchMode || switching || m === mode}
                onClick={() => switchMode(m)}
                title={!canSwitchMode ? 'Commander role required to change mode.' : ''}
                className={`py-2 rounded-lg text-[10px] font-mono font-bold uppercase tracking-wider border transition-all disabled:opacity-30 disabled:cursor-not-allowed ${
                  m === mode ? 'bg-slate-800 border-slate-700 text-gray-500' : 'bg-slate-900/40 border-slate-700 text-gray-300 hover:text-cyan-400 hover:border-cyan-500/40'
                }`}
              >
                {m}
              </button>
            ))}
          </div>
          {!canSwitchMode && (
            <p className="text-[9px] text-gray-600 font-mono">Signed in as {currentUser?.role || '—'} — mode switching requires a commander role.</p>
          )}

          <div className="mt-5 pt-4 border-t border-[#1F2E45]">
            <div className="flex items-center gap-2 mb-2">
              <History className="h-3.5 w-3.5 text-gray-500" />
              <span className="text-[10px] font-mono text-gray-500 uppercase tracking-wider font-bold">Recent Mode Changes</span>
            </div>
            <div className="space-y-1.5 max-h-32 overflow-y-auto">
              {history.slice(0, 6).map((h, i) => (
                <div key={i} className="flex items-center justify-between text-[10px] font-mono">
                  <span className={MODE_STYLE[h.mode]?.split(' ')[0] || 'text-gray-400'}>{h.mode}</span>
                  <span className="text-gray-600">{new Date(h.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Neural Policy Training Status */}
        <div className="bg-surface rounded-2xl p-5 border border-border">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-cyan-400" />
              <h3 className="font-bold text-sm text-white uppercase tracking-wider">Neural Policy — {trainingStatus?.neuralPolicy?.name || 'neural-dqn-v1'}</h3>
            </div>
            <button
              onClick={triggerTraining}
              disabled={!canSwitchMode || training || mode !== 'TRAINING'}
              title={mode !== 'TRAINING' ? 'Switch to TRAINING mode first.' : ''}
              className="px-3 py-1.5 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-lg text-[10px] font-bold text-white uppercase tracking-wider disabled:opacity-30 disabled:cursor-not-allowed"
            >
              {training ? 'Training…' : 'Train Now'}
            </button>
          </div>

          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="p-2.5 rounded-lg bg-slate-900/40 border border-slate-800 text-center">
              <div className="text-lg font-extrabold text-white">{trainingStatus?.neuralPolicy?.episodesTrained ?? 0}</div>
              <div className="text-[8px] text-gray-500 uppercase font-mono">Episodes Trained</div>
            </div>
            <div className="p-2.5 rounded-lg bg-slate-900/40 border border-slate-800 text-center">
              <div className="text-lg font-extrabold text-white">{trainingStatus?.neuralPolicy?.trainSteps ?? 0}</div>
              <div className="text-[8px] text-gray-500 uppercase font-mono">Train Steps</div>
            </div>
            <div className="p-2.5 rounded-lg bg-slate-900/40 border border-slate-800 text-center">
              <div className="text-lg font-extrabold text-cyan-400">{trainingStatus?.neuralPolicy?.lastLoss != null ? trainingStatus.neuralPolicy.lastLoss.toFixed(4) : '—'}</div>
              <div className="text-[8px] text-gray-500 uppercase font-mono">Last Loss</div>
            </div>
          </div>

          <div className="h-32">
            {lossChartData.length > 1 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={lossChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1F2E45" />
                  <XAxis dataKey="step" tick={{ fontSize: 9, fill: '#6B7280' }} />
                  <YAxis tick={{ fontSize: 9, fill: '#6B7280' }} />
                  <Tooltip contentStyle={{ background: '#0D1626', border: '1px solid #1F2E45', fontSize: 11 }} />
                  <Line type="monotone" dataKey="loss" stroke="#06B6D4" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-xs text-gray-600 font-mono text-center py-10">No training passes yet — switch to TRAINING mode and dispatch/complete a few missions.</p>
            )}
          </div>
        </div>
      </div>

      {/* Recent Experience */}
      <div className="bg-surface rounded-2xl p-5 border border-border">
        <h3 className="font-bold text-sm text-white uppercase tracking-wider mb-4">Recent Experience Tuples</h3>
        <div className="space-y-2">
          {experience.map(e => (
            <div key={e.id} className="p-3 rounded-xl border border-slate-800 bg-slate-900/30 flex items-center justify-between">
              <div>
                <div className="text-xs font-bold text-white">{callSignFor(e.action?.droneId)} — {e.action?.type}</div>
                <div className="text-[9px] text-gray-500 font-mono">{new Date(e.timestamp).toLocaleString()}</div>
              </div>
              <div className="flex items-center gap-3">
                {e.shadow_comparison && (
                  <span className={`flex items-center gap-1 text-[9px] font-mono font-bold uppercase px-2 py-1 rounded-full border ${
                    e.shadow_comparison.agree ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' : 'text-orange-400 border-orange-500/30 bg-orange-500/10'
                  }`}>
                    {e.shadow_comparison.agree ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                    {e.shadow_comparison.agree ? 'Agreed with heuristic' : `Differed (heuristic: ${e.shadow_comparison.heuristicCallSign})`}
                  </span>
                )}
                <span className={`text-xs font-mono font-extrabold ${e.reward >= 0 ? 'text-cyan-400' : 'text-red-400'}`}>
                  {e.reward >= 0 ? '+' : ''}{e.reward?.toFixed(3)}
                </span>
              </div>
            </div>
          ))}
          {experience.length === 0 && <p className="text-xs text-gray-600 font-mono text-center py-4">No completed-mission experience yet.</p>}
        </div>
      </div>
    </div>
  );
}

export default RLConsole;
