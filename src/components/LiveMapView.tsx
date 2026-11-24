/// <reference types="google.maps" />
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AdvancedMarker,
  InfoWindow,
  Map as GoogleMap,
  useAdvancedMarkerRef,
  useMap,
} from '@vis.gl/react-google-maps';
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Crosshair,
  Flame,
  HardHat,
  Navigation,
  Search,
  ShieldAlert,
  Wrench,
} from 'lucide-react';
import { HazardReport, HazardStatus, WorkerProfile } from '../types/routix';
import {
  formatManoeuvreLabel,
  formatRelativeTime,
  formatSeverityLabel,
  formatSlaRemaining,
  formatStatusLabel,
} from '../utils/routixHelpers';
import { CameraReportModal } from './CameraReportModal';
import { PotholeHeatmapLayer } from './PotholeHeatmapLayer';

interface LiveMapViewProps {
  hazards: HazardReport[];
  workers: WorkerProfile[];
  theme: 'light' | 'dark';
  defaultHeatmapOn?: boolean;
  autoUseGps?: boolean;
  highSeverityAlerts?: boolean;
  openCameraSignal?: number;
  selectedHazardId: string | null;
  onSelectHazard: (id: string | null) => void;
  onAssignNearest: (hazardId: string) => Promise<void>;
  onNavigateToVerify: (hazardId: string) => void;
  onPickLocationForDetect: (lat: number, lng: number) => void;
  onHazardReported: (hazard: HazardReport) => Promise<void>;
  busyHazardId: string | null;
}

const DEFAULT_CENTER = { lat: 12.956, lng: 77.628 };

function MapFocusController({
  selectedHazard,
}: {
  selectedHazard: HazardReport | undefined;
}) {
  const map = useMap();

  useEffect(() => {
    if (map && selectedHazard) {
      map.panTo({ lat: selectedHazard.lat, lng: selectedHazard.lng });
    }
  }, [map, selectedHazard]);

  return null;
}

function getMarkerTheme(hazard: HazardReport) {
  if (hazard.status === 'verified') {
    return {
      bg: '#16A34A',
      border: '#14532D',
      tag: 'OK',
    };
  }
  if (hazard.status === 'pending_verification') {
    return {
      bg: '#0284C7',
      border: '#0C4A6E',
      tag: 'QA',
    };
  }
  if (hazard.severity === 'critical') {
    return {
      bg: '#DC2626',
      border: '#7F1D1D',
      tag: `P${hazard.priorityScore}`,
    };
  }
  if (hazard.severity === 'high') {
    return {
      bg: '#E11D48',
      border: '#881337',
      tag: `P${hazard.priorityScore}`,
    };
  }
  return {
    bg: '#D97706',
    border: '#78350F',
    tag: `P${hazard.priorityScore}`,
  };
}

interface HazardMarkerProps {
  hazard: HazardReport;
  isSelected: boolean;
  zIndex: number;
  onMarkerClick: (
    hazardId: string,
    marker: google.maps.marker.AdvancedMarkerElement
  ) => void;
}

function HazardMarker({
  hazard,
  isSelected,
  zIndex,
  onMarkerClick,
}: HazardMarkerProps) {
  const [markerRef, marker] = useAdvancedMarkerRef();
  const theme = getMarkerTheme(hazard);

  return (
    <AdvancedMarker
      ref={markerRef}
      position={{ lat: hazard.lat, lng: hazard.lng }}
      zIndex={isSelected ? 1000 : zIndex}
      title={`${hazard.streetName} — Priority ${hazard.priorityScore}`}
      onClick={() => {
        if (marker) {
          onMarkerClick(hazard.id, marker);
        }
      }}
    >
      <div
        className={`flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold text-white shadow-md transition-transform duration-150 ${
          isSelected ? 'scale-110 ring-2 ring-white' : 'hover:scale-105'
        }`}
        style={{
          backgroundColor: theme.bg,
          border: `1.5px solid ${theme.border}`,
        }}
      >
        <span className="font-mono tabular-nums">{theme.tag}</span>
      </div>
    </AdvancedMarker>
  );
}

