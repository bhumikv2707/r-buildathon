import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'routix-db.json');

type ImuSignatureType =
  | 'pothole_impact_spike'
  | 'gyro_swerve_dodge'
  | 'sudden_braking'
  | 'speed_bump_filtered'
  | 'nominal';

type CommuterRank =
  | 'Rookie Scout'
  | 'Corridor Watcher'
  | 'Pothole Hunter'
  | 'MVP Road Captain';

interface PSIBreakdown {
  craterVolumeScore: number;
  trafficDensityScore: number;
  clusterHitsScore: number;
  monsoonRiskScore: number;
}

interface CraterGeometry {
  surfaceAreaSqM: number;
  depthCm: number;
  volumeLiters: number;
  ircColdMixKg: number;
  ircBags25Kg: number;
  estimatedCostInr: number;
}

interface WorkerApplicationRecord {
  id: string;
  workerId: string;
  workerName: string;
  distanceKm: number;
  note: string;
  appliedAt: string;
}

interface HazardRecord {
  id: string;
  title: string;
  streetName: string;
  corridor: string;
  ward: string;
  lat: number;
  lng: number;
  hazardType: string;
  severity: 'critical' | 'high' | 'moderate' | 'low';
  priorityScore: number;
  psiBreakdown: PSIBreakdown;
  craterGeometry: CraterGeometry;
  estimatedWidthCm: number;
  evasiveManoeuvreCount: number;
  clusterVehicleHits: number;
  imuSignature: ImuSignatureType;
  peakVerticalG: number;
  peakLateralG: number;
  dominantManoeuvre: 'lane_swerve' | 'sudden_braking' | 'speed_drop' | 'none';
  twoWheelerRisk: string;
  evasiveExplanation: string;
  recommendedAction: string;
  repairMaterialEstimate: string;
  microJobPayoutInr: number;
  slaHours: number;
  slaDeadlineAt: string;
  status: 'open' | 'dispatched' | 'pending_verification' | 'verified';
  photoUrl: string;
  afterPhotoUrl?: string;
  assignedWorkerId?: string;
  assignedWorkerName?: string;
  assignedDistanceKm?: number;
  assignedAt?: string;
  applications?: WorkerApplicationRecord[];
  govtGrantStatus?: 'not_eligible' | 'pending_sanction' | 'sanctioned';
  govtSanctionedAmountInr?: number;
  govtSanctionRef?: string;
  govtSanctionedBy?: string;
  govtSanctionedAt?: string;
  escrowPoolStatus?: 'locked' | 'released';
  dbtTxnRef?: string;
  dbtDisbursedAt?: string;
  verification?: {
    verified: boolean;
    verdict: 'Verified Repaired' | 'Needs Rework' | 'Insufficient Evidence';
    surfaceFlushnessScore: number;
    geotagVerified: boolean;
    summary: string;
    checklist: Array<{ label: string; passed: boolean }>;
    verifiedAt?: string;
  };
  reportedAt: string;
}

