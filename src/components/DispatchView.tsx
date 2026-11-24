import { useMemo, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  Download,
  HardHat,
  MapPin,
  Navigation,
  Star,
} from 'lucide-react';
import {
  CommuterScoutProfile,
  HazardReport,
  WardLeagueEntry,
  WorkerProfile,
} from '../types/routix';
import {
  formatSeverityLabel,
  formatSlaRemaining,
  formatStatusLabel,
  formatTierLabel,
  haversineDistanceKm,
} from '../utils/routixHelpers';
import { exportDispatchSummaryPdf } from '../utils/exportDispatchReport';
import { PremierLeaguePanel } from './PremierLeaguePanel';

interface DispatchViewProps {
  hazards: HazardReport[];
  workers: WorkerProfile[];
  wardLeague: WardLeagueEntry[];
  scouts: CommuterScoutProfile[];
  onAssignWorker: (hazardId: string, workerId?: string) => Promise<void>;
  onMarkReadyForVerify: (hazardId: string) => Promise<void>;
  onGoToVerify: (hazardId: string) => void;
  onLogCommutePass: (scoutId: string, clusterConfirmed: boolean) => Promise<void>;
  busyHazardId: string | null;
}

export function DispatchView({
  hazards,
  workers,
  wardLeague,
  scouts,
  onAssignWorker,
  onMarkReadyForVerify,
  onGoToVerify,
  onLogCommutePass,
  busyHazardId,
}: DispatchViewProps) {
  const [commandMode, setCommandMode] = useState<'dispatch' | 'league'>('dispatch');
  const [tierFilter, setTierFilter] = useState<
    'all' | 'micro_gig_squad' | 'tier1_contractor'
  >('all');

  const actionableHazards = useMemo(
    () => hazards.filter((h) => h.status !== 'verified'),
    [hazards]
  );

  const [selectedId, setSelectedId] = useState<string>(
    actionableHazards[0]?.id ?? hazards[0]?.id ?? ''
  );

  const selectedHazard = useMemo(
    () =>
      actionableHazards.find((h) => h.id === selectedId) ??
      actionableHazards[0] ??
      hazards[0],
    [actionableHazards, hazards, selectedId]
  );

  const selectedWardBudget = useMemo(
    () => wardLeague.find((w) => w.wardName === selectedHazard?.ward),
    [wardLeague, selectedHazard]
  );

  const rankedWorkers = useMemo(() => {
    if (!selectedHazard) return [];
    return [...workers]
      .filter((w) => tierFilter === 'all' || w.tier === tierFilter)
      .map((w) => ({
        worker: w,
        distanceKm: haversineDistanceKm(
          selectedHazard.lat,
          selectedHazard.lng,
          w.lat,
          w.lng
        ),
      }))
      .sort((a, b) => {
        if (a.worker.available !== b.worker.available) {
          return a.worker.available ? -1 : 1;
        }
        return a.distanceKm - b.distanceKm;
      });
  }, [workers, selectedHazard, tierFilter]);

  return (
    <div className="space-y-5">
      {/* Sub-navigation: Civic Command Dispatch vs Ward Premier League */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="inline-flex items-center gap-1 rounded-lg bg-slate-200/70 dark:bg-slate-800 p-1">
          <button
            type="button"
            onClick={() => setCommandMode('dispatch')}
            className={`rounded-md px-4 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              commandMode === 'dispatch'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Civic Command &amp; SLA Dispatch
          </button>
          <button
            type="button"
            onClick={() => setCommandMode('league')}
            className={`rounded-md px-4 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              commandMode === 'league'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Ward Premier League &amp; Commuter Ranks
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {selectedWardBudget && commandMode === 'dispatch' && (
            <div className="text-xs text-slate-600 dark:text-slate-400 font-mono tabular-nums">
              <span className="font-sans font-medium text-slate-800 dark:text-slate-200">
                {selectedWardBudget.wardName}
              </span>{' '}
              · Budget Spent ₹{selectedWardBudget.budgetSpentInr.toLocaleString()} / ₹
              {selectedWardBudget.budgetAllocatedInr.toLocaleString()}
            </div>
          )}
          <button
            type="button"
            onClick={() => exportDispatchSummaryPdf(hazards, workers)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200 hover:bg-slate-900 dark:hover:bg-slate-100 hover:text-white dark:hover:text-slate-950 hover:border-slate-900 dark:hover:border-slate-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Download Report</span>
          </button>
        </div>
      </div>

      {commandMode === 'league' ? (
        <PremierLeaguePanel
          wardLeague={wardLeague}
          scouts={scouts}
          onLogCommutePass={onLogCommutePass}
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left: Prioritized PSI Tickets with SLA Countdowns */}
          <div className="lg:col-span-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
            <div className="border-b border-slate-200 dark:border-slate-800 px-5 py-4">
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                01. Civic Command PSI Queue &amp; SLAs
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Ranked by Pothole Severity Index (PSI) with live municipal SLA countdowns.
              </p>
            </div>

            {actionableHazards.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
                All hazards have been patched and verified.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {actionableHazards.map((h) => {
                  const isSelected = selectedHazard?.id === h.id;
                  const sla = formatSlaRemaining(h.slaDeadlineAt);
                  return (
                    <button
                      key={h.id}
                      type="button"
                      onClick={() => setSelectedId(h.id)}
                      className={`w-full text-left px-5 py-3.5 transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-slate-50 dark:bg-slate-800/80'
                          : 'hover:bg-slate-50/70 dark:hover:bg-slate-800/50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                            <span className="font-mono font-medium text-slate-800 dark:text-slate-200">
                              {h.id}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>{formatSeverityLabel(h.severity)}</span>
                            <span aria-hidden="true">·</span>
                            <span
                              className={`inline-flex items-center gap-1 font-mono tabular-nums ${
                                sla.urgent
                                  ? 'text-rose-700 dark:text-rose-400 font-semibold'
                                  : 'text-slate-600 dark:text-slate-300'
                              }`}
                            >
                              <Clock className="h-3 w-3" />
                              {sla.text}
                            </span>
                          </div>
                          <div className="mt-1 text-sm font-semibold text-slate-900 dark:text-white truncate">
                            {h.streetName}
                          </div>
                          <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                            {h.ward} · {h.repairMaterialEstimate}
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <div className="font-mono text-base font-bold text-slate-900 dark:text-white tabular-nums">
                            {h.priorityScore}
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400">PSI</div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right: Tier-1 Contractors & 2-5 km Micro-Gig Squads */}
          <div className="lg:col-span-7 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 px-5 py-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                  02. Contractor &amp; Micro-Gig Dispatch (IRC:SP:100)
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {selectedHazard
                    ? `15–30 min cold-mix flush repair · ${selectedHazard.ward}`
                    : 'Select a hazard to dispatch'}
                </p>
              </div>
              {selectedHazard && selectedHazard.status === 'open' && (
                <button
                  type="button"
                  disabled={busyHazardId === selectedHazard.id}
                  onClick={() => onAssignWorker(selectedHazard.id)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 dark:bg-slate-100 px-3.5 py-2 text-xs font-semibold text-white dark:text-slate-950 hover:bg-slate-800 dark:hover:bg-white transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
                >
                  <Navigation className="h-3.5 w-3.5" />
                  <span>
                    {busyHazardId === selectedHazard.id
                      ? 'Dispatching...'
                      : 'One-Tap Auto Dispatch'}
                  </span>
                </button>
              )}
            </div>

            {selectedHazard && (
              <div className="p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-1 rounded-lg bg-slate-100 dark:bg-slate-800 p-1">
                    {(
                      [
                        { id: 'all', label: 'All Crews' },
                        { id: 'micro_gig_squad', label: 'Micro-Gig Squads (2–5 km)' },
                        { id: 'tier1_contractor', label: 'Tier-1 Contractors' },
                      ] as const
                    ).map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setTierFilter(t.id)}
                        className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                          tierFilter === t.id
                            ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                  <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                    Status: {formatStatusLabel(selectedHazard.status)}
                  </span>
                </div>

                {selectedHazard.status === 'dispatched' && (
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-amber-200 dark:border-amber-900/70 bg-amber-50/70 dark:bg-amber-950/40 px-4 py-3 text-sm text-amber-950 dark:text-amber-100">
                    <div>
                      <span className="font-semibold">
                        {selectedHazard.assignedWorkerName}
                      </span>{' '}
                      dispatched ({selectedHazard.assignedDistanceKm} km away). Funds locked in Municipal Escrow pending CV Proof-of-Work.
                    </div>
                    <button
                      type="button"
                      disabled={busyHazardId === selectedHazard.id}
                      onClick={async () => {
                        await onMarkReadyForVerify(selectedHazard.id);
                        onGoToVerify(selectedHazard.id);
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 dark:bg-slate-100 px-3 py-1.5 text-xs font-medium text-white dark:text-slate-950 hover:bg-slate-800 dark:hover:bg-white whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <span>Cold-Mix Done · Verify</span>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}

                {selectedHazard.status === 'pending_verification' && (
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-sky-200 dark:border-sky-900/70 bg-sky-50 dark:bg-sky-950/40 px-4 py-3 text-sm text-sky-950 dark:text-sky-100">
                    <div>
                      Patch completed by{' '}
                      <span className="font-semibold">
                        {selectedHazard.assignedWorkerName}
                      </span>
                      . Ready for geotagged CV Proof-of-Work &amp; DBT payout.
                    </div>
                    <button
                      type="button"
                      onClick={() => onGoToVerify(selectedHazard.id)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-800 whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <span>Run CV Audit</span>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}

                <div className="divide-y divide-slate-100 dark:divide-slate-800 rounded-lg border border-slate-200 dark:border-slate-800">
                  {rankedWorkers.map(({ worker, distanceKm }) => {
                    const isAssignedHere =
                      selectedHazard.assignedWorkerId === worker.id;
                    const etaMins = Math.max(4, Math.round(distanceKm * 4.5));
                    const withinMicroRadius = distanceKm <= 5.0;

                    return (
                      <div
                        key={worker.id}
                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-4 py-3.5"
                      >
                        <div className="flex items-start gap-3 min-w-0">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                            <HardHat className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-white">
                              <span>{worker.name}</span>
                              <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
                                · {formatTierLabel(worker.tier)}
                              </span>
                              {worker.priorityTenderUnlocked && (
                                <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                                  · Priority Tenders
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-slate-600 dark:text-slate-400 mt-0.5 truncate">
                              {worker.specialty} · {worker.neighborhood}
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                              <span className="inline-flex items-center gap-1 text-slate-700 dark:text-slate-300">
                                <MapPin className="h-3 w-3" />
                                {distanceKm} km (~{etaMins} min)
                                {withinMicroRadius ? ' · In 5km radius' : ''}
                              </span>
                              <span aria-hidden="true">·</span>
                              <span className="inline-flex items-center gap-0.5">
                                <Star className="h-3 w-3 text-amber-500" />
                                {worker.rating.toFixed(1)}
                              </span>
                              <span aria-hidden="true">·</span>
                              <span>Avg {worker.avgTurnaroundMins}m patch</span>
                            </div>
                          </div>
                        </div>

                        <div className="shrink-0">
                          {isAssignedHere ? (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400 whitespace-nowrap">
                              <CheckCircle2 className="h-4 w-4" />
                              <span>Dispatched</span>
                            </span>
                          ) : (
                            <button
                              type="button"
                              disabled={
                                !worker.available ||
                                selectedHazard.status === 'verified' ||
                                busyHazardId === selectedHazard.id
                              }
                              onClick={() =>
                                onAssignWorker(selectedHazard.id, worker.id)
                              }
                              className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-800 dark:text-slate-200 hover:bg-slate-900 dark:hover:bg-slate-100 hover:text-white dark:hover:text-slate-950 hover:border-slate-900 dark:hover:border-slate-100 transition-colors whitespace-nowrap cursor-pointer disabled:opacity-40 disabled:pointer-events-none"
                            >
                              Dispatch (₹{selectedHazard.microJobPayoutInr})
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
