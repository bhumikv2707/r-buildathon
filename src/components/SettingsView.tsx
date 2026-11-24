import { useEffect, useMemo, useState } from 'react';
import {
  Bell,
  Camera,
  CheckCircle2,
  Cpu,
  Database,
  Download,
  ExternalLink,
  History,
  MapPin,
  Moon,
  RotateCcw,
  Search,
  Settings,
  Shield,
  Sliders,
  Sun,
  Trash2,
  UserCircle2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  CIVIC_ROLE_META,
  DefaultWorkspaceTab,
  ImuSensitivity,
  ReportHistoryEntry,
  UserSettings,
  WARD_ZONES,
} from '../types/account';
import { HazardReport } from '../types/routix';
import {
  formatRelativeTime,
  formatSeverityLabel,
  formatStatusLabel,
} from '../utils/routixHelpers';

export interface LocalReportHistoryItem {
  id: string;
  hazardId: string;
  title: string;
  streetName: string;
  ward: string;
  hazardType: string;
  severity: HazardReport['severity'];
  priorityScore: number;
  source: 'camera' | 'ai_detect';
  status: HazardReport['status'];
  lat: number;
  lng: number;
  estimatedCostInr: number;
  reportedAt: string;
}

interface SettingsViewProps {
  hazards: HazardReport[];
  theme: 'light' | 'dark';
  onChangeTheme: (theme: 'light' | 'dark') => void;
  settings: Omit<UserSettings, 'uid' | 'createdAt' | 'updatedAt'>;
  onUpdateSettings: (
    next: Omit<UserSettings, 'uid' | 'createdAt' | 'updatedAt'>
  ) => Promise<void>;
  localHistory: LocalReportHistoryItem[];
  onDeleteLocalHistoryItem: (hazardId: string) => void;
  onOpenAccountPortal: () => void;
  onJumpToMapHazard: (hazardId: string) => void;
  onStartCameraReport: () => void;
  onResetDemoData: () => Promise<void>;
}

type SettingsSection =
  | 'history'
  | 'general'
  | 'sensors'
  | 'account'
  | 'data';

const NAV_ITEMS: Array<{
  id: SettingsSection;
  label: string;
  description: string;
}> = [
  {
    id: 'history',
    label: 'Reporting History',
    description: 'Potholes & hazards you reported',
  },
  {
    id: 'general',
    label: 'General & Appearance',
    description: 'Theme, startup tab, home ward',
  },
  {
    id: 'sensors',
    label: 'Map, Sensors & Alerts',
    description: 'Heatmap, GPS, IMU sensitivity',
  },
  {
    id: 'account',
    label: 'Account & Role',
    description: 'Civic credentials & permissions',
  },
  {
    id: 'data',
    label: 'Data & Export',
    description: 'Download history & corridor reset',
  },
];

