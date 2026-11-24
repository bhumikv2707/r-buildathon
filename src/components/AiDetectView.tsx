import { ChangeEvent, useEffect, useState } from 'react';
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Cpu,
  MapPin,
  Send,
  ShieldAlert,
  Upload,
} from 'lucide-react';
import {
  HazardReport,
  ImuSignatureType,
  RoadAnalysisResult,
} from '../types/routix';
import {
  fileToBase64,
  formatImuSignatureLabel,
  formatManoeuvreLabel,
  formatSeverityLabel,
  SAMPLE_IMAGES,
  urlToBase64,
} from '../utils/routixHelpers';

interface AiDetectViewProps {
  prefilledCoords: { lat: number; lng: number } | null;
  onHazardPublished: (hazard: HazardReport) => void;
}

const LOCATION_PRESETS = [
  {
    label: '100 Feet Road, Indiranagar',
    ward: 'Ward 80 · Indiranagar',
    lat: 12.9784,
    lng: 77.6408,
    corridor: 'East Arterial Corridor',
  },
  {
    label: 'Silk Board Service Road',
    ward: 'Ward 151 · Koramangala',
    lat: 12.9177,
    lng: 77.6238,
    corridor: 'South Outer Ring',
  },
  {
    label: 'Hebbal Flyover Approach',
    ward: 'Ward 80 · Indiranagar',
    lat: 13.0358,
    lng: 77.597,
    corridor: 'Airport Expressway',
  },
  {
    label: 'Whitefield Main Road',
    ward: 'Ward 150 · Bellandur',
    lat: 12.9698,
    lng: 77.7499,
    corridor: 'East Tech Corridor',
  },
];