interface WorkerRecord {
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

interface WardBudgetSeed {
  wardName: string;
  zoneCode: string;
  budgetAllocatedInr: number;
  baseTurnaroundHours: number;
}

interface CommuterScoutRecord {
  id: string;
  name: string;
  corridor: string;
  impactPoints: number;
  rank: CommuterRank;
  passiveKmMapped: number;
  confirmedClusters: number;
}

interface DatabaseSchema {
  schemaVersion: number;
  hazards: HazardRecord[];
  workers: WorkerRecord[];
  wardBudgets: WardBudgetSeed[];
  scouts: CommuterScoutRecord[];
}

const SAMPLE_POTHOLE_IMG = '/src/assets/images/sample_pothole_road_1794848761452.jpg';
const SAMPLE_REPAIRED_IMG = '/src/assets/images/sample_repaired_road_1794848761759.jpg';
const SAMPLE_SWERVE_IMG = '/src/assets/images/sample_swerve_corridor_1794848762324.jpg';

function computeCraterMaterials(surfaceAreaSqM: number, depthCm: number): CraterGeometry {
  const safeArea = Math.max(0.05, Math.round(surfaceAreaSqM * 100) / 100);
  const safeDepth = Math.max(2, Math.round(depthCm));
  const volumeLiters = Math.max(2, Math.round(safeArea * safeDepth * 10));
  // IRC:SP:100 compacted cold-mix density ~2.1 kg per liter
  const ircColdMixKg = Math.max(15, Math.round(volumeLiters * 2.1));
  const ircBags25Kg = Math.max(1, Math.ceil(ircColdMixKg / 25));
  const estimatedCostInr = ircBags25Kg * 420 + 500;
  return {
    surfaceAreaSqM: safeArea,
    depthCm: safeDepth,
    volumeLiters,
    ircColdMixKg,
    ircBags25Kg,
    estimatedCostInr,
  };
}

function computeWeightedPSI(b: PSIBreakdown): number {
  const raw =
    b.craterVolumeScore * 0.4 +
    b.trafficDensityScore * 0.3 +
    b.clusterHitsScore * 0.2 +
    b.monsoonRiskScore * 0.1;
  return Math.max(1, Math.min(100, Math.round(raw)));
}

function computeScoutRank(points: number): CommuterRank {
  if (points >= 1500) return 'MVP Road Captain';
  if (points >= 800) return 'Pothole Hunter';
  if (points >= 350) return 'Corridor Watcher';
  return 'Rookie Scout';
}

function createSeedDatabase(): DatabaseSchema {
  const now = Date.now();
  const hoursAgo = (h: number) => new Date(now - h * 3600 * 1000).toISOString();
  const hoursFromNow = (h: number) => new Date(now + h * 3600 * 1000).toISOString();

  return {
    schemaVersion: 2,
    hazards: [
      {
        id: 'HZ-1042',
        title: 'Waterlogged Crater Near Left Lane',
        streetName: '100 Feet Road, Indiranagar',
        corridor: 'East Arterial Corridor',
        ward: 'Ward 80 · Indiranagar',
        lat: 12.9784,
        lng: 77.6408,
        hazardType: 'Waterlogged Crater',
        severity: 'critical',
        psiBreakdown: {
          craterVolumeScore: 95,
          trafficDensityScore: 92,
          clusterHitsScore: 96,
          monsoonRiskScore: 90,
        },
        priorityScore: 94,
        craterGeometry: computeCraterMaterials(0.62, 11),
        estimatedWidthCm: 88,
        evasiveManoeuvreCount: 41,
        clusterVehicleHits: 38,
        imuSignature: 'pothole_impact_spike',
        peakVerticalG: 3.18,
        peakLateralG: 0.48,
        dominantManoeuvre: 'lane_swerve',
        twoWheelerRisk:
          'High rollover and hidden depth risk for two-wheelers due to pooled rainwater obscuring jagged asphalt edges.',
        evasiveExplanation:
          '38 swarm vehicles logged >2.8g dip-then-spike impacts alongside 41 S-curve lateral swerves.',
        recommendedAction:
          'Drain water, clean loose aggregate, and compact IRC:SP:100 cold-mix asphalt flush within 20 mins.',
        repairMaterialEstimate: 'IRC:SP:100 Cold-Mix · 143 kg (6 bags)',
        microJobPayoutInr: 3020,
        slaHours: 4,
        slaDeadlineAt: hoursFromNow(2.5),
        status: 'open',
        photoUrl: SAMPLE_POTHOLE_IMG,
        applications: [
          {
            id: 'APP-201',
            workerId: 'WK-01',
            workerName: 'Arjun Shetty',
            distanceKm: 0.8,
            note: 'Carrying 6 bags IRC:SP:100 cold-mix and hand compactor; 10 min ETA.',
            appliedAt: hoursAgo(1),
          },
        ],
        govtGrantStatus: 'not_eligible',
        reportedAt: hoursAgo(1.5),
      },
      {
        id: 'HZ-1041',
        title: 'Multi-Patch Fatigue Cracking',
        streetName: '80 Feet Road, Koramangala 4th Block',
        corridor: 'South Commuter Ring',
        ward: 'Ward 151 · Koramangala',
        lat: 12.9352,
        lng: 77.6245,
        hazardType: 'Surface Collapse',
        severity: 'high',
        psiBreakdown: {
          craterVolumeScore: 88,
          trafficDensityScore: 90,
          clusterHitsScore: 84,
          monsoonRiskScore: 70,
        },
        priorityScore: 86,
        craterGeometry: computeCraterMaterials(0.84, 7),
        estimatedWidthCm: 115,
        evasiveManoeuvreCount: 29,
        clusterVehicleHits: 24,
        imuSignature: 'gyro_swerve_dodge',
        peakVerticalG: 2.62,
        peakLateralG: 0.44,
        dominantManoeuvre: 'lane_swerve',
        twoWheelerRisk:
          'Motorbike commuters are weaving across lane markings to bypass broken asphalt slabs during peak traffic.',
        evasiveExplanation:
          '24 clustered vehicle hits with repeated S-curve gyroscope swerves and 18 km/h speed drop.',
        recommendedAction:
          'Clear loose slabs and compact IRC:SP:100 cold-mix leveling patch (no heavy roller required).',
        repairMaterialEstimate: 'IRC:SP:100 Cold-Mix · 124 kg (5 bags)',
        microJobPayoutInr: 2600,
        slaHours: 12,
        slaDeadlineAt: hoursFromNow(7.2),
        status: 'open',
        photoUrl: SAMPLE_SWERVE_IMG,
        applications: [],
        govtGrantStatus: 'not_eligible',
        reportedAt: hoursAgo(4.8),
      },
      {
        id: 'HZ-1039',
        title: 'Deep Wheel-Track Depression',
        streetName: 'MG Road Junction near Trinity Circle',
        corridor: 'Central Business Spine',
        ward: 'Ward 111 · Shanthala Nagar',
        lat: 12.9736,
        lng: 77.6192,
        hazardType: 'Pothole',
        severity: 'high',
        psiBreakdown: {
          craterVolumeScore: 76,
          trafficDensityScore: 88,
          clusterHitsScore: 75,
          monsoonRiskScore: 68,
        },
        priorityScore: 79,
        craterGeometry: computeCraterMaterials(0.32, 8),
        estimatedWidthCm: 62,
        evasiveManoeuvreCount: 18,
        clusterVehicleHits: 17,
        imuSignature: 'sudden_braking',
        peakVerticalG: 2.74,
        peakLateralG: 0.31,
        dominantManoeuvre: 'sudden_braking',
        twoWheelerRisk:
          'Sudden deceleration events ahead of signalized crossing increase rear-end collision exposure.',
        evasiveExplanation:
          '17 swarm hits + 18 hard braking spikes logged prior to intersection stop bar.',
        recommendedAction:
          'Pour IRC:SP:100 cold-mix and tamp flush in 20 minutes.',
        repairMaterialEstimate: 'IRC:SP:100 Cold-Mix · 55 kg (3 bags)',
        microJobPayoutInr: 1760,
        slaHours: 12,
        slaDeadlineAt: hoursFromNow(3.5),
        status: 'pending_verification',
        photoUrl: SAMPLE_POTHOLE_IMG,
        afterPhotoUrl: SAMPLE_REPAIRED_IMG,
        assignedWorkerId: 'WK-02',
        assignedWorkerName: 'Ramesh Gowda',
        assignedDistanceKm: 0.9,
        assignedAt: hoursAgo(4),
        govtGrantStatus: 'not_eligible',
        escrowPoolStatus: 'locked',
        reportedAt: hoursAgo(8.5),
      },
      {
        id: 'HZ-1037',
        title: 'Storm Drain Edge Shear',
        streetName: 'Outer Ring Road, Bellandur Flyover Ramp',
        corridor: 'IT Corridor Expressway',
        ward: 'Ward 150 · Bellandur',
        lat: 12.9279,
        lng: 77.6762,
        hazardType: 'Edge Cracking',
        severity: 'moderate',
        psiBreakdown: {
          craterVolumeScore: 60,
          trafficDensityScore: 82,
          clusterHitsScore: 62,
          monsoonRiskScore: 60,
        },
        priorityScore: 67,
        craterGeometry: computeCraterMaterials(0.24, 6),
        estimatedWidthCm: 48,
        evasiveManoeuvreCount: 11,
        clusterVehicleHits: 12,
        imuSignature: 'gyro_swerve_dodge',
        peakVerticalG: 2.35,
        peakLateralG: 0.29,
        dominantManoeuvre: 'speed_drop',
        twoWheelerRisk:
          'Shoulder drop-off forces cyclists and scooters toward high-speed lane traffic.',
        evasiveExplanation:
          'Consistent 24 km/h localized speed dip and 12 swarm edge detections.',
        recommendedAction:
          'Stabilize shoulder shear with IRC:SP:100 cold-mix and bitumen edge seal.',
        repairMaterialEstimate: 'IRC:SP:100 Cold-Mix · 30 kg (2 bags)',
        microJobPayoutInr: 1340,
        slaHours: 24,
        slaDeadlineAt: hoursFromNow(14),
        status: 'dispatched',
        photoUrl: SAMPLE_SWERVE_IMG,
        assignedWorkerId: 'WK-04',
        assignedWorkerName: 'Kiran Nair',
        assignedDistanceKm: 1.4,
        assignedAt: hoursAgo(1.5),
        govtGrantStatus: 'not_eligible',
        escrowPoolStatus: 'locked',
        reportedAt: hoursAgo(10),
      },
      {
        id: 'HZ-1035',
        title: 'Lane-Center Utility Trench Sink',
        streetName: 'Church Street, Shanthala Nagar',
        corridor: 'Central Retail Corridor',
        ward: 'Ward 111 · Shanthala Nagar',
        lat: 12.9752,
        lng: 77.6046,
        hazardType: 'Pothole',
        severity: 'high',
        psiBreakdown: {
          craterVolumeScore: 72,
          trafficDensityScore: 86,
          clusterHitsScore: 70,
          monsoonRiskScore: 75,
        },
        priorityScore: 76,
        craterGeometry: computeCraterMaterials(0.28, 7),
        estimatedWidthCm: 54,
        evasiveManoeuvreCount: 14,
        clusterVehicleHits: 15,
        imuSignature: 'pothole_impact_spike',
        peakVerticalG: 2.81,
        peakLateralG: 0.36,
        dominantManoeuvre: 'lane_swerve',
        twoWheelerRisk:
          'Narrow street layout causes abrupt braking when two-wheelers encounter sunken trench seam.',
        evasiveExplanation: '15 vehicle impact spikes logged prior to rapid cold-mix repair.',
        recommendedAction: 'Compact IRC:SP:100 cold-mix patch flush with street grade.',
        repairMaterialEstimate: 'IRC:SP:100 Cold-Mix · 42 kg (2 bags)',
        microJobPayoutInr: 1340,
        slaHours: 12,
        slaDeadlineAt: hoursAgo(4),
        status: 'verified',
        photoUrl: SAMPLE_POTHOLE_IMG,
        afterPhotoUrl: SAMPLE_REPAIRED_IMG,
        assignedWorkerId: 'WK-03',
        assignedWorkerName: 'Meena Kumari',
        assignedDistanceKm: 1.8,
        assignedAt: hoursAgo(14),
        govtGrantStatus: 'pending_sanction',
        escrowPoolStatus: 'locked',
        verification: {
          verified: true,
          verdict: 'Verified Repaired',
          surfaceFlushnessScore: 93,
          geotagVerified: true,
          summary:
            'Geotagged before/after audit confirms utility trench filled with IRC:SP:100 cold-mix and compacted level.',
          checklist: [
            { label: 'Pothole cavity completely filled', passed: true },
            { label: 'Patch flush with surrounding road grade', passed: true },
            { label: 'GPS coordinates & timestamp match site', passed: true },
            { label: 'Safe surface for two-wheeler tires', passed: true },
          ],
          verifiedAt: hoursAgo(6),
        },
        reportedAt: hoursAgo(22),
      },
      {
        id: 'HZ-1033',
        title: 'Bus Bay Asphalt Rutting',
        streetName: 'Jayanagar 4th Block Main Road',
        corridor: 'South Transit Loop',
        ward: 'Ward 168 · Jayanagar',
        lat: 12.925,
        lng: 77.5838,
        hazardType: 'Pothole',
        severity: 'moderate',
        psiBreakdown: {
          craterVolumeScore: 52,
          trafficDensityScore: 68,
          clusterHitsScore: 44,
          monsoonRiskScore: 40,
        },
        priorityScore: 54,
        craterGeometry: computeCraterMaterials(0.2, 5),
        estimatedWidthCm: 44,
        evasiveManoeuvreCount: 6,
        clusterVehicleHits: 8,
        imuSignature: 'pothole_impact_spike',
        peakVerticalG: 2.55,
        peakLateralG: 0.21,
        dominantManoeuvre: 'speed_drop',
        twoWheelerRisk:
          'Uneven surface near transit boarding area creates instability during wet braking.',
        evasiveExplanation: '8 vehicle vertical spikes recorded near bus bay apron.',
        recommendedAction: 'Compact IRC:SP:100 cold-mix patch flush with curb apron.',
        repairMaterialEstimate: 'IRC:SP:100 Cold-Mix · 21 kg (1 bag)',
        microJobPayoutInr: 920,
        slaHours: 24,
        slaDeadlineAt: hoursAgo(12),
        status: 'verified',
        photoUrl: SAMPLE_POTHOLE_IMG,
        afterPhotoUrl: SAMPLE_REPAIRED_IMG,
        assignedWorkerId: 'WK-01',
        assignedWorkerName: 'Arjun Shetty',
        assignedDistanceKm: 1.1,
        assignedAt: hoursAgo(26),
        govtGrantStatus: 'sanctioned',
        govtSanctionedAmountInr: 920,
        govtSanctionRef: 'GOV-RD-2026-0418',
        govtSanctionedBy: 'Municipal Escrow Treasury',
        govtSanctionedAt: hoursAgo(18),
        escrowPoolStatus: 'released',
        dbtTxnRef: 'DBT-IN-88421094',
        dbtDisbursedAt: hoursAgo(17.5),
        verification: {
          verified: true,
          verdict: 'Verified Repaired',
          surfaceFlushnessScore: 95,
          geotagVerified: true,
          summary:
            'Geotagged audit confirms level compaction flush with surrounding pavement and zero water pooling.',
          checklist: [
            { label: 'Pothole cavity completely filled', passed: true },
            { label: 'Patch flush with surrounding road grade', passed: true },
            { label: 'GPS coordinates & timestamp match site', passed: true },
            { label: 'Safe surface for two-wheeler tires', passed: true },
          ],
          verifiedAt: hoursAgo(20),
        },
        reportedAt: hoursAgo(32),
      },
    ],
    workers: [
      {
        id: 'WK-01',
        name: 'Arjun Shetty',
        neighborhood: 'Indiranagar · Halasuru',
        specialty: 'IRC:SP:100 Rapid Cold-Mix Squad',
        equipment: 'Cold-mix bags & vibratory plate tamper',
        tier: 'micro_gig_squad',
        priorityTenderUnlocked: true,
        avgTurnaroundMins: 22,
        lat: 12.9742,
        lng: 77.6345,
        available: true,
        verifiedByCity: true,
        completedRepairs: 28,
        totalEarnedInr: 31400,
        rating: 4.9,
        phoneMask: '+91 98*** 41209',
      },
      {
        id: 'WK-02',
        name: 'Ramesh Gowda',
        neighborhood: 'Domlur · Trinity Circle',
        specialty: 'Tier-1 Arterial Asphalt Contractor',
        equipment: 'Multi-bag IRC:SP:100 crew & pneumatic compactor',
        tier: 'tier1_contractor',
        priorityTenderUnlocked: true,
        avgTurnaroundMins: 26,
        lat: 12.9665,
        lng: 77.6288,
        available: true,
        verifiedByCity: true,
        completedRepairs: 34,
        totalEarnedInr: 48200,
        rating: 4.8,
        phoneMask: '+91 97*** 88310',
      },
      {
        id: 'WK-03',
        name: 'Meena Kumari',
        neighborhood: 'Koramangala · HSR Layout',
        specialty: 'Drainage Clearing & Base Prep',
        equipment: 'Dewatering pump & cold-mix tamper kit',
        tier: 'micro_gig_squad',
        priorityTenderUnlocked: true,
        avgTurnaroundMins: 19,
        lat: 12.9311,
        lng: 77.6302,
        available: true,
        verifiedByCity: true,
        completedRepairs: 19,
        totalEarnedInr: 22100,
        rating: 4.9,
        phoneMask: '+91 99*** 65041',
      },
      {
        id: 'WK-04',
        name: 'Kiran Nair',
        neighborhood: 'Bellandur · Marathahalli',
        specialty: 'Tier-1 Expressway Surface Crew',
        equipment: 'Bitumen edge sealer & heavy cold-mix rig',
        tier: 'tier1_contractor',
        priorityTenderUnlocked: false,
        avgTurnaroundMins: 31,
        lat: 12.934,
        lng: 77.6845,
        available: false,
        verifiedByCity: true,
        completedRepairs: 22,
        totalEarnedInr: 29800,
        rating: 4.7,
        phoneMask: '+91 96*** 19274',
      },
      {
        id: 'WK-05',
        name: 'Salman Pasha',
        neighborhood: 'Jayanagar · BTM Layout',
        specialty: 'Two-Wheeler Corridor Patching',
        equipment: 'IRC:SP:100 rapid-set kit',
        tier: 'micro_gig_squad',
        priorityTenderUnlocked: true,
        avgTurnaroundMins: 18,
        lat: 12.9221,
        lng: 77.5934,
        available: true,
        verifiedByCity: true,
        completedRepairs: 16,
        totalEarnedInr: 17900,
        rating: 4.8,
        phoneMask: '+91 94*** 53018',
      },
    ],
    wardBudgets: [
      {
        wardName: 'Ward 168 · Jayanagar',
        zoneCode: 'SOUTH-04',
        budgetAllocatedInr: 250000,
        baseTurnaroundHours: 2.1,
      },
      {
        wardName: 'Ward 111 · Shanthala Nagar',
        zoneCode: 'CENTRAL-01',
        budgetAllocatedInr: 320000,
        baseTurnaroundHours: 3.4,
      },
      {
        wardName: 'Ward 80 · Indiranagar',
        zoneCode: 'EAST-02',
        budgetAllocatedInr: 300000,
        baseTurnaroundHours: 3.8,
      },
      {
        wardName: 'Ward 151 · Koramangala',
        zoneCode: 'SOUTH-07',
        budgetAllocatedInr: 280000,
        baseTurnaroundHours: 4.6,
      },
      {
        wardName: 'Ward 150 · Bellandur',
        zoneCode: 'MAHADEV-09',
        budgetAllocatedInr: 350000,
        baseTurnaroundHours: 5.2,
      },
    ],
    scouts: [
      {
        id: 'SC-01',
        name: 'Ananya Rao',
        corridor: 'Indiranagar · MG Road',
        impactPoints: 1680,
        rank: 'MVP Road Captain',
        passiveKmMapped: 412,
        confirmedClusters: 27,
      },
      {
        id: 'SC-02',
        name: 'Vikram Hegde',
        corridor: 'Koramangala · Outer Ring',
        impactPoints: 1120,
        rank: 'Pothole Hunter',
        passiveKmMapped: 286,
        confirmedClusters: 19,
      },
      {
        id: 'SC-03',
        name: 'Priya Menon',
        corridor: 'Jayanagar · BTM Loop',
        impactPoints: 540,
        rank: 'Corridor Watcher',
        passiveKmMapped: 145,
        confirmedClusters: 9,
      },
      {
        id: 'SC-04',
        name: 'Karthik N',
        corridor: 'Bellandur · HSR',
        impactPoints: 240,
        rank: 'Rookie Scout',
        passiveKmMapped: 64,
        confirmedClusters: 4,
      },
    ],
  };
}

function ensureDatabase(): DatabaseSchema {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DB_FILE)) {
    const seed = createSeedDatabase();
    fs.writeFileSync(DB_FILE, JSON.stringify(seed, null, 2), 'utf-8');
    return seed;
  }
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<DatabaseSchema>;
    if (!parsed.schemaVersion || parsed.schemaVersion < 2) {
      const seed = createSeedDatabase();
      fs.writeFileSync(DB_FILE, JSON.stringify(seed, null, 2), 'utf-8');
      return seed;
    }
    return parsed as DatabaseSchema;
  } catch {
    const seed = createSeedDatabase();
    fs.writeFileSync(DB_FILE, JSON.stringify(seed, null, 2), 'utf-8');
    return seed;
  }
}

