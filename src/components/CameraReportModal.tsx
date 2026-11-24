import { ChangeEvent, useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Camera,
  CheckCircle2,
  LocateFixed,
  RefreshCw,
  RotateCcw,
  Send,
  Upload,
  X,
} from 'lucide-react';
import { HazardReport, RoadAnalysisResult } from '../types/routix';
import { fileToBase64, formatSeverityLabel } from '../utils/routixHelpers';

interface CameraReportModalProps {
  open: boolean;
  autoUseGps?: boolean;
  onClose: () => void;
  onHazardReported: (hazard: HazardReport) => Promise<void> | void;
}

const ROAD_PRESETS = [
  {
    label: '100 Feet Road, Indiranagar',
    ward: 'Ward 80 · Indiranagar',
    corridor: 'East Arterial Corridor',
    lat: 12.9784,
    lng: 77.6408,
  },
  {
    label: 'Silk Board Service Road',
    ward: 'Ward 151 · Koramangala',
    corridor: 'South Outer Ring',
    lat: 12.9177,
    lng: 77.6238,
  },
  {
    label: 'Outer Ring Road, Bellandur',
    ward: 'Ward 150 · Bellandur',
    corridor: 'IT Tech Corridor',
    lat: 12.9279,
    lng: 77.6762,
  },
  {
    label: 'Whitefield Main Road',
    ward: 'Ward 82 · Whitefield',
    corridor: 'East Tech Corridor',
    lat: 12.9698,
    lng: 77.7499,
  },
];

