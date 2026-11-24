import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { APIProvider } from '@vis.gl/react-google-maps';
import {
  Info,
  Moon,
  RotateCcw,
  Settings,
  ShieldAlert,
  Sun,
  UserCircle2,
} from 'lucide-react';
import { AccountPortalModal } from './components/AccountPortalModal';
import { AiDetectView } from './components/AiDetectView';
import { DispatchView } from './components/DispatchView';
import { HowItWorksModal } from './components/HowItWorksModal';
import { LiveMapView } from './components/LiveMapView';
import { RoadIntelView } from './components/RoadIntelView';
import { RoadTwin3DView } from './components/RoadTwin3DView';
import {
  LocalReportHistoryItem,
  SettingsView,
} from './components/SettingsView';
import { VerifyView } from './components/VerifyView';
import { WorkersPortalView } from './components/WorkersPortalView';
import { useAuth } from './context/AuthContext';
import { CIVIC_ROLE_META, UserSettings } from './types/account';
import {
  CommuterScoutProfile,
  HazardReport,
  WardLeagueEntry,
  WorkerProfile,
} from './types/routix';

type WorkspaceTab =
  | 'map'
  | 'twin3d'
  | 'detect'
  | 'dispatch'
  | 'verify'
  | 'workers'
  | 'intel'
  | 'settings';

type AppSettingsState = Omit<UserSettings, 'uid' | 'createdAt' | 'updatedAt'>;

const DEFAULT_SETTINGS: AppSettingsState = {
  theme: 'light',
  defaultTab: 'map',
  defaultWard: 'Ward 80 · Indiranagar',
  defaultHeatmapOn: true,
  autoUseGps: false,
  highSeverityAlerts: true,
  imuSensitivity: 'standard_2_5g',
};

const MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? '';

