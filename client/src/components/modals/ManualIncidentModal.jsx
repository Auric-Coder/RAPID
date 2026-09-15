import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import useRapidStore from '../../store/rapidStore';

export default function ManualIncidentModal() {
  const showManualForm = useRapidStore(s => s.showManualForm);
  const setShowManualForm = useRapidStore(s => s.setShowManualForm);
  const manualTitle = useRapidStore(s => s.manualTitle);
  const setManualTitle = useRapidStore(s => s.setManualTitle);
  const manualCategory = useRapidStore(s => s.manualCategory);
  const setManualCategory = useRapidStore(s => s.setManualCategory);
  const manualSeverity = useRapidStore(s => s.manualSeverity);
  const setManualSeverity = useRapidStore(s => s.setManualSeverity);
  const manualLat = useRapidStore(s => s.manualLat);
  const setManualLat = useRapidStore(s => s.setManualLat);
  const manualLng = useRapidStore(s => s.manualLng);
  const setManualLng = useRapidStore(s => s.setManualLng);
  const handleManualIncidentSubmit = useRapidStore(s => s.handleManualIncidentSubmit);

  return (
    <AnimatePresence>
      {showManualForm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
            className="w-full max-w-md bg-[#161F30] border border-[#1F2E45] rounded-3xl p-6 shadow-2xl">
            <div className="flex justify-between items-center mb-4 border-b border-[#1F2E45] pb-3">
              <h3 className="font-bold text-sm uppercase tracking-wider text-white">Log Incident Manually</h3>
              <button onClick={() => setShowManualForm(false)} className="text-gray-500 hover:text-white"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={handleManualIncidentSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block font-mono uppercase text-gray-400 mb-1">Title</label>
                <input type="text" required value={manualTitle} onChange={e => setManualTitle(e.target.value)} placeholder="e.g. Trespass near Panaji" className="w-full bg-[#1F2E45] border border-gray-700 focus:border-cyan-500 focus:outline-none rounded-xl px-3 py-2 text-white" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-mono uppercase text-gray-400 mb-1">Category</label>
                  <select value={manualCategory} onChange={e => setManualCategory(e.target.value)} className="w-full bg-[#1F2E45] border border-gray-700 focus:border-cyan-500 rounded-xl px-2 py-2 text-white focus:outline-none">
                    {['trespass', 'fire', 'theft', 'assault', 'traffic', 'medical', 'other'].map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block font-mono uppercase text-gray-400 mb-1">Severity</label>
                  <select value={manualSeverity} onChange={e => setManualSeverity(e.target.value)} className="w-full bg-[#1F2E45] border border-gray-700 focus:border-cyan-500 rounded-xl px-2 py-2 text-white focus:outline-none">
                    {['low', 'medium', 'high', 'critical'].map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-mono uppercase text-gray-400 mb-1">Latitude</label>
                  <input type="number" step="0.000001" required value={manualLat} onChange={e => setManualLat(e.target.value)} className="w-full bg-[#1F2E45] border border-gray-700 focus:border-cyan-500 rounded-xl px-3 py-2 text-white focus:outline-none" />
                </div>
                <div>
                  <label className="block font-mono uppercase text-gray-400 mb-1">Longitude</label>
                  <input type="number" step="0.000001" required value={manualLng} onChange={e => setManualLng(e.target.value)} className="w-full bg-[#1F2E45] border border-gray-700 focus:border-cyan-500 rounded-xl px-3 py-2 text-white focus:outline-none" />
                </div>
              </div>
              <button type="submit" className="w-full mt-2 py-3 bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-bold rounded-xl hover:opacity-90 transition-all shadow-lg">Create Incident</button>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
