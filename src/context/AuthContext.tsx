import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  User,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  auth,
  BOOTSTRAPPED_ADMIN_EMAIL,
  db,
  googleProvider,
  handleFirestoreError,
  OperationType,
  SCHEMA_LIMITS,
} from '../firebase';
import {
  CivicRole,
  ReportHistoryEntry,
  RoleAccessRequest,
  UserAccountProfile,
  UserPrivateInfo,
  UserSettings,
} from '../types/account';
import { HazardReport } from '../types/routix';

export interface AccountProfileInput {
  displayName: string;
  requestedRole: CivicRole;
  organization: string;
  wardZone: string;
  badgeNumber: string;
  specialty: string;
  phone: string;
  dbtHandle: string;
  officeAddress: string;
  justification: string;
}

interface AuthContextValue {
  user: User | null;
  authReady: boolean;
  isAdmin: boolean;
  profile: UserAccountProfile | null;
  privateInfo: UserPrivateInfo | null;
  roleRequest: RoleAccessRequest | null;
  allRequests: RoleAccessRequest[];
  allAccounts: UserAccountProfile[];
  userSettings: UserSettings | null;
  reportHistory: ReportHistoryEntry[];
  profileLoading: boolean;
  isSigningIn: boolean;
  authError: string | null;
  signInWithGoogle: () => Promise<void>;
  signOutAccount: () => Promise<void>;
  saveAccountProfile: (input: AccountProfileInput) => Promise<void>;
  reviewRoleRequest: (
    targetUid: string,
    decision: 'approved' | 'rejected',
    requestedRole: CivicRole
  ) => Promise<void>;
  saveUserSettings: (
    settings: Omit<UserSettings, 'uid' | 'createdAt' | 'updatedAt'>
  ) => Promise<void>;
  recordReportHistory: (
    hazard: HazardReport,
    source: 'camera' | 'ai_detect'
  ) => Promise<void>;
  deleteReportHistoryItem: (reportId: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function clampString(value: string, maxLen: number): string {
  return value.trim().slice(0, maxLen);
}

export function FirebaseProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [profile, setProfile] = useState<UserAccountProfile | null>(null);
  const [privateInfo, setPrivateInfo] = useState<UserPrivateInfo | null>(null);
  const [roleRequest, setRoleRequest] = useState<RoleAccessRequest | null>(null);
  const [allRequests, setAllRequests] = useState<RoleAccessRequest[]>([]);
  const [allAccounts, setAllAccounts] = useState<UserAccountProfile[]>([]);
  const [userSettings, setUserSettings] = useState<UserSettings | null>(null);
  const [reportHistory, setReportHistory] = useState<ReportHistoryEntry[]>([]);
  const [profileLoading, setProfileLoading] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setAuthReady(true);
      if (!firebaseUser) {
        setProfile(null);
        setPrivateInfo(null);
        setRoleRequest(null);
        setAllRequests([]);
        setAllAccounts([]);
        setUserSettings(null);
        setReportHistory([]);
        setProfileLoading(false);
      }
    });
    return unsub;
  }, []);

  const isAdmin = useMemo(
    () =>
      Boolean(
        user &&
          user.emailVerified &&
          user.email?.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase()
      ),
    [user]
  );

  useEffect(() => {
    if (!authReady || !user) return;

    setProfileLoading(true);
    const userPath = `users/${user.uid}`;
    const privatePath = `users/${user.uid}/private/info`;
    const requestPath = `role_requests/${user.uid}`;

    const unsubUser = onSnapshot(
      doc(db, 'users', user.uid),
      (snap) => {
        setProfile(
          snap.exists() ? (snap.data() as UserAccountProfile) : null
        );
        setProfileLoading(false);
      },
      (error) => {
        setProfileLoading(false);
        handleFirestoreError(error, OperationType.GET, userPath);
      }
    );

    const unsubPrivate = onSnapshot(
      doc(db, 'users', user.uid, 'private', 'info'),
      (snap) => {
        setPrivateInfo(
          snap.exists() ? (snap.data() as UserPrivateInfo) : null
        );
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, privatePath);
      }
    );

    const unsubReq = onSnapshot(
      doc(db, 'role_requests', user.uid),
      (snap) => {
        setRoleRequest(
          snap.exists() ? (snap.data() as RoleAccessRequest) : null
        );
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, requestPath);
      }
    );

    const unsubSettings = onSnapshot(
      doc(db, 'user_settings', user.uid),
      (snap) => {
        setUserSettings(snap.exists() ? (snap.data() as UserSettings) : null);
      },
      (error) => {
        handleFirestoreError(
          error,
          OperationType.GET,
          `user_settings/${user.uid}`
        );
      }
    );

    const unsubHistory = onSnapshot(
      query(
        collection(db, 'report_history'),
        where('uid', '==', user.uid)
      ),
      (snap) => {
        const items = snap.docs
          .map((d) => d.data() as ReportHistoryEntry)
          .sort((a, b) => (b.reportedAt || '').localeCompare(a.reportedAt || ''));
        setReportHistory(items);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'report_history');
      }
    );

    let unsubAllRequests: (() => void) | undefined;
    let unsubAllUsers: (() => void) | undefined;

    if (isAdmin) {
      unsubAllRequests = onSnapshot(
        collection(db, 'role_requests'),
        (snap) => {
          setAllRequests(
            snap.docs.map((d) => d.data() as RoleAccessRequest)
          );
        },
        (error) => {
          handleFirestoreError(error, OperationType.LIST, 'role_requests');
        }
      );

      unsubAllUsers = onSnapshot(
        collection(db, 'users'),
        (snap) => {
          setAllAccounts(
            snap.docs.map((d) => d.data() as UserAccountProfile)
          );
        },
        (error) => {
          handleFirestoreError(error, OperationType.LIST, 'users');
        }
      );
    }

    return () => {
      unsubUser();
      unsubPrivate();
      unsubReq();
      unsubSettings();
      unsubHistory();
      unsubAllRequests?.();
      unsubAllUsers?.();
    };
  }, [authReady, user, isAdmin]);

  const signInWithGoogle = useCallback(async () => {
    setIsSigningIn(true);
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Unable to sign in with Google.';
      if (!msg.includes('popup-closed-by-user')) {
        setAuthError(msg);
      }
    } finally {
      setIsSigningIn(false);
    }
  }, []);

  const signOutAccount = useCallback(async () => {
    setAuthError(null);
    await signOut(auth);
  }, []);

  const saveAccountProfile = useCallback(
    async (input: AccountProfileInput) => {
      if (!user) {
        throw new Error('Please sign in first.');
      }
      if (!SCHEMA_LIMITS.UID_PATTERN.test(user.uid)) {
        throw new Error('Invalid user identifier format.');
      }

      const displayName =
        clampString(input.displayName, SCHEMA_LIMITS.DISPLAY_NAME_MAX) ||
        clampString(
          user.displayName || 'Civic Member',
          SCHEMA_LIMITS.DISPLAY_NAME_MAX
        );
      const safeDisplayName =
        displayName.length >= SCHEMA_LIMITS.DISPLAY_NAME_MIN
          ? displayName
          : 'Civic Member';

      const organization = clampString(
        input.organization,
        SCHEMA_LIMITS.ORGANIZATION_MAX
      );
      const safeOrganization =
        organization.length >= SCHEMA_LIMITS.ORGANIZATION_MIN
          ? organization
          : 'Routix Civic Unit';

      const wardZone = clampString(input.wardZone, SCHEMA_LIMITS.WARD_ZONE_MAX);
      const safeWardZone =
        wardZone.length >= SCHEMA_LIMITS.WARD_ZONE_MIN
          ? wardZone
          : 'Ward 80 · Indiranagar';

      const rawBadge = clampString(input.badgeNumber, SCHEMA_LIMITS.BADGE_MAX);
      const safeBadge =
        rawBadge.length >= SCHEMA_LIMITS.BADGE_MIN ? rawBadge : 'RTX-001';

      const specialty = clampString(
        input.specialty,
        SCHEMA_LIMITS.SPECIALTY_MAX
      );
      const email = clampString(user.email || '', SCHEMA_LIMITS.EMAIL_MAX);
      const phone = clampString(input.phone, SCHEMA_LIMITS.PHONE_MAX);
      const dbtHandle = clampString(
        input.dbtHandle,
        SCHEMA_LIMITS.DBT_HANDLE_MAX
      );
      const officeAddress = clampString(
        input.officeAddress,
        SCHEMA_LIMITS.OFFICE_ADDRESS_MAX
      );
      const justification = clampString(
        input.justification,
        SCHEMA_LIMITS.JUSTIFICATION_MAX
      );

      const userRef = doc(db, 'users', user.uid);
      const privateRef = doc(db, 'users', user.uid, 'private', 'info');
      const reqRef = doc(db, 'role_requests', user.uid);

      if (!profile) {
        const batch = writeBatch(db);
        const initialRole: CivicRole = isAdmin ? input.requestedRole : 'worker';
        const approvalStatus =
          isAdmin || input.requestedRole === 'worker' ? 'approved' : 'pending';

        batch.set(userRef, {
          uid: user.uid,
          displayName: safeDisplayName,
          role: initialRole,
          requestedRole: input.requestedRole,
          approvalStatus,
          organization: safeOrganization,
          wardZone: safeWardZone,
          badgeNumber: safeBadge,
          specialty,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        batch.set(privateRef, {
          uid: user.uid,
          email,
          phone,
          dbtHandle,
          officeAddress,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        if (!isAdmin && input.requestedRole !== 'worker') {
          batch.set(reqRef, {
            uid: user.uid,
            displayName: safeDisplayName,
            requestedRole: input.requestedRole,
            organization: safeOrganization,
            wardZone: safeWardZone,
            badgeNumber: safeBadge,
            justification:
              justification ||
              `Requesting ${input.requestedRole} access for ${safeWardZone}.`,
            status: 'pending',
            reviewedByUid: '',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }

        try {
          await batch.commit();
        } catch (error) {
          handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}`);
        }
        return;
      }

      // Existing account update (strictly respects Action 1 vs Action 2 affectedKeys rules)
      const isChangingRole = input.requestedRole !== profile.requestedRole;
      const nextApprovalStatus = isAdmin
        ? 'approved'
        : isChangingRole
        ? input.requestedRole === 'worker'
          ? 'approved'
          : 'pending'
        : profile.approvalStatus;

      try {
        const batch = writeBatch(db);
        batch.update(userRef, {
          displayName: safeDisplayName,
          requestedRole: input.requestedRole,
          approvalStatus: nextApprovalStatus,
          organization: safeOrganization,
          wardZone: safeWardZone,
          badgeNumber: safeBadge,
          specialty,
          updatedAt: serverTimestamp(),
        });

        if (privateInfo) {
          batch.update(privateRef, {
            email,
            phone,
            dbtHandle,
            officeAddress,
            updatedAt: serverTimestamp(),
          });
        } else {
          batch.set(privateRef, {
            uid: user.uid,
            email,
            phone,
            dbtHandle,
            officeAddress,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }

        if (!isAdmin && input.requestedRole !== 'worker') {
          if (!roleRequest) {
            batch.set(reqRef, {
              uid: user.uid,
              displayName: safeDisplayName,
              requestedRole: input.requestedRole,
              organization: safeOrganization,
              wardZone: safeWardZone,
              badgeNumber: safeBadge,
              justification:
                justification ||
                `Requesting ${input.requestedRole} access for ${safeWardZone}.`,
              status: 'pending',
              reviewedByUid: '',
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          } else if (roleRequest.status === 'pending') {
            batch.update(reqRef, {
              displayName: safeDisplayName,
              requestedRole: input.requestedRole,
              organization: safeOrganization,
              wardZone: safeWardZone,
              badgeNumber: safeBadge,
              justification:
                justification || roleRequest.justification || 'Verification requested.',
              updatedAt: serverTimestamp(),
            });
          }
        }

        await batch.commit();

        if (isAdmin && profile.role !== input.requestedRole) {
          await updateDoc(userRef, {
            role: input.requestedRole,
            requestedRole: input.requestedRole,
            approvalStatus: 'approved',
            updatedAt: serverTimestamp(),
          });
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
      }
    },
    [user, profile, privateInfo, roleRequest, isAdmin]
  );

  const reviewRoleRequest = useCallback(
    async (
      targetUid: string,
      decision: 'approved' | 'rejected',
      requestedRole: CivicRole
    ) => {
      if (!user || !isAdmin) {
        throw new Error('Only Government Admin can review role requests.');
      }

      const batch = writeBatch(db);
      const targetUserRef = doc(db, 'users', targetUid);
      const targetReqRef = doc(db, 'role_requests', targetUid);

      batch.update(targetReqRef, {
        status: decision,
        reviewedByUid: user.uid,
        updatedAt: serverTimestamp(),
      });

      batch.update(targetUserRef, {
        role: decision === 'approved' ? requestedRole : 'worker',
        requestedRole,
        approvalStatus: decision,
        updatedAt: serverTimestamp(),
      });

      try {
        await batch.commit();
      } catch (error) {
        handleFirestoreError(
          error,
          OperationType.UPDATE,
          `role_requests/${targetUid}`
        );
      }
    },
    [user, isAdmin]
  );

  const saveUserSettings = useCallback(
    async (
      settingsInput: Omit<UserSettings, 'uid' | 'createdAt' | 'updatedAt'>
    ) => {
      if (!user) return;
      const settingsRef = doc(db, 'user_settings', user.uid);
      const safeWard =
        clampString(settingsInput.defaultWard, SCHEMA_LIMITS.WARD_ZONE_MAX) ||
        'Ward 80 · Indiranagar';

      try {
        if (!userSettings) {
          await setDoc(settingsRef, {
            uid: user.uid,
            theme: settingsInput.theme,
            defaultTab: settingsInput.defaultTab,
            defaultWard: safeWard.length >= 2 ? safeWard : 'Ward 80 · Indiranagar',
            defaultHeatmapOn: Boolean(settingsInput.defaultHeatmapOn),
            autoUseGps: Boolean(settingsInput.autoUseGps),
            highSeverityAlerts: Boolean(settingsInput.highSeverityAlerts),
            imuSensitivity: settingsInput.imuSensitivity,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        } else {
          await updateDoc(settingsRef, {
            theme: settingsInput.theme,
            defaultTab: settingsInput.defaultTab,
            defaultWard: safeWard.length >= 2 ? safeWard : 'Ward 80 · Indiranagar',
            defaultHeatmapOn: Boolean(settingsInput.defaultHeatmapOn),
            autoUseGps: Boolean(settingsInput.autoUseGps),
            highSeverityAlerts: Boolean(settingsInput.highSeverityAlerts),
            imuSensitivity: settingsInput.imuSensitivity,
            updatedAt: serverTimestamp(),
          });
        }
      } catch (error) {
        handleFirestoreError(
          error,
          OperationType.WRITE,
          `user_settings/${user.uid}`
        );
      }
    },
    [user, userSettings]
  );

  const recordReportHistory = useCallback(
    async (hazard: HazardReport, source: 'camera' | 'ai_detect') => {
      if (!user) return;
      const safeHazardId = hazard.id.replace(/[^a-zA-Z0-9_\-]/g, '-').slice(0, 64);
      const reportId = `${user.uid}_${safeHazardId}`.slice(0, 128);
      const reportRef = doc(db, 'report_history', reportId);

      const safeStr = (val: string, fallback: string, maxLen: number) => {
        const trimmed = val.trim().slice(0, maxLen);
        return trimmed.length >= 2 ? trimmed : fallback;
      };

      try {
        await setDoc(reportRef, {
          id: reportId,
          uid: user.uid,
          hazardId: safeHazardId,
          title: safeStr(hazard.title || '', 'Road Hazard', 140),
          streetName: safeStr(hazard.streetName || '', 'Urban Road', 140),
          ward: safeStr(hazard.ward || '', 'Ward 80 · Indiranagar', 80),
          hazardType: safeStr(hazard.hazardType || '', 'Pothole', 64),
          severity: hazard.severity,
          priorityScore: Math.max(0, Math.min(100, Math.round(hazard.priorityScore))),
          source,
          status: hazard.status,
          lat: Math.max(-90, Math.min(90, Number(hazard.lat) || 0)),
          lng: Math.max(-180, Math.min(180, Number(hazard.lng) || 0)),
          estimatedCostInr: Math.max(0, Math.round(hazard.microJobPayoutInr || 0)),
          reportedAt: (hazard.reportedAt || new Date().toISOString()).slice(0, 64),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        handleFirestoreError(
          error,
          OperationType.CREATE,
          `report_history/${reportId}`
        );
      }
    },
    [user]
  );

  const deleteReportHistoryItem = useCallback(
    async (reportId: string) => {
      if (!user) return;
      try {
        await deleteDoc(doc(db, 'report_history', reportId));
      } catch (error) {
        handleFirestoreError(
          error,
          OperationType.DELETE,
          `report_history/${reportId}`
        );
      }
    },
    [user]
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      authReady,
      isAdmin,
      profile,
      privateInfo,
      roleRequest,
      allRequests,
      allAccounts,
      userSettings,
      reportHistory,
      profileLoading,
      isSigningIn,
      authError,
      signInWithGoogle,
      signOutAccount,
      saveAccountProfile,
      reviewRoleRequest,
      saveUserSettings,
      recordReportHistory,
      deleteReportHistoryItem,
    }),
    [
      user,
      authReady,
      isAdmin,
      profile,
      privateInfo,
      roleRequest,
      allRequests,
      allAccounts,
      userSettings,
      reportHistory,
      profileLoading,
      isSigningIn,
      authError,
      signInWithGoogle,
      signOutAccount,
      saveAccountProfile,
      reviewRoleRequest,
      saveUserSettings,
      recordReportHistory,
      deleteReportHistoryItem,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside FirebaseProvider');
  }
  return ctx;
}
