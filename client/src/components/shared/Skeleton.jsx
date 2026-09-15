import React from 'react';

/**
 * RAPID — Loading Skeleton Primitives (Step 13)
 *
 * A page that fetches its own data on mount (Analytics, Fleet, Incidents,
 * Surveillance, RLConsole, SecurityAudit) previously rendered either
 * hardcoded placeholder numbers that looked real (Analytics) or an
 * empty-state message like "No X found yet" (the rest) during the brief
 * window before that fetch resolves — both are misleading: the user can't
 * tell "still loading" from "genuinely nothing here."
 *
 * These are plain pulsing rounded blocks, built from the exact
 * `animate-pulse` utility already used throughout this codebase (see
 * Fleet.jsx's status badges, TopCommandBar's health indicator, etc.) —
 * not a new visual language, just a shape that approximates each page's
 * real content while it loads.
 */

export function SkeletonBlock({ className = '' }) {
  return <div className={`animate-pulse bg-slate-800/60 rounded-lg ${className}`} />;
}

// A stat tile: label-sized line + a larger value-sized line beneath it.
// Matches the shape of Analytics.jsx's summary cards.
export function SkeletonStatTile() {
  return (
    <div className="cyber-glass rounded-2xl p-4 space-y-3">
      <SkeletonBlock className="h-3 w-2/3" />
      <SkeletonBlock className="h-7 w-1/2" />
    </div>
  );
}

// A drone/mission card: title line, a couple of detail lines, one badge.
// Matches Fleet.jsx's per-drone cards and Surveillance.jsx's mission cards.
export function SkeletonCard() {
  return (
    <div className="cyber-glass rounded-2xl p-4 space-y-3 border border-[#1F2E45]">
      <div className="flex items-center justify-between">
        <SkeletonBlock className="h-4 w-1/3" />
        <SkeletonBlock className="h-4 w-16" />
      </div>
      <SkeletonBlock className="h-3 w-full" />
      <SkeletonBlock className="h-3 w-2/3" />
    </div>
  );
}

// One list/table row: a leading line plus a trailing short value — for
// Incidents.jsx's registry table, RLConsole.jsx's experience feed, and
// SecurityAudit.jsx's audit log.
export function SkeletonRow() {
  return (
    <div className="flex items-center justify-between gap-4 py-3 border-b border-gray-800/40">
      <SkeletonBlock className="h-3 w-1/2" />
      <SkeletonBlock className="h-3 w-20" />
    </div>
  );
}

// A chart-sized block, for Analytics.jsx's recharts panels.
export function SkeletonChart() {
  return (
    <div className="cyber-glass rounded-2xl p-4">
      <SkeletonBlock className="h-3 w-1/4 mb-4" />
      <SkeletonBlock className="h-52 w-full" />
    </div>
  );
}