function WorkerMarker({ worker }: { worker: WorkerProfile }) {
  return (
    <AdvancedMarker
      position={{ lat: worker.lat, lng: worker.lng }}
      zIndex={10}
      title={`${worker.name} (${worker.available ? 'Available' : 'On Task'})`}
    >
      <div
        className={`flex h-7 w-7 items-center justify-center rounded-full border-2 shadow-sm ${
          worker.available
            ? 'border-slate-900 bg-white text-slate-900'
            : 'border-slate-400 bg-slate-200 text-slate-600'
        }`}
      >
        <HardHat className="h-3.5 w-3.5" />
      </div>
    </AdvancedMarker>
  );
}

export function LiveMapView({
  hazards,
  workers,
  theme,
  defaultHeatmapOn = true,
  autoUseGps = false,
  highSeverityAlerts = true,
  openCameraSignal = 0,
  selectedHazardId,
  onSelectHazard,
  onAssignNearest,
  onNavigateToVerify,
  onPickLocationForDetect,
  onHazardReported,
  busyHazardId,
}: LiveMapViewProps) {
  const [statusFilter, setStatusFilter] = useState<'all' | HazardStatus>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showHeatmap, setShowHeatmap] = useState(defaultHeatmapOn);
  const [showWorkersOnMap, setShowWorkersOnMap] = useState(true);
  const [pinDropMode, setPinDropMode] = useState(false);
  const [showCameraModal, setShowCameraModal] = useState(false);
  const [anchorMarker, setAnchorMarker] =
    useState<google.maps.marker.AdvancedMarkerElement | null>(null);
  const [imgFailed, setImgFailed] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setShowHeatmap(defaultHeatmapOn);
  }, [defaultHeatmapOn]);

  useEffect(() => {
    if (openCameraSignal > 0) {
      setShowCameraModal(true);
    }
  }, [openCameraSignal]);

  const filteredHazards = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return hazards.filter((h) => {
      const matchesStatus = statusFilter === 'all' || h.status === statusFilter;
      const matchesQuery =
        !q ||
        h.streetName.toLowerCase().includes(q) ||
        h.title.toLowerCase().includes(q) ||
        h.corridor.toLowerCase().includes(q) ||
        h.hazardType.toLowerCase().includes(q);
      return matchesStatus && matchesQuery;
    });
  }, [hazards, statusFilter, searchQuery]);

  const sortedForMarkers = useMemo(
    () => [...filteredHazards].sort((a, b) => b.lat - a.lat),
    [filteredHazards]
  );

  const selectedHazard = useMemo(
    () => hazards.find((h) => h.id === selectedHazardId),
    [hazards, selectedHazardId]
  );

  const handleMarkerClick = useCallback(
    (hazardId: string, marker: google.maps.marker.AdvancedMarkerElement) => {
      setAnchorMarker(marker);
      onSelectHazard(hazardId);
    },
    [onSelectHazard]
  );

  const highestActiveAlert = useMemo(
    () => hazards.find((h) => h.status === 'open' && h.priorityScore >= 80),
    [hazards]
  );

  return (
    <div className="space-y-4">
      {highSeverityAlerts && highestActiveAlert && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-rose-200 dark:border-rose-900/70 bg-rose-50/80 dark:bg-rose-950/40 px-4 py-2.5 text-sm text-rose-950 dark:text-rose-100">
          <div className="flex items-center gap-2.5 min-w-0">
            <AlertTriangle className="h-4 w-4 text-rose-600 dark:text-rose-400 shrink-0" />
            <p className="truncate">
              <span className="font-semibold">Active Commuter Road Alert:</span>{' '}
              {highestActiveAlert.streetName} — {highestActiveAlert.evasiveManoeuvreCount}{' '}
              evasive swerves logged ({formatSeverityLabel(highestActiveAlert.severity)})
            </p>
          </div>
          <button
            type="button"
            onClick={() => onSelectHazard(highestActiveAlert.id)}
            className="text-xs font-semibold text-rose-700 dark:text-rose-300 hover:text-rose-900 dark:hover:text-rose-200 underline underline-offset-2 whitespace-nowrap shrink-0 cursor-pointer text-left"
          >
            Focus Hazard
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        {/* Left: Interactive Google Map */}
        <div className="lg:col-span-7 xl:col-span-8 flex flex-col rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 px-4 py-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                GPS Hazard &amp; Workforce Map
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Click any priority marker for safety risk &amp; dispatch ·{' '}
                {pinDropMode
                  ? 'Click anywhere on the map to scan that GPS coordinate'
                  : 'Real-time corridor overview'}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setShowCameraModal(true)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 dark:bg-slate-100 px-3 py-1.5 text-xs font-semibold text-white dark:text-slate-950 hover:bg-slate-800 dark:hover:bg-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Camera className="h-3.5 w-3.5" />
                <span>Camera Report</span>
              </button>
              <button
                type="button"
                onClick={() => setShowHeatmap((v) => !v)}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  showHeatmap
                    ? 'border-rose-600 bg-rose-600 text-white'
                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700'
                }`}
              >
                <Flame className="h-3.5 w-3.5" />
                <span>Severity Heatmap</span>
              </button>
              <button
                type="button"
                onClick={() => setShowWorkersOnMap((v) => !v)}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  showWorkersOnMap
                    ? 'border-slate-900 dark:border-slate-100 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-950'
                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700'
                }`}
              >
                <HardHat className="h-3.5 w-3.5" />
                <span>Workers ({workers.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setPinDropMode((v) => !v)}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  pinDropMode
                    ? 'border-slate-900 dark:border-slate-100 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-950'
                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700'
                }`}
              >
                <Crosshair className="h-3.5 w-3.5" />
                <span>{pinDropMode ? 'Cancel Pin Drop' : 'Scan Map Point'}</span>
              </button>
            </div>
          </div>

          <div className="relative h-[540px] w-full bg-slate-100 dark:bg-slate-950">
            <GoogleMap
              mapId="DEMO_MAP_ID"
              colorScheme={theme === 'dark' ? 'DARK' : 'LIGHT'}
              defaultCenter={DEFAULT_CENTER}
              defaultZoom={12}
              gestureHandling="greedy"
              streetViewControl={false}
              mapTypeControl={false}
              fullscreenControl={true}
              internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
              onClick={(ev) => {
                if (pinDropMode && ev.detail.latLng) {
                  setPinDropMode(false);
                  onPickLocationForDetect(ev.detail.latLng.lat, ev.detail.latLng.lng);
                } else {
                  setAnchorMarker(null);
                }
              }}
              style={{ width: '100%', height: '100%' }}
            >
              <MapFocusController selectedHazard={selectedHazard} />
              <PotholeHeatmapLayer hazards={filteredHazards} visible={showHeatmap} />

              {sortedForMarkers.map((hazard, index) => (
                <HazardMarker
                  key={hazard.id}
                  hazard={hazard}
                  isSelected={selectedHazardId === hazard.id}
                  zIndex={index + 20}
                  onMarkerClick={handleMarkerClick}
                />
              ))}

              {showWorkersOnMap &&
                workers.map((worker) => <WorkerMarker key={worker.id} worker={worker} />)}

              {selectedHazard && anchorMarker && (
                <InfoWindow
                  anchor={anchorMarker}
                  pixelOffset={[0, -6]}
                  onCloseClick={() => {
                    setAnchorMarker(null);
                    onSelectHazard(null);
                  }}
                >
                  <div className="max-w-[260px] p-1 text-slate-900">
                    <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                      <span className="font-mono font-semibold text-rose-700">
                        {selectedHazard.id} · PSI {selectedHazard.priorityScore}
                      </span>
                      <span>{formatStatusLabel(selectedHazard.status)}</span>
                    </div>
                    <h3 className="mt-1 text-sm font-semibold text-slate-900 leading-snug">
                      {selectedHazard.title}
                    </h3>
                    <p className="text-xs text-slate-600 mt-0.5">
                      {selectedHazard.streetName} · {selectedHazard.ward}
                    </p>
                    <p className="mt-1.5 text-xs text-slate-700 leading-relaxed">
                      {selectedHazard.twoWheelerRisk}
                    </p>
                    <p className="mt-1 text-[11px] font-mono text-slate-500">
                      {selectedHazard.clusterVehicleHits} swarm hits · {selectedHazard.repairMaterialEstimate}
                    </p>
                    <div className="mt-2.5 flex items-center gap-2">
                      {selectedHazard.status === 'open' && (
                        <button
                          type="button"
                          onClick={() => onAssignNearest(selectedHazard.id)}
                          disabled={busyHazardId === selectedHazard.id}
                          className="rounded-md bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-slate-800 cursor-pointer"
                        >
                          {busyHazardId === selectedHazard.id
                            ? 'Assigning...'
                            : 'Assign Nearest Worker'}
                        </button>
                      )}
                      {(selectedHazard.status === 'dispatched' ||
                        selectedHazard.status === 'pending_verification') && (
                        <button
                          type="button"
                          onClick={() => onNavigateToVerify(selectedHazard.id)}
                          className="rounded-md bg-emerald-700 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-emerald-800 cursor-pointer"
                        >
                          Verify Repair
                        </button>
                      )}
                    </div>
                  </div>
                </InfoWindow>
              )}
            </GoogleMap>

            {/* Clean Legend Footer inside map viewport */}
            <div className="pointer-events-none absolute bottom-3 left-3 flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 px-3 py-2 text-xs text-slate-700 dark:text-slate-200 shadow-sm backdrop-blur-xs">
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-xs bg-red-600" />
                <span>Critical (P85+)</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-xs bg-rose-600" />
                <span>High Risk</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-xs bg-amber-600" />
                <span>Moderate</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-xs bg-emerald-600" />
                <span>Verified Repaired</span>
              </span>
              {showHeatmap && (
                <span className="flex items-center gap-1.5 border-l border-slate-200 dark:border-slate-700 pl-3">
                  <span className="inline-block h-2.5 w-8 rounded-xs bg-gradient-to-r from-amber-200 via-orange-500 to-rose-700" />
                  <span>PSI Cluster Density</span>
                </span>
              )}
            </div>

            {/* Direct Map Camera Action */}
            <button
              type="button"
              onClick={() => setShowCameraModal(true)}
              className="absolute bottom-3 right-14 inline-flex items-center gap-2 rounded-lg bg-rose-600 px-3.5 py-2 text-xs font-semibold text-white shadow-md hover:bg-rose-700 transition-colors whitespace-nowrap cursor-pointer"
            >
              <Camera className="h-4 w-4" />
              <span>Report with Camera</span>
            </button>
          </div>
        </div>

        {/* Right: Priority Queue & Selected Hazard Inspector */}
        <div className="lg:col-span-5 xl:col-span-4 flex flex-col rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
          <div className="border-b border-slate-200 dark:border-slate-800 p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                Priority Repair Queue
              </h2>
              <span className="font-mono text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                {filteredHazards.length} shown
              </span>
            </div>

            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search road, corridor, or defect..."
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 py-2 pl-9 pr-3 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-slate-400 dark:focus:border-slate-500 focus:bg-white dark:focus:bg-slate-800 focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-1 rounded-lg bg-slate-100 dark:bg-slate-800 p-1 overflow-x-auto">
              {(
                [
                  { id: 'all', label: 'All' },
                  { id: 'open', label: 'Open' },
                  { id: 'dispatched', label: 'Dispatched' },
                  { id: 'verified', label: 'Verified' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setStatusFilter(tab.id)}
                  className={`flex-1 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    statusFilter === tab.id
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 divide-y divide-slate-100 dark:divide-slate-800 overflow-y-auto max-h-[370px]">
            {filteredHazards.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
                No hazards match the active filter.
              </div>
            ) : (
              filteredHazards.map((hazard) => {
                const active = selectedHazardId === hazard.id;
                const sla = formatSlaRemaining(hazard.slaDeadlineAt);
                return (
                  <button
                    key={hazard.id}
                    type="button"
                    onClick={() => {
                      onSelectHazard(hazard.id);
                      setAnchorMarker(null);
                    }}
                    className={`w-full text-left px-4 py-3.5 transition-colors cursor-pointer ${
                      active
                        ? 'bg-slate-50 dark:bg-slate-800/80'
                        : 'hover:bg-slate-50/70 dark:hover:bg-slate-800/50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                          <span className="font-mono text-slate-700 dark:text-slate-300 font-medium">
                            {hazard.id}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span
                            className={
                              hazard.status === 'verified'
                                ? 'text-emerald-700 dark:text-emerald-400 font-medium'
                                : hazard.severity === 'critical'
                                ? 'text-rose-700 dark:text-rose-400 font-medium'
                                : 'text-slate-600 dark:text-slate-300'
                            }
                          >
                            {formatStatusLabel(hazard.status)}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className={sla.urgent && hazard.status !== 'verified' ? 'text-rose-700 dark:text-rose-400 font-mono' : ''}>
                            {hazard.status === 'verified' ? formatRelativeTime(hazard.reportedAt) : sla.text}
                          </span>
                        </div>
                        <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white truncate">
                          {hazard.streetName}
                        </p>
                        <p className="text-xs text-slate-600 dark:text-slate-400 truncate mt-0.5">
                          {hazard.ward} · {hazard.clusterVehicleHits} swarm hits ·{' '}
                          {formatManoeuvreLabel(hazard.dominantManoeuvre)}
                        </p>
                      </div>

                      <div className="text-right shrink-0">
                        <div className="font-mono text-base font-bold text-slate-900 dark:text-white tabular-nums">
                          {hazard.priorityScore}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">PSI</div>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* Selected Hazard Action Footer */}
          {selectedHazard && (
            <div className="border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 p-4 space-y-3">
              <div className="flex items-start gap-3">
                <div className="h-14 w-20 shrink-0 overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-200 dark:bg-slate-800 flex items-center justify-center">
                  {!imgFailed[selectedHazard.id] ? (
                    <img
                      src={selectedHazard.photoUrl}
                      alt={selectedHazard.title}
                      referrerPolicy="no-referrer"
                      onError={() =>
                        setImgFailed((prev) => ({ ...prev, [selectedHazard.id]: true }))
                      }
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <ShieldAlert className="h-5 w-5 text-slate-500 dark:text-slate-400" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    {selectedHazard.ward} · {selectedHazard.craterGeometry.surfaceAreaSqM} m² /{' '}
                    {selectedHazard.craterGeometry.depthCm} cm deep · {selectedHazard.repairMaterialEstimate}
                  </p>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                    {selectedHazard.title}
                  </p>
                  <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5 line-clamp-2">
                    {selectedHazard.evasiveExplanation}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 pt-1">
                {selectedHazard.assignedWorkerName ? (
                  <span className="text-xs text-slate-700 dark:text-slate-300 truncate">
                    Assigned: <strong className="font-semibold">{selectedHazard.assignedWorkerName}</strong>{' '}
                    ({selectedHazard.assignedDistanceKm} km)
                  </span>
                ) : (
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    Micro-job payout:{' '}
                    <strong className="font-mono text-slate-800 dark:text-slate-100">
                      ₹{selectedHazard.microJobPayoutInr}
                    </strong>
                  </span>
                )}

                {selectedHazard.status === 'open' ? (
                  <button
                    type="button"
                    disabled={busyHazardId === selectedHazard.id}
                    onClick={() => onAssignNearest(selectedHazard.id)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 dark:bg-slate-100 px-3 py-1.5 text-xs font-medium text-white dark:text-slate-950 hover:bg-slate-800 dark:hover:bg-white transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
                  >
                    <Navigation className="h-3.5 w-3.5" />
                    <span>
                      {busyHazardId === selectedHazard.id
                        ? 'Allocating...'
                        : 'Assign Nearest Worker'}
                    </span>
                  </button>
                ) : selectedHazard.status === 'verified' ? (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400 whitespace-nowrap shrink-0">
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Verified Safe</span>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => onNavigateToVerify(selectedHazard.id)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Wrench className="h-3.5 w-3.5" />
                    <span>Verify Repair</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <CameraReportModal
        open={showCameraModal}
        autoUseGps={autoUseGps}
        onClose={() => setShowCameraModal(false)}
        onHazardReported={onHazardReported}
      />
    </div>
  );
}
