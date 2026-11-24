import { ChangeEvent, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Cpu,
  Landmark,
  MapPin,
  ShieldCheck,
  Upload,
  XCircle,
} from 'lucide-react';
import { HazardReport, RepairVerificationResult } from '../types/routix';
import {
  fileToBase64,
  formatStatusLabel,
  SAMPLE_IMAGES,
  urlToBase64,
} from '../utils/routixHelpers';

interface VerifyViewProps {
  hazards: HazardReport[];
  selectedHazardId: string | null;
  onVerifiedSuccess: (hazard: HazardReport) => void;
  onGoToWorkersGrants: () => void;
}

export function VerifyView({
  hazards,
  selectedHazardId,
  onVerifiedSuccess,
  onGoToWorkersGrants,
}: VerifyViewProps) {
  const orderedHazards = useMemo(() => {
    const priorityOrder: Record<HazardReport['status'], number> = {
      pending_verification: 0,
      dispatched: 1,
      open: 2,
      verified: 3,
    };
    return [...hazards].sort(
      (a, b) => priorityOrder[a.status] - priorityOrder[b.status]
    );
  }, [hazards]);

  const [activeId, setActiveId] = useState<string>(
    selectedHazardId ?? orderedHazards[0]?.id ?? ''
  );

  useEffect(() => {
    if (selectedHazardId) {
      setActiveId(selectedHazardId);
    }
  }, [selectedHazardId]);

  const activeHazard = useMemo(
    () =>
      orderedHazards.find((h) => h.id === activeId) ?? orderedHazards[0],
    [orderedHazards, activeId]
  );

  const [afterPreview, setAfterPreview] = useState<string>(
    activeHazard?.afterPhotoUrl || SAMPLE_IMAGES.repaired
  );
  const [afterBase64, setAfterBase64] = useState<string>('');
  const [afterMimeType, setAfterMimeType] = useState<string>('image/jpeg');
  const [isVerifying, setIsVerifying] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [latestResult, setLatestResult] =
    useState<RepairVerificationResult | null>(
      activeHazard?.verification ?? null
    );

  useEffect(() => {
    if (activeHazard) {
      setAfterPreview(activeHazard.afterPhotoUrl || SAMPLE_IMAGES.repaired);
      setAfterBase64('');
      setLatestResult(activeHazard.verification ?? null);
      setErrorMsg(null);
    }
  }, [activeHazard]);

  const handleAfterUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorMsg(null);
    setLatestResult(null);
    try {
      const encoded = await fileToBase64(file);
      setAfterPreview(encoded.base64);
      setAfterBase64(encoded.base64);
      setAfterMimeType(encoded.mimeType);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to read image.');
    }
  };

  const handleRunVerification = async () => {
    if (!activeHazard) return;
    setIsVerifying(true);
    setErrorMsg(null);

    try {
      const beforeEncoded = await urlToBase64(activeHazard.photoUrl);
      let afterEncoded = { base64: afterBase64, mimeType: afterMimeType };
      if (!afterEncoded.base64) {
        afterEncoded = await urlToBase64(afterPreview);
      }

      const res = await fetch('/api/verify-repair', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hazardId: activeHazard.id,
          beforeImageBase64: beforeEncoded.base64,
          beforeMimeType: beforeEncoded.mimeType,
          afterImageBase64: afterEncoded.base64,
          afterMimeType: afterEncoded.mimeType,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'CV Proof-of-Work audit failed.');
      }

      setLatestResult(data.verification as RepairVerificationResult);
      if (data.hazard) {
        onVerifiedSuccess(data.hazard as HazardReport);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Verification failed.');
    } finally {
      setIsVerifying(false);
    }
  };

  if (!activeHazard) {
    return (
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-10 text-center text-sm text-slate-500 dark:text-slate-400">
        No hazard records available for verification.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Left: Task Selector */}
      <div className="lg:col-span-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
        <div className="border-b border-slate-200 dark:border-slate-800 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">
            CV Proof-of-Work Queue
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Dual-image audit checks compaction, flush alignment, and GPS geotag authenticity before escrow release.
          </p>
        </div>

        <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-[540px] overflow-y-auto">
          {orderedHazards.map((h) => {
            const active = h.id === activeHazard.id;
            return (
              <button
                key={h.id}
                type="button"
                onClick={() => setActiveId(h.id)}
                className={`w-full text-left px-5 py-3.5 transition-colors cursor-pointer ${
                  active
                    ? 'bg-slate-50 dark:bg-slate-800/80'
                    : 'hover:bg-slate-50/70 dark:hover:bg-slate-800/50'
                }`}
              >
                <div className="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <span className="font-mono font-medium text-slate-700 dark:text-slate-300">
                    {h.id}
                  </span>
                  <span
                    className={
                      h.status === 'verified'
                        ? 'font-semibold text-emerald-700 dark:text-emerald-400'
                        : h.status === 'pending_verification'
                        ? 'font-semibold text-sky-700 dark:text-sky-400'
                        : 'text-slate-600 dark:text-slate-300'
                    }
                  >
                    {formatStatusLabel(h.status)}
                  </span>
                </div>
                <div className="mt-1 text-sm font-semibold text-slate-900 dark:text-white truncate">
                  {h.streetName}
                </div>
                <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  {h.assignedWorkerName
                    ? `Crew: ${h.assignedWorkerName}`
                    : 'Unassigned'}{' '}
                  · Escrow ₹{h.microJobPayoutInr}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Right: Before vs After Comparison + Geotag & Escrow DBT */}
      <div className="lg:col-span-8 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-4">
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400 font-mono">
              {activeHazard.id} · {activeHazard.ward}
            </div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mt-0.5">
              {activeHazard.streetName}
            </h2>
            <div className="mt-1 flex items-center gap-1.5 text-xs font-mono text-slate-600 dark:text-slate-400">
              <MapPin className="h-3.5 w-3.5 text-rose-600 dark:text-rose-400 shrink-0" />
              <span>
                Geotag: {activeHazard.lat.toFixed(4)}, {activeHazard.lng.toFixed(4)}
              </span>
              <span aria-hidden="true">·</span>
              <span>{activeHazard.repairMaterialEstimate}</span>
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-slate-500 dark:text-slate-400">Municipal Escrow Pool</div>
            <div className="font-mono text-base font-bold text-slate-900 dark:text-white tabular-nums">
              ₹{activeHazard.microJobPayoutInr.toLocaleString()}
            </div>
          </div>
        </div>

        {/* Before / After Image Pair */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300">
              <span>Before Repair (Geotagged Hazard)</span>
              <span className="font-mono text-rose-700 dark:text-rose-400">
                PSI {activeHazard.priorityScore}
              </span>
            </div>
            <div className="aspect-4/3 w-full overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800">
              <img
                src={activeHazard.photoUrl}
                alt="Before repair road hazard"
                referrerPolicy="no-referrer"
                className="h-full w-full object-cover"
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300">
              <span>After Repair (IRC:SP:100 Patch)</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setAfterPreview(SAMPLE_IMAGES.repaired);
                    setAfterBase64('');
                    setLatestResult(null);
                  }}
                  className="text-xs font-medium text-slate-600 dark:text-slate-400 underline hover:text-slate-900 dark:hover:text-white cursor-pointer"
                >
                  Use Repaired Sample
                </button>
                <span aria-hidden="true" className="text-slate-300 dark:text-slate-600">
                  |
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setAfterPreview(SAMPLE_IMAGES.pothole);
                    setAfterBase64('');
                    setLatestResult(null);
                  }}
                  className="text-xs font-medium text-slate-600 dark:text-slate-400 underline hover:text-slate-900 dark:hover:text-white cursor-pointer"
                >
                  Test Unrepaired
                </button>
              </div>
            </div>

            <div className="aspect-4/3 w-full overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800">
              <img
                src={afterPreview}
                alt="After repair submission"
                referrerPolicy="no-referrer"
                className="h-full w-full object-cover"
              />
            </div>

            <label className="inline-flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors cursor-pointer">
              <Upload className="h-3.5 w-3.5" />
              <span>Upload Geotagged After Photo</span>
              <input
                type="file"
                accept="image/*"
                onChange={handleAfterUpload}
                className="sr-only"
              />
            </label>
          </div>
        </div>

        <button
          type="button"
          disabled={isVerifying}
          onClick={handleRunVerification}
          className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 dark:bg-slate-100 px-4 py-2.5 text-sm font-semibold text-white dark:text-slate-950 hover:bg-slate-800 dark:hover:bg-white transition-colors cursor-pointer disabled:opacity-60"
        >
          <Cpu className="h-4 w-4" />
          <span>
            {isVerifying
              ? 'Running Dual-Image CV Audit & Geotag Check...'
              : 'Verify Repair & Unlock Escrow for DBT'}
          </span>
        </button>

        {errorMsg && (
          <div className="flex items-start gap-2 rounded-lg border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/50 p-3 text-xs text-rose-800 dark:text-rose-200">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {latestResult && (
          <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 p-4 space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2.5">
                {latestResult.verified ? (
                  <ShieldCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                ) : (
                  <XCircle className="h-5 w-5 text-rose-600 dark:text-rose-400 shrink-0" />
                )}
                <div>
                  <div className="text-sm font-bold text-slate-900 dark:text-white">
                    {latestResult.verdict}
                  </div>
                  <div className="text-xs text-slate-600 dark:text-slate-300">
                    {latestResult.summary}
                  </div>
                </div>
              </div>

              <div className="text-right shrink-0">
                <div className="font-mono text-xl font-bold text-slate-900 dark:text-white tabular-nums">
                  {latestResult.surfaceFlushnessScore}%
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">Compaction</div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 border-t border-slate-200 dark:border-slate-700 pt-3">
              {latestResult.checklist.map((item) => (
                <div
                  key={item.label}
                  className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300"
                >
                  {item.passed ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  ) : (
                    <XCircle className="h-4 w-4 text-rose-600 dark:text-rose-400 shrink-0" />
                  )}
                  <span>{item.label}</span>
                </div>
              ))}
            </div>

            {latestResult.verified && (
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 dark:border-slate-700 pt-3 text-xs">
                <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                  <Landmark className="h-4 w-4 text-emerald-700 dark:text-emerald-400 shrink-0" />
                  <span>
                    {activeHazard.govtGrantStatus === 'sanctioned'
                      ? `DBT Disbursed (${activeHazard.dbtTxnRef}) · ${activeHazard.govtSanctionRef}`
                      : 'Escrow audit passed — ready for Government Sanction & Direct Benefit Transfer (DBT).'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={onGoToWorkersGrants}
                  className="font-semibold text-emerald-700 dark:text-emerald-400 hover:text-emerald-900 dark:hover:text-emerald-300 underline whitespace-nowrap cursor-pointer"
                >
                  Open Govt DBT Ledger
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
