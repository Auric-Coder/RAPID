import React from 'react';
import useWebSocket from '../store/useWebSocket';
import TopCommandBar from '../components/header/TopCommandBar';
import LeftSidebar from '../components/sidebar/LeftSidebar';
import RapidMap from '../components/map/RapidMap';
import MissionControlPanel from '../components/mission-control/MissionControlPanel';
import ManualIncidentModal from '../components/modals/ManualIncidentModal';
import OverrideModal from '../components/modals/OverrideModal';

// ============================================================
// Main Dashboard Component
//
// RAPID v1.3 — Phase 0: This page is now a thin composition
// shell. All state lives in store/rapidStore.js; the map, side
// panels and modals are independently testable components.
// ============================================================
function Dashboard() {
  useWebSocket();

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] overflow-hidden text-gray-200 -m-8 relative hud-scanlines">
      <TopCommandBar />

      <div className="grid grid-cols-12 flex-1 min-h-0 bg-[#070B14]">
        <LeftSidebar />
        <RapidMap />
        <MissionControlPanel />
      </div>

      <ManualIncidentModal />
      <OverrideModal />
    </div>
  );
}

export default Dashboard;
