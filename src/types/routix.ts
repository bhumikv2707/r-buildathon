export type SeverityLevel = 'critical' | 'high' | 'moderate' | 'low';

export type HazardStatus =
  | 'open'
  | 'dispatched'
  | 'pending_verification'
  | 'verified';

export type ManoeuvreType =
  | 'lane_swerve'
  | 'sudden_braking'
  | 'speed_drop'
  | 'none';

export type ImuSignatureType =
  | 'pothole_impact_spike'
  | 'gyro_swerve_dodge'
  | 'sudden_braking'
  | 'speed_bump_filtered'
  | 'nominal';

export interface PSIBreakdown {
  craterVolumeScore: number; // 40% weight
  trafficDensityScore: number; // 30% weight
  clusterHitsScore: number; // 20% weight
  monsoonRiskScore: number; // 10% weight
}

export interface CraterGeometry {
  surfaceAreaSqM: number;
  depthCm: number;
  volumeLiters: number;
  ircColdMixKg: number;
  ircBags25Kg: number;
  estimatedCostInr: number;
}

export interface VerificationChecklistItem {
  label: string;
  passed: boolean;
}

export interface RepairVerificationResult {
  verified: boolean;
  verdict: 'Verified Repaired' | 'Needs Rework' | 'Insufficient Evidence';
  surfaceFlushnessScore: number;
  geotagVerified: boolean;
  summary: string;
  checklist: VerificationChecklistItem[];
  verifiedAt?: string;
}

export type GovtGrantStatus = 'not_eligible' | 'pending_sanction' | 'sanctioned';

export interface WorkerApplication {
  id: string;
  workerId: string;
  workerName: string;
  distanceKm: number;
  note: string;
  appliedAt: string;
}

export interface HazardReport {
  id: string;
  title: string;
  streetName: string;
  corridor: string;
  ward: string;
  lat: number;
  lng: number;
  hazardType: string;
  severity: SeverityLevel;
  priorityScore: number; // PSI 0-100
  psiBreakdown: PSIBreakdown;
  craterGeometry: CraterGeometry;
  estimatedWidthCm: number;
  evasiveManoeuvreCount: number;
  clusterVehicleHits: number;
  imuSignature: ImuSignatureType;
  peakVerticalG: number;
  peakLateralG: number;
  dominantManoeuvre: ManoeuvreType;
  twoWheelerRisk: string;
  evasiveExplanation: string;
  recommendedAction: string;
  repairMaterialEstimate: string;
  microJobPayoutInr: number;
  slaHours: number;
  slaDeadlineAt: string;
  status: HazardStatus;
  photoUrl: string;
  afterPhotoUrl?: string;
  assignedWorkerId?: string;
  assignedWorkerName?: string;
  assignedDistanceKm?: number;
  assignedAt?: string;
  applications?: WorkerApplication[];
  govtGrantStatus?: GovtGrantStatus;
  govtSanctionedAmountInr?: number;
  govtSanctionRef?: string;
  govtSanctionedBy?: string;
  govtSanctionedAt?: string;
  escrowPoolStatus?: 'locked' | 'released';
  dbtTxnRef?: string;
  dbtDisbursedAt?: string;
  verification?: RepairVerificationResult;
  reportedAt: string;
}

export interface WorkerProfile {
  id: string;
  name: string;
  neighborhood: string;
  specialty: string;
  equipment?: string;
  tier: 'tier1_contractor' | 'micro_gig_squad';
  priorityTenderUnlocked: boolean;
  avgTurnaroundMins: number;
  lat: number;
  lng: number;
  available: boolean;
  verifiedByCity?: boolean;
  completedRepairs: number;
  totalEarnedInr: number;
  rating: number;
  phoneMask: string;
  joinedAt?: string;
}

export interface WardLeagueEntry {
  wardName: string;
  zoneCode: string;
  roadHealthScore: number;
  avgPatchHours: number;
  resolvedCount: number;
  unresolvedCount: number;
  budgetAllocatedInr: number;
  budgetSpentInr: number;
  escrowLockedInr: number;
}

export type CommuterRank =
  | 'Rookie Scout'
  | 'Corridor Watcher'
  | 'Pothole Hunter'
  | 'MVP Road Captain';

export interface CommuterScoutProfile {
  id: string;
  name: string;
  corridor: string;
  impactPoints: number;
  rank: CommuterRank;
  passiveKmMapped: number;
  confirmedClusters: number;
}

export interface RoadAnalysisResult {
  hazardDetected: boolean;
  speedBumpFiltered: boolean;
  hazardType: string;
  severity: SeverityLevel;
  estimatedWidthCm: number;
  craterGeometry: CraterGeometry;
  psiBreakdown: PSIBreakdown;
  priorityScore: number;
  twoWheelerRisk: string;
  evasiveManoeuvreRisk: ManoeuvreType;
  evasiveExplanation: string;
  recommendedAction: string;
  repairMaterialEstimate: string;
  suggestedPayoutInr: number;
}