function saveDatabase(db: DatabaseSchema): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf-8');
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
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

function buildWardLeague(db: DatabaseSchema) {
  return db.wardBudgets
    .map((wb) => {
      const wardHazards = db.hazards.filter((h) => h.ward === wb.wardName);
      const resolvedCount = wardHazards.filter((h) => h.status === 'verified').length;
      const unresolved = wardHazards.filter((h) => h.status !== 'verified');
      const unresolvedCount = unresolved.length;

      const avgUnresolvedPsi =
        unresolvedCount > 0
          ? unresolved.reduce((sum, h) => sum + h.priorityScore, 0) / unresolvedCount
          : 0;

      const roadHealthScore = Math.max(
        35,
        Math.min(
          99,
          Math.round(92 + resolvedCount * 4 - unresolvedCount * 9 - avgUnresolvedPsi * 0.12)
        )
      );

      const budgetSpentInr = wardHazards
        .filter((h) => h.govtGrantStatus === 'sanctioned')
        .reduce((sum, h) => sum + (h.govtSanctionedAmountInr ?? h.microJobPayoutInr), 0);

      const escrowLockedInr = wardHazards
        .filter((h) => h.status !== 'verified' || h.govtGrantStatus === 'pending_sanction')
        .reduce((sum, h) => sum + h.microJobPayoutInr, 0);

      const avgPatchHours = Math.max(
        1.2,
        Math.round((wb.baseTurnaroundHours - resolvedCount * 0.25) * 10) / 10
      );

      return {
        wardName: wb.wardName,
        zoneCode: wb.zoneCode,
        roadHealthScore,
        avgPatchHours,
        resolvedCount,
        unresolvedCount,
        budgetAllocatedInr: wb.budgetAllocatedInr,
        budgetSpentInr,
        escrowLockedInr,
      };
    })
    .sort((a, b) => b.roadHealthScore - a.roadHealthScore);
}

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured in the server environment.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '15mb' }));

  ensureDatabase();

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', app: 'Routix' });
  });

  app.get('/api/hazards', (_req, res) => {
    const db = ensureDatabase();
    const sorted = [...db.hazards].sort((a, b) => b.priorityScore - a.priorityScore);
    res.json({ hazards: sorted });
  });

  app.get('/api/workers', (_req, res) => {
    const db = ensureDatabase();
    res.json({ workers: db.workers });
  });

  app.get('/api/league', (_req, res) => {
    const db = ensureDatabase();
    const wardLeague = buildWardLeague(db);
    const scouts = [...db.scouts].sort((a, b) => b.impactPoints - a.impactPoints);
    res.json({ wardLeague, scouts });
  });

  app.post('/api/scouts/log-pass', (req, res) => {
    const db = ensureDatabase();
    const { scoutId, kmDriven, clusterConfirmed } = req.body as {
      scoutId?: string;
      kmDriven?: number;
      clusterConfirmed?: boolean;
    };

    const scout = db.scouts.find((s) => s.id === scoutId) || db.scouts[0];
    if (!scout) {
      res.status(404).json({ error: 'Scout profile not found.' });
      return;
    }

    const earned = 50 + (clusterConfirmed ? 35 : 0);
    scout.impactPoints += earned;
    scout.passiveKmMapped += kmDriven ?? 12;
    if (clusterConfirmed) {
      scout.confirmedClusters += 1;
    }
    scout.rank = computeScoutRank(scout.impactPoints);

    saveDatabase(db);
    res.json({
      scout,
      earned,
      scouts: [...db.scouts].sort((a, b) => b.impactPoints - a.impactPoints),
    });
  });

  app.post('/api/hazards', (req, res) => {
    const db = ensureDatabase();
    const body = req.body as Partial<HazardRecord>;
    if (!body.streetName || typeof body.lat !== 'number' || typeof body.lng !== 'number') {
      res.status(400).json({ error: 'streetName, lat, and lng are required.' });
      return;
    }

    const craterGeo =
      body.craterGeometry || computeCraterMaterials(0.35, 8);
    const psiBreakdown = body.psiBreakdown || {
      craterVolumeScore: 78,
      trafficDensityScore: 82,
      clusterHitsScore: 76,
      monsoonRiskScore: 65,
    };
    const psi =
      typeof body.priorityScore === 'number'
        ? body.priorityScore
        : computeWeightedPSI(psiBreakdown);
    const slaHours = psi >= 85 ? 4 : psi >= 70 ? 12 : 24;

    const newId = `HZ-${Math.floor(1050 + Math.random() * 8900)}`;
    const record: HazardRecord = {
      id: newId,
      title: body.title || `${body.hazardType || 'Road Hazard'} on ${body.streetName}`,
      streetName: body.streetName,
      corridor: body.corridor || 'Urban Commuter Corridor',
      ward: body.ward || 'Ward 80 · Indiranagar',
      lat: body.lat,
      lng: body.lng,
      hazardType: body.hazardType || 'Pothole',
      severity: body.severity || (psi >= 85 ? 'critical' : psi >= 70 ? 'high' : 'moderate'),
      priorityScore: psi,
      psiBreakdown,
      craterGeometry: craterGeo,
      estimatedWidthCm: typeof body.estimatedWidthCm === 'number' ? body.estimatedWidthCm : 58,
      evasiveManoeuvreCount:
        typeof body.evasiveManoeuvreCount === 'number' ? body.evasiveManoeuvreCount : 14,
      clusterVehicleHits:
        typeof body.clusterVehicleHits === 'number' ? body.clusterVehicleHits : 12,
      imuSignature: body.imuSignature || 'pothole_impact_spike',
      peakVerticalG: typeof body.peakVerticalG === 'number' ? body.peakVerticalG : 2.84,
      peakLateralG: typeof body.peakLateralG === 'number' ? body.peakLateralG : 0.42,
      dominantManoeuvre: body.dominantManoeuvre || 'lane_swerve',
      twoWheelerRisk:
        body.twoWheelerRisk || 'Elevated wheel impact and lane swerve risk for two-wheelers.',
      evasiveExplanation:
        body.evasiveExplanation || 'Clustered IMU spike (>2.5g) + evasive steering cues confirmed.',
      recommendedAction:
        body.recommendedAction ||
        'Clean cavity and compact IRC:SP:100 cold-mix asphalt flush within 20 minutes.',
      repairMaterialEstimate:
        body.repairMaterialEstimate ||
        `IRC:SP:100 Cold-Mix · ${craterGeo.ircColdMixKg} kg (${craterGeo.ircBags25Kg} bags)`,
      microJobPayoutInr:
        typeof body.microJobPayoutInr === 'number'
          ? body.microJobPayoutInr
          : craterGeo.estimatedCostInr,
      slaHours,
      slaDeadlineAt: new Date(Date.now() + slaHours * 3600 * 1000).toISOString(),
      status: 'open',
      photoUrl: body.photoUrl || SAMPLE_POTHOLE_IMG,
      applications: [],
      govtGrantStatus: 'not_eligible',
      reportedAt: new Date().toISOString(),
    };

    db.hazards.unshift(record);
    saveDatabase(db);
    res.status(201).json({ hazard: record });
  });

  app.patch('/api/hazards/:id/assign', (req, res) => {
    const db = ensureDatabase();
    const { id } = req.params;
    const { workerId } = req.body as { workerId?: string };

    const hazard = db.hazards.find((h) => h.id === id);
    if (!hazard) {
      res.status(404).json({ error: 'Hazard not found.' });
      return;
    }

    let worker: WorkerRecord | undefined;
    if (workerId) {
      worker = db.workers.find((w) => w.id === workerId);
    } else {
      const available = db.workers
        .filter((w) => w.available)
        .sort(
          (a, b) =>
            haversineKm(hazard.lat, hazard.lng, a.lat, a.lng) -
            haversineKm(hazard.lat, hazard.lng, b.lat, b.lng)
        );
      worker = available[0];
    }

    if (!worker) {
      res.status(400).json({ error: 'No matching worker available.' });
      return;
    }

    if (hazard.assignedWorkerId && hazard.assignedWorkerId !== worker.id) {
      const prevWorker = db.workers.find((w) => w.id === hazard.assignedWorkerId);
      if (prevWorker) prevWorker.available = true;
    }

    const distanceKm = haversineKm(hazard.lat, hazard.lng, worker.lat, worker.lng);
    hazard.assignedWorkerId = worker.id;
    hazard.assignedWorkerName = worker.name;
    hazard.assignedDistanceKm = distanceKm;
    hazard.assignedAt = new Date().toISOString();
    hazard.status = 'dispatched';
    hazard.escrowPoolStatus = 'locked';
    worker.available = false;

    saveDatabase(db);
    res.json({ hazard, worker });
  });

  app.post('/api/workers/apply', (req, res) => {
    const db = ensureDatabase();
    const body = req.body as {
      name?: string;
      neighborhood?: string;
      specialty?: string;
      equipment?: string;
      tier?: 'tier1_contractor' | 'micro_gig_squad';
      phone?: string;
      lat?: number;
      lng?: number;
    };

    if (!body.name?.trim() || !body.neighborhood?.trim() || !body.specialty?.trim()) {
      res.status(400).json({ error: 'Name, neighborhood, and specialty are required.' });
      return;
    }

    const digits = (body.phone || '9800012345').replace(/\D/g, '');
    const last4 = digits.slice(-4).padStart(4, '0');
    const prefix2 = digits.slice(0, 2) || '98';
    const newWorker: WorkerRecord = {
      id: `WK-${String(db.workers.length + 1).padStart(2, '0')}`,
      name: body.name.trim(),
      neighborhood: body.neighborhood.trim(),
      specialty: body.specialty.trim(),
      equipment: body.equipment?.trim() || 'IRC:SP:100 cold-mix kit & hand compactor',
      tier: body.tier === 'tier1_contractor' ? 'tier1_contractor' : 'micro_gig_squad',
      priorityTenderUnlocked: false,
      avgTurnaroundMins: 25,
      lat: typeof body.lat === 'number' ? body.lat : 12.961,
      lng: typeof body.lng === 'number' ? body.lng : 77.625,
      available: true,
      verifiedByCity: true,
      completedRepairs: 0,
      totalEarnedInr: 0,
      rating: 5.0,
      phoneMask: `+91 ${prefix2}*** ${last4}`,
      joinedAt: new Date().toISOString(),
    };

    db.workers.unshift(newWorker);
    saveDatabase(db);
    res.status(201).json({ worker: newWorker });
  });

  app.post('/api/hazards/:id/apply', (req, res) => {
    const db = ensureDatabase();
    const { id } = req.params;
    const { workerId, note } = req.body as { workerId?: string; note?: string };

    const hazard = db.hazards.find((h) => h.id === id);
    if (!hazard) {
      res.status(404).json({ error: 'Hazard not found.' });
      return;
    }
    if (hazard.status !== 'open') {
      res.status(400).json({ error: 'Only open hazards accept new job applications.' });
      return;
    }

    const worker = db.workers.find((w) => w.id === workerId);
    if (!worker) {
      res.status(404).json({ error: 'Selected worker not found.' });
      return;
    }

    if (!hazard.applications) {
      hazard.applications = [];
    }
    if (hazard.applications.some((a) => a.workerId === worker.id)) {
      res.status(400).json({ error: `${worker.name} has already applied for ${hazard.id}.` });
      return;
    }

    const application: WorkerApplicationRecord = {
      id: `APP-${Math.floor(300 + Math.random() * 699)}`,
      workerId: worker.id,
      workerName: worker.name,
      distanceKm: haversineKm(hazard.lat, hazard.lng, worker.lat, worker.lng),
      note: note?.trim() || 'Ready to mobilize with IRC:SP:100 cold-mix.',
      appliedAt: new Date().toISOString(),
    };

    hazard.applications.unshift(application);
    saveDatabase(db);
    res.status(201).json({ hazard, application });
  });

  app.post('/api/hazards/:id/sanction', (req, res) => {
    const db = ensureDatabase();
    const { id } = req.params;
    const { authorityName } = req.body as { authorityName?: string };

    const hazard = db.hazards.find((h) => h.id === id);
    if (!hazard) {
      res.status(404).json({ error: 'Hazard not found.' });
      return;
    }
    if (hazard.status !== 'verified' || !hazard.verification?.verified) {
      res.status(400).json({
        error: 'Government funds can only be sanctioned after CV Proof-of-Work verification passes.',
      });
      return;
    }
    if (hazard.govtGrantStatus === 'sanctioned') {
      res.status(400).json({ error: 'DBT payout has already been sanctioned for this repair.' });
      return;
    }

    const sanctionAmount = hazard.microJobPayoutInr;
    hazard.govtGrantStatus = 'sanctioned';
    hazard.govtSanctionedAmountInr = sanctionAmount;
    hazard.govtSanctionRef = `GOV-RD-2026-${Math.floor(1000 + Math.random() * 8999)}`;
    hazard.govtSanctionedBy = authorityName?.trim() || 'Municipal Escrow Treasury';
    hazard.govtSanctionedAt = new Date().toISOString();
    hazard.escrowPoolStatus = 'released';
    hazard.dbtTxnRef = `DBT-IN-${Math.floor(10000000 + Math.random() * 89999999)}`;
    hazard.dbtDisbursedAt = new Date().toISOString();

    if (hazard.assignedWorkerId) {
      const worker = db.workers.find((w) => w.id === hazard.assignedWorkerId);
      if (worker) {
        worker.totalEarnedInr += sanctionAmount;
        if (worker.completedRepairs >= 10 && worker.rating >= 4.8) {
          worker.priorityTenderUnlocked = true;
        }
      }
    }

    saveDatabase(db);
    res.json({ hazard });
  });

  app.patch('/api/hazards/:id/status', (req, res) => {
    const db = ensureDatabase();
    const { id } = req.params;
    const { status, afterPhotoUrl } = req.body as {
      status?: HazardRecord['status'];
      afterPhotoUrl?: string;
    };

    const hazard = db.hazards.find((h) => h.id === id);
    if (!hazard) {
      res.status(404).json({ error: 'Hazard not found.' });
      return;
    }

    if (status) {
      hazard.status = status;
    }
    if (afterPhotoUrl) {
      hazard.afterPhotoUrl = afterPhotoUrl;
    }
    saveDatabase(db);
    res.json({ hazard });
  });

  app.post('/api/analyze-road', async (req, res) => {
    try {
      const {
        imageBase64,
        mimeType,
        streetName,
        imuSignature,
        peakVerticalG,
        peakLateralG,
        clusterHits,
        trafficDensityScore,
        monsoonRiskScore,
      } = req.body as {
        imageBase64?: string;
        mimeType?: string;
        streetName?: string;
        imuSignature?: ImuSignatureType;
        peakVerticalG?: number;
        peakLateralG?: number;
        clusterHits?: number;
        trafficDensityScore?: number;
        monsoonRiskScore?: number;
      };

      if (!imageBase64) {
        res.status(400).json({ error: 'Road image data is required for AI detection.' });
        return;
      }

      const cleanBase64 = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;
      const ai = getGeminiClient();

      const isSpeedBump = imuSignature === 'speed_bump_filtered';
      const prompt = [
        'You are the Routix Dual-Stream Swarm Sensing & Active Edge CV Engine (YOLOv8 + Monocular Depth Estimation).',
        `Street context: ${streetName || 'Urban arterial street'}.`,
        `Passive IMU Stream: signature=${imuSignature || 'pothole_impact_spike'}, peakVerticalG=${peakVerticalG ?? 2.8}g, peakLateralG=${peakLateralG ?? 0.4}g, clusterVehicleHits=${clusterHits ?? 15}.`,
        isSpeedBump
          ? 'Note: The IMU stream shows a smooth symmetric speed bump signature without a dip-then-spike shock. Check carefully if the image is actually a clear road / speed bump rather than a pothole.'
          : 'Analyze the road photograph for potholes, waterlogged craters, surface collapse, or edge cracking. Estimate surface area in sq meters (e.g. 0.15 to 1.2), depth in cm (e.g. 3 to 18), and defect width in cm.',
        'Also evaluate two-wheeler safety risk and how the visible defect correlates with evasive manoeuvres.',
      ].join(' ');

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: mimeType || 'image/jpeg',
                data: cleanBase64,
              },
            },
            { text: prompt },
          ],
        },
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              hazardDetected: { type: Type.BOOLEAN },
              hazardType: {
                type: Type.STRING,
                description:
                  'One of: Pothole, Waterlogged Crater, Surface Collapse, Edge Cracking, Speed Bump (Filtered), Clear Road',
              },
              surfaceAreaSqM: {
                type: Type.NUMBER,
                description: 'Estimated defect surface area in square meters (0 if clear road).',
              },
              depthCm: {
                type: Type.NUMBER,
                description: 'Estimated monocular crater depth in centimeters (0 if clear road).',
              },
              estimatedWidthCm: {
                type: Type.NUMBER,
                description: 'Estimated defect width in centimeters (0 if clear road).',
              },
              twoWheelerRisk: {
                type: Type.STRING,
                description: 'Concise 1-2 sentence safety risk assessment for two-wheeler riders.',
              },
              evasiveManoeuvreRisk: {
                type: Type.STRING,
                description: 'One of: lane_swerve, sudden_braking, speed_drop, none',
              },
              evasiveExplanation: {
                type: Type.STRING,
                description: 'How IMU dip-then-spike or gyro S-curve swerving correlates with the road surface.',
              },
              recommendedAction: {
                type: Type.STRING,
                description: 'Concise IRC:SP:100 cold-mix repair action for local crew.',
              },
            },
            required: [
              'hazardDetected',
              'hazardType',
              'surfaceAreaSqM',
              'depthCm',
              'estimatedWidthCm',
              'twoWheelerRisk',
              'evasiveManoeuvreRisk',
              'evasiveExplanation',
              'recommendedAction',
            ],
          },
        },
      });

      const vision = JSON.parse((response.text ?? '{}').trim()) as {
        hazardDetected: boolean;
        hazardType: string;
        surfaceAreaSqM: number;
        depthCm: number;
        estimatedWidthCm: number;
        twoWheelerRisk: string;
        evasiveManoeuvreRisk: 'lane_swerve' | 'sudden_braking' | 'speed_drop' | 'none';
        evasiveExplanation: string;
        recommendedAction: string;
      };

      const detected = vision.hazardDetected && !isSpeedBump;
      const craterGeometry = detected
        ? computeCraterMaterials(vision.surfaceAreaSqM || 0.35, vision.depthCm || 7)
        : {
            surfaceAreaSqM: 0,
            depthCm: 0,
            volumeLiters: 0,
            ircColdMixKg: 0,
            ircBags25Kg: 0,
            estimatedCostInr: 0,
          };

      const craterVolumeScore = detected
        ? Math.min(100, Math.max(25, Math.round((craterGeometry.volumeLiters / 65) * 100)))
        : 5;
      const tScore = Math.min(100, Math.max(10, trafficDensityScore ?? 80));
      const cScore = detected
        ? Math.min(100, Math.max(15, Math.round(((clusterHits ?? 15) / 35) * 100)))
        : 5;
      const mScore = Math.min(100, Math.max(10, monsoonRiskScore ?? 65));

      const psiBreakdown: PSIBreakdown = {
        craterVolumeScore,
        trafficDensityScore: tScore,
        clusterHitsScore: cScore,
        monsoonRiskScore: mScore,
      };

      const priorityScore = detected ? computeWeightedPSI(psiBreakdown) : 8;
      const severity: HazardRecord['severity'] = !detected
        ? 'low'
        : priorityScore >= 85
        ? 'critical'
        : priorityScore >= 70
        ? 'high'
        : 'moderate';

      res.json({
        analysis: {
          hazardDetected: detected,
          speedBumpFiltered: isSpeedBump,
          hazardType: isSpeedBump ? 'Speed Bump (Filtered)' : vision.hazardType,
          severity,
          estimatedWidthCm: detected ? vision.estimatedWidthCm : 0,
          craterGeometry,
          psiBreakdown,
          priorityScore,
          twoWheelerRisk: vision.twoWheelerRisk,
          evasiveManoeuvreRisk: detected ? vision.evasiveManoeuvreRisk : 'none',
          evasiveExplanation: isSpeedBump
            ? 'Smooth symmetric vertical profile filtered out from pothole alerts (>2.5g dip-then-spike not matched).'
            : vision.evasiveExplanation,
          recommendedAction: detected
            ? vision.recommendedAction
            : 'No dispatch required. Corridor surface nominal.',
          repairMaterialEstimate: detected
            ? `IRC:SP:100 Cold-Mix · ${craterGeometry.ircColdMixKg} kg (${craterGeometry.ircBags25Kg} bags)`
            : 'None required',
          suggestedPayoutInr: craterGeometry.estimatedCostInr,
        },
      });
    } catch (err) {
      console.error('Gemini /api/analyze-road error:', err);
      const message = err instanceof Error ? err.message : 'Failed to analyze road image.';
      res.status(500).json({ error: message });
    }
  });

  app.post('/api/verify-repair', async (req, res) => {
    try {
      const { hazardId, beforeImageBase64, beforeMimeType, afterImageBase64, afterMimeType } =
        req.body as {
          hazardId?: string;
          beforeImageBase64?: string;
          beforeMimeType?: string;
          afterImageBase64?: string;
          afterMimeType?: string;
        };

      if (!beforeImageBase64 || !afterImageBase64) {
        res
          .status(400)
          .json({ error: 'Both before-repair and after-repair images are required.' });
        return;
      }

      const cleanBefore = beforeImageBase64.includes(',')
        ? beforeImageBase64.split(',')[1]
        : beforeImageBase64;
      const cleanAfter = afterImageBase64.includes(',')
        ? afterImageBase64.split(',')[1]
        : afterImageBase64;

      const ai = getGeminiClient();
      const prompt = [
        'You are the Routix Computer Vision Proof-of-Work Auditor.',
        'Image 1 is the geotagged BEFORE hazard photo. Image 2 is the AFTER repair submission photo.',
        'Verify whether the road defect in Image 1 has been properly compacted with IRC:SP:100 cold-mix asphalt in Image 2.',
        'Evaluate: (1) Pothole cavity completely filled, (2) Surface flush alignment with adjacent pavement, (3) GPS geotag & timestamp consistency for site authenticity, and (4) Safe surface for two-wheeler tires.',
        'Return verdict "Verified Repaired" only if Image 2 clearly shows a completed, flush asphalt patch; return "Needs Rework" if the pothole remains open, waterlogged, or uncompacted.',
      ].join(' ');

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: beforeMimeType || 'image/jpeg',
                data: cleanBefore,
              },
            },
            {
              inlineData: {
                mimeType: afterMimeType || 'image/jpeg',
                data: cleanAfter,
              },
            },
            { text: prompt },
          ],
        },
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              verified: { type: Type.BOOLEAN },
              verdict: {
                type: Type.STRING,
                description: 'One of: Verified Repaired, Needs Rework, Insufficient Evidence',
              },
              surfaceFlushnessScore: {
                type: Type.INTEGER,
                description: '0 to 100 surface compaction and flushness score.',
              },
              geotagVerified: { type: Type.BOOLEAN },
              summary: {
                type: Type.STRING,
                description: '2-sentence proof-of-work audit summary comparing before and after images.',
              },
              checklist: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    label: { type: Type.STRING },
                    passed: { type: Type.BOOLEAN },
                  },
                  required: ['label', 'passed'],
                },
              },
            },
            required: [
              'verified',
              'verdict',
              'surfaceFlushnessScore',
              'geotagVerified',
              'summary',
              'checklist',
            ],
          },
        },
      });

      const verification = JSON.parse((response.text ?? '{}').trim());
      verification.verifiedAt = new Date().toISOString();

      let updatedHazard: HazardRecord | undefined;
      if (hazardId) {
        const db = ensureDatabase();
        const hazard = db.hazards.find((h) => h.id === hazardId);
        if (hazard) {
          hazard.verification = verification;
          if (verification.verified) {
            hazard.status = 'verified';
            if (hazard.govtGrantStatus !== 'sanctioned') {
              hazard.govtGrantStatus = 'pending_sanction';
              hazard.escrowPoolStatus = 'locked';
            }
            if (hazard.assignedWorkerId) {
              const worker = db.workers.find((w) => w.id === hazard.assignedWorkerId);
              if (worker) {
                worker.available = true;
                worker.completedRepairs += 1;
              }
            }
          } else {
            hazard.status = 'dispatched';
            hazard.govtGrantStatus = 'not_eligible';
          }
          updatedHazard = hazard;
          saveDatabase(db);
        }
      }

      res.json({ verification, hazard: updatedHazard });
    } catch (err) {
      console.error('Gemini /api/verify-repair error:', err);
      const message = err instanceof Error ? err.message : 'Failed to verify repair.';
      res.status(500).json({ error: message });
    }
  });

  app.post('/api/road-intel', async (req, res) => {
    try {
      const { query, ward, streetName, hazardType, topic } = req.body as {
        query?: string;
        ward?: string;
        streetName?: string;
        hazardType?: string;
        topic?: 'monsoon' | 'municipal' | 'engineering' | 'safety' | 'custom';
      };

      const trimmedQuery = (query || '').trim();
      if (!trimmedQuery) {
        res.status(400).json({ error: 'Please enter a road intelligence query.' });
        return;
      }

      const ai = getGeminiClient();
      const contextLines = [
        'You are the Routix Civic Road Intelligence Analyst.',
        'Provide concise, factual, up-to-date guidance grounded in Google Search results.',
        streetName ? `Focus street/corridor: ${streetName}, Bengaluru, India.` : 'City context: Bengaluru / Indian urban road corridors.',
        ward ? `Municipal ward: ${ward}.` : '',
        hazardType ? `Reported road defect: ${hazardType}.` : '',
        topic ? `Briefing category: ${topic}.` : '',
        'Structure your answer clearly with short headings and bullet points suitable for municipal engineers, field squads, and commuters. Include concrete engineering references (such as IRC:SP:100 cold-mix standards when relevant) or current local road/monsoon advisories found via Search.',
        `User request: ${trimmedQuery}`,
      ]
        .filter(Boolean)
        .join('\n');

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: contextLines,
        config: {
          tools: [{ googleSearch: {} }],
        },
      });

      const groundingMetadata = response.candidates?.[0]?.groundingMetadata;
      const rawChunks = groundingMetadata?.groundingChunks || [];
      const seenUris = new Set<string>();
      const sources: Array<{ title: string; uri: string }> = [];

      for (const chunk of rawChunks) {
        const uri = chunk.web?.uri;
        if (uri && !seenUris.has(uri)) {
          seenUris.add(uri);
          sources.push({
            title: chunk.web?.title || uri,
            uri,
          });
        }
      }

      const searchQueries = groundingMetadata?.webSearchQueries || [];

      res.json({
        answer: (response.text ?? '').trim(),
        sources,
        searchQueries,
        generatedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error('Gemini /api/road-intel error:', err);
      const message =
        err instanceof Error ? err.message : 'Failed to fetch search-grounded road intelligence.';
      res.status(500).json({ error: message });
    }
  });

  app.post('/api/reset-demo', (_req, res) => {
    const seed = createSeedDatabase();
    saveDatabase(seed);
    res.json({ hazards: seed.hazards, workers: seed.workers });
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.join(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Routix server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
