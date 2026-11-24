import { useEffect, useMemo } from 'react';
import { useMap } from '@vis.gl/react-google-maps';
import { GoogleMapsOverlay } from '@deck.gl/google-maps';
import { HeatmapLayer } from '@deck.gl/aggregation-layers';
import type { LayersList } from '@deck.gl/core';
import { HazardReport } from '../types/routix';

interface PotholeHeatmapLayerProps {
  hazards: HazardReport[];
  visible: boolean;
}

function hasWebGLSupport(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

function getSeverityHeatWeight(hazard: HazardReport): number {
  const severityFactor =
    hazard.severity === 'critical'
      ? 2.4
      : hazard.severity === 'high'
      ? 1.6
      : hazard.severity === 'moderate'
      ? 0.9
      : 0.5;
  const psiFactor = Math.max(0.2, hazard.priorityScore / 100);
  const swarmBoost = 1 + Math.min(1.5, (hazard.clusterVehicleHits || 1) / 25);
  return psiFactor * severityFactor * swarmBoost;
}

export function PotholeHeatmapLayer({
  hazards,
  visible,
}: PotholeHeatmapLayerProps) {
  const map = useMap();
  const webglReady = useMemo(() => hasWebGLSupport(), []);

  const overlay = useMemo(() => {
    if (!webglReady) return null;
    try {
      return new GoogleMapsOverlay({ interleaved: true });
    } catch {
      return null;
    }
  }, [webglReady]);

  const activeClusterData = useMemo(
    () => hazards.filter((h) => h.status !== 'verified'),
    [hazards]
  );

  const layers: LayersList = useMemo(() => {
    if (!visible || activeClusterData.length === 0) {
      return [];
    }
    return [
      new HeatmapLayer<HazardReport>({
        id: 'routix-pothole-density-heatmap',
        data: activeClusterData,
        getPosition: (d: HazardReport) => [d.lng, d.lat],
        getWeight: (d: HazardReport) => getSeverityHeatWeight(d),
        aggregation: 'SUM',
        radiusPixels: 58,
        intensity: 1.45,
        threshold: 0.05,
        colorRange: [
          [254, 240, 138, 110],
          [253, 186, 116, 160],
          [249, 115, 22, 195],
          [239, 68, 68, 220],
          [225, 29, 72, 235],
          [159, 18, 57, 245],
        ],
      }),
    ];
  }, [activeClusterData, visible]);

  useEffect(() => {
    if (!overlay || !map) return;
    try {
      overlay.setMap(map);
    } catch {
      // Ignore if map instance is tearing down
    }
    return () => {
      try {
        overlay.setMap(null);
      } catch {
        // Ignore cleanup errors
      }
    };
  }, [overlay, map]);

  useEffect(() => {
    if (!overlay) return;
    try {
      overlay.setProps({ layers });
    } catch {
      // Ignore transient WebGL context errors
    }
  }, [overlay, layers]);

  useEffect(() => {
    return () => {
      if (overlay) {
        try {
          overlay.finalize();
        } catch {
          // Ignore finalize errors
        }
      }
    };
  }, [overlay]);

  return null;
}
