export type CivicRole =
  | 'worker'
  | 'engineer'
  | 'municipality_officer'
  | 'government';

export type ApprovalStatus = 'approved' | 'pending' | 'rejected';

export interface UserAccountProfile {
  uid: string;
  displayName: string;
  role: CivicRole;
  requestedRole: CivicRole;
  approvalStatus: ApprovalStatus;
  organization: string;
  wardZone: string;
  badgeNumber: string;
  specialty: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface UserPrivateInfo {
  uid: string;
  email: string;
  phone: string;
  dbtHandle: string;
  officeAddress: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface RoleAccessRequest {
  uid: string;
  displayName: string;
  requestedRole: CivicRole;
  organization: string;
  wardZone: string;
  badgeNumber: string;
  justification: string;
  status: ApprovalStatus;
  reviewedByUid: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface CivicRoleMeta {
  id: CivicRole;
  label: string;
  shortLabel: string;
  badgeClass: string;
  organizationPlaceholder: string;
  specialtyPlaceholder: string;
  summary: string;
  capabilities: string[];
  requiresApprovalForNonAdmin: boolean;
}

export const CIVIC_ROLE_META: Record<CivicRole, CivicRoleMeta> = {
  engineer: {
    id: 'engineer',
    label: 'Road / Civil Engineer',
    shortLabel: 'Engineer',
    badgeClass:
      'border-sky-200 dark:border-sky-900 bg-sky-50 dark:bg-sky-950/60 text-sky-800 dark:text-sky-300',
    organizationPlaceholder: 'e.g. BBMP Road Infrastructure Cell',
    specialtyPlaceholder: 'e.g. PSI Triage & IRC:SP:100 Structural QA',
    summary:
      'Runs AI crater geometry triage, calibrates Pothole Severity Index (PSI) scores, and audits before/after CV proof-of-work.',
    capabilities: [
      'Publish AI Detect & Edge CV pothole scans',
      'Inspect monocular depth & IRC:SP:100 material volumes',
      'Audit before/after repair compaction in Verify',
    ],
    requiresApprovalForNonAdmin: true,
  },
  worker: {
    id: 'worker',
    label: 'Field Worker / Patch Squad',
    shortLabel: 'Worker',
    badgeClass:
      'border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300',
    organizationPlaceholder: 'e.g. Indiranagar Rapid Cold-Mix Squad',
    specialtyPlaceholder: 'e.g. IRC:SP:100 Rapid Cold-Mix Patching',
    summary:
      'Applies for nearby 2–5 km repair micro-gigs, executes 15–30 minute cold-mix patches, and receives DBT payouts.',
    capabilities: [
      'Apply for open 2–5 km cold-mix micro-gigs',
      'Upload geotagged after-repair proof photos',
      'Track Municipal Escrow & DBT payout status',
    ],
    requiresApprovalForNonAdmin: false,
  },
  municipality_officer: {
    id: 'municipality_officer',
    label: 'Municipality Officer',
    shortLabel: 'Municipality',
    badgeClass:
      'border-violet-200 dark:border-violet-900 bg-violet-50 dark:bg-violet-950/60 text-violet-800 dark:text-violet-300',
    organizationPlaceholder: 'e.g. Ward 80 Municipal Ward Office',
    specialtyPlaceholder: 'e.g. Ward SLA Command & Contractor Dispatch',
    summary:
      'Manages ward-level SLA countdowns, approves worker applications, dispatches Tier-1 crews, and monitors Ward Premier League.',
    capabilities: [
      'One-tap dispatch & crew allocation on Civic Command',
      'Approve worker micro-gig applications',
      'Track ward SLA turnaround & budget utilization',
    ],
    requiresApprovalForNonAdmin: true,
  },
  government: {
    id: 'government',
    label: 'Government Authority',
    shortLabel: 'Government',
    badgeClass:
      'border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300',
    organizationPlaceholder: 'e.g. State Municipal Escrow Treasury',
    specialtyPlaceholder: 'e.g. DBT Grant Sanction & Civic Audit',
    summary:
      'Sanctions municipal escrow funds via Direct Benefit Transfer (DBT) after CV audit and oversees cross-ward accountability.',
    capabilities: [
      'Sanction & release Direct Benefit Transfer (DBT) payouts',
      'Export executive PDF hazard & workforce reports',
      'Verify & approve Engineer / Municipality accounts',
    ],
    requiresApprovalForNonAdmin: true,
  },
};

export const WARD_ZONES = [
  'Ward 80 · Indiranagar',
  'Ward 151 · Koramangala',
  'Ward 111 · Shanthala Nagar',
  'Ward 150 · Bellandur',
  'Ward 168 · Jayanagar',
  'Statewide / Multi-Ward Command',
];

export type ImuSensitivity = 'high_2_2g' | 'standard_2_5g' | 'strict_3_0g';
export type DefaultWorkspaceTab =
  | 'map'
  | 'detect'
  | 'dispatch'
  | 'verify'
  | 'workers';

export interface UserSettings {
  uid?: string;
  theme: 'light' | 'dark';
  defaultTab: DefaultWorkspaceTab;
  defaultWard: string;
  defaultHeatmapOn: boolean;
  autoUseGps: boolean;
  highSeverityAlerts: boolean;
  imuSensitivity: ImuSensitivity;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface ReportHistoryEntry {
  id: string;
  uid: string;
  hazardId: string;
  title: string;
  streetName: string;
  ward: string;
  hazardType: string;
  severity: 'critical' | 'high' | 'moderate' | 'low';
  priorityScore: number;
  source: 'camera' | 'ai_detect';
  status: 'open' | 'dispatched' | 'pending_verification' | 'verified';
  lat: number;
  lng: number;
  estimatedCostInr: number;
  reportedAt: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