export default function App() {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('map');
  const [hazards, setHazards] = useState<HazardReport[]>([]);
  const [workers, setWorkers] = useState<WorkerProfile[]>([]);
  const [wardLeague, setWardLeague] = useState<WardLeagueEntry[]>([]);
  const [scouts, setScouts] = useState<CommuterScoutProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedHazardId, setSelectedHazardId] = useState<string | null>(null);
  const [busyHazardId, setBusyHazardId] = useState<string | null>(null);
  const [prefilledCoords, setPrefilledCoords] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const {
    user,
    isAdmin,
    profile,
    privateInfo,
    allRequests,
    userSettings,
    saveUserSettings,
    recordReportHistory,
  } = useAuth();
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [showOverviewModal, setShowOverviewModal] = useState(false);
  const [openCameraSignal, setOpenCameraSignal] = useState(0);
  const [quotaExceeded, setQuotaExceeded] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window === 'undefined') return 'light';
    const saved = localStorage.getItem('routix-theme');
    if (saved === 'dark' || saved === 'light') return saved;
    return window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  });

  const [appSettings, setAppSettings] = useState<AppSettingsState>(() => {
    if (typeof window === 'undefined') return DEFAULT_SETTINGS;
    try {
      const raw = localStorage.getItem('routix-settings');
      if (raw) {
        return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<AppSettingsState>) };
      }
    } catch {
      // Ignore storage errors
    }
    return DEFAULT_SETTINGS;
  });

  const [localReportHistory, setLocalReportHistory] = useState<
    LocalReportHistoryItem[]
  >(() => {
    if (typeof window === 'undefined') return [];
    try {
      const raw = localStorage.getItem('routix-report-history');
      if (raw) {
        return JSON.parse(raw) as LocalReportHistoryItem[];
      }
    } catch {
      // Ignore storage errors
    }
    return [];
  });

  const appliedCloudStartupTab = useRef(false);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    try {
      localStorage.setItem('routix-theme', theme);
    } catch {
      // Ignore storage errors
    }
  }, [theme]);

  useEffect(() => {
    if (!userSettings) return;
    setAppSettings({
      theme: userSettings.theme,
      defaultTab: userSettings.defaultTab,
      defaultWard: userSettings.defaultWard,
      defaultHeatmapOn: userSettings.defaultHeatmapOn,
      autoUseGps: userSettings.autoUseGps,
      highSeverityAlerts: userSettings.highSeverityAlerts,
      imuSensitivity: userSettings.imuSensitivity,
    });
    setTheme(userSettings.theme);
    if (!appliedCloudStartupTab.current) {
      appliedCloudStartupTab.current = true;
      setActiveTab(userSettings.defaultTab);
    }
  }, [userSettings]);

  const handleUpdateSettings = useCallback(
    async (next: AppSettingsState) => {
      setAppSettings(next);
      try {
        localStorage.setItem('routix-settings', JSON.stringify(next));
      } catch {
        // Ignore storage errors
      }
      if (user) {
        await saveUserSettings(next);
      }
    },
    [user, saveUserSettings]
  );

  useEffect(() => {
    const onQuotaExceeded = () => setQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', onQuotaExceeded);
    return () => window.removeEventListener('gmp-quota-exceeded', onQuotaExceeded);
  }, []);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const [hRes, wRes, lRes] = await Promise.all([
        fetch('/api/hazards'),
        fetch('/api/workers'),
        fetch('/api/league'),
      ]);
      if (!hRes.ok || !wRes.ok || !lRes.ok) {
        throw new Error('Unable to load Routix corridor data.');
      }
      const [hJson, wJson, lJson] = await Promise.all([
        hRes.json(),
        wRes.json(),
        lRes.json(),
      ]);
      const loadedHazards = (hJson.hazards || []) as HazardReport[];
      setHazards(loadedHazards);
      setWorkers((wJson.workers || []) as WorkerProfile[]);
      setWardLeague((lJson.wardLeague || []) as WardLeagueEntry[]);
      setScouts((lJson.scouts || []) as CommuterScoutProfile[]);
      setSelectedHazardId((prev) => prev ?? loadedHazards[0]?.id ?? null);
    } catch (err) {
      setLoadError(
        err instanceof Error ? err.message : 'Unable to connect to Routix server.'
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleAssignWorker = useCallback(
    async (hazardId: string, workerId?: string) => {
      setBusyHazardId(hazardId);
      try {
        const res = await fetch(`/api/hazards/${hazardId}/assign`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ workerId }),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Worker assignment failed.');
        }
        await fetchData();
      } catch (err) {
        setLoadError(
          err instanceof Error ? err.message : 'Worker assignment failed.'
        );
      } finally {
        setBusyHazardId(null);
      }
    },
    [fetchData]
  );

  const handleMarkReadyForVerify = useCallback(
    async (hazardId: string) => {
      setBusyHazardId(hazardId);
      try {
        const res = await fetch(`/api/hazards/${hazardId}/status`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'pending_verification' }),
        });
        if (!res.ok) {
          throw new Error('Could not update repair status.');
        }
        await fetchData();
      } finally {
        setBusyHazardId(null);
      }
    },
    [fetchData]
  );

  const handleHazardPublished = useCallback(
    async (
      newHazard: HazardReport,
      source: 'camera' | 'ai_detect' = 'ai_detect'
    ) => {
      const historyEntry: LocalReportHistoryItem = {
        id: newHazard.id,
        hazardId: newHazard.id,
        title: newHazard.title,
        streetName: newHazard.streetName,
        ward: newHazard.ward,
        hazardType: newHazard.hazardType,
        severity: newHazard.severity,
        priorityScore: newHazard.priorityScore,
        source,
        status: newHazard.status,
        lat: newHazard.lat,
        lng: newHazard.lng,
        estimatedCostInr: newHazard.microJobPayoutInr,
        reportedAt: newHazard.reportedAt,
      };
      setLocalReportHistory((prev) => {
        const next = [
          historyEntry,
          ...prev.filter((item) => item.hazardId !== newHazard.id),
        ].slice(0, 100);
        try {
          localStorage.setItem('routix-report-history', JSON.stringify(next));
        } catch {
          // Ignore storage errors
        }
        return next;
      });
      if (user) {
        recordReportHistory(newHazard, source).catch(() => undefined);
      }

      await fetchData();
      setSelectedHazardId(newHazard.id);
      setActiveTab('map');
    },
    [fetchData, user, recordReportHistory]
  );

  const handleDeleteLocalHistoryItem = useCallback((hazardId: string) => {
    setLocalReportHistory((prev) => {
      const next = prev.filter((item) => item.hazardId !== hazardId);
      try {
        localStorage.setItem('routix-report-history', JSON.stringify(next));
      } catch {
        // Ignore storage errors
      }
      return next;
    });
  }, []);

  const handleVerifiedSuccess = useCallback(
    async (updatedHazard: HazardReport) => {
      await fetchData();
      setSelectedHazardId(updatedHazard.id);
    },
    [fetchData]
  );

  const handleLogCommutePass = useCallback(
    async (scoutId: string, clusterConfirmed: boolean) => {
      const res = await fetch('/api/scouts/log-pass', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scoutId, clusterConfirmed }),
      });
      if (!res.ok) {
        throw new Error('Failed to log commuter swarm pass.');
      }
      const data = await res.json();
      if (data.scouts) {
        setScouts(data.scouts as CommuterScoutProfile[]);
      }
    },
    []
  );

  const handleResetDemo = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/reset-demo', { method: 'POST' });
      if (res.ok) {
        await fetchData();
      }
    } finally {
      setIsLoading(false);
    }
  }, [fetchData]);

  const stats = useMemo(() => {
    const activeHazards = hazards.filter((h) => h.status !== 'verified').length;
    const totalEvasive = hazards.reduce(
      (acc, h) => acc + (h.status !== 'verified' ? h.evasiveManoeuvreCount : 0),
      0
    );
    const availableWorkers = workers.filter((w) => w.available).length;
    const verifiedCount = hazards.filter((h) => h.status === 'verified').length;
    return { activeHazards, totalEvasive, availableWorkers, verifiedCount };
  }, [hazards, workers]);

  return (
    <APIProvider
      apiKey={MAPS_API_KEY}
      libraries={['marker']}
      language="en"
      region="IN"
    >
      <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100 transition-colors">
        {quotaExceeded && (
          <div className="bg-amber-50 dark:bg-amber-950/80 border-b border-amber-200 dark:border-amber-900 text-amber-900 dark:text-amber-100 px-4 py-2.5 text-xs md:text-sm text-center sticky top-0 z-50 shadow-sm">
            <span>
              Google Maps Platform quota reached. If you are the app owner, visit{' '}
              <a
                href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
                target="_blank"
                rel="noopener noreferrer"
                className="underline font-semibold text-amber-950 dark:text-amber-200 hover:text-amber-800"
              >
                maps developer site
              </a>{' '}
              for instructions to update your account.
            </span>
          </div>
        )}

        {/* Strict 3-Zone Top Navigation Bar */}
        <header className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-8 px-6 py-3.5">
            {/* Zone 1: Single-element Brand Wordmark */}
            <a
              href="#top"
              onClick={(e) => {
                e.preventDefault();
                setActiveTab('map');
              }}
              className="inline-flex items-center gap-2 text-xl font-bold tracking-tight text-slate-900 dark:text-white whitespace-nowrap shrink-0 font-display"
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
                className="shrink-0"
              >
                <path
                  d="M12 2C7.86 2 4.5 5.36 4.5 9.5C4.5 14.95 12 22 12 22C12 22 19.5 14.95 19.5 9.5C19.5 5.36 16.14 2 12 2Z"
                  fill="#E11D48"
                />
                <path
                  d="M9.2 12.2L11.1 7.2H12.9L14.8 12.2"
                  stroke="white"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M12 8.2V11.8"
                  stroke="white"
                  strokeWidth="1.4"
                  strokeDasharray="1.5 1.5"
                  strokeLinecap="round"
                />
              </svg>
              <span>Routix</span>
            </a>

            {/* Zone 2: Primary Single-line Text Navigation Links */}
            <nav
              aria-label="Primary Workspace"
              className="hidden md:flex items-center gap-5 xl:gap-6 text-sm font-medium"
            >
              {(
                [
                  { id: 'map', label: 'Live Map' },
                  { id: 'twin3d', label: '3D Twin' },
                  { id: 'detect', label: 'AI Detect' },
                  { id: 'dispatch', label: 'Dispatch' },
                  { id: 'verify', label: 'Verify' },
                  { id: 'workers', label: 'Workers' },
                  { id: 'intel', label: 'Road Intel' },
                ] as const
              ).map((item) => {
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveTab(item.id)}
                    className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      isActive
                        ? 'border-rose-600 text-slate-900 dark:text-white font-semibold'
                        : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:border-slate-300 dark:hover:border-slate-700'
                    }`}
                  >
                    {item.label}
                  </button>
                );
              })}
            </nav>

            {/* Zone 3: Theme Toggle + Account + Settings + Primary CTA */}
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  const nextTheme = theme === 'dark' ? 'light' : 'dark';
                  setTheme(nextTheme);
                  handleUpdateSettings({ ...appSettings, theme: nextTheme });
                }}
                aria-label={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
                title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                {theme === 'dark' ? (
                  <>
                    <Sun className="h-3.5 w-3.5 text-amber-400" />
                    <span className="hidden sm:inline">Light</span>
                  </>
                ) : (
                  <>
                    <Moon className="h-3.5 w-3.5 text-slate-600" />
                    <span className="hidden sm:inline">Dark</span>
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => setShowAccountModal(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-medium text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <UserCircle2 className="h-3.5 w-3.5 text-rose-600 dark:text-rose-400 shrink-0" />
                {user ? (
                  <span className="flex items-center gap-1.5">
                    <span className="max-w-[90px] truncate">
                      {(profile?.displayName || user.displayName || 'Account').split(' ')[0]}
                    </span>
                    <span className="hidden lg:inline text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                      · {CIVIC_ROLE_META[profile?.role || (isAdmin ? 'government' : 'worker')].shortLabel}
                    </span>
                    {isAdmin && allRequests.some((r) => r.status === 'pending') && (
                      <span
                        title="Pending role approvals"
                        className="h-2 w-2 rounded-full bg-amber-500 shrink-0"
                      />
                    )}
                  </span>
                ) : (
                  <span>Sign In</span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('settings')}
                aria-label="Settings and Reporting History"
                title="Settings & Reporting History"
                className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  activeTab === 'settings'
                    ? 'border-rose-600 bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300'
                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700'
                }`}
              >
                <Settings className="h-3.5 w-3.5 shrink-0" />
                <span className="hidden xl:inline">Settings</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setPrefilledCoords(null);
                  setActiveTab('detect');
                }}
                className="rounded-lg bg-slate-900 dark:bg-slate-100 px-4 py-2 text-xs font-semibold text-white dark:text-slate-950 hover:bg-slate-800 dark:hover:bg-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Report Hazard
              </button>
            </div>
          </div>

          {/* Mobile navigation row */}
          <div className="flex md:hidden border-t border-slate-100 dark:border-slate-800 px-4 py-2 gap-4 overflow-x-auto">
            {(
              [
                { id: 'map', label: 'Live Map' },
                { id: 'twin3d', label: '3D Twin' },
                { id: 'detect', label: 'AI Detect' },
                { id: 'dispatch', label: 'Dispatch' },
                { id: 'verify', label: 'Verify' },
                { id: 'workers', label: 'Workers' },
                { id: 'intel', label: 'Road Intel' },
                { id: 'settings', label: 'Settings' },
              ] as const
            ).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`text-xs font-medium py-1 border-b-2 whitespace-nowrap shrink-0 ${
                  activeTab === item.id
                    ? 'border-rose-600 text-slate-900 dark:text-white font-semibold'
                    : 'border-transparent text-slate-600 dark:text-slate-400'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1440px] flex-1 px-6 py-6 space-y-6">
          {/* Context Header & Pipeline Overview Trigger */}
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                Detect · Report · Repair
              </h1>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">
                Smarter Roads. Safer Journeys. AI pothole &amp; evasive manoeuvre detection paired with nearby local worker dispatch.
              </p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <button
                type="button"
                onClick={() => setShowOverviewModal(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap cursor-pointer"
              >
                <Info className="h-3.5 w-3.5" />
                <span>How Routix Works</span>
              </button>
              <button
                type="button"
                onClick={handleResetDemo}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap cursor-pointer"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Reset Data</span>
              </button>
            </div>
          </div>

          {user && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-2.5 text-xs">
              {profile ? (
                <>
                  <div className="flex flex-wrap items-center gap-2 min-w-0">
                    <span
                      className={`rounded-md border px-2 py-0.5 font-semibold ${
                        CIVIC_ROLE_META[profile.role].badgeClass
                      }`}
                    >
                      {CIVIC_ROLE_META[profile.role].label}
                    </span>
                    <span className="font-semibold text-slate-900 dark:text-white">
                      {profile.displayName}
                    </span>
                    <span className="text-slate-500 dark:text-slate-400">
                      · {profile.organization} · {profile.wardZone} · ID{' '}
                      <span className="font-mono">{profile.badgeNumber}</span>
                    </span>
                    {profile.approvalStatus === 'pending' && (
                      <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400 font-medium">
                        <ShieldAlert className="h-3.5 w-3.5" />
                        Pending {CIVIC_ROLE_META[profile.requestedRole].shortLabel} verification
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        if (profile.role === 'engineer') setActiveTab('detect');
                        else if (profile.role === 'municipality_officer')
                          setActiveTab('dispatch');
                        else setActiveTab('workers');
                      }}
                      className="rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2.5 py-1 font-semibold text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
                    >
                      {profile.role === 'engineer'
                        ? 'Open AI Detect'
                        : profile.role === 'municipality_officer'
                        ? 'Open Civic Dispatch'
                        : profile.role === 'government'
                        ? 'Open Govt DBT Ledger'
                        : 'Open Worker Micro-Gigs'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowAccountModal(true)}
                      className="text-slate-600 dark:text-slate-400 underline hover:text-slate-900 dark:hover:text-white cursor-pointer"
                    >
                      Manage Account
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <span className="text-slate-600 dark:text-slate-300">
                    Signed in as <span className="font-semibold">{user.email}</span>. Select your role (Engineer, Worker, Municipality Officer, or Government Authority) to complete setup.
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowAccountModal(true)}
                    className="rounded-md bg-slate-900 dark:bg-slate-100 px-3 py-1 font-semibold text-white dark:text-slate-950 hover:bg-slate-800 dark:hover:bg-white cursor-pointer"
                  >
                    Complete Role Setup
                  </button>
                </>
              )}
            </div>
          )}

          {/* 4-Column Operational Summary Strip */}
          <div className="grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-slate-200 dark:divide-slate-800 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
            <div className="px-5 py-3.5">
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Active Road Hazards
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="font-mono text-2xl font-bold text-slate-900 dark:text-white tabular-nums">
                  {stats.activeHazards}
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  mapped &amp; scored
                </span>
              </div>
            </div>

            <div className="px-5 py-3.5">
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Evasive Manoeuvres Logged
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="font-mono text-2xl font-bold text-rose-700 dark:text-rose-400 tabular-nums">
                  {stats.totalEvasive}
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  swerve &amp; brake cues
                </span>
              </div>
            </div>

            <div className="px-5 py-3.5">
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Nearby Local Workers
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="font-mono text-2xl font-bold text-slate-900 dark:text-white tabular-nums">
                  {stats.availableWorkers} / {workers.length}
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  ready for micro-jobs
                </span>
              </div>
            </div>

            <div className="px-5 py-3.5">
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                AI-Verified Repairs
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="font-mono text-2xl font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
                  {stats.verifiedCount}
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  cleared for traffic
                </span>
              </div>
            </div>
          </div>

          {loadError && (
            <div className="rounded-lg border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/50 px-4 py-3 text-sm text-rose-800 dark:text-rose-200">
              {loadError}
            </div>
          )}

          {isLoading && hazards.length === 0 ? (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              <div className="lg:col-span-8 h-[540px] animate-pulse rounded-xl bg-slate-200/70 dark:bg-slate-800/70" />
              <div className="lg:col-span-4 h-[540px] animate-pulse rounded-xl bg-slate-200/70 dark:bg-slate-800/70" />
            </div>
          ) : (
            <>
              {activeTab === 'map' && (
                <LiveMapView
                  hazards={hazards}
                  workers={workers}
                  theme={theme}
                  defaultHeatmapOn={appSettings.defaultHeatmapOn}
                  autoUseGps={appSettings.autoUseGps}
                  highSeverityAlerts={appSettings.highSeverityAlerts}
                  openCameraSignal={openCameraSignal}
                  selectedHazardId={selectedHazardId}
                  onSelectHazard={setSelectedHazardId}
                  onAssignNearest={(id) => handleAssignWorker(id)}
                  onNavigateToVerify={(id) => {
                    setSelectedHazardId(id);
                    setActiveTab('verify');
                  }}
                  onPickLocationForDetect={(lat, lng) => {
                    setPrefilledCoords({ lat, lng });
                    setActiveTab('detect');
                  }}
                  onHazardReported={(hazard) =>
                    handleHazardPublished(hazard, 'camera')
                  }
                  busyHazardId={busyHazardId}
                />
              )}

              {activeTab === 'twin3d' && (
                <RoadTwin3DView
                  hazards={hazards}
                  selectedHazardId={selectedHazardId}
                  onSelectHazard={setSelectedHazardId}
                  theme={theme}
                  onOpenRoadIntel={(hazardId) => {
                    setSelectedHazardId(hazardId);
                    setActiveTab('intel');
                  }}
                />
              )}

              {activeTab === 'detect' && (
                <AiDetectView
                  prefilledCoords={prefilledCoords}
                  onHazardPublished={(hazard) =>
                    handleHazardPublished(hazard, 'ai_detect')
                  }
                />
              )}

              {activeTab === 'dispatch' && (
                <DispatchView
                  hazards={hazards}
                  workers={workers}
                  wardLeague={wardLeague}
                  scouts={scouts}
                  onAssignWorker={handleAssignWorker}
                  onMarkReadyForVerify={handleMarkReadyForVerify}
                  onGoToVerify={(id) => {
                    setSelectedHazardId(id);
                    setActiveTab('verify');
                  }}
                  onLogCommutePass={handleLogCommutePass}
                  busyHazardId={busyHazardId}
                />
              )}

              {activeTab === 'verify' && (
                <VerifyView
                  hazards={hazards}
                  selectedHazardId={selectedHazardId}
                  onVerifiedSuccess={handleVerifiedSuccess}
                  onGoToWorkersGrants={() => setActiveTab('workers')}
                />
              )}

              {activeTab === 'workers' && (
                <WorkersPortalView
                  hazards={hazards}
                  workers={workers}
                  accountProfile={profile}
                  accountPhone={privateInfo?.phone}
                  onRefresh={fetchData}
                  onApproveApplicant={async (hazardId, workerId) => {
                    await handleAssignWorker(hazardId, workerId);
                    setActiveTab('dispatch');
                  }}
                  onGoToVerify={(id) => {
                    setSelectedHazardId(id);
                    setActiveTab('verify');
                  }}
                />
              )}

              {activeTab === 'intel' && (
                <RoadIntelView
                  hazards={hazards}
                  selectedHazardId={selectedHazardId}
                  onSelectHazard={setSelectedHazardId}
                />
              )}

              {activeTab === 'settings' && (
                <SettingsView
                  hazards={hazards}
                  theme={theme}
                  onChangeTheme={setTheme}
                  settings={appSettings}
                  onUpdateSettings={handleUpdateSettings}
                  localHistory={localReportHistory}
                  onDeleteLocalHistoryItem={handleDeleteLocalHistoryItem}
                  onOpenAccountPortal={() => setShowAccountModal(true)}
                  onJumpToMapHazard={(hazardId) => {
                    setSelectedHazardId(hazardId);
                    setActiveTab('map');
                  }}
                  onStartCameraReport={() => {
                    setActiveTab('map');
                    setOpenCameraSignal((s) => s + 1);
                  }}
                  onResetDemoData={handleResetDemo}
                />
              )}
            </>
          )}
        </main>

        <footer className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-4 px-6 py-4 text-xs text-slate-500 dark:text-slate-400">
            <span>Routix Road Safety &amp; Maintenance Platform</span>
            <span>Detect · Report · Repair — Smarter Roads. Safer Journeys.</span>
          </div>
        </footer>

        <HowItWorksModal
          open={showOverviewModal}
          onClose={() => setShowOverviewModal(false)}
          onStartDetect={() => setActiveTab('detect')}
        />

        <AccountPortalModal
          open={showAccountModal}
          onClose={() => setShowAccountModal(false)}
        />
      </div>
    </APIProvider>
  );
}
