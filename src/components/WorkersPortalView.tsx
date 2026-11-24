import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  HardHat,
  Landmark,
  MapPin,
  Star,
  UserPlus,
} from 'lucide-react';
import { UserAccountProfile } from '../types/account';
import { HazardReport, WorkerProfile } from '../types/routix';
import {
  formatRelativeTime,
  formatSeverityLabel,
  formatTierLabel,
  haversineDistanceKm,
} from '../utils/routixHelpers';

interface WorkersPortalViewProps {
  hazards: HazardReport[];
  workers: WorkerProfile[];
  accountProfile?: UserAccountProfile | null;
  accountPhone?: string;
  onRefresh: () => Promise<void>;
  onApproveApplicant: (hazardId: string, workerId: string) => Promise<void>;
  onGoToVerify: (hazardId: string) => void;
}

const ZONE_COORDS = [
  { label: 'Indiranagar · Halasuru', lat: 12.9742, lng: 77.6345 },
  { label: 'Koramangala · HSR Layout', lat: 12.9311, lng: 77.6302 },
  { label: 'Domlur · Trinity Circle', lat: 12.9665, lng: 77.6288 },
  { label: 'Bellandur · Marathahalli', lat: 12.934, lng: 77.6845 },
  { label: 'Jayanagar · BTM Layout', lat: 12.9221, lng: 77.5934 },
  { label: 'Malleshwaram · Yeshwanthpur', lat: 13.0068, lng: 77.5692 },
];

const SPECIALTIES = [
  'IRC:SP:100 Rapid Cold-Mix Squad',
  'Tier-1 Arterial Asphalt Contractor',
  'Drainage Clearing & Base Prep',
  'Bitumen Edge Sealing',
  'Two-Wheeler Corridor Patching',
];

