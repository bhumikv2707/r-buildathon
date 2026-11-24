import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  BadgeCheck,
  Building2,
  CheckCircle2,
  Clock,
  HardHat,
  Landmark,
  Lock,
  LogOut,
  Shield,
  UserCheck,
  Wrench,
  X,
  XCircle,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { SCHEMA_LIMITS } from '../firebase';
import {
  CIVIC_ROLE_META,
  CivicRole,
  WARD_ZONES,
} from '../types/account';

interface AccountPortalModalProps {
  open: boolean;
  onClose: () => void;
}

const ROLE_ORDER: CivicRole[] = [
  'engineer',
  'worker',
  'municipality_officer',
  'government',
];

function RoleIcon({ role, className }: { role: CivicRole; className?: string }) {
  switch (role) {
    case 'engineer':
      return <Wrench className={className} />;
    case 'worker':
      return <HardHat className={className} />;
    case 'municipality_officer':
      return <Building2 className={className} />;
    case 'government':
      return <Landmark className={className} />;
  }
}

export function AccountPortalModal({ open, onClose }: AccountPortalModalProps) {
  const {
    user,
    isAdmin,
    profile,
    privateInfo,
    roleRequest,
    allRequests,
    allAccounts,
    profileLoading,
    isSigningIn,
    authError,
    signInWithGoogle,
    signOutAccount,
    saveAccountProfile,
    reviewRoleRequest,
  } = useAuth();

  const [modalTab, setModalTab] = useState<'profile' | 'permissions' | 'approvals'>(
    'profile'
  );
  const [selectedRole, setSelectedRole] = useState<CivicRole>('worker');
  const [displayName, setDisplayName] = useState('');
  const [organization, setOrganization] = useState('');
  const [wardZone, setWardZone] = useState(WARD_ZONES[0]);
  const [badgeNumber, setBadgeNumber] = useState('');
  const [specialty, setSpecialty] = useState('');
  const [phone, setPhone] = useState('');
  const [dbtHandle, setDbtHandle] = useState('');
  const [officeAddress, setOfficeAddress] = useState('');
  const [justification, setJustification] = useState('');

  const [isSaving, setIsSaving] = useState(false);
  const [busyReviewUid, setBusyReviewUid] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  useEffect(() => {
    if (!open) return;
    setFeedback(null);
    if (profile) {
      setSelectedRole(profile.requestedRole || profile.role);
      setDisplayName(profile.displayName || user?.displayName || '');
      setOrganization(profile.organization || '');
      setWardZone(profile.wardZone || WARD_ZONES[0]);
      setBadgeNumber(profile.badgeNumber || '');
      setSpecialty(profile.specialty || '');
    } else if (user) {
      setSelectedRole(isAdmin ? 'government' : 'worker');
      setDisplayName(user.displayName || '');
      setOrganization(isAdmin ? 'Municipal Escrow Treasury' : '');
      setWardZone(WARD_ZONES[0]);
      setBadgeNumber(isAdmin ? 'GOV-ROOT-01' : '');
      setSpecialty('');
    }
    if (privateInfo) {
      setPhone(privateInfo.phone || '');
      setDbtHandle(privateInfo.dbtHandle || '');
      setOfficeAddress(privateInfo.officeAddress || '');
    } else {
      setPhone('');
      setDbtHandle('');
      setOfficeAddress('');
    }
    if (roleRequest) {
      setJustification(roleRequest.justification || '');
    } else {
      setJustification('');
    }
  }, [open, user, profile, privateInfo, roleRequest, isAdmin]);

  const pendingRequests = useMemo(
    () => allRequests.filter((r) => r.status === 'pending'),
    [allRequests]
  );

  if (!open) return null;

  const activeRole: CivicRole = profile?.role || (isAdmin ? 'government' : 'worker');
  const activeRoleMeta = CIVIC_ROLE_META[activeRole];
  const selectedRoleMeta = CIVIC_ROLE_META[selectedRole];
  const roleLockedByResolvedRequest =
    !isAdmin &&
    Boolean(roleRequest && roleRequest.status !== 'pending');

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    if (displayName.trim().length < SCHEMA_LIMITS.DISPLAY_NAME_MIN) {
      setFeedback({
        type: 'error',
        message: 'Please enter your full name (at least 2 characters).',
      });
      return;
    }
    if (organization.trim().length < SCHEMA_LIMITS.ORGANIZATION_MIN) {
      setFeedback({
        type: 'error',
        message: 'Please enter your department, contractor squad, or agency name.',
      });
      return;
    }

    setIsSaving(true);
    try {
      await saveAccountProfile({
        displayName,
        requestedRole: roleLockedByResolvedRequest
          ? profile?.requestedRole || selectedRole
          : selectedRole,
        organization,
        wardZone,
        badgeNumber,
        specialty,
        phone,
        dbtHandle,
        officeAddress,
        justification,
      });
      setFeedback({
        type: 'success',
        message:
          isAdmin || selectedRole === 'worker'
            ? `Account saved as ${selectedRoleMeta.label}.`
            : `Profile saved. Your request for ${selectedRoleMeta.label} access has been queued for Government Authority verification.`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        message:
          err instanceof Error
            ? err.message
            : 'Unable to save civic account profile.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleReview = async (
    targetUid: string,
    decision: 'approved' | 'rejected',
    requestedRole: CivicRole
  ) => {
    setBusyReviewUid(targetUid);
    setFeedback(null);
    try {
      await reviewRoleRequest(targetUid, decision, requestedRole);
      setFeedback({
        type: 'success',
        message:
          decision === 'approved'
            ? `Approved ${CIVIC_ROLE_META[requestedRole].label} access.`
            : 'Role verification request rejected.',
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        message:
          err instanceof Error ? err.message : 'Unable to review request.',
      });
    } finally {
      setBusyReviewUid(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="account-portal-title"
    >
      <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl flex flex-col">
        {/* Top Modal Header */}
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 dark:border-slate-800 px-6 py-4 sticky top-0 bg-white dark:bg-slate-900 z-10">
          <div>
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-rose-600 dark:text-rose-400 shrink-0" />
              <h2
                id="account-portal-title"
                className="text-lg font-bold text-slate-900 dark:text-white"
              >
                Routix Civic Accounts &amp; Role Portal
              </h2>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Verified access for Road Engineers, Field Workers, Municipality Officers, and Government Authorities.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close account portal"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {!user ? (
            /* Signed-out Sign-In Experience */
            <div className="space-y-5">
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Sign in to create or access your Routix account
                  </h3>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                    Authenticate with Google to register your civic role, isolate private contact &amp; DBT payout info, and track official approvals.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={isSigningIn}
                  onClick={signInWithGoogle}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 dark:bg-slate-100 px-4 py-2.5 text-xs font-semibold text-white dark:text-slate-950 hover:bg-slate-800 dark:hover:bg-white transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
                >
                  <UserCheck className="h-4 w-4" />
                  <span>
                    {isSigningIn ? 'Signing in...' : 'Sign in with Google'}
                  </span>
                </button>
              </div>

              {authError && (
                <div className="flex items-start gap-2 rounded-lg border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/50 p-3 text-xs text-rose-800 dark:text-rose-200">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{authError}</span>
                </div>
              )}

              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">
                  Supported Account Types
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {ROLE_ORDER.map((r) => {
                    const meta = CIVIC_ROLE_META[r];
                    return (
                      <div
                        key={r}
                        className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-4 space-y-2"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 font-semibold text-sm text-slate-900 dark:text-white">
                            <RoleIcon role={r} className="h-4 w-4 text-rose-600 dark:text-rose-400 shrink-0" />
                            <span>{meta.label}</span>
                          </div>
                          <span
                            className={`rounded-md border px-2 py-0.5 text-[11px] font-medium ${meta.badgeClass}`}
                          >
                            {meta.requiresApprovalForNonAdmin
                              ? 'Verified'
                              : 'Instant'}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                          {meta.summary}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            /* Signed-in Experience */
            <div className="space-y-5">
              {/* Identity Banner */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 px-4 py-3.5">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200">
                    <RoleIcon role={activeRole} className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold text-slate-900 dark:text-white truncate">
                        {profile?.displayName || user.displayName || 'Civic Member'}
                      </span>
                      <span
                        className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold ${activeRoleMeta.badgeClass}`}
                      >
                        {activeRoleMeta.label}
                      </span>
                      {isAdmin && (
                        <span className="rounded-md border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 dark:text-emerald-300">
                          Root Authority
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                      {user.email}
                      {profile ? ` · ${profile.wardZone} · ID ${profile.badgeNumber}` : ' · Complete role setup below'}
                    </div>
                  </div>
                </div>

                {profile && profile.approvalStatus === 'pending' && (
                  <div className="inline-flex items-center gap-1.5 rounded-md border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/50 px-2.5 py-1 text-xs font-medium text-amber-800 dark:text-amber-300 shrink-0">
                    <Clock className="h-3.5 w-3.5" />
                    <span>
                      Pending {CIVIC_ROLE_META[profile.requestedRole].shortLabel} Approval
                    </span>
                  </div>
                )}
              </div>

              {/* Sub-navigation tabs inside Account Portal */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
                <div className="inline-flex items-center gap-1 rounded-lg bg-slate-100 dark:bg-slate-800 p-1">
                  <button
                    type="button"
                    onClick={() => setModalTab('profile')}
                    className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                      modalTab === 'profile'
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    Role &amp; Profile
                  </button>
                  <button
                    type="button"
                    onClick={() => setModalTab('permissions')}
                    className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                      modalTab === 'permissions'
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    Role Permissions
                  </button>
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => setModalTab('approvals')}
                      className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                        modalTab === 'approvals'
                          ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      Authority Approvals ({pendingRequests.length})
                    </button>
                  )}
                </div>

                {profileLoading && (
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    Syncing account...
                  </span>
                )}
              </div>

              {feedback && (
                <div
                  className={`flex items-start gap-2 rounded-lg border p-3 text-xs ${
                    feedback.type === 'success'
                      ? 'border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200'
                      : 'border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/50 text-rose-900 dark:text-rose-200'
                  }`}
                >
                  {feedback.type === 'success' ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                  )}
                  <span>{feedback.message}</span>
                </div>
              )}

              {modalTab === 'profile' && (
                <form onSubmit={handleSave} className="space-y-5">
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Select Civic Account Role
                      </label>
                      {roleLockedByResolvedRequest && roleRequest && (
                        <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                          Role request status: {roleRequest.status}
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {ROLE_ORDER.map((r) => {
                        const meta = CIVIC_ROLE_META[r];
                        const isSelected = selectedRole === r;
                        return (
                          <button
                            key={r}
                            type="button"
                            disabled={roleLockedByResolvedRequest}
                            onClick={() => setSelectedRole(r)}
                            className={`text-left rounded-lg border p-3 transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed ${
                              isSelected
                                ? 'border-slate-900 dark:border-slate-100 bg-slate-50 dark:bg-slate-800'
                                : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 text-xs font-bold text-slate-900 dark:text-white">
                                <RoleIcon
                                  role={r}
                                  className="h-4 w-4 text-rose-600 dark:text-rose-400 shrink-0"
                                />
                                <span>{meta.label}</span>
                              </div>
                              {isSelected && (
                                <BadgeCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                              )}
                            </div>
                            <p className="mt-1 text-[11px] text-slate-600 dark:text-slate-400 leading-snug">
                              {meta.summary}
                            </p>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {!isAdmin && selectedRole !== 'worker' && (
                    <div className="rounded-lg border border-amber-200 dark:border-amber-900/70 bg-amber-50/70 dark:bg-amber-950/30 px-3.5 py-2.5 text-xs text-amber-900 dark:text-amber-200">
                      Worker access activates immediately on save. Requests for{' '}
                      <span className="font-semibold">{selectedRoleMeta.label}</span>{' '}
                      are verified by the Government Authority to prevent unauthorized escrow or SLA actions.
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label
                        htmlFor="acc-display-name"
                        className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                      >
                        Full Name
                      </label>
                      <input
                        id="acc-display-name"
                        type="text"
                        required
                        maxLength={SCHEMA_LIMITS.DISPLAY_NAME_MAX}
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        placeholder="e.g. Rajesh Kulkarni"
                        className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:border-slate-400 focus:bg-white dark:focus:bg-slate-800 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="acc-ward-zone"
                        className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                      >
                        Assigned Ward / Jurisdiction
                      </label>
                      <select
                        id="acc-ward-zone"
                        value={wardZone}
                        onChange={(e) => setWardZone(e.target.value)}
                        className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:border-slate-400 focus:bg-white dark:focus:bg-slate-800 focus:outline-none"
                      >
                        {WARD_ZONES.map((w) => (
                          <option key={w} value={w}>
                            {w}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label
                        htmlFor="acc-org"
                        className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                      >
                        Organization / Department / Squad
                      </label>
                      <input
                        id="acc-org"
                        type="text"
                        required
                        maxLength={SCHEMA_LIMITS.ORGANIZATION_MAX}
                        value={organization}
                        onChange={(e) => setOrganization(e.target.value)}
                        placeholder={selectedRoleMeta.organizationPlaceholder}
                        className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:border-slate-400 focus:bg-white dark:focus:bg-slate-800 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="acc-badge"
                        className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                      >
                        Official Badge / Worker / Agency ID
                      </label>
                      <input
                        id="acc-badge"
                        type="text"
                        required
                        maxLength={SCHEMA_LIMITS.BADGE_MAX}
                        value={badgeNumber}
                        onChange={(e) => setBadgeNumber(e.target.value)}
                        placeholder="e.g. ENG-80-214 or WK-IND-09"
                        className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm font-mono text-slate-900 dark:text-slate-100 focus:border-slate-400 focus:bg-white dark:focus:bg-slate-800 focus:outline-none"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label
                        htmlFor="acc-specialty"
                        className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                      >
                        Operational Specialty
                      </label>
                      <input
                        id="acc-specialty"
                        type="text"
                        maxLength={SCHEMA_LIMITS.SPECIALTY_MAX}
                        value={specialty}
                        onChange={(e) => setSpecialty(e.target.value)}
                        placeholder={selectedRoleMeta.specialtyPlaceholder}
                        className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:border-slate-400 focus:bg-white dark:focus:bg-slate-800 focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* Strictly Isolated PII Section */}
                  <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 p-4 space-y-3">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200">
                      <Lock className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
                      <span>
                        Private Contact &amp; DBT Details (Strictly Isolated to You &amp; Authority)
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label
                          htmlFor="acc-phone"
                          className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1"
                        >
                          Mobile Number
                        </label>
                        <input
                          id="acc-phone"
                          type="tel"
                          maxLength={SCHEMA_LIMITS.PHONE_MAX}
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          placeholder="+91 98450 11223"
                          className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs text-slate-900 dark:text-slate-100 focus:border-slate-400 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label
                          htmlFor="acc-dbt"
                          className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1"
                        >
                          DBT Handle / Treasury Ref
                        </label>
                        <input
                          id="acc-dbt"
                          type="text"
                          maxLength={SCHEMA_LIMITS.DBT_HANDLE_MAX}
                          value={dbtHandle}
                          onChange={(e) => setDbtHandle(e.target.value)}
                          placeholder="Masked bank / UPI ref"
                          className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs text-slate-900 dark:text-slate-100 focus:border-slate-400 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label
                          htmlFor="acc-address"
                          className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1"
                        >
                          Office / Depot Location
                        </label>
                        <input
                          id="acc-address"
                          type="text"
                          maxLength={SCHEMA_LIMITS.OFFICE_ADDRESS_MAX}
                          value={officeAddress}
                          onChange={(e) => setOfficeAddress(e.target.value)}
                          placeholder="Ward office or depot"
                          className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs text-slate-900 dark:text-slate-100 focus:border-slate-400 focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>

                  {!isAdmin && selectedRole !== 'worker' && (
                    <div>
                      <label
                        htmlFor="acc-justification"
                        className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                      >
                        Role Verification Note
                      </label>
                      <input
                        id="acc-justification"
                        type="text"
                        maxLength={SCHEMA_LIMITS.JUSTIFICATION_MAX}
                        value={justification}
                        onChange={(e) => setJustification(e.target.value)}
                        placeholder="e.g. Junior Engineer assigned to Ward 80 road maintenance"
                        className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-xs text-slate-900 dark:text-slate-100 focus:border-slate-400 focus:bg-white dark:focus:bg-slate-800 focus:outline-none"
                      />
                    </div>
                  )}

                  <div className="flex items-center justify-end gap-3 pt-1">
                    <button
                      type="submit"
                      disabled={isSaving}
                      className="rounded-lg bg-slate-900 dark:bg-slate-100 px-4 py-2 text-xs font-semibold text-white dark:text-slate-950 hover:bg-slate-800 dark:hover:bg-white transition-colors cursor-pointer disabled:opacity-60"
                    >
                      {isSaving
                        ? 'Saving Account...'
                        : profile
                        ? 'Update Civic Account'
                        : 'Create Civic Account'}
                    </button>
                  </div>
                </form>
              )}

              {modalTab === 'permissions' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {ROLE_ORDER.map((r) => {
                    const meta = CIVIC_ROLE_META[r];
                    const isCurrent = activeRole === r;
                    return (
                      <div
                        key={r}
                        className={`rounded-lg border p-4 space-y-2.5 ${
                          isCurrent
                            ? 'border-slate-900 dark:border-slate-200 bg-slate-50 dark:bg-slate-800/60'
                            : 'border-slate-200 dark:border-slate-800'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
                            <RoleIcon role={r} className="h-4 w-4 text-rose-600 dark:text-rose-400" />
                            <span>{meta.label}</span>
                          </div>
                          {isCurrent && (
                            <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                              Your Role
                            </span>
                          )}
                        </div>
                        <ul className="space-y-1.5 text-xs text-slate-600 dark:text-slate-300">
                          {meta.capabilities.map((cap) => (
                            <li key={cap} className="flex items-start gap-1.5">
                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                              <span>{cap}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              )}

              {modalTab === 'approvals' && isAdmin && (
                <div className="space-y-4">
                  <div className="rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden">
                    <div className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 px-4 py-2.5 text-xs font-semibold text-slate-700 dark:text-slate-200">
                      Pending Role Verification Requests ({pendingRequests.length})
                    </div>
                    {pendingRequests.length === 0 ? (
                      <div className="p-6 text-center text-xs text-slate-500 dark:text-slate-400">
                        No pending Engineer, Municipality Officer, or Government role requests.
                      </div>
                    ) : (
                      <div className="divide-y divide-slate-100 dark:divide-slate-800">
                        {pendingRequests.map((req) => (
                          <div
                            key={req.uid}
                            className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 text-xs"
                          >
                            <div className="space-y-0.5 min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-bold text-slate-900 dark:text-white">
                                  {req.displayName}
                                </span>
                                <span
                                  className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold ${
                                    CIVIC_ROLE_META[req.requestedRole].badgeClass
                                  }`}
                                >
                                  Requested: {CIVIC_ROLE_META[req.requestedRole].label}
                                </span>
                              </div>
                              <div className="text-slate-600 dark:text-slate-400">
                                {req.organization} · {req.wardZone} · Badge {req.badgeNumber}
                              </div>
                              {req.justification && (
                                <div className="text-slate-500 dark:text-slate-400 italic">
                                  “{req.justification}”
                                </div>
                              )}
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <button
                                type="button"
                                disabled={busyReviewUid === req.uid}
                                onClick={() =>
                                  handleReview(
                                    req.uid,
                                    'approved',
                                    req.requestedRole
                                  )
                                }
                                className="inline-flex items-center gap-1 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800 cursor-pointer disabled:opacity-60"
                              >
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                <span>Approve</span>
                              </button>
                              <button
                                type="button"
                                disabled={busyReviewUid === req.uid}
                                onClick={() =>
                                  handleReview(
                                    req.uid,
                                    'rejected',
                                    req.requestedRole
                                  )
                                }
                                className="inline-flex items-center gap-1 rounded-lg border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/50 px-3 py-1.5 text-xs font-semibold text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-900/60 cursor-pointer disabled:opacity-60"
                              >
                                <XCircle className="h-3.5 w-3.5" />
                                <span>Reject</span>
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden">
                    <div className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 px-4 py-2.5 text-xs font-semibold text-slate-700 dark:text-slate-200">
                      Registered Civic Accounts Directory ({allAccounts.length})
                    </div>
                    {allAccounts.length === 0 ? (
                      <div className="p-5 text-center text-xs text-slate-500 dark:text-slate-400">
                        No accounts registered yet.
                      </div>
                    ) : (
                      <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-56 overflow-y-auto">
                        {allAccounts.map((acc) => (
                          <div
                            key={acc.uid}
                            className="flex items-center justify-between gap-3 px-4 py-2.5 text-xs"
                          >
                            <div className="min-w-0">
                              <div className="font-semibold text-slate-900 dark:text-white truncate">
                                {acc.displayName} ·{' '}
                                <span className="font-mono text-slate-500 dark:text-slate-400">
                                  {acc.badgeNumber}
                                </span>
                              </div>
                              <div className="text-slate-500 dark:text-slate-400 truncate">
                                {acc.organization} · {acc.wardZone}
                              </div>
                            </div>
                            <span
                              className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold shrink-0 ${
                                CIVIC_ROLE_META[acc.role].badgeClass
                              }`}
                            >
                              {CIVIC_ROLE_META[acc.role].shortLabel}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 border-t border-slate-200 dark:border-slate-800 px-6 py-3.5 bg-slate-50 dark:bg-slate-900/90">
          {user ? (
            <button
              type="button"
              onClick={signOutAccount}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>Sign Out</span>
            </button>
          ) : (
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Secured by Firebase Auth &amp; Role-Based Rules
            </span>
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