function ImuWaveformPreview({ signature }: { signature: ImuSignatureType }) {
  // SVG waveform illustrating dip-then-spike (>2.5g) vs smooth speed bump vs S-curve swerve
  let path = 'M 0 28 L 280 28';
  let stroke = '#64748B';
  if (signature === 'pothole_impact_spike') {
    path =
      'M 0 28 L 70 28 L 88 29 L 100 48 L 116 4 L 130 40 L 145 22 L 160 28 L 280 28';
    stroke = '#E11D48';
  } else if (signature === 'gyro_swerve_dodge') {
    path =
      'M 0 28 L 55 28 C 80 28, 90 6, 120 6 C 150 6, 160 50, 190 50 C 215 50, 225 28, 250 28 L 280 28';
    stroke = '#D97706';
  } else if (signature === 'sudden_braking') {
    path = 'M 0 28 L 65 28 L 85 44 L 155 46 L 185 28 L 280 28';
    stroke = '#DC2626';
  } else if (signature === 'speed_bump_filtered') {
    path =
      'M 0 36 L 65 36 C 95 36, 110 12, 140 12 C 170 12, 185 36, 215 36 L 280 36';
    stroke = '#0284C7';
  }

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 px-3 py-2">
      <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 mb-1">
        <span>IMU / Gyro Waveform</span>
        <span className="font-mono">{formatImuSignatureLabel(signature)}</span>
      </div>
      <svg viewBox="0 0 280 56" className="h-12 w-full" aria-hidden="true">
        <line x1="0" y1="28" x2="280" y2="28" stroke="#64748B" strokeOpacity="0.4" strokeDasharray="3 3" />
        <path
          d={path}
          fill="none"
          stroke={stroke}
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

export function AiDetectView({
  prefilledCoords,
  onHazardPublished,
}: AiDetectViewProps) {
  const [imagePreview, setImagePreview] = useState<string>(SAMPLE_IMAGES.pothole);
  const [imageBase64, setImageBase64] = useState<string>('');
  const [imageMimeType, setImageMimeType] = useState<string>('image/jpeg');
  const [streetName, setStreetName] = useState<string>(LOCATION_PRESETS[1].label);
  const [ward, setWard] = useState<string>(LOCATION_PRESETS[1].ward);
  const [corridor, setCorridor] = useState<string>(LOCATION_PRESETS[1].corridor);
  const [lat, setLat] = useState<number>(LOCATION_PRESETS[1].lat);
  const [lng, setLng] = useState<number>(LOCATION_PRESETS[1].lng);

  const [imuSignature, setImuSignature] =
    useState<ImuSignatureType>('pothole_impact_spike');
  const [peakVerticalG, setPeakVerticalG] = useState<number>(3.05);
  const [peakLateralG, setPeakLateralG] = useState<number>(0.42);
  const [clusterHits, setClusterHits] = useState<number>(24);
  const [trafficDensityScore, setTrafficDensityScore] = useState<number>(85);
  const [monsoonRiskScore, setMonsoonRiskScore] = useState<number>(80);

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<RoadAnalysisResult | null>(null);
  const [publishedId, setPublishedId] = useState<string | null>(null);

  useEffect(() => {
    if (prefilledCoords) {
      setLat(Number(prefilledCoords.lat.toFixed(5)));
      setLng(Number(prefilledCoords.lng.toFixed(5)));
      setStreetName(
        `Scanned Pin (${prefilledCoords.lat.toFixed(4)}, ${prefilledCoords.lng.toFixed(4)})`
      );
    }
  }, [prefilledCoords]);

  const handleSelectSample = (
    url: string,
    sig: ImuSignatureType,
    vG: number,
    lG: number,
    hits: number
  ) => {
    setErrorMsg(null);
    setAnalysis(null);
    setPublishedId(null);
    setImagePreview(url);
    setImageBase64('');
    setImuSignature(sig);
    setPeakVerticalG(vG);
    setPeakLateralG(lG);
    setClusterHits(hits);
  };

  const handleFileUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorMsg(null);
    setAnalysis(null);
    setPublishedId(null);
    try {
      const encoded = await fileToBase64(file);
      setImagePreview(encoded.base64);
      setImageBase64(encoded.base64);
      setImageMimeType(encoded.mimeType);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to read image.');
    }
  };

  const handleRunAnalysis = async () => {
    setIsAnalyzing(true);
    setErrorMsg(null);
    setPublishedId(null);

    try {
      let payloadBase64 = imageBase64;
      let payloadMime = imageMimeType;

      if (!payloadBase64) {
        const encoded = await urlToBase64(imagePreview);
        payloadBase64 = encoded.base64;
        payloadMime = encoded.mimeType;
      }

      const res = await fetch('/api/analyze-road', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: payloadBase64,
          mimeType: payloadMime,
          streetName,
          imuSignature,
          peakVerticalG,
          peakLateralG,
          clusterHits,
          trafficDensityScore,
          monsoonRiskScore,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Road analysis failed.');
      }
      setAnalysis(data.analysis as RoadAnalysisResult);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Analysis failed.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handlePublishHazard = async () => {
    if (!analysis) return;
    setIsPublishing(true);
    setErrorMsg(null);

    try {
      const res = await fetch('/api/hazards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `${analysis.hazardType} — ${streetName.split(',')[0]}`,
          streetName,
          corridor,
          ward,
          lat,
          lng,
          hazardType: analysis.hazardType,
          severity: analysis.severity,
          priorityScore: analysis.priorityScore,
          psiBreakdown: analysis.psiBreakdown,
          craterGeometry: analysis.craterGeometry,
          estimatedWidthCm: analysis.estimatedWidthCm,
          evasiveManoeuvreCount: Math.max(clusterHits, Math.round(peakLateralG * 60)),
          clusterVehicleHits: clusterHits,
          imuSignature,
          peakVerticalG,
          peakLateralG,
          dominantManoeuvre: analysis.evasiveManoeuvreRisk,
          twoWheelerRisk: analysis.twoWheelerRisk,
          evasiveExplanation: analysis.evasiveExplanation,
          recommendedAction: analysis.recommendedAction,
          repairMaterialEstimate: analysis.repairMaterialEstimate,
          microJobPayoutInr: analysis.suggestedPayoutInr,
          photoUrl: imagePreview,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Could not publish hazard.');
      }
      setPublishedId(data.hazard.id);
      onHazardPublished(data.hazard as HazardReport);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not publish hazard.');
    } finally {
      setIsPublishing(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Left: Dual-Stream Capture (Passive IMU Swarm + Active Edge CV) */}
      <div className="lg:col-span-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            01. Dual-Stream Swarm Sensing (IMU + Edge Vision)
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Fuses passive smartphone IMU shock/gyroscope spikes with active edge computer vision (YOLOv8 + monocular depth estimation).
          </p>
        </div>

        {/* Sample Capture Selector */}
        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
            Sample Sensor + Visual Captures
          </label>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() =>
                handleSelectSample(
                  SAMPLE_IMAGES.pothole,
                  'pothole_impact_spike',
                  3.05,
                  0.42,
                  24
                )
              }
              className={`rounded-lg border p-2 text-left text-xs transition-colors cursor-pointer ${
                imagePreview === SAMPLE_IMAGES.pothole
                  ? 'border-slate-900 dark:border-slate-100 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-950'
                  : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700'
              }`}
            >
              <div className="font-semibold truncate">Waterlogged Crater</div>
              <div className="opacity-75 mt-0.5 truncate">3.05g dip-spike</div>
            </button>
            <button
              type="button"
              onClick={() =>
                handleSelectSample(
                  SAMPLE_IMAGES.swerve,
                  'gyro_swerve_dodge',
                  2.55,
                  0.46,
                  19
                )
              }
              className={`rounded-lg border p-2 text-left text-xs transition-colors cursor-pointer ${
                imagePreview === SAMPLE_IMAGES.swerve
                  ? 'border-slate-900 dark:border-slate-100 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-950'
                  : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700'
              }`}
            >
              <div className="font-semibold truncate">Two-Wheeler Swerve</div>
              <div className="opacity-75 mt-0.5 truncate">S-curve gyro dodge</div>
            </button>
            <button
              type="button"
              onClick={() =>
                handleSelectSample(
                  SAMPLE_IMAGES.repaired,
                  'speed_bump_filtered',
                  1.35,
                  0.06,
                  3
                )
              }
              className={`rounded-lg border p-2 text-left text-xs transition-colors cursor-pointer ${
                imagePreview === SAMPLE_IMAGES.repaired
                  ? 'border-slate-900 dark:border-slate-100 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-950'
                  : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700'
              }`}
            >
              <div className="font-semibold truncate">Smooth / Bump Test</div>
              <div className="opacity-75 mt-0.5 truncate">Bump filter check</div>
            </button>
          </div>
        </div>

        {/* Visual Frame & Upload */}
        <div className="space-y-2">
          <div className="relative aspect-16/9 w-full overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800">
            <img
              src={imagePreview}
              alt="Road surface capture for AI inspection"
              referrerPolicy="no-referrer"
              className="h-full w-full object-cover"
            />
          </div>
          <label className="inline-flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors cursor-pointer">
            <Upload className="h-3.5 w-3.5" />
            <span>Upload Road Frame</span>
            <input
              type="file"
              accept="image/*"
              onChange={handleFileUpload}
              className="sr-only"
            />
          </label>
        </div>

        {/* Stream 1: Passive IMU & Gyroscope Signature */}
        <div className="border-t border-slate-100 dark:border-slate-800 pt-3.5 space-y-2.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-800 dark:text-slate-200">
              Stream 1: Passive IMU &amp; Gyroscope Signature
            </span>
            <span className="font-mono text-slate-600 dark:text-slate-400 tabular-nums">
              Z: {peakVerticalG.toFixed(2)}g · Lat: {peakLateralG.toFixed(2)}g
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
            {(
              [
                {
                  id: 'pothole_impact_spike',
                  label: '>2.5g Dip-Spike',
                  vG: 3.05,
                  lG: 0.42,
                },
                {
                  id: 'gyro_swerve_dodge',
                  label: 'S-Curve Swerve',
                  vG: 2.55,
                  lG: 0.46,
                },
                {
                  id: 'sudden_braking',
                  label: 'Hard Braking',
                  vG: 2.68,
                  lG: 0.25,
                },
                {
                  id: 'speed_bump_filtered',
                  label: 'Speed Bump',
                  vG: 1.45,
                  lG: 0.05,
                },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => {
                  setImuSignature(opt.id);
                  setPeakVerticalG(opt.vG);
                  setPeakLateralG(opt.lG);
                }}
                className={`rounded-md border px-2 py-1.5 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                  imuSignature === opt.id
                    ? 'border-rose-600 bg-rose-50 dark:bg-rose-950/50 text-rose-800 dark:text-rose-300'
                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <ImuWaveformPreview signature={imuSignature} />
        </div>

        {/* PSI Weighting Inputs & Location */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 border-t border-slate-100 dark:border-slate-800 pt-3.5">
          <div>
            <label
              htmlFor="psi-cluster-input"
              className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1"
            >
              Swarm Cluster Hits
            </label>
            <input
              id="psi-cluster-input"
              type="number"
              min={1}
              max={100}
              value={clusterHits}
              onChange={(e) => setClusterHits(Number(e.target.value))}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2.5 py-1.5 font-mono text-xs text-slate-900 dark:text-slate-100 tabular-nums"
            />
          </div>
          <div>
            <label
              htmlFor="psi-traffic-input"
              className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1"
            >
              Traffic Density (0–100)
            </label>
            <input
              id="psi-traffic-input"
              type="number"
              min={10}
              max={100}
              value={trafficDensityScore}
              onChange={(e) => setTrafficDensityScore(Number(e.target.value))}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2.5 py-1.5 font-mono text-xs text-slate-900 dark:text-slate-100 tabular-nums"
            />
          </div>
          <div>
            <label
              htmlFor="psi-monsoon-input"
              className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1"
            >
              Monsoon Risk (0–100)
            </label>
            <input
              id="psi-monsoon-input"
              type="number"
              min={10}
              max={100}
              value={monsoonRiskScore}
              onChange={(e) => setMonsoonRiskScore(Number(e.target.value))}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2.5 py-1.5 font-mono text-xs text-slate-900 dark:text-slate-100 tabular-nums"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <label
              htmlFor="routix-street-input"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
            >
              Road / Ward Location
            </label>
            <div className="flex gap-2">
              <input
                id="routix-street-input"
                type="text"
                value={streetName}
                onChange={(e) => setStreetName(e.target.value)}
                className="flex-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-1.5 text-sm text-slate-900 dark:text-slate-100 focus:border-slate-400 focus:bg-white dark:focus:bg-slate-800 focus:outline-none"
              />
              <select
                aria-label="Choose preset corridor"
                value=""
                onChange={(e) => {
                  const found = LOCATION_PRESETS.find((p) => p.label === e.target.value);
                  if (found) {
                    setStreetName(found.label);
                    setWard(found.ward);
                    setCorridor(found.corridor);
                    setLat(found.lat);
                    setLng(found.lng);
                  }
                }}
                className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs text-slate-700 dark:text-slate-200 focus:outline-none"
              >
                <option value="">Presets...</option>
                {LOCATION_PRESETS.map((p) => (
                  <option key={p.label} value={p.label}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label
              htmlFor="routix-lat-input"
              className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1"
            >
              Latitude
            </label>
            <input
              id="routix-lat-input"
              type="number"
              step="0.0001"
              value={lat}
              onChange={(e) => setLat(Number(e.target.value))}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2.5 py-1.5 font-mono text-xs text-slate-900 dark:text-slate-100 tabular-nums"
            />
          </div>
          <div>
            <label
              htmlFor="routix-lng-input"
              className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1"
            >
              Longitude
            </label>
            <input
              id="routix-lng-input"
              type="number"
              step="0.0001"
              value={lng}
              onChange={(e) => setLng(Number(e.target.value))}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2.5 py-1.5 font-mono text-xs text-slate-900 dark:text-slate-100 tabular-nums"
            />
          </div>
        </div>

        <button
          type="button"
          onClick={handleRunAnalysis}
          disabled={isAnalyzing}
          className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 dark:bg-slate-100 px-4 py-2.5 text-sm font-semibold text-white dark:text-slate-950 hover:bg-slate-800 dark:hover:bg-white transition-colors cursor-pointer disabled:opacity-60"
        >
          <Cpu className="h-4 w-4" />
          <span>
            {isAnalyzing
              ? 'Computing PSI & Crater Depth Estimate...'
              : 'Run Dual-Stream Detection & PSI Triage'}
          </span>
        </button>

        {errorMsg && (
          <div className="flex items-start gap-2 rounded-lg border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/50 p-3 text-xs text-rose-800 dark:text-rose-200">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}
      </div>

      {/* Right: Pothole Severity Index (PSI) + IRC:SP:100 Estimate */}
      <div className="lg:col-span-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-5">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            02. AI Triage, PSI (0–100) &amp; IRC:SP:100 Estimate
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Weighted PSI: Crater Volume (40%) · Traffic Density (30%) · Cluster Hits (20%) · Monsoon Risk (10%).
          </p>
        </div>

        {!analysis && !isAnalyzing && (
          <div className="rounded-lg border border-dashed border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/40 p-10 text-center space-y-2">
            <Activity className="h-7 w-7 text-slate-400 mx-auto" />
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
              Ready for Dual-Stream AI Triage
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
              Run detection to calculate monocular crater volume, Pothole Severity Index (PSI), and exact IRC:SP:100 cold-mix material requirements without manual site inspection.
            </p>
          </div>
        )}

        {isAnalyzing && (
          <div className="space-y-3 py-6">
            <div className="h-20 w-full animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
            <div className="h-24 w-full animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
            <div className="h-20 w-full animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
          </div>
        )}

        {analysis && !isAnalyzing && (
          <div className="space-y-4">
            {/* Primary PSI Verdict */}
            <div
              className={`flex items-center justify-between gap-4 rounded-lg border p-4 ${
                analysis.hazardDetected
                  ? 'border-rose-200 dark:border-rose-900/70 bg-rose-50/60 dark:bg-rose-950/35'
                  : 'border-emerald-200 dark:border-emerald-900/70 bg-emerald-50/60 dark:bg-emerald-950/35'
              }`}
            >
              <div className="flex items-start gap-3">
                {analysis.hazardDetected ? (
                  <ShieldAlert className="h-5 w-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                ) : (
                  <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                )}
                <div>
                  <div className="text-xs font-medium text-slate-600 dark:text-slate-300">
                    {analysis.speedBumpFiltered
                      ? 'Smooth Speed Bump Filtered'
                      : analysis.hazardDetected
                      ? 'Hazard Confirmed'
                      : 'Surface Clear'}{' '}
                    · {formatSeverityLabel(analysis.severity)}
                  </div>
                  <div className="text-base font-bold text-slate-900 dark:text-white">
                    {analysis.hazardType}
                  </div>
                </div>
              </div>

              <div className="text-right shrink-0">
                <div className="font-mono text-2xl font-bold text-slate-900 dark:text-white tabular-nums">
                  {analysis.priorityScore}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">PSI / 100</div>
              </div>
            </div>

            {/* Weighted PSI Breakdown Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-200 dark:divide-slate-800 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60">
              <div className="px-3 py-2.5">
                <div className="text-[11px] text-slate-500 dark:text-slate-400">Volume (40%)</div>
                <div className="font-mono text-sm font-bold text-slate-900 dark:text-white tabular-nums mt-0.5">
                  {analysis.psiBreakdown.craterVolumeScore}
                </div>
              </div>
              <div className="px-3 py-2.5">
                <div className="text-[11px] text-slate-500 dark:text-slate-400">Traffic (30%)</div>
                <div className="font-mono text-sm font-bold text-slate-900 dark:text-white tabular-nums mt-0.5">
                  {analysis.psiBreakdown.trafficDensityScore}
                </div>
              </div>
              <div className="px-3 py-2.5">
                <div className="text-[11px] text-slate-500 dark:text-slate-400">Cluster (20%)</div>
                <div className="font-mono text-sm font-bold text-slate-900 dark:text-white tabular-nums mt-0.5">
                  {analysis.psiBreakdown.clusterHitsScore}
                </div>
              </div>
              <div className="px-3 py-2.5">
                <div className="text-[11px] text-slate-500 dark:text-slate-400">Monsoon (10%)</div>
                <div className="font-mono text-sm font-bold text-slate-900 dark:text-white tabular-nums mt-0.5">
                  {analysis.psiBreakdown.monsoonRiskScore}
                </div>
              </div>
            </div>

            {/* Monocular Depth & IRC:SP:100 Estimate */}
            <dl className="divide-y divide-slate-100 dark:divide-slate-800 rounded-lg border border-slate-200 dark:border-slate-800">
              <div className="grid grid-cols-3 gap-3 px-4 py-3 text-xs">
                <dt className="text-slate-500 dark:text-slate-400 font-medium">Edge CV Geometry</dt>
                <dd className="col-span-2 font-mono text-slate-900 dark:text-slate-100 tabular-nums">
                  {analysis.craterGeometry.surfaceAreaSqM} m² ·{' '}
                  {analysis.craterGeometry.depthCm} cm deep ·{' '}
                  {analysis.craterGeometry.volumeLiters} L volume
                </dd>
              </div>
              <div className="grid grid-cols-3 gap-3 px-4 py-3 text-xs">
                <dt className="text-slate-500 dark:text-slate-400 font-medium">IRC:SP:100 Material</dt>
                <dd className="col-span-2 text-slate-900 dark:text-slate-100">
                  <span className="font-mono font-semibold">
                    {analysis.repairMaterialEstimate}
                  </span>
                  <span className="text-slate-500 dark:text-slate-400">
                    {' '}
                    · Est. Cost ₹{analysis.suggestedPayoutInr} (15–30 min cold-mix)
                  </span>
                </dd>
              </div>
              <div className="grid grid-cols-3 gap-3 px-4 py-3 text-xs">
                <dt className="text-slate-500 dark:text-slate-400 font-medium">Manoeuvre &amp; IMU</dt>
                <dd className="col-span-2 text-slate-800 dark:text-slate-200">
                  <span className="font-semibold">
                    {formatManoeuvreLabel(analysis.evasiveManoeuvreRisk)}
                  </span>
                  <p className="text-slate-600 dark:text-slate-400 mt-0.5">
                    {analysis.evasiveExplanation}
                  </p>
                </dd>
              </div>
              <div className="grid grid-cols-3 gap-3 px-4 py-3 text-xs">
                <dt className="text-slate-500 dark:text-slate-400 font-medium">Two-Wheeler Risk</dt>
                <dd className="col-span-2 text-slate-700 dark:text-slate-300 leading-relaxed">
                  {analysis.twoWheelerRisk}
                </dd>
              </div>
            </dl>

            {publishedId ? (
              <div className="flex items-center justify-between gap-3 rounded-lg border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/40 px-4 py-3 text-sm text-emerald-900 dark:text-emerald-200">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-700 dark:text-emerald-400 shrink-0" />
                  <span>
                    Published <strong className="font-mono">{publishedId}</strong> with SLA timer to Civic Command.
                  </span>
                </div>
                <MapPin className="h-4 w-4 text-emerald-700 dark:text-emerald-400 shrink-0" />
              </div>
            ) : (
              <button
                type="button"
                disabled={isPublishing || !analysis.hazardDetected}
                onClick={handlePublishHazard}
                className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-700 transition-colors cursor-pointer disabled:opacity-50"
              >
                <Send className="h-4 w-4" />
                <span>
                  {isPublishing
                    ? 'Publishing to Civic Command...'
                    : analysis.hazardDetected
                    ? 'Publish PSI Ticket to Map & Civic Command'
                    : 'Filtered / Clear Surface — No Ticket Needed'}
                </span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