export function WorkersPortalView({
  hazards,
  workers,
  accountProfile,
  accountPhone,
  onRefresh,
  onApproveApplicant,
  onGoToVerify,
}: WorkersPortalViewProps) {
  const [subTab, setSubTab] = useState<'apply' | 'govt_grants'>(
    accountProfile?.role === 'government' ? 'govt_grants' : 'apply'
  );
  const [selectedApplicantWorkerId, setSelectedApplicantWorkerId] =
    useState<string>(workers[0]?.id ?? '');
  const [jobNotes, setJobNotes] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // New Worker Registration state
  const [workerName, setWorkerName] = useState('');
  const [workerZone, setWorkerZone] = useState(ZONE_COORDS[0].label);
  const [workerSpecialty, setWorkerSpecialty] = useState(SPECIALTIES[0]);
  const [workerTier, setWorkerTier] = useState<'micro_gig_squad' | 'tier1_contractor'>(
    'micro_gig_squad'
  );
  const [workerEquipment, setWorkerEquipment] = useState(
    'IRC:SP:100 cold-mix bags & vibratory plate tamper'
  );
  const [workerPhone, setWorkerPhone] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);

  // Authority name for govt grant sanctioning
  const [authorityName, setAuthorityName] = useState(
    'Municipal Escrow Treasury'
  );

  useEffect(() => {
    if (!accountProfile) return;
    if (accountProfile.role === 'worker' && !workerName) {
      setWorkerName(accountProfile.displayName);
    }
    if (accountPhone && !workerPhone) {
      setWorkerPhone(accountPhone);
    }
    if (
      accountProfile.role === 'government' ||
      accountProfile.role === 'municipality_officer'
    ) {
      setAuthorityName(
        `${accountProfile.displayName} (${accountProfile.organization})`
      );
    }
  }, [accountProfile, accountPhone, workerName, workerPhone]);

  const openJobs = useMemo(
    () => hazards.filter((h) => h.status === 'open'),
    [hazards]
  );

  const completedRepairs = useMemo(
    () => hazards.filter((h) => h.status === 'verified'),
    [hazards]
  );

  const grantTotals = useMemo(() => {
    let totalSanctionedInr = 0;
    let pendingSanctionInr = 0;
    let sanctionedCount = 0;
    let pendingCount = 0;

    for (const h of completedRepairs) {
      if (h.govtGrantStatus === 'sanctioned') {
        totalSanctionedInr += h.govtSanctionedAmountInr ?? h.microJobPayoutInr;
        sanctionedCount += 1;
      } else {
        pendingSanctionInr += h.microJobPayoutInr;
        pendingCount += 1;
      }
    }

    return {
      totalSanctionedInr,
      pendingSanctionInr,
      sanctionedCount,
      pendingCount,
    };
  }, [completedRepairs]);

  const handleApplyForJob = async (hazardId: string) => {
    const workerId = selectedApplicantWorkerId || workers[0]?.id;
    if (!workerId) return;

    setBusyId(hazardId);
    setFeedback(null);
    try {
      const res = await fetch(`/api/hazards/${hazardId}/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workerId,
          note: jobNotes[hazardId] || '',
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Could not submit application.');
      }
      setJobNotes((prev) => ({ ...prev, [hazardId]: '' }));
      setFeedback({
        type: 'success',
        message: `Application submitted for ${hazardId}.`,
      });
      await onRefresh();
    } catch (err) {
      setFeedback({
        type: 'error',
        message:
          err instanceof Error ? err.message : 'Unable to submit application.',
      });
    } finally {
      setBusyId(null);
    }
  };

  const handleRegisterWorker = async (e: FormEvent) => {
    e.preventDefault();
    if (!workerName.trim()) {
      setFeedback({
        type: 'error',
        message: 'Please enter the worker full name.',
      });
      return;
    }

    setIsRegistering(true);
    setFeedback(null);
    try {
      const zoneObj =
        ZONE_COORDS.find((z) => z.label === workerZone) ?? ZONE_COORDS[0];
      const res = await fetch('/api/workers/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: workerName,
          neighborhood: workerZone,
          specialty: workerSpecialty,
          tier: workerTier,
          equipment: workerEquipment,
          phone: workerPhone,
          lat: zoneObj.lat,
          lng: zoneObj.lng,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Worker registration failed.');
      }
      setWorkerName('');
      setWorkerPhone('');
      setSelectedApplicantWorkerId(data.worker.id);
      setFeedback({
        type: 'success',
        message: `${data.worker.name} registered to the Routix workforce and can now apply for micro-gigs & DBT payouts.`,
      });
      await onRefresh();
    } catch (err) {
      setFeedback({
        type: 'error',
        message:
          err instanceof Error ? err.message : 'Worker registration failed.',
      });
    } finally {
      setIsRegistering(false);
    }
  };

  const handleSanctionGrant = async (hazardId: string) => {
    setBusyId(hazardId);
    setFeedback(null);
    try {
      const res = await fetch(`/api/hazards/${hazardId}/sanction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ authorityName }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Could not disburse DBT funds.');
      }
      setFeedback({
        type: 'success',
        message: `Released ₹${data.hazard.govtSanctionedAmountInr} via DBT (${data.hazard.dbtTxnRef} · ${data.hazard.govtSanctionRef}).`,
      });
      await onRefresh();
    } catch (err) {
      setFeedback({
        type: 'error',
        message:
          err instanceof Error
            ? err.message
            : 'Unable to disburse government grant.',
      });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-5">
      {/* Summary Strip for Micro-Gigs & Municipal Escrow DBT */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-200 dark:divide-slate-800 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <div className="px-5 py-3.5">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Govt Money Disbursed (DBT)
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="font-mono text-2xl font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
              ₹{grantTotals.totalSanctionedInr.toLocaleString()}
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {grantTotals.sanctionedCount} escrow releases
            </span>
          </div>
        </div>

        <div className="px-5 py-3.5">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Escrow Ready for Sanction
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="font-mono text-2xl font-bold text-amber-700 dark:text-amber-400 tabular-nums">
              ₹{grantTotals.pendingSanctionInr.toLocaleString()}
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {grantTotals.pendingCount} CV-audited repairs
            </span>
          </div>
        </div>

        <div className="px-5 py-3.5">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Open Micro-Gigs (2–5 km)
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="font-mono text-2xl font-bold text-slate-900 dark:text-white tabular-nums">
              {openJobs.length}
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              accepting applications
            </span>
          </div>
        </div>

        <div className="px-5 py-3.5">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Registered Crews &amp; Workers
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="font-mono text-2xl font-bold text-slate-900 dark:text-white tabular-nums">
              {workers.length}
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              micro-squads &amp; Tier-1
            </span>
          </div>
        </div>
      </div>

      {/* Sub-navigation Segmented Toggle */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="inline-flex items-center gap-1 rounded-lg bg-slate-200/70 dark:bg-slate-800 p-1">
          <button
            type="button"
            onClick={() => setSubTab('apply')}
            className={`rounded-md px-4 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              subTab === 'apply'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Worker Applications &amp; Open Micro-Gigs
          </button>
          <button
            type="button"
            onClick={() => setSubTab('govt_grants')}
            className={`rounded-md px-4 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              subTab === 'govt_grants'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Govt Sanctioned Money &amp; DBT ({completedRepairs.length})
          </button>
        </div>

        {feedback && (
          <div
            className={`flex items-center gap-2 rounded-lg border px-3.5 py-2 text-xs ${
              feedback.type === 'success'
                ? 'border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200'
                : 'border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/50 text-rose-900 dark:text-rose-200'
            }`}
          >
            {feedback.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-700 dark:text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 text-rose-700 dark:text-rose-400 shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
        )}
      </div>

      {subTab === 'apply' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left: Open Repair Jobs Where Workers Apply */}
          <div className="lg:col-span-7 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 px-5 py-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                  Open Micro-Gigs — Apply as Worker / Crew
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Apply for localized 15–30 min IRC:SP:100 cold-mix repairs with guaranteed escrow DBT payout after CV verification.
                </p>
              </div>
              <div className="shrink-0">
                <label htmlFor="applicant-worker-select" className="sr-only">
                  Applying as worker
                </label>
                <select
                  id="applicant-worker-select"
                  value={selectedApplicantWorkerId}
                  onChange={(e) => setSelectedApplicantWorkerId(e.target.value)}
                  className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-800 dark:text-slate-100 focus:border-slate-400 focus:bg-white dark:focus:bg-slate-800 focus:outline-none"
                >
                  {workers.map((w) => (
                    <option key={w.id} value={w.id}>
                      Apply as: {w.name} ({formatTierLabel(w.tier)})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {openJobs.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
                No open repair tasks right now. Report a new hazard in AI Detect to create a micro-gig.
              </div>
            ) : (
              <div className="divide-y divide-slate-200 dark:divide-slate-800">
                {openJobs.map((job) => {
                  const activeWorker = workers.find(
                    (w) => w.id === selectedApplicantWorkerId
                  );
                  const distKm = activeWorker
                    ? haversineDistanceKm(
                        job.lat,
                        job.lng,
                        activeWorker.lat,
                        activeWorker.lng
                      )
                    : null;
                  const alreadyApplied = job.applications?.some(
                    (a) => a.workerId === selectedApplicantWorkerId
                  );

                  return (
                    <div key={job.id} className="p-5 space-y-3">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                            <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                              {job.id}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span className="text-rose-700 dark:text-rose-400 font-medium">
                              {formatSeverityLabel(job.severity)} (PSI {job.priorityScore})
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>{job.ward}</span>
                            <span aria-hidden="true">·</span>
                            <span>{formatRelativeTime(job.reportedAt)}</span>
                          </div>
                          <h3 className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">
                            {job.streetName} — {job.title}
                          </h3>
                          <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">
                            {job.repairMaterialEstimate} · {job.recommendedAction}
                          </p>
                        </div>

                        <div className="text-right shrink-0">
                          <div className="font-mono text-base font-bold text-slate-900 dark:text-white tabular-nums">
                            ₹{job.microJobPayoutInr.toLocaleString()}
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400">
                            Govt Escrow
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                        <input
                          type="text"
                          value={jobNotes[job.id] ?? ''}
                          onChange={(e) =>
                            setJobNotes((prev) => ({
                              ...prev,
                              [job.id]: e.target.value,
                            }))
                          }
                          placeholder={
                            distKm !== null
                              ? `Optional note (e.g. ${distKm} km away, carrying IRC:SP:100 bags)...`
                              : 'Optional mobilization note...'
                          }
                          className="flex-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-1.5 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-slate-400 focus:bg-white dark:focus:bg-slate-800 focus:outline-none"
                        />
                        <button
                          type="button"
                          disabled={alreadyApplied || busyId === job.id}
                          onClick={() => handleApplyForJob(job.id)}
                          className="rounded-lg bg-slate-900 dark:bg-slate-100 px-3.5 py-1.5 text-xs font-semibold text-white dark:text-slate-950 hover:bg-slate-800 dark:hover:bg-white transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
                        >
                          {alreadyApplied
                            ? 'Already Applied'
                            : busyId === job.id
                            ? 'Applying...'
                            : 'Apply for Job'}
                        </button>
                      </div>

                      {job.applications && job.applications.length > 0 && (
                        <div className="border-t border-slate-100 dark:border-slate-800 pt-2.5 space-y-2">
                          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                            Worker Applications ({job.applications.length})
                          </div>
                          {job.applications.map((app) => (
                            <div
                              key={app.id}
                              className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 dark:bg-slate-800/70 px-3 py-2 text-xs"
                            >
                              <div className="min-w-0">
                                <span className="font-semibold text-slate-900 dark:text-white">
                                  {app.workerName}
                                </span>
                                <span className="text-slate-500 dark:text-slate-400 font-mono">
                                  {' '}
                                  · {app.distanceKm} km away
                                </span>
                                <span className="text-slate-600 dark:text-slate-300">
                                  {' '}
                                  — {app.note}
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={() =>
                                  onApproveApplicant(job.id, app.workerId)
                                }
                                className="rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-2.5 py-1 text-xs font-medium text-slate-800 dark:text-slate-200 hover:bg-slate-900 dark:hover:bg-slate-100 hover:text-white dark:hover:text-slate-950 hover:border-slate-900 dark:hover:border-slate-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                              >
                                Approve &amp; Assign
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right: Register New Worker Application + Roster */}
          <div className="lg:col-span-5 space-y-6">
            <form
              onSubmit={handleRegisterWorker}
              className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4"
            >
              <div className="flex items-center gap-2">
                <UserPlus className="h-4 w-4 text-rose-600 dark:text-rose-400 shrink-0" />
                <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                  Apply to Join Routix Workforce
                </h2>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Daily-wage patch squads (2–5 km radius) and empanelled Tier-1 contractors can register here for rapid cold-mix gigs and Direct Benefit Transfer (DBT) payouts.
              </p>

              <div className="space-y-3">
                <div>
                  <label
                    htmlFor="reg-worker-name"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                  >
                    Full Name / Crew Lead
                  </label>
                  <input
                    id="reg-worker-name"
                    type="text"
                    required
                    value={workerName}
                    onChange={(e) => setWorkerName(e.target.value)}
                    placeholder="e.g. Suresh Babu"
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:border-slate-400 focus:bg-white dark:focus:bg-slate-800 focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label
                      htmlFor="reg-worker-tier"
                      className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                    >
                      Execution Tier
                    </label>
                    <select
                      id="reg-worker-tier"
                      value={workerTier}
                      onChange={(e) =>
                        setWorkerTier(
                          e.target.value as 'micro_gig_squad' | 'tier1_contractor'
                        )
                      }
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-xs text-slate-900 dark:text-slate-100 focus:border-slate-400 focus:bg-white dark:focus:bg-slate-800 focus:outline-none"
                    >
                      <option value="micro_gig_squad">Micro-Gig Squad (2–5 km)</option>
                      <option value="tier1_contractor">Tier-1 Contractor</option>
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="reg-worker-zone"
                      className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                    >
                      Operating Ward Zone
                    </label>
                    <select
                      id="reg-worker-zone"
                      value={workerZone}
                      onChange={(e) => setWorkerZone(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-xs text-slate-900 dark:text-slate-100 focus:border-slate-400 focus:bg-white dark:focus:bg-slate-800 focus:outline-none"
                    >
                      {ZONE_COORDS.map((z) => (
                        <option key={z.label} value={z.label}>
                          {z.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="reg-worker-specialty"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                  >
                    Repair Specialty
                  </label>
                  <select
                    id="reg-worker-specialty"
                    value={workerSpecialty}
                    onChange={(e) => setWorkerSpecialty(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:border-slate-400 focus:bg-white dark:focus:bg-slate-800 focus:outline-none"
                  >
                    {SPECIALTIES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label
                      htmlFor="reg-worker-equipment"
                      className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                    >
                      Tools &amp; Cold-Mix Kit
                    </label>
                    <input
                      id="reg-worker-equipment"
                      type="text"
                      value={workerEquipment}
                      onChange={(e) => setWorkerEquipment(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-xs text-slate-900 dark:text-slate-100 focus:border-slate-400 focus:bg-white dark:focus:bg-slate-800 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="reg-worker-phone"
                      className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                    >
                      DBT Bank-Linked Mobile
                    </label>
                    <input
                      id="reg-worker-phone"
                      type="tel"
                      value={workerPhone}
                      onChange={(e) => setWorkerPhone(e.target.value)}
                      placeholder="+91 98450 11223"
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-xs text-slate-900 dark:text-slate-100 focus:border-slate-400 focus:bg-white dark:focus:bg-slate-800 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={isRegistering}
                className="w-full rounded-lg bg-slate-900 dark:bg-slate-100 px-4 py-2.5 text-sm font-semibold text-white dark:text-slate-950 hover:bg-slate-800 dark:hover:bg-white transition-colors cursor-pointer disabled:opacity-60"
              >
                {isRegistering
                  ? 'Submitting Worker Application...'
                  : 'Submit Worker Application'}
              </button>
            </form>

            {/* Compact Verified Workforce Earnings List */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
              <div className="border-b border-slate-200 dark:border-slate-800 px-5 py-3.5">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Registered Workforce &amp; Performance Ratings ({workers.length})
                </h3>
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-[280px] overflow-y-auto">
                {workers.map((w) => (
                  <div
                    key={w.id}
                    className="flex items-center justify-between gap-3 px-5 py-3 text-xs"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5 font-semibold text-slate-900 dark:text-white">
                        <HardHat className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400 shrink-0" />
                        <span className="truncate">{w.name}</span>
                        <span className="font-normal text-slate-500 dark:text-slate-400">
                          · {formatTierLabel(w.tier)}
                        </span>
                        {w.priorityTenderUnlocked && (
                          <span className="font-medium text-emerald-700 dark:text-emerald-400">
                            · Priority Tenders
                          </span>
                        )}
                      </div>
                      <div className="text-slate-500 dark:text-slate-400 truncate mt-0.5">
                        {w.neighborhood} · Avg {w.avgTurnaroundMins}m patch
                      </div>
                    </div>
                    <div className="text-right font-mono shrink-0 tabular-nums">
                      <div className="font-semibold text-slate-900 dark:text-white">
                        ₹{w.totalEarnedInr.toLocaleString()}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-end gap-1">
                        <Star className="h-3 w-3 text-amber-500" />
                        <span>
                          {w.rating.toFixed(1)} · {w.completedRepairs} jobs
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Government Sanctioned Money After Completion via Direct Benefit Transfer (DBT) */
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 px-5 py-4">
            <div>
              <div className="flex items-center gap-2">
                <Landmark className="h-4 w-4 text-emerald-700 dark:text-emerald-400 shrink-0" />
                <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                  Government Sanctioned Money &amp; Municipal Escrow DBT Ledger
                </h2>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                After geotagged before/after CV proof-of-work passes, funds disburse from the Municipal Escrow Pool directly to the worker or contractor via DBT within hours.
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <label
                htmlFor="govt-authority-input"
                className="text-xs font-medium text-slate-600 dark:text-slate-400 whitespace-nowrap"
              >
                Escrow Authority:
              </label>
              <input
                id="govt-authority-input"
                type="text"
                value={authorityName}
                onChange={(e) => setAuthorityName(e.target.value)}
                className="w-56 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-1.5 text-xs text-slate-900 dark:text-slate-100 focus:border-slate-400 focus:bg-white dark:focus:bg-slate-800 focus:outline-none"
              />
            </div>
          </div>

          {completedRepairs.length === 0 ? (
            <div className="p-10 text-center space-y-2">
              <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                No CV-verified repairs awaiting government DBT sanction yet.
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Complete a repair and pass before/after CV inspection in Verify to unlock Municipal Escrow disbursement.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/70 text-xs font-medium text-slate-500 dark:text-slate-400">
                    <th className="px-5 py-3">Repair &amp; Ward</th>
                    <th className="px-4 py-3">Worker / Contractor</th>
                    <th className="px-4 py-3">CV Proof-of-Work</th>
                    <th className="px-4 py-3">Escrow &amp; DBT Status</th>
                    <th className="px-4 py-3 text-right">Sanctioned</th>
                    <th className="px-5 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                  {completedRepairs.map((h) => {
                    const isSanctioned = h.govtGrantStatus === 'sanctioned';
                    return (
                      <tr key={h.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/50">
                        <td className="px-5 py-3.5">
                          <div className="font-mono text-xs text-slate-500 dark:text-slate-400">
                            {h.id} · {h.ward}
                          </div>
                          <div className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5 mt-0.5">
                            <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                            <span>{h.streetName}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-xs text-slate-700 dark:text-slate-300">
                          <div className="font-semibold text-slate-900 dark:text-white">
                            {h.assignedWorkerName || 'Unassigned'}
                          </div>
                          <div className="text-slate-500 dark:text-slate-400">
                            {h.repairMaterialEstimate}
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-xs">
                          <div className="inline-flex items-center gap-1 font-semibold text-emerald-700 dark:text-emerald-400">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            <span>
                              {h.verification?.surfaceFlushnessScore ?? 90}% flush · Geotag OK
                            </span>
                          </div>
                          <div className="text-slate-500 dark:text-slate-400 mt-0.5">
                            {h.verification?.verifiedAt
                              ? formatRelativeTime(h.verification.verifiedAt)
                              : 'Audited'}
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-xs">
                          {isSanctioned ? (
                            <div>
                              <div className="font-semibold text-emerald-700 dark:text-emerald-400">
                                Disbursed via DBT
                              </div>
                              <div className="font-mono text-slate-500 dark:text-slate-400 mt-0.5">
                                {h.dbtTxnRef || 'DBT-IN-VERIFIED'} · {h.govtSanctionRef}
                              </div>
                            </div>
                          ) : (
                            <div>
                              <div className="font-semibold text-amber-700 dark:text-amber-400">
                                Escrow Locked · Pending Sanction
                              </div>
                              <div className="text-slate-500 dark:text-slate-400 mt-0.5">
                                Ready for instant DBT release
                              </div>
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-right font-mono font-bold text-slate-900 dark:text-white tabular-nums">
                          ₹
                          {(
                            h.govtSanctionedAmountInr ?? h.microJobPayoutInr
                          ).toLocaleString()}
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          {isSanctioned ? (
                            <button
                              type="button"
                              onClick={() => onGoToVerify(h.id)}
                              className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 whitespace-nowrap cursor-pointer"
                            >
                              View Audit
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled={busyId === h.id}
                              onClick={() => handleSanctionGrant(h.id)}
                              className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800 transition-colors whitespace-nowrap cursor-pointer disabled:opacity-60"
                            >
                              {busyId === h.id
                                ? 'Releasing DBT...'
                                : 'Sanction & Release DBT'}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
