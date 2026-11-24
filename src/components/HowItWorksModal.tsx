import { X, ArrowRight, Camera, Cpu, MapPin, HardHat, CheckCircle2 } from 'lucide-react';

interface HowItWorksModalProps {
  open: boolean;
  onClose: () => void;
  onStartDetect: () => void;
}

export function HowItWorksModal({ open, onClose, onStartDetect }: HowItWorksModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="routix-overview-title"
    >
      <div className="w-full max-w-4xl rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 px-6 py-4">
          <div>
            <h2 id="routix-overview-title" className="text-xl font-bold text-slate-900 dark:text-white">
              How Routix Works — Detect · Report · Repair
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              Smarter Roads. Safer Journeys. Built for two-wheeler safety, faster maintenance, and local micro-employment.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
            aria-label="Close overview"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 p-4">
              <div className="flex items-center gap-2 text-slate-900 dark:text-white font-semibold text-sm">
                <Camera className="h-4 w-4 text-rose-600 dark:text-rose-400 shrink-0" />
                <span>01. Zero-Click Swarm Sensing</span>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                Passive IMU (&gt;2.5g dip-spike shocks &amp; S-curve gyroscope swerves, filtering smooth speed bumps) pairs with active edge YOLOv8 crater depth &amp; area capture.
              </p>
            </div>

            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 p-4">
              <div className="flex items-center gap-2 text-slate-900 dark:text-white font-semibold text-sm">
                <Cpu className="h-4 w-4 text-rose-600 dark:text-rose-400 shrink-0" />
                <span>02. AI Triage &amp; PSI (0–100)</span>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                Scores crater volume (40%), traffic density (30%), cluster hits (20%), and monsoon risk (10%), auto-calculating IRC:SP:100 cold-mix material &amp; cost.
              </p>
            </div>

            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 p-4">
              <div className="flex items-center gap-2 text-slate-900 dark:text-white font-semibold text-sm">
                <MapPin className="h-4 w-4 text-rose-600 dark:text-rose-400 shrink-0" />
                <span>03. Civic SLA &amp; Micro-Gigs</span>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                Engineers dispatch Tier-1 contractors or 2–5 km local squads with live SLA countdowns, ward budgets, and 15–30 min ready-to-pour cold-mix asphalt.
              </p>
            </div>

            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 p-4">
              <div className="flex items-center gap-2 text-slate-900 dark:text-white font-semibold text-sm">
                <HardHat className="h-4 w-4 text-rose-600 dark:text-rose-400 shrink-0" />
                <span>04. CV PoW, DBT &amp; League</span>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                Geotagged before/after CV audits verify flush compaction and trigger Municipal Escrow DBT bank transfers while updating the Ward Premier League.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 border-t border-slate-200 dark:border-slate-800 pt-5">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Why Traditional Reporting Fails</h3>
              <ul className="mt-2.5 space-y-2 text-sm text-slate-600 dark:text-slate-300">
                <li className="flex items-start gap-2">
                  <span className="text-rose-600 dark:text-rose-400 font-mono text-xs mt-1">1.</span>
                  <span>Potholes and damaged roads put two-wheeler riders and daily commuters at high risk.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-rose-600 dark:text-rose-400 font-mono text-xs mt-1">2.</span>
                  <span>Manual complaint portals fail in heavy traffic when riders cannot stop to report.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-rose-600 dark:text-rose-400 font-mono text-xs mt-1">3.</span>
                  <span>Slow preliminary site inspections and months-long contractor billing stall small patches.</span>
                </li>
              </ul>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Community &amp; Civic Accountability</h3>
              <ul className="mt-2.5 space-y-2 text-sm text-slate-600 dark:text-slate-300">
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                  <span>Commuter Scouts earn Impact Points from Rookie Scout to MVP Road Captain.</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                  <span>Local crews get rapid DBT escrow payouts and unlock priority micro-tenders.</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                  <span>Ward-vs-Ward Premier League leaderboards publish transparent Road Health Scores.</span>
                </li>
              </ul>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 px-6 py-3.5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer whitespace-nowrap"
          >
            Back to Workspace
          </button>
          <button
            type="button"
            onClick={() => {
              onClose();
              onStartDetect();
            }}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-slate-100 px-4 py-2 text-sm font-medium text-white dark:text-slate-950 hover:bg-slate-800 dark:hover:bg-white transition-colors cursor-pointer whitespace-nowrap"
          >
            <span>Try AI Hazard Detection</span>
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
