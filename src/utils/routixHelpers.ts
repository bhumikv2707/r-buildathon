import { HazardStatus, ImuSignatureType, ManoeuvreType, SeverityLevel } from '../types/routix';

export const SAMPLE_IMAGES = {
  pothole: '/src/assets/images/sample_pothole_road_1794848761452.jpg',
  repaired: '/src/assets/images/sample_repaired_road_1794848761759.jpg',
  swerve: '/src/assets/images/sample_swerve_corridor_1794848762324.jpg',
};

export function haversineDistanceKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

export function formatSeverityLabel(severity: SeverityLevel): string {
  switch (severity) {
    case 'critical':
      return 'Critical';
    case 'high':
      return 'High Risk';
    case 'moderate':
      return 'Moderate';
    case 'low':
      return 'Low';
  }
}

export function formatStatusLabel(status: HazardStatus): string {
  switch (status) {
    case 'open':
      return 'Open Hazard';
    case 'dispatched':
      return 'Crew Dispatched';
    case 'pending_verification':
      return 'Awaiting CV Audit';
    case 'verified':
      return 'Verified Repaired';
  }
}

export function formatManoeuvreLabel(type: ManoeuvreType): string {
  switch (type) {
    case 'lane_swerve':
      return 'S-Curve Gyro Swerve';
    case 'sudden_braking':
      return 'Sudden Braking';
    case 'speed_drop':
      return 'Corridor Speed Drop';
    case 'none':
      return 'Nominal Flow';
  }
}

export function formatImuSignatureLabel(sig: ImuSignatureType): string {
  switch (sig) {
    case 'pothole_impact_spike':
      return 'Dip-then-Spike (>2.5g)';
    case 'gyro_swerve_dodge':
      return 'S-Curve Gyro Swerve';
    case 'sudden_braking':
      return 'Hard Deceleration';
    case 'speed_bump_filtered':
      return 'Smooth Bump (Filtered)';
    case 'nominal':
      return 'Nominal Cruise';
  }
}

export function formatTierLabel(tier: 'tier1_contractor' | 'micro_gig_squad'): string {
  return tier === 'tier1_contractor' ? 'Tier-1 Contractor' : 'Micro-Gig Squad';
}

export function formatSlaRemaining(deadlineIso: string): {
  text: string;
  urgent: boolean;
} {
  const diffMs = new Date(deadlineIso).getTime() - Date.now();
  if (diffMs <= 0) {
    return { text: 'SLA Overdue', urgent: true };
  }
  const totalMins = Math.floor(diffMs / 60000);
  const hrs = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  return {
    text: hrs > 0 ? `${hrs}h ${mins}m SLA` : `${mins}m SLA`,
    urgent: hrs < 3,
  };
}

export function formatRelativeTime(isoDate: string): string {
  const diffMs = Date.now() - new Date(isoDate).getTime();
  const mins = Math.max(1, Math.floor(diffMs / 60000));
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export async function urlToBase64(url: string): Promise<{ base64: string; mimeType: string }> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error('Unable to load image asset.');
  }
  const blob = await res.blob();
  const mimeType = blob.type || 'image/jpeg';
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      resolve({ base64: result, mimeType });
    };
    reader.onerror = () => reject(new Error('Failed to encode image.'));
    reader.readAsDataURL(blob);
  });
}

export function fileToBase64(file: File): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      resolve({ base64: result, mimeType: file.type || 'image/jpeg' });
    };
    reader.onerror = () => reject(new Error('Failed to read uploaded image file.'));
    reader.readAsDataURL(file);
  });
}
