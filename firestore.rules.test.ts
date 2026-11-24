/**
 * Phase 0 Payload-First Security TDD specification for Routix Firestore Rules.
 * Documents the 12 adversarial payloads ("Dirty Dozen") validated against DRAFT_firestore.rules
 * and final firestore.rules.
 */

export interface DirtyDozenCase {
  id: string;
  name: string;
  targetPath: string;
  operation: 'create' | 'update' | 'get' | 'list';
  payload: Record<string, unknown>;
  expectedOutcome: 'PERMISSION_DENIED';
  enforcedByPillar: string;
}

export const DIRTY_DOZEN_CASES: DirtyDozenCase[] = [
  {
    id: 'DD-01',
    name: 'Identity Spoofing on Create',
    targetPath: '/users/victimUid',
    operation: 'create',
    payload: {
      uid: 'attackerUid',
      displayName: 'Spoof User',
      role: 'worker',
      requestedRole: 'worker',
      approvalStatus: 'approved',
      organization: 'Ward 80',
      wardZone: 'Ward 80 · Indiranagar',
      badgeNumber: 'WK-99',
      specialty: 'Cold-Mix',
    },
    expectedOutcome: 'PERMISSION_DENIED',
    enforcedByPillar: 'Pillar 2: incoming().uid == userId && incoming().uid == request.auth.uid',
  },
  {
    id: 'DD-02',
    name: 'Self-Assigned Government Role',
    targetPath: '/users/myUid',
    operation: 'create',
    payload: {
      uid: 'myUid',
      displayName: 'Fake Authority',
      role: 'government',
      requestedRole: 'government',
      approvalStatus: 'approved',
      organization: 'Treasury',
      wardZone: 'Ward 80 · Indiranagar',
      badgeNumber: 'GOV-1',
      specialty: 'DBT',
    },
    expectedOutcome: 'PERMISSION_DENIED',
    enforcedByPillar: 'Pillar 4: Non-admin create forces role == worker',
  },
  {
    id: 'DD-03',
    name: 'Role Escalation via Update',
    targetPath: '/users/myUid',
    operation: 'update',
    payload: {
      role: 'municipality_officer',
    },
    expectedOutcome: 'PERMISSION_DENIED',
    enforcedByPillar: 'Pillar 4: incoming().role == existing().role for owner updates',
  },
  {
    id: 'DD-04',
    name: 'Shadow / Ghost Field Injection',
    targetPath: '/users/myUid',
    operation: 'create',
    payload: {
      uid: 'myUid',
      displayName: 'Valid Name',
      role: 'worker',
      isAdmin: true,
    },
    expectedOutcome: 'PERMISSION_DENIED',
    enforcedByPillar: 'Pillar 2: data.keys().hasOnly(...) blocks shadow keys',
  },
  {
    id: 'DD-05',
    name: 'Client Timestamp Forgery',
    targetPath: '/users/myUid',
    operation: 'create',
    payload: {
      createdAt: '2020-01-01T00:00:00Z',
    },
    expectedOutcome: 'PERMISSION_DENIED',
    enforcedByPillar: 'Temporal Integrity: createdAt == request.time',
  },
  {
    id: 'DD-06',
    name: 'Unverified Email Spoofing Admin Bypass',
    targetPath: '/role_requests/targetUid',
    operation: 'update',
    payload: {
      status: 'approved',
      reviewedByUid: 'spoofUid',
    },
    expectedOutcome: 'PERMISSION_DENIED',
    enforcedByPillar: 'Email Spoofing Guard: request.auth.token.email_verified == true',
  },
  {
    id: 'DD-07',
    name: 'Cross-User PII Read',
    targetPath: '/users/otherUid/private/info',
    operation: 'get',
    payload: {},
    expectedOutcome: 'PERMISSION_DENIED',
    enforcedByPillar: 'Pillar 6: PII strictly isolated to isOwner(userId) || isAdmin()',
  },
  {
    id: 'DD-08',
    name: 'Blanket Collection Scraping',
    targetPath: '/users',
    operation: 'list',
    payload: {},
    expectedOutcome: 'PERMISSION_DENIED',
    enforcedByPillar: 'Pillar 8: allow list enforces resource.data.uid == request.auth.uid',
  },
  {
    id: 'DD-09',
    name: 'ID Poisoning via Oversized / Invalid Path ID',
    targetPath: '/users/invalid$path$id',
    operation: 'create',
    payload: {},
    expectedOutcome: 'PERMISSION_DENIED',
    enforcedByPillar: 'Pillar 3: isValidId(userId) regex & length check',
  },
  {
    id: 'DD-10',
    name: 'Self-Approval of Role Request',
    targetPath: '/role_requests/myUid',
    operation: 'create',
    payload: {
      uid: 'myUid',
      requestedRole: 'engineer',
      status: 'approved',
    },
    expectedOutcome: 'PERMISSION_DENIED',
    enforcedByPillar: 'Pillar 4: create enforces status == pending && reviewedByUid == empty',
  },
  {
    id: 'DD-11',
    name: 'Terminal State Overwrite on Rejected Role Request',
    targetPath: '/role_requests/myUid',
    operation: 'update',
    payload: {
      status: 'pending',
    },
    expectedOutcome: 'PERMISSION_DENIED',
    enforcedByPillar: 'Terminal State Locking: existing().status == pending required for owner update',
  },
  {
    id: 'DD-12',
    name: 'Denial of Wallet Size Exhaustion',
    targetPath: '/users/myUid',
    operation: 'create',
    payload: {
      organization: 'X'.repeat(50000),
    },
    expectedOutcome: 'PERMISSION_DENIED',
    enforcedByPillar: 'Pillar 3: Strict .size() bounds on every string field',
  },
];
