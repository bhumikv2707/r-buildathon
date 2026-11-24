import { useState } from 'react';
import { Award, CheckCircle2, Navigation, Trophy } from 'lucide-react';
import { CommuterScoutProfile, WardLeagueEntry } from '../types/routix';

interface PremierLeaguePanelProps {
  wardLeague: WardLeagueEntry[];
  scouts: CommuterScoutProfile[];
  onLogCommutePass: (scoutId: string, clusterConfirmed: boolean) => Promise<void>;
}

export function PremierLeaguePanel({
  wardLeague,
  scouts,
  onLogCommutePass,
}: PremierLeaguePanelProps) {
  const [selectedScoutId, setSelectedScoutId] = useState<string>(
    scouts[0]?.id ?? 'SC-04'
  );
  const [busy, setBusy] = useState(false);
  const [lastEarnedMsg, setLastEarnedMsg] = useState<string | null>(null);

  const handleSimulatePass = async (clusterConfirmed: boolean) => {
    const id = selectedScoutId || scouts[0]?.id;
    if (!id) return;
    setBusy(true);
    setLastEarnedMsg(null);
    try {
      await onLogCommutePass(id, clusterConfirmed);
      const scout = scouts.find((s) => s.id === id);
      setLastEarnedMsg(
        `+${clusterConfirmed ? 85 : 50} Impact Points credited to ${
          scout?.name || 'commuter'
        } for passive swarm mapping.`
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Ward-vs-Ward Civic Premier League Table */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 px-5 py-4">
          <div>
            <div className="flex items-center gap-2">
              <Trophy className="h-4 w-4 text-rose-600 dark:text-rose-400 shrink-0" />
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                Civic Premier League — Ward-vs-Ward Accountability Standings
              </h2>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Live civic zone rankings by Road Health Score, average IRC:SP:100 patch turnaround, unresolved hazards, and ward-level budget tracking.
            </p>
          </div>
          <span className="font-mono text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap shrink-0">
            {wardLeague.length} Wards Ranked
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/70 text-xs font-medium text-slate-500 dark:text-slate-400">
                <th className="px-5 py-3">Rank &amp; Civic Ward</th>
                <th className="px-4 py-3 text-right">Road Health Score</th>
                <th className="px-4 py-3 text-right">Avg Turnaround</th>
                <th className="px-4 py-3 text-right">Resolved / Open</th>
                <th className="px-4 py-3 text-right">Ward Budget Spent</th>
                <th className="px-5 py-3 text-right">Escrow Committed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
              {wardLeague.map((ward, idx) => (
                <tr key={ward.wardName} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/50">
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <span
                        className={`font-mono text-xs font-bold w-6 text-center ${
                          idx === 0
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : 'text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        #{idx + 1}
                      </span>
                      <div>
                        <div className="font-semibold text-slate-900 dark:text-white">
                          {ward.wardName}
                        </div>
                        <div className="font-mono text-xs text-slate-500 dark:text-slate-400">
                          Zone {ward.zoneCode}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3.5 text-right font-mono tabular-nums">
                    <span
                      className={`font-bold ${
                        ward.roadHealthScore >= 85
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : ward.roadHealthScore >= 70
                          ? 'text-amber-700 dark:text-amber-400'
                          : 'text-rose-700 dark:text-rose-400'
                      }`}
                    >
                      {ward.roadHealthScore} / 100
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-right font-mono text-slate-700 dark:text-slate-300 tabular-nums">
                    {ward.avgPatchHours} hrs
                  </td>
                  <td className="px-4 py-3.5 text-right font-mono tabular-nums">
                    <span className="text-emerald-700 dark:text-emerald-400 font-semibold">
                      {ward.resolvedCount}
                    </span>
                    <span className="text-slate-400"> / </span>
                    <span
                      className={
                        ward.unresolvedCount > 0
                          ? 'text-rose-700 dark:text-rose-400 font-semibold'
                          : 'text-slate-600 dark:text-slate-400'
                      }
                    >
                      {ward.unresolvedCount} open
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-right font-mono text-slate-700 dark:text-slate-300 tabular-nums">
                    ₹{ward.budgetSpentInr.toLocaleString()} / ₹
                    {(ward.budgetAllocatedInr / 1000).toFixed(0)}k
                  </td>
                  <td className="px-5 py-3.5 text-right font-mono text-slate-700 dark:text-slate-300 tabular-nums">
                    ₹{ward.escrowLockedInr.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Commuter Impact Points & Rank Upgrades */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-8 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
          <div className="border-b border-slate-200 dark:border-slate-800 px-5 py-4">
            <div className="flex items-center gap-2">
              <Award className="h-4 w-4 text-rose-600 dark:text-rose-400 shrink-0" />
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                Commuter Swarm Scouts — Impact Points &amp; Rank Progression
              </h3>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Zero-click passive commuters earn Impact Points for routine road mapping and rank up from Rookie Scout to MVP Road Captain.
            </p>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {scouts.map((scout, index) => (
              <div
                key={scout.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-3.5"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="font-mono text-xs font-bold text-slate-500 dark:text-slate-400 w-5">
                    {index + 1}.
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="font-semibold text-slate-900 dark:text-white">
                        {scout.name}
                      </span>
                      <span className="text-slate-400">·</span>
                      <span
                        className={`text-xs font-semibold ${
                          scout.rank === 'MVP Road Captain'
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : scout.rank === 'Pothole Hunter'
                            ? 'text-rose-700 dark:text-rose-400'
                            : 'text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        {scout.rank}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      {scout.corridor} · {scout.passiveKmMapped} km passively mapped ·{' '}
                      {scout.confirmedClusters} clusters confirmed
                    </div>
                  </div>
                </div>

                <div className="text-right font-mono shrink-0 tabular-nums">
                  <div className="text-base font-bold text-slate-900 dark:text-white">
                    {scout.impactPoints.toLocaleString()} pts
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">Impact Points</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Interactive Passive Swarm Check-In Simulator */}
        <div className="lg:col-span-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
          <h3 className="text-base font-semibold text-slate-900 dark:text-white">
            Passive Commute Swarm Credit
          </h3>
          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            Simulate a routine commute with passive IMU &amp; gyroscope monitoring active to award Impact Points and test rank upgrades (Rookie Scout → Corridor Watcher → Pothole Hunter → MVP Road Captain).
          </p>

          <div>
            <label
              htmlFor="scout-select"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
            >
              Commuter Profile
            </label>
            <select
              id="scout-select"
              value={selectedScoutId}
              onChange={(e) => setSelectedScoutId(e.target.value)}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:border-slate-400 focus:bg-white dark:focus:bg-slate-800 focus:outline-none"
            >
              {scouts.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.rank} · {s.impactPoints} pts)
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => handleSimulatePass(false)}
              className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2 text-xs font-semibold text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors cursor-pointer disabled:opacity-60"
            >
              <Navigation className="h-3.5 w-3.5" />
              <span>Log Passive 12 km Commute (+50 pts)</span>
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => handleSimulatePass(true)}
              className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 dark:bg-slate-100 px-3.5 py-2 text-xs font-semibold text-white dark:text-slate-950 hover:bg-slate-800 dark:hover:bg-white transition-colors cursor-pointer disabled:opacity-60"
            >
              <Trophy className="h-3.5 w-3.5" />
              <span>Confirm Swarm Hazard Cluster (+85 pts)</span>
            </button>
          </div>

          {lastEarnedMsg && (
            <div className="flex items-start gap-2 rounded-lg border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/40 p-3 text-xs text-emerald-900 dark:text-emerald-200">
              <CheckCircle2 className="h-4 w-4 text-emerald-700 dark:text-emerald-400 shrink-0 mt-0.5" />
              <span>{lastEarnedMsg}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
