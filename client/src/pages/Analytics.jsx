import React, { useState, useEffect } from 'react';
import { BarChart3, PieChart as PieIcon, LineChart as LineIcon, Activity, Battery, ShieldAlert, CheckSquare } from 'lucide-react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, PieChart, Pie, Cell, BarChart, Bar } from 'recharts';
import { SkeletonStatTile, SkeletonChart } from '../components/shared/Skeleton';

// Colors for category chart pie sectors
const COLORS = ['#06B6D4', '#F97316', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899'];

function Analytics() {
  // These defaults only need to be structurally valid. `loading` gates a
  // skeleton, so they are never rendered as real values.
  const [summary, setSummary] = useState({
    totalDrones: 0, activeDrones: 0, maintenanceDrones: 0, idleDrones: 0,
    activeIncidents: 0, resolvedIncidents: 0, totalIncidents: 0, averageBattery: 0
  });
  const [loading, setLoading] = useState(true);

  const [charts, setCharts] = useState({
    categories: [],
    dailyTrends: [],
    droneUsage: []
  });

  useEffect(() => {
    let ignore = false;

    const fetchMetrics = async () => {
      try {
        const summaryRes = await fetch('/api/metrics/summary');
        const chartRes = await fetch('/api/metrics/historical');

        if (ignore) return;
        if (summaryRes.ok && chartRes.ok) {
          const summaryData = await summaryRes.json();
          const chartData = await chartRes.json();
          if (ignore) return;
          setSummary(summaryData);
          setCharts(chartData);
        }
      } catch (err) {
        if (!ignore) console.error(err);
      } finally {
        // Only the FIRST resolution (success or failure) should end the
        // loading state - later 3s poll ticks must not flash the skeleton
        // back over already-displayed real data.
        if (!ignore) setLoading(false);
      }
    };

    fetchMetrics();
    const interval = setInterval(fetchMetrics, 3000);
    return () => { ignore = true; clearInterval(interval); };
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-[#1F2E45] pb-4">
        <div className="bg-cyan-500/10 p-2.5 rounded-xl border border-cyan-500/20">
          <BarChart3 className="h-6 w-6 text-cyan-400" />
        </div>
        <div>
          <h2 className="text-xl font-bold tracking-wide text-white">Operations Performance Analytics</h2>
          <p className="text-xs text-gray-400 font-mono mt-0.5">Live metrics reporting, response latency audits, and equipment usage analysis.</p>
        </div>
      </div>

      {/* Overview stats cards */}
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {[0, 1, 2, 3].map(i => <SkeletonStatTile key={i} />)}
        </div>
      ) : (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
        <div className="bg-surface rounded-2xl p-5 border border-border">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono text-gray-400 uppercase font-semibold">Drone Utilization</span>
            <Activity className="h-4.5 w-4.5 text-cyan-400" />
          </div>
          <p className="text-2xl font-black text-white mt-2">
            {summary.activeDrones} <span className="text-xs text-gray-400 font-normal">/ {summary.totalDrones} in flight</span>
          </p>
        </div>

        <div className="bg-surface rounded-2xl p-5 border border-border">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono text-gray-400 uppercase font-semibold">Active Emergencies</span>
            <ShieldAlert className="h-4.5 w-4.5 text-orange-400 animate-pulse" />
          </div>
          <p className="text-2xl font-black text-white mt-2">
            {summary.activeIncidents} <span className="text-xs text-gray-400 font-normal">pending response</span>
          </p>
        </div>

        <div className="bg-surface rounded-2xl p-5 border border-border">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono text-gray-400 uppercase font-semibold">Average Battery Reserve</span>
            <Battery className="h-4.5 w-4.5 text-emerald-400" />
          </div>
          <p className="text-2xl font-black text-white mt-2">
            {summary.averageBattery}% <span className="text-xs text-gray-400 font-normal">fleet average</span>
          </p>
        </div>

        <div className="bg-surface rounded-2xl p-5 border border-border">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono text-gray-400 uppercase font-semibold">Cases Resolved</span>
            <CheckSquare className="h-4.5 w-4.5 text-emerald-400" />
          </div>
          <p className="text-2xl font-black text-white mt-2">
            {summary.resolvedIncidents} <span className="text-xs text-gray-400 font-normal">total cases resolved</span>
          </p>
        </div>
      </div>
      )}

      {/* Charts Grid */}
      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <SkeletonChart />
          <SkeletonChart />
          <div className="lg:col-span-2"><SkeletonChart /></div>
        </div>
      ) : (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Incident alarm trends (Line chart) */}
        <div className="bg-surface rounded-2xl p-5 border border-border flex flex-col h-80">
          <div className="flex items-center gap-2 mb-4">
            <LineIcon className="h-4.5 w-4.5 text-cyan-400" />
            <h3 className="font-bold text-xs uppercase tracking-wider text-white">Daily Emergency Dispatch Trends</h3>
          </div>
          <div className="flex-1 min-h-0 text-xs">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={charts.dailyTrends} margin={{ top: 5, right: 20, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1F2E45" opacity={0.3} />
                <XAxis dataKey="day" stroke="#9CA3AF" />
                <YAxis stroke="#9CA3AF" allowDecimals={false} />
                <Tooltip contentStyle={{ backgroundColor: '#111827', borderColor: '#1F2E45', color: '#fff' }} />
                <Line type="monotone" dataKey="count" stroke="#06B6D4" strokeWidth={2.5} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Categories ratio breakdown (Pie Chart) */}
        <div className="bg-surface rounded-2xl p-5 border border-border flex flex-col h-80">
          <div className="flex items-center gap-2 mb-4">
            <PieIcon className="h-4.5 w-4.5 text-cyan-400" />
            <h3 className="font-bold text-xs uppercase tracking-wider text-white">Incidents by Category</h3>
          </div>
          <div className="flex-1 min-h-0 text-xs flex items-center justify-center">
            {charts.categories.length > 0 ? (
              <div className="w-full h-full flex flex-col md:flex-row items-center justify-around">
                <div className="w-48 h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={charts.categories}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={75}
                        paddingAngle={3}
                        dataKey="value"
                      >
                        {charts.categories.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ backgroundColor: '#111827', borderColor: '#1F2E45' }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[10px] font-mono text-gray-400 max-w-[200px]">
                  {charts.categories.map((entry, index) => (
                    <div key={entry.name} className="flex items-center gap-1.5">
                      <div className="h-2 w-2 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }}></div>
                      <span>{entry.name}: <b>{entry.value}</b></span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-gray-500 italic">Standby mode: awaiting case logs to populate ratios.</p>
            )}
          </div>
        </div>

        {/* Drone reserve levels (Bar Chart) */}
        <div className="bg-surface rounded-2xl p-5 border border-border flex flex-col h-80 lg:col-span-2">
          <div className="flex items-center gap-2 mb-4">
            <Battery className="h-4.5 w-4.5 text-cyan-400" />
            <h3 className="font-bold text-xs uppercase tracking-wider text-white">Drone Energy Reserves</h3>
          </div>
          <div className="flex-1 min-h-0 text-xs">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={charts.droneUsage} margin={{ top: 5, right: 20, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1F2E45" opacity={0.3} />
                <XAxis dataKey="name" stroke="#9CA3AF" />
                <YAxis stroke="#9CA3AF" domain={[0, 100]} />
                <Tooltip contentStyle={{ backgroundColor: '#111827', borderColor: '#1F2E45', color: '#fff' }} />
                <Bar dataKey="battery" fill="#06B6D4" radius={[6, 6, 0, 0]}>
                  {charts.droneUsage.map((entry, index) => {
                    const color = entry.battery < 25 ? '#EF4444' : entry.battery < 60 ? '#F59E0B' : '#10B981';
                    return <Cell key={`cell-${index}`} fill={color} />;
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

      </div>
      )}
    </div>
  );
}

export default Analytics;
