import { FormEvent, ReactNode, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  CloudRain,
  ExternalLink,
  Globe,
  HardHat,
  Loader2,
  Search,
  ShieldCheck,
} from 'lucide-react';
import { HazardReport } from '../types/routix';

interface RoadIntelViewProps {
  hazards: HazardReport[];
  selectedHazardId: string | null;
  onSelectHazard: (id: string) => void;
}

interface GroundedSource {
  title: string;
  uri: string;
}

interface RoadIntelResponse {
  answer: string;
  sources: GroundedSource[];
  searchQueries: string[];
  generatedAt: string;
}

type IntelTopic = 'monsoon' | 'municipal' | 'engineering' | 'safety' | 'custom';

function renderInlineBold(text: string): ReactNode {
  const segments = text.split(/(\*\*[^*]+\*\*)/g);
  return segments.map((seg, idx) => {
    if (seg.startsWith('**') && seg.endsWith('**') && seg.length > 4) {
      return (
        <strong key={idx} className="font-semibold text-slate-900 dark:text-white">
          {seg.slice(2, -2)}
        </strong>
      );
    }
    return <span key={idx}>{seg}</span>;
  });
}

function StructuredBrief({ markdown }: { markdown: string }) {
  const lines = markdown.split('\n');
  return (
    <div className="space-y-2.5 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
      {lines.map((rawLine, idx) => {
        const line = rawLine.trim();
        if (!line) return null;

        if (line.startsWith('### ') || line.startsWith('## ') || line.startsWith('# ')) {
          const cleanHeading = line.replace(/^#{1,3}\s+/, '');
          return (
            <h3
              key={idx}
              className="pt-2 text-sm font-bold tracking-tight text-slate-900 dark:text-white"
            >
              {renderInlineBold(cleanHeading)}
            </h3>
          );
        }

        if (line.startsWith('- ') || line.startsWith('* ') || /^\d+\.\s+/.test(line)) {
          const content = line.replace(/^([-*]|\d+\.)\s+/, '');
          return (
            <div key={idx} className="flex items-start gap-2 pl-1">
              <span className="mt-2 h-1.5 w-1.5 rounded-sm bg-rose-600 dark:bg-rose-400 shrink-0" />
              <p className="flex-1">{renderInlineBold(content)}</p>
            </div>
          );
        }

        return <p key={idx}>{renderInlineBold(line)}</p>;
      })}
    </div>
  );
}

export function RoadIntelView({
  hazards,
  selectedHazardId,
  onSelectHazard,
}: RoadIntelViewProps) {
  const activeHazard = useMemo(() => {
    if (hazards.length === 0) return null;
    return hazards.find((h) => h.id === selectedHazardId) ?? hazards[0];
  }, [hazards, selectedHazardId]);

  const [queryInput, setQueryInput] = useState('');
  const [activeTopic, setActiveTopic] = useState<IntelTopic>('monsoon');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RoadIntelResponse | null>(null);
  const [lastQuery, setLastQuery] = useState<string>('');

  const presets: Array<{
    id: IntelTopic;
    label: string;
    subtitle: string;
    icon: typeof CloudRain;
    buildQuery: (h: HazardReport | null) => string;
  }> = [
    {
      id: 'monsoon',
      label: 'Monsoon & Waterlogging Alerts',
      subtitle: 'Live rain forecasts, drainage & road flooding advisories',
      icon: CloudRain,
      buildQuery: (h) =>
        `Latest weather, rainfall, waterlogging, and traffic disruption alerts affecting ${
          h ? `${h.streetName} and ${h.ward}` : 'Bengaluru arterial corridors'
        } for road patching operations.`,
    },
    {
      id: 'municipal',
      label: 'Municipal Road Works & Tenders',
      subtitle: 'Recent civic pothole repair drives & BBMP road updates',
      icon: HardHat,
      buildQuery: (h) =>
        `Recent Bengaluru municipal BBMP pothole repair drives, road resurfacing updates, or civic maintenance announcements near ${
          h ? `${h.streetName} (${h.ward})` : 'Indiranagar and Koramangala'
        }.`,
    },
    {
      id: 'engineering',
      label: 'IRC:SP:100 Cold-Mix Standards',
      subtitle: 'Technical compaction, wet-weather binder & curing specs',
      icon: BookOpen,
      buildQuery: (h) =>
        `IRC:SP:100 cold-mix asphalt technical guidelines for rapid pothole patching in wet urban Indian roads, including cavity prep, compaction flushness, and material dosage for a ${
          h ? `${h.estimatedWidthCm}cm wide ${h.hazardType}` : 'medium urban pothole'
        }.`,
    },
    {
      id: 'safety',
      label: 'Two-Wheeler Blackspot Advisories',
      subtitle: 'Corridor crash prevention & commuter safety notices',
      icon: ShieldCheck,
      buildQuery: (h) =>
        `Two-wheeler road safety advisories, pothole accident prevention guidelines, and traffic safety measures relevant to ${
          h ? `${h.streetName}, Bengaluru` : 'Bengaluru arterial roads'
        }.`,
    },
  ];

  const runSearchIntel = async (promptText: string, topic: IntelTopic) => {
    const clean = promptText.trim();
    if (!clean) return;

    setIsLoading(true);
    setError(null);
    setActiveTopic(topic);
    setLastQuery(clean);

    try {
      const res = await fetch('/api/road-intel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: clean,
          topic,
          streetName: activeHazard?.streetName,
          ward: activeHazard?.ward,
          hazardType: activeHazard?.hazardType,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to retrieve live road intelligence.');
      }
      setResult(data as RoadIntelResponse);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to fetch search-grounded road intelligence.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    runSearchIntel(queryInput, 'custom');
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Left Control Column */}
      <div className="lg:col-span-4 space-y-4">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-rose-600 dark:text-rose-400">
              <Globe className="h-3.5 w-3.5" />
              <span>Google Search Grounding</span>
            </div>
            <h2 className="mt-1 text-lg font-bold tracking-tight text-slate-900 dark:text-white">
              Live Road Intelligence
            </h2>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Query real-time web data for monsoon alerts, municipal maintenance updates, and IRC:SP:100 cold-mix engineering standards with verifiable citations.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Target Hazard &amp; Corridor Context
            </label>
            <select
              value={activeHazard?.id ?? ''}
              onChange={(e) => onSelectHazard(e.target.value)}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-xs font-medium text-slate-900 dark:text-white focus:outline-none focus:border-rose-500"
            >
              {hazards.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.id} · {h.streetName} ({h.ward})
                </option>
              ))}
            </select>
          </div>

          <form onSubmit={handleSubmit} className="space-y-2.5">
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Ask Live Civic Search
            </label>
            <div className="relative">
              <input
                type="text"
                value={queryInput}
                onChange={(e) => setQueryInput(e.target.value)}
                placeholder="e.g. Latest rain alert or roadwork on 100 Feet Road..."
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 pl-3 pr-9 py-2.5 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-rose-500"
              />
              <Search className="pointer-events-none absolute right-3 top-2.5 h-4 w-4 text-slate-400" />
            </div>
            <button
              type="submit"
              disabled={isLoading || !queryInput.trim()}
              className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 dark:bg-slate-100 px-4 py-2 text-xs font-semibold text-white dark:text-slate-950 hover:bg-slate-800 dark:hover:bg-white disabled:opacity-50 transition-colors cursor-pointer"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Searching Web Sources...</span>
                </>
              ) : (
                <>
                  <Search className="h-3.5 w-3.5" />
                  <span>Run Grounded Search</span>
                </>
              )}
            </button>
          </form>
        </div>

        {/* One-Click Grounded Briefing Presets */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 px-1">
            Quick Corridor Briefings
          </div>
          {presets.map((preset) => {
            const Icon = preset.icon;
            const isSelected = activeTopic === preset.id && Boolean(result);
            return (
              <button
                key={preset.id}
                type="button"
                disabled={isLoading}
                onClick={() => {
                  const q = preset.buildQuery(activeHazard);
                  setQueryInput(q);
                  runSearchIntel(q, preset.id);
                }}
                className={`w-full text-left rounded-lg border p-3 transition-colors cursor-pointer disabled:opacity-60 ${
                  isSelected
                    ? 'border-rose-500 bg-rose-50/70 dark:bg-rose-950/30'
                    : 'border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/50 hover:border-slate-300 dark:hover:border-slate-700'
                }`}
              >
                <div className="flex items-start gap-2.5">
                  <Icon className="h-4 w-4 mt-0.5 text-rose-600 dark:text-rose-400 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-slate-900 dark:text-white">
                      {preset.label}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      {preset.subtitle}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Right Intelligence Output & Citations Column */}
      <div className="lg:col-span-8 space-y-4">
        {error && (
          <div className="flex items-start gap-2.5 rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/50 p-4 text-xs text-rose-800 dark:text-rose-200">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold">Search Grounding Request Failed</div>
              <p className="mt-0.5">{error}</p>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 flex flex-col items-center justify-center text-center min-h-[380px]">
            <Loader2 className="h-7 w-7 animate-spin text-rose-600 dark:text-rose-400" />
            <div className="mt-3 text-sm font-semibold text-slate-900 dark:text-white">
              Retrieving Live Google Search Sources
            </div>
            <p className="mt-1 max-w-md text-xs text-slate-500 dark:text-slate-400">
              Checking current weather, municipal road circulars, and engineering references for{' '}
              <span className="font-medium text-slate-700 dark:text-slate-200">
                {activeHazard?.streetName || 'selected corridor'}
              </span>
              ...
            </p>
          </div>
        ) : result ? (
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 divide-y divide-slate-200 dark:divide-slate-800">
            <div className="p-5">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 mb-3 border-b border-slate-100 dark:border-slate-800">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                    Grounded Civic Intelligence Brief
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {lastQuery}
                  </div>
                </div>
                <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                  {new Date(result.generatedAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>

              <StructuredBrief markdown={result.answer} />
            </div>

            {/* Verified Web Source Citations */}
            <div className="p-5 bg-slate-50/70 dark:bg-slate-950/40 rounded-b-xl space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  Verified Web Sources ({result.sources.length})
                </h3>
                {result.searchQueries.length > 0 && (
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-md">
                    Search: {result.searchQueries.join(' · ')}
                  </span>
                )}
              </div>

              {result.sources.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  {result.sources.map((src, idx) => (
                    <a
                      key={`${src.uri}-${idx}`}
                      href={src.uri}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-start justify-between gap-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2.5 hover:border-rose-400 dark:hover:border-rose-500 transition-colors"
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                          {src.title}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                          {src.uri}
                        </div>
                      </div>
                      <ExternalLink className="h-3.5 w-3.5 text-slate-400 shrink-0 mt-0.5" />
                    </a>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  No direct external web URLs were returned for this query.
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 min-h-[380px] flex flex-col justify-center">
            <div className="max-w-lg space-y-3">
              <div className="inline-flex items-center gap-2 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2.5 py-1 text-[11px] font-semibold text-slate-700 dark:text-slate-200">
                <Globe className="h-3.5 w-3.5 text-rose-600 dark:text-rose-400" />
                <span>Real-Time Google Search Integration</span>
              </div>
              <h3 className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">
                Select a corridor briefing or run a live web query
              </h3>
              <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                Every briefing queries live Google Search results to check current monsoon drainage alerts, BBMP road maintenance circulars, and IRC:SP:100 cold-mix application specs for{' '}
                <span className="font-semibold text-slate-900 dark:text-white">
                  {activeHazard ? `${activeHazard.streetName} (${activeHazard.ward})` : 'your active ward'}
                </span>
                .
              </p>
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => {
                    const first = presets[0];
                    const q = first.buildQuery(activeHazard);
                    setQueryInput(q);
                    runSearchIntel(q, first.id);
                  }}
                  className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-700 transition-colors cursor-pointer"
                >
                  <CloudRain className="h-3.5 w-3.5" />
                  <span>Check Live Monsoon &amp; Road Alerts</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
