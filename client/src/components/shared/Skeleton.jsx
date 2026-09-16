import React from 'react';

/**
 * Loading skeleton primitives.
 *
 * A page that fetches on mount used to render either placeholder numbers that
 * looked real (Analytics) or an empty-state message (the rest) during the fetch
 * window, so a user could not tell "still loading" from "nothing here".
 *
 * These are pulsing rounded blocks built from the same `animate-pulse` utility
 * used elsewhere in the app, shaped to approximate each page's real content.
 */

export function SkeletonBlock({ className = '' }) {
  return <div className={`animate-pulse bg-border rounded-lg ${className}`} />;
}

// A stat tile: label-sized line + a larger value-sized line beneath it.
// Matches the shape of Analytics.jsx's summary cards.
export function SkeletonStatTile() {
  return (
    <div className="bg-surface border border-border rounded-2xl p-4 space-y-3">
      <SkeletonBlock className="h-3 w-2/3" />
      <SkeletonBlock className="h-7 w-1/2" />
    </div>
  );
}

// A drone/mission card: title line, a couple of detail lines, one badge.
// Matches Fleet.jsx's per-drone cards and Surveillance.jsx's mission cards.
export function SkeletonCard() {
  return (
    <div className="bg-surface rounded-2xl p-4 space-y-3 border border-border">
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
    <div className="bg-surface border border-border rounded-2xl p-4">
      <SkeletonBlock className="h-3 w-1/4 mb-4" />
      <SkeletonBlock className="h-52 w-full" />
    </div>
  );
}
