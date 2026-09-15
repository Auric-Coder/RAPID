import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle } from 'lucide-react';
import useRapidStore from '../../store/rapidStore';

export default function OverrideModal() {
  const overrideModal = useRapidStore(s => s.overrideModal);
  const setOverrideModal = useRapidStore(s => s.setOverrideModal);
  const handleManualDispatch = useRapidStore(s => s.handleManualDispatch);

  return (
    <AnimatePresence>
      {overrideModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
            className="w-full max-w-sm bg-[#161F30] border border-red-500/30 rounded-3xl p-6 shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <AlertTriangle className="h-6 w-6 text-red-400" />
              <h3 className="font-bold text-sm uppercase tracking-wider text-red-400">Insufficient Energy — Override Required</h3>
            </div>
            <p className="text-[11px] font-mono text-gray-300 mb-2">
              <span className="text-white font-bold">{overrideModal.candidate.callSign}</span> does not have enough battery to reach this incident and return to base.
            </p>
            <p className="text-[10px] font-mono text-red-400 mb-4">
              Dispatching this drone risks it running out of power before it can return. Use only if no other drone is available.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => setOverrideModal(null)} className="py-2.5 bg-gray-800 border border-gray-700 hover:border-gray-500 rounded-xl text-xs font-bold text-gray-300 transition-all">Cancel</button>
              <button
                onClick={() => handleManualDispatch(overrideModal.candidate, overrideModal.incident, true)}
                className="py-2.5 bg-red-700 hover:bg-red-600 rounded-xl text-xs font-bold text-white transition-all"
              >
                Dispatch anyway
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