export function CameraReportModal({
  open,
  autoUseGps = false,
  onClose,
  onHazardReported,
}: CameraReportModalProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [cameraState, setCameraState] = useState<
    'starting' | 'streaming' | 'captured' | 'unavailable'
  >('starting');
  const [cameraError, setCameraError] = useState<string | null>(null);

  const [capturedImage, setCapturedImage] = useState<string>('');
  const [capturedMimeType, setCapturedMimeType] = useState<string>('image/jpeg');

  const [streetName, setStreetName] = useState<string>(ROAD_PRESETS[0].label);
  const [ward, setWard] = useState<string>(ROAD_PRESETS[0].ward);
  const [corridor, setCorridor] = useState<string>(ROAD_PRESETS[0].corridor);
  const [lat, setLat] = useState<number>(ROAD_PRESETS[0].lat);
  const [lng, setLng] = useState<number>(ROAD_PRESETS[0].lng);
  const [gpsStatus, setGpsStatus] = useState<string | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [pendingReviewAnalysis, setPendingReviewAnalysis] =
    useState<RoadAnalysisResult | null>(null);

  const stopCameraStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const startCameraStream = useCallback(async () => {
    stopCameraStream();
    setCameraState('starting');
    setCameraError(null);

    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices ||
      !navigator.mediaDevices.getUserMedia
    ) {
      setCameraState('unavailable');
      setCameraError(
        'Live camera access is unavailable in this browser. Upload or capture a photo below.'
      );
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
      setCameraState('streaming');
    } catch (err) {
      setCameraState('unavailable');
      const message =
        err instanceof Error && err.name === 'NotAllowedError'
          ? 'Camera permission was denied. Allow camera access or upload a road photo below.'
          : 'No active camera stream detected. Use your device camera or upload a photo below.';
      setCameraError(message);
    }
  }, [facingMode, stopCameraStream]);

  useEffect(() => {
    if (!open) {
      stopCameraStream();
      setCapturedImage('');
      setPendingReviewAnalysis(null);
      setSubmitError(null);
      setGpsStatus(null);
      return;
    }

    if (!capturedImage) {
      startCameraStream();
    }

    return () => {
      stopCameraStream();
    };
  }, [open, capturedImage, startCameraStream, stopCameraStream]);

  const handleCaptureFrame = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) {
      setCameraError('Camera video frame is not ready yet.');
      return;
    }

    const maxWidth = 1024;
    const scale = Math.min(1, maxWidth / video.videoWidth);
    const width = Math.round(video.videoWidth * scale);
    const height = Math.round(video.videoHeight * scale);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, width, height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);

    stopCameraStream();
    setCapturedImage(dataUrl);
    setCapturedMimeType('image/jpeg');
    setCameraState('captured');
    setPendingReviewAnalysis(null);
    setSubmitError(null);
  };

  const handleFileFallback = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSubmitError(null);
    setPendingReviewAnalysis(null);
    try {
      const encoded = await fileToBase64(file);
      stopCameraStream();
      setCapturedImage(encoded.base64);
      setCapturedMimeType(encoded.mimeType);
      setCameraState('captured');
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : 'Unable to load captured image.'
      );
    }
  };

  const handleRetake = () => {
    setCapturedImage('');
    setPendingReviewAnalysis(null);
    setSubmitError(null);
    startCameraStream();
  };

  const handleUseMyGps = useCallback(() => {
    if (!navigator.geolocation) {
      setGpsStatus('Geolocation not supported by this browser.');
      return;
    }
    setGpsStatus('Reading GPS...');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(Number(pos.coords.latitude.toFixed(5)));
        setLng(Number(pos.coords.longitude.toFixed(5)));
        setGpsStatus(
          `Locked GPS (${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)})`
        );
      },
      () => {
        setGpsStatus('GPS permission unavailable — using selected corridor coordinates.');
      },
      { enableHighAccuracy: true, timeout: 6000 }
    );
  }, []);

  useEffect(() => {
    if (open && autoUseGps) {
      handleUseMyGps();
    }
  }, [open, autoUseGps, handleUseMyGps]);

  const publishHazardRecord = async (analysis: RoadAnalysisResult) => {
    const cleanHazardType = analysis.hazardDetected ? analysis.hazardType : 'Citizen Road Hazard';
    const res = await fetch('/api/hazards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: `${cleanHazardType} — ${streetName.split(',')[0]}`,
        streetName,
        corridor,
        ward,
        lat,
        lng,
        hazardType: cleanHazardType,
        severity: analysis.severity,
        priorityScore: Math.max(45, analysis.priorityScore),
        psiBreakdown: analysis.psiBreakdown,
        craterGeometry: analysis.craterGeometry,
        estimatedWidthCm: analysis.estimatedWidthCm,
        evasiveManoeuvreCount: 8,
        clusterVehicleHits: 10,
        imuSignature: 'pothole_impact_spike',
        peakVerticalG: 2.75,
        peakLateralG: 0.34,
        dominantManoeuvre: analysis.evasiveManoeuvreRisk,
        twoWheelerRisk: analysis.twoWheelerRisk,
        evasiveExplanation:
          analysis.evasiveExplanation ||
          'Reported directly via live camera capture from the map view.',
        recommendedAction: analysis.recommendedAction,
        repairMaterialEstimate: analysis.repairMaterialEstimate,
        microJobPayoutInr: analysis.suggestedPayoutInr,
        photoUrl: capturedImage,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Could not publish hazard report.');
    }

    await onHazardReported(data.hazard as HazardReport);
    onClose();
  };

  const handleAnalyzeAndReport = async () => {
    if (!capturedImage) return;
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const analyzeRes = await fetch('/api/analyze-road', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: capturedImage,
          mimeType: capturedMimeType,
          streetName,
          imuSignature: 'pothole_impact_spike',
          peakVerticalG: 2.75,
          peakLateralG: 0.34,
          clusterHits: 10,
          trafficDensityScore: 76,
          monsoonRiskScore: 70,
        }),
      });

      const analyzeJson = await analyzeRes.json();
      if (!analyzeRes.ok) {
        throw new Error(analyzeJson.error || 'AI road inspection failed.');
      }

      const result = analyzeJson.analysis as RoadAnalysisResult;
      if (!result.hazardDetected) {
        setPendingReviewAnalysis(result);
        setIsSubmitting(false);
        return;
      }

      await publishHazardRecord(result);
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : 'Unable to submit road report.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="camera-report-title"
    >
      <div className="w-full max-w-2xl rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400">
              <Camera className="h-4 w-4" />
            </div>
            <div>
              <h2
                id="camera-report-title"
                className="text-base font-semibold text-slate-900 dark:text-white"
              >
                Camera Hazard Report
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Capture a road defect directly from the map to triage PSI &amp; alert nearby crews.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
            aria-label="Close camera modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 max-h-[82vh] overflow-y-auto">
          {/* Viewport: Live Camera or Captured Photo */}
          <div className="relative aspect-16/9 w-full overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-950 flex items-center justify-center">
            {capturedImage ? (
              <img
                src={capturedImage}
                alt="Captured road problem"
                className="h-full w-full object-cover"
              />
            ) : cameraState === 'unavailable' ? (
              <div className="px-6 text-center space-y-3">
                <Camera className="h-9 w-9 text-slate-400 mx-auto" />
                <p className="text-xs text-slate-200 max-w-sm mx-auto leading-relaxed">
                  {cameraError}
                </p>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={startCameraStream}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-600 bg-slate-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700 cursor-pointer"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    <span>Retry Camera</span>
                  </button>
                  <label className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-700 cursor-pointer">
                    <Upload className="h-3.5 w-3.5" />
                    <span>Take / Upload Photo</span>
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={handleFileFallback}
                      className="sr-only"
                    />
                  </label>
                </div>
              </div>
            ) : (
              <>
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="h-full w-full object-cover"
                />
                {cameraState === 'starting' && (
                  <div className="absolute inset-0 flex items-center justify-center bg-slate-950/70 text-xs text-slate-200">
                    Starting camera feed...
                  </div>
                )}
              </>
            )}

            {/* Overlay Controls while Streaming */}
            {!capturedImage && cameraState === 'streaming' && (
              <div className="absolute bottom-3 inset-x-3 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setFacingMode((m) => (m === 'environment' ? 'user' : 'environment'))
                  }
                  className="inline-flex items-center gap-1.5 rounded-lg bg-slate-950/75 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-900 backdrop-blur-xs cursor-pointer"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  <span>Flip Camera</span>
                </button>

                <button
                  type="button"
                  onClick={handleCaptureFrame}
                  className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-xs font-semibold text-white shadow-md hover:bg-rose-700 cursor-pointer"
                >
                  <Camera className="h-4 w-4" />
                  <span>Snap Road Photo</span>
                </button>

                <label className="inline-flex items-center gap-1.5 rounded-lg bg-slate-950/75 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-900 backdrop-blur-xs cursor-pointer">
                  <Upload className="h-3.5 w-3.5" />
                  <span>Upload</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileFallback}
                    className="sr-only"
                  />
                </label>
              </div>
            )}

            {/* Retake button over captured image */}
            {capturedImage && (
              <div className="absolute top-3 right-3">
                <button
                  type="button"
                  onClick={handleRetake}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-slate-950/80 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-900 backdrop-blur-xs cursor-pointer"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>Retake</span>
                </button>
              </div>
            )}
          </div>

          {/* Location Selector + GPS Lock */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Corridor Preset
              </label>
              <select
                value={
                  ROAD_PRESETS.find((p) => p.label === streetName)?.label ?? 'custom'
                }
                onChange={(e) => {
                  const found = ROAD_PRESETS.find((p) => p.label === e.target.value);
                  if (found) {
                    setStreetName(found.label);
                    setWard(found.ward);
                    setCorridor(found.corridor);
                    setLat(found.lat);
                    setLng(found.lng);
                  }
                }}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs text-slate-900 dark:text-slate-100 focus:border-slate-400 focus:outline-none"
              >
                {ROAD_PRESETS.map((p) => (
                  <option key={p.label} value={p.label}>
                    {p.label} ({p.ward})
                  </option>
                ))}
                <option value="custom">Custom Street Location</option>
              </select>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Road / Landmark Name
                </label>
                <button
                  type="button"
                  onClick={handleUseMyGps}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-rose-700 dark:text-rose-400 hover:text-rose-800 dark:hover:text-rose-300 cursor-pointer"
                >
                  <LocateFixed className="h-3 w-3" />
                  <span>Use My GPS</span>
                </button>
              </div>
              <input
                type="text"
                value={streetName}
                onChange={(e) => setStreetName(e.target.value)}
                placeholder="Enter road or junction..."
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs text-slate-900 dark:text-slate-100 focus:border-slate-400 focus:outline-none"
              />
            </div>
          </div>

          {gpsStatus && (
            <p className="text-[11px] font-mono text-slate-600 dark:text-slate-400">{gpsStatus}</p>
          )}

          {/* Review Notice if Gemini did not detect a road defect */}
          {pendingReviewAnalysis && (
            <div className="rounded-lg border border-amber-200 dark:border-amber-900/70 bg-amber-50 dark:bg-amber-950/40 p-3.5 text-xs text-amber-950 dark:text-amber-100 space-y-2">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">
                    AI Road Check: {pendingReviewAnalysis.hazardType} (
                    {formatSeverityLabel(pendingReviewAnalysis.severity)})
                  </p>
                  <p className="mt-0.5 text-amber-900 dark:text-amber-200 leading-relaxed">
                    {pendingReviewAnalysis.twoWheelerRisk ||
                      pendingReviewAnalysis.recommendedAction}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleRetake}
                  className="rounded-md border border-amber-300 dark:border-amber-800 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-medium text-amber-950 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-950 cursor-pointer"
                >
                  Retake Photo
                </button>
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={async () => {
                    setIsSubmitting(true);
                    try {
                      await publishHazardRecord(pendingReviewAnalysis);
                    } catch (err) {
                      setSubmitError(
                        err instanceof Error ? err.message : 'Publish failed.'
                      );
                    } finally {
                      setIsSubmitting(false);
                    }
                  }}
                  className="rounded-md bg-slate-900 dark:bg-slate-100 px-3 py-1.5 text-xs font-semibold text-white dark:text-slate-950 hover:bg-slate-800 dark:hover:bg-white cursor-pointer disabled:opacity-50"
                >
                  Publish Report Anyway
                </button>
              </div>
            </div>
          )}

          {submitError && (
            <div className="flex items-center gap-2 rounded-lg border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/50 px-3.5 py-2.5 text-xs text-rose-800 dark:text-rose-200">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{submitError}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 px-5 py-3.5">
          <span className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
            GPS: {lat.toFixed(4)}, {lng.toFixed(4)}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!capturedImage || isSubmitting}
              onClick={handleAnalyzeAndReport}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 dark:bg-slate-100 px-4 py-2 text-xs font-semibold text-white dark:text-slate-950 hover:bg-slate-800 dark:hover:bg-white transition-colors cursor-pointer disabled:opacity-50 disabled:pointer-events-none"
            >
              <Send className="h-3.5 w-3.5" />
              <span>
                {isSubmitting ? 'Analyzing & Publishing...' : 'Analyze & Report Problem'}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
