# Routix Multi-Role Account Security Specification (Phase 0 TDD)

## 1. Data Invariants
1. **No Self-Assigned Privileged Roles**: Any authenticated user creating `/users/{userId}` can only self-assign `role == 'worker'` unless verified as an Admin (`bhumikav544@gmail.com` with `email_verified == true` or registered in `/admins/{uid}`). Privileged roles (`engineer`, `municipality_officer`, `government`) require a `role_requests/{userId}` entry with `status == 'pending'` and admin approval.
2. **Immutable Ownership & Timestamps**: `uid` and `createdAt` are immutable across updates. `createdAt` and `updatedAt` must equal `request.time`.
3. **PII Isolation**: Email, phone number, DBT bank handles, and office addresses are stored exclusively under `/users/{userId}/private/info` and are strictly readable only by the owner (`request.auth.uid == userId`) or a verified Admin.
4. **Action-Based Update Integrity**: Owners may update only profile metadata (`displayName`, `requestedRole`, `approvalStatus`, `organization`, `wardZone`, `badgeNumber`, `specialty`, `updatedAt`) and may never mutate `role`. Admins may approve/reject role requests and update `role` + `approvalStatus`.
5. **Terminal State Locking**: Once a `role_requests/{userId}` document transitions from `pending` to `approved` or `rejected`, non-admin users cannot overwrite or reopen it.
6. **Email Verification Mandate**: All standard writes and admin checks enforce `request.auth.token.email_verified == true`.

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Identity Spoofing on Create**: `POST /users/victimUid` with `uid: "attackerUid"`. -> `PERMISSION_DENIED`.
2. **Self-Assigned Government Role**: Regular user creates `/users/myUid` with `role: "government"` and `approvalStatus: "approved"`. -> `PERMISSION_DENIED`.
3. **Role Escalation via Update**: Existing `worker` updates `/users/myUid` setting `role: "municipality_officer"`. -> `PERMISSION_DENIED`.
4. **Shadow / Ghost Field Injection**: User creates `/users/myUid` with extra field `isAdmin: true` or `escrowBypass: true`. -> `PERMISSION_DENIED`.
5. **Timestamp Forgery**: User creates `/users/myUid` with client-supplied `createdAt: "2020-01-01T00:00:00Z"`. -> `PERMISSION_DENIED`.
6. **Email Spoofing Admin Bypass**: Unverified token (`email: "bhumikav544@gmail.com"`, `email_verified: false`) attempts to approve `/role_requests/targetUid`. -> `PERMISSION_DENIED`.
7. **Cross-User PII Read**: Authenticated user `uidA` tries `GET /users/uidB/private/info`. -> `PERMISSION_DENIED`.
8. **Blanket Collection Scraping**: Authenticated user `uidA` tries `LIST /users` or `LIST /role_requests` without `uid == request.auth.uid`. -> `PERMISSION_DENIED`.
9. **ID Poisoning**: User writes `/users/AAAA... (1500 chars)` or `/users/bad$id`. -> `PERMISSION_DENIED`.
10. **Self-Approval of Role Request**: User creates `/role_requests/myUid` with `status: "approved"`. -> `PERMISSION_DENIED`.
11. **Terminal State Overwrite**: Rejected user attempts to update `/role_requests/myUid` back to `status: "pending"`. -> `PERMISSION_DENIED`.
12. **Denial of Wallet Size Exhaustion**: User writes a 50KB `organization` string into `/users/myUid`. -> `PERMISSION_DENIED`.