function ToggleSwitch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none ${
        checked
          ? 'bg-rose-600'
          : 'bg-slate-300 dark:bg-slate-700'
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

export function SettingsView({
  hazards,
  theme,
  onChangeTheme,
  settings,
  onUpdateSettings,
  localHistory,
  onDeleteLocalHistoryItem,
  onOpenAccountPortal,
  onJumpToMapHazard,
  onStartCameraReport,
  onResetDemoData,
}: SettingsViewProps) {
  const {
    user,
    isAdmin,
    profile,
    reportHistory,
    deleteReportHistoryItem,
    signInWithGoogle,
    isSigningIn,
  } = useAuth();

  const [section, setSection] = useState<SettingsSection>('history');
  const [historyScope, setHistoryScope] = useState<'my_reports' | 'all_corridor'>(
    'my_reports'
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sourceFilter, setSourceFilter] = useState<'all' | 'camera' | 'ai_detect'>(
    'all'
  );
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!saveNotice) return;
    const t = setTimeout(() => setSaveNotice(null), 2600);
    return () => clearTimeout(t);
  }, [saveNotice]);

  const hazardLookup = useMemo(() => {
    const map = new Map<string, HazardReport>();
    for (const h of hazards) {
      map.set(h.id, h);
    }
    return map;
  }, [hazards]);

  // Combine Firestore reportHistory (when signed in) with localHistory so user sees everything cleanly
  const myReportEntries = useMemo(() => {
    const combined = new Map<
      string,
      {
        docId?: string;
        hazardId: string;
        title: string;
        streetName: string;
        ward: string;
        hazardType: string;
        severity: HazardReport['severity'];
        priorityScore: number;
        source: 'camera' | 'ai_detect';
        status: HazardReport['status'];
        lat: number;
        lng: number;
        estimatedCostInr: number;
        reportedAt: string;
        syncedToCloud: boolean;
      }
    >();

    for (const item of localHistory) {
      const live = hazardLookup.get(item.hazardId);
      combined.set(item.hazardId, {
        ...item,
        status: live?.status ?? item.status,
        priorityScore: live?.priorityScore ?? item.priorityScore,
        syncedToCloud: false,
      });
    }

    if (user) {
      for (const item of reportHistory as ReportHistoryEntry[]) {
        const live = hazardLookup.get(item.hazardId);
        combined.set(item.hazardId, {
          docId: item.id,
          hazardId: item.hazardId,
          title: item.title,
          streetName: item.streetName,
          ward: item.ward,
          hazardType: item.hazardType,
          severity: item.severity,
          priorityScore: live?.priorityScore ?? item.priorityScore,
          source: item.source,
          status: live?.status ?? item.status,
          lat: item.lat,
          lng: item.lng,
          estimatedCostInr: item.estimatedCostInr,
          reportedAt: item.reportedAt,
          syncedToCloud: true,
        });
      }
    }

    return Array.from(combined.values()).sort((a, b) =>
      b.reportedAt.localeCompare(a.reportedAt)
    );
  }, [localHistory, reportHistory, user, hazardLookup]);

  const displayedHistory = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const baseList =
      historyScope === 'my_reports'
        ? myReportEntries
        : hazards.map((h) => ({
            docId: undefined,
            hazardId: h.id,
            title: h.title,
            streetName: h.streetName,
            ward: h.ward,
            hazardType: h.hazardType,
            severity: h.severity,
            priorityScore: h.priorityScore,
            source: 'ai_detect' as const,
            status: h.status,
            lat: h.lat,
            lng: h.lng,
            estimatedCostInr: h.microJobPayoutInr,
            reportedAt: h.reportedAt,
            syncedToCloud: true,
          }));

    return baseList.filter((item) => {
      if (statusFilter !== 'all' && item.status !== statusFilter) return false;
      if (
        historyScope === 'my_reports' &&
        sourceFilter !== 'all' &&
        item.source !== sourceFilter
      ) {
        return false;
      }
      if (!q) return true;
      return (
        item.hazardId.toLowerCase().includes(q) ||
        item.streetName.toLowerCase().includes(q) ||
        item.ward.toLowerCase().includes(q) ||
        item.hazardType.toLowerCase().includes(q)
      );
    });
  }, [
    historyScope,
    myReportEntries,
    hazards,
    searchQuery,
    statusFilter,
    sourceFilter,
  ]);

  const applySettingChange = async (
    patch: Partial<Omit<UserSettings, 'uid' | 'createdAt' | 'updatedAt'>>
  ) => {
    setIsSaving(true);
    try {
      const next = { ...settings, ...patch };
      if (patch.theme) {
        onChangeTheme(patch.theme);
      }
      await onUpdateSettings(next);
      setSaveNotice(
        user
          ? 'Settings saved to your cloud account.'
          : 'Settings saved locally on this device.'
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleExportCsv = () => {
    const rows = myReportEntries.length > 0 ? myReportEntries : hazards.map((h) => ({
      hazardId: h.id,
      streetName: h.streetName,
      ward: h.ward,
      hazardType: h.hazardType,
      severity: h.severity,
      priorityScore: h.priorityScore,
      status: h.status,
      estimatedCostInr: h.microJobPayoutInr,
      reportedAt: h.reportedAt,
    }));

    const header = [
      'Ticket ID',
      'Street',
      'Ward',
      'Hazard Type',
      'Severity',
      'PSI',
      'Status',
      'Estimated Cost INR',
      'Reported At',
    ];
    const csvLines = [
      header.join(','),
      ...rows.map((r) =>
        [
          r.hazardId,
          `"${String(r.streetName).replace(/"/g, '""')}"`,
          `"${String(r.ward).replace(/"/g, '""')}"`,
          `"${String(r.hazardType).replace(/"/g, '""')}"`,
          r.severity,
          r.priorityScore,
          r.status,
          r.estimatedCostInr,
          r.reportedAt,
        ].join(',')
      ),
    ];

    const blob = new Blob([csvLines.join('\n')], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `routix-pothole-history-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setSaveNotice('Exported reporting history CSV.');
  };

  const activeRole = profile?.role || (isAdmin ? 'government' : 'worker');

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Left: Settings Categories Rail */}
      <aside className="lg:col-span-4 xl:col-span-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
        <div className="border-b border-slate-200 dark:border-slate-800 px-5 py-4">
          <div className="flex items-center gap-2">
            <Settings className="h-4 w-4 text-rose-600 dark:text-rose-400 shrink-0" />
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              Settings
            </h2>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Preferences &amp; pothole reporting log
          </p>
        </div>

        <nav
          aria-label="Settings Categories"
          className="divide-y divide-slate-100 dark:divide-slate-800"
        >
          {NAV_ITEMS.map((item) => {
            const active = section === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSection(item.id)}
                className={`w-full flex items-start gap-3 px-5 py-3.5 text-left transition-colors cursor-pointer ${
                  active
                    ? 'bg-slate-50 dark:bg-slate-800/80'
                    : 'hover:bg-slate-50/70 dark:hover:bg-slate-800/40'
                }`}
              >
                <div className="mt-0.5 shrink-0 text-slate-500 dark:text-slate-400">
                  {item.id === 'history' && <History className="h-4 w-4 text-rose-600 dark:text-rose-400" />}
                  {item.id === 'general' && <Sliders className="h-4 w-4" />}
                  {item.id === 'sensors' && <Bell className="h-4 w-4" />}
                  {item.id === 'account' && <UserCircle2 className="h-4 w-4" />}
                  {item.id === 'data' && <Database className="h-4 w-4" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`text-sm ${
                        active
                          ? 'font-semibold text-slate-900 dark:text-white'
                          : 'font-medium text-slate-700 dark:text-slate-200'
                      }`}
                    >
                      {item.label}
                    </span>
                    {item.id === 'history' && (
                      <span className="font-mono text-xs font-semibold text-slate-500 dark:text-slate-400 tabular-nums">
                        {myReportEntries.length}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                    {item.description}
                  </div>
                </div>
              </button>
            );
          })}
        </nav>
      </aside>

      {/* Right: Active Settings Panel */}
      <div className="lg:col-span-8 xl:col-span-9 space-y-4">
        {saveNotice && (
          <div className="flex items-center gap-2 rounded-lg border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/40 px-4 py-2.5 text-xs font-medium text-emerald-900 dark:text-emerald-200">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>{saveNotice}</span>
          </div>
        )}

        {/* Section 1: Pothole Reporting History */}
        {section === 'history' && (
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 px-5 py-4">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Pothole &amp; Road Hazard Reporting History
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {user
                    ? 'Synced to your Routix account with live municipal repair status.'
                    : 'Showing reports logged in this browser. Sign in to sync history across devices.'}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {!user && (
                  <button
                    type="button"
                    disabled={isSigningIn}
                    onClick={signInWithGoogle}
                    className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
                  >
                    {isSigningIn ? 'Signing in...' : 'Sign in to Sync'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={onStartCameraReport}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700 transition-colors cursor-pointer"
                >
                  <Camera className="h-3.5 w-3.5" />
                  <span>Report Pothole</span>
                </button>
              </div>
            </div>

            {/* Scope & Filters Bar */}
            <div className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 px-5 py-3 flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="inline-flex items-center gap-1 rounded-lg bg-slate-200/70 dark:bg-slate-800 p-1 self-start">
                <button
                  type="button"
                  onClick={() => setHistoryScope('my_reports')}
                  className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors cursor-pointer ${
                    historyScope === 'my_reports'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  My Reports ({myReportEntries.length})
                </button>
                <button
                  type="button"
                  onClick={() => setHistoryScope('all_corridor')}
                  className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors cursor-pointer ${
                    historyScope === 'all_corridor'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  All Corridor Reports ({hazards.length})
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search street, ID, ward..."
                    className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 pl-8 pr-3 py-1.5 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none w-48"
                  />
                </div>
                <select
                  aria-label="Filter by repair status"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-100 focus:outline-none"
                >
                  <option value="all">All Statuses</option>
                  <option value="open">Open</option>
                  <option value="dispatched">Dispatched</option>
                  <option value="pending_verification">Pending QA</option>
                  <option value="verified">Verified Repaired</option>
                </select>
                {historyScope === 'my_reports' && (
                  <select
                    aria-label="Filter by capture source"
                    value={sourceFilter}
                    onChange={(e) =>
                      setSourceFilter(
                        e.target.value as 'all' | 'camera' | 'ai_detect'
                      )
                    }
                    className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-100 focus:outline-none"
                  >
                    <option value="all">All Sources</option>
                    <option value="camera">Live Camera</option>
                    <option value="ai_detect">AI Detect</option>
                  </select>
                )}
              </div>
            </div>

            {displayedHistory.length === 0 ? (
              <div className="p-10 text-center space-y-3">
                <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                  <History className="h-5 w-5" />
                </div>
                <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                  {historyScope === 'my_reports' && myReportEntries.length === 0
                    ? 'You have not reported any potholes yet'
                    : 'No matching reports found'}
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                  {historyScope === 'my_reports' && myReportEntries.length === 0
                    ? 'Use the live camera or AI Detect to report a road defect. Every submission will appear here with its live SLA and repair status.'
                    : 'Try clearing your search query or switching status filters.'}
                </p>
                {historyScope === 'my_reports' && myReportEntries.length === 0 && (
                  <div className="flex items-center justify-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={onStartCameraReport}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 dark:bg-slate-100 px-3.5 py-2 text-xs font-semibold text-white dark:text-slate-950 hover:bg-slate-800 dark:hover:bg-white cursor-pointer"
                    >
                      <Camera className="h-3.5 w-3.5" />
                      <span>Report with Camera</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setHistoryScope('all_corridor')}
                      className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer"
                    >
                      View Corridor Reports ({hazards.length})
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {displayedHistory.map((entry) => (
                  <div
                    key={`${entry.hazardId}-${entry.docId ?? 'local'}`}
                    className="px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                          {entry.hazardId}
                        </span>
                        <span
                          className={`font-semibold ${
                            entry.status === 'verified'
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : entry.status === 'dispatched'
                              ? 'text-amber-700 dark:text-amber-400'
                              : entry.status === 'pending_verification'
                              ? 'text-sky-700 dark:text-sky-400'
                              : 'text-rose-700 dark:text-rose-400'
                          }`}
                        >
                          · {formatStatusLabel(entry.status)}
                        </span>
                        <span className="text-slate-400">·</span>
                        <span className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-400">
                          {entry.source === 'camera' ? (
                            <Camera className="h-3 w-3" />
                          ) : (
                            <Cpu className="h-3 w-3" />
                          )}
                          {entry.source === 'camera' ? 'Live Camera' : 'AI Detect'}
                        </span>
                        <span className="text-slate-400">·</span>
                        <span className="text-slate-500 dark:text-slate-400">
                          {formatRelativeTime(entry.reportedAt)}
                        </span>
                      </div>

                      <div className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5 text-rose-600 dark:text-rose-400 shrink-0" />
                        <span className="truncate">{entry.streetName}</span>
                      </div>

                      <div className="text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-2">
                        <span>{entry.ward}</span>
                        <span aria-hidden="true">·</span>
                        <span>{entry.hazardType}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">
                          {formatSeverityLabel(entry.severity)} (PSI {entry.priorityScore})
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">
                          Est. ₹{entry.estimatedCostInr.toLocaleString()}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => onJumpToMapHazard(entry.hazardId)}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        <span>View on Map</span>
                      </button>

                      {historyScope === 'my_reports' && (
                        <button
                          type="button"
                          title="Remove from history"
                          onClick={() => {
                            onDeleteLocalHistoryItem(entry.hazardId);
                            if (entry.docId) {
                              deleteReportHistoryItem(entry.docId);
                            }
                          }}
                          className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-1.5 text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Section 2: General & Appearance */}
        {section === 'general' && (
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 divide-y divide-slate-100 dark:divide-slate-800">
            <div className="px-5 py-4">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                General &amp; Appearance
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Customize theme, starting workspace view, and default road jurisdiction.
              </p>
            </div>

            <div className="px-5 py-4 flex items-center justify-between gap-4">
              <div>
                <div className="text-sm font-semibold text-slate-900 dark:text-white">
                  Color Theme
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  Switch between Light and Dark mode across UI and Google Maps.
                </div>
              </div>
              <div className="inline-flex items-center gap-1 rounded-lg bg-slate-100 dark:bg-slate-800 p-1 shrink-0">
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => applySettingChange({ theme: 'light' })}
                  className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold cursor-pointer ${
                    theme === 'light'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <Sun className="h-3.5 w-3.5 text-amber-500" />
                  <span>Light</span>
                </button>
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => applySettingChange({ theme: 'dark' })}
                  className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold cursor-pointer ${
                    theme === 'dark'
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <Moon className="h-3.5 w-3.5 text-sky-400" />
                  <span>Dark</span>
                </button>
              </div>
            </div>

            <div className="px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="text-sm font-semibold text-slate-900 dark:text-white">
                  Default Startup View
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  Choose which Routix workspace tab opens first when you launch the app.
                </div>
              </div>
              <select
                aria-label="Default startup view"
                value={settings.defaultTab}
                onChange={(e) =>
                  applySettingChange({
                    defaultTab: e.target.value as DefaultWorkspaceTab,
                  })
                }
                className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-xs font-medium text-slate-900 dark:text-slate-100 focus:outline-none sm:w-52"
              >
                <option value="map">Live Map &amp; Camera</option>
                <option value="detect">AI Detect &amp; PSI</option>
                <option value="dispatch">Civic Command &amp; Dispatch</option>
                <option value="verify">CV Proof-of-Work Verify</option>
                <option value="workers">Workers &amp; Govt Grants</option>
              </select>
            </div>

            <div className="px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="text-sm font-semibold text-slate-900 dark:text-white">
                  Preferred Home Ward
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  Default ward zone highlighted for quick hazard reporting and SLA monitoring.
                </div>
              </div>
              <select
                aria-label="Preferred home ward"
                value={settings.defaultWard}
                onChange={(e) =>
                  applySettingChange({ defaultWard: e.target.value })
                }
                className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-xs font-medium text-slate-900 dark:text-slate-100 focus:outline-none sm:w-60"
              >
                {WARD_ZONES.map((w) => (
                  <option key={w} value={w}>
                    {w}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Section 3: Map, Sensors & Alerts */}
        {section === 'sensors' && (
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 divide-y divide-slate-100 dark:divide-slate-800">
            <div className="px-5 py-4">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Map, Sensors &amp; Alerts
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Configure Google Maps density heatmap, GPS capture, and passive IMU swarm sensitivity.
              </p>
            </div>

            <div className="px-5 py-4 flex items-center justify-between gap-4">
              <div>
                <div className="text-sm font-semibold text-slate-900 dark:text-white">
                  Enable Density Heatmap by Default
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  Show the high-severity pothole cluster heatmap automatically when opening Live Map.
                </div>
              </div>
              <ToggleSwitch
                label="Enable Density Heatmap by Default"
                checked={settings.defaultHeatmapOn}
                onChange={(val) =>
                  applySettingChange({ defaultHeatmapOn: val })
                }
              />
            </div>

            <div className="px-5 py-4 flex items-center justify-between gap-4">
              <div>
                <div className="text-sm font-semibold text-slate-900 dark:text-white">
                  Auto-Lock GPS on Camera Report
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  Automatically read device coordinates when capturing a pothole with the camera.
                </div>
              </div>
              <ToggleSwitch
                label="Auto-Lock GPS on Camera Report"
                checked={settings.autoUseGps}
                onChange={(val) => applySettingChange({ autoUseGps: val })}
              />
            </div>

            <div className="px-5 py-4 flex items-center justify-between gap-4">
              <div>
                <div className="text-sm font-semibold text-slate-900 dark:text-white">
                  Critical Corridor Alerts (PSI &ge; 85)
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  Highlight critical two-wheeler rollover risks and SLA breaches in the map banner.
                </div>
              </div>
              <ToggleSwitch
                label="Critical Corridor Alerts"
                checked={settings.highSeverityAlerts}
                onChange={(val) =>
                  applySettingChange({ highSeverityAlerts: val })
                }
              />
            </div>

            <div className="px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="text-sm font-semibold text-slate-900 dark:text-white">
                  Passive IMU Swarm Shock Threshold
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  Vertical accelerometer spike threshold used to distinguish potholes from speed bumps.
                </div>
              </div>
              <select
                aria-label="IMU sensitivity threshold"
                value={settings.imuSensitivity}
                onChange={(e) =>
                  applySettingChange({
                    imuSensitivity: e.target.value as ImuSensitivity,
                  })
                }
                className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-xs font-medium text-slate-900 dark:text-slate-100 focus:outline-none sm:w-56"
              >
                <option value="high_2_2g">High Sensitivity (&gt; 2.2g)</option>
                <option value="standard_2_5g">Standard Swarm (&gt; 2.5g)</option>
                <option value="strict_3_0g">Severe Craters Only (&gt; 3.0g)</option>
              </select>
            </div>
          </div>
        )}

        {/* Section 4: Account & Role */}
        {section === 'account' && (
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-rose-600 dark:text-rose-400 shrink-0">
                  <Shield className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    {user
                      ? profile?.displayName || user.displayName || 'Civic Account'
                      : 'Not Signed In'}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {user
                      ? `${user.email} · ${CIVIC_ROLE_META[activeRole].label}`
                      : 'Sign in with Google to register as an Engineer, Worker, Municipality Officer, or Government Authority.'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={onOpenAccountPortal}
                className="rounded-lg bg-slate-900 dark:bg-slate-100 px-4 py-2 text-xs font-semibold text-white dark:text-slate-950 hover:bg-slate-800 dark:hover:bg-white cursor-pointer shrink-0"
              >
                {user ? 'Manage Role & Credentials' : 'Sign In / Create Account'}
              </button>
            </div>

            {profile && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 border-t border-slate-200 dark:border-slate-800 pt-4 text-xs">
                <div>
                  <div className="text-slate-500 dark:text-slate-400">Organization</div>
                  <div className="font-semibold text-slate-900 dark:text-white mt-0.5">
                    {profile.organization}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500 dark:text-slate-400">Ward Jurisdiction</div>
                  <div className="font-semibold text-slate-900 dark:text-white mt-0.5">
                    {profile.wardZone}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500 dark:text-slate-400">Official Badge ID</div>
                  <div className="font-mono font-semibold text-slate-900 dark:text-white mt-0.5">
                    {profile.badgeNumber}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Section 5: Data & Export */}
        {section === 'data' && (
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 divide-y divide-slate-100 dark:divide-slate-800">
            <div className="px-5 py-4">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Data &amp; Export
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Download your pothole reporting history or reset demo corridor records.
              </p>
            </div>

            <div className="px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="text-sm font-semibold text-slate-900 dark:text-white">
                  Export Pothole Reporting History (CSV)
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  Downloads a spreadsheet containing your reported ticket IDs, locations, PSI scores, and repair status.
                </div>
              </div>
              <button
                type="button"
                onClick={handleExportCsv}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2 text-xs font-semibold text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer shrink-0"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Download CSV</span>
              </button>
            </div>

            <div className="px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="text-sm font-semibold text-slate-900 dark:text-white">
                  Reset Corridor Seed Data
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  Restores the shared Bengaluru corridor hazards, workers, and league table to initial state.
                </div>
              </div>
              <button
                type="button"
                onClick={async () => {
                  await onResetDemoData();
                  setSaveNotice('Corridor data restored to initial state.');
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 px-3.5 py-2 text-xs font-semibold text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-900/50 cursor-pointer shrink-0"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Reset Corridor Data</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
