// @mfe/auth — Centralized authorization package for ERP MFE apps.
// All permission checks should go through this package.

export { PermissionProvider, usePermissions } from './PermissionProvider';
export { useHasModule, useIsSuperAdmin } from './useHasPermission';
export { useCheckPermission } from './useCheckPermission';
export { useExplainPermission } from './useExplainPermission';
// Faz 21.8 PR-X8 — `ExplainPermissionModal` MOVED to `@mfe/auth/ui` subpath.
// The root barrel is the MF-shared singleton; pulling `Modal/Button/Alert/Badge/Select/Input`
// from `@mfe/design-system` into the root surface created an `auth` ↔ `design-system`
// circular cycle in the generated MF `loadShare` chunks. The cycle silently
// deadlocked `hostAutoInit` in production after the
// `@module-federation/vite 1.14.2 → 1.15.1` upgrade (PR-X7) — React app
// never mounted, `#root` empty, no console errors. Two independent Codex
// audits (threads 019deeb0 + 019deecf) confirmed the cycle in the generated
// dist artifacts.
//
// Migration: import the modal directly from `@mfe/auth/ui`:
//   - import { ExplainPermissionModal } from '@mfe/auth/ui';
export { ProtectedRoute, ProtectedSection } from './ProtectedRoute';
export { useZanzibarAccess } from './useZanzibarAccess';
export { useZanzibarAccessProps } from './useZanzibarAccessProps';
export { useBatchZanzibarAccess } from './useBatchZanzibarAccess';
export type { BatchAccessEntry, BatchZanzibarAccessResult } from './useBatchZanzibarAccess';
export { ZanzibarGate } from './ZanzibarGate';
export { fetchAuthzMe, fetchAuthzVersion, checkPermission, checkPermissionBatch } from './api';
export { getHttpStatus, isUnauthorizedError, isForbiddenError, isServerError } from './errors';
export { MODULES } from './types';
export { REPORT_AUTHZ_TARGETS, getReportAuthzTarget } from './authzTargetRegistry';
export type { AuthzTarget, ReportGroupKey } from './authzTargetRegistry';
export type {
  AuthzMeResponse,
  CheckRequest,
  CheckResponse,
  ModuleKey,
  AccessLevel,
  GrantResult,
  ScopeAssignment,
  ExplainResponse,
  ExplainScopeType,
  PermissionCatalog,
  ModuleCatalogItem,
  ActionCatalogItem,
  ReportCatalogItem,
  CheckReason,
  BatchCheckRequest,
  BatchCheckItem,
  BatchCheckResponse,
  ZanzibarAccessLevel,
} from './types';
// Object-level permission cache (authzVersion-driven)
export { createZanzibarCache } from './zanzibar-cache';
export type { ZanzibarCache, ZanzibarCacheConfig, ZanzibarCacheEntry } from './zanzibar-cache';

// User Impersonation v1 (PR-C) — typed API client + helpers
export {
  startImpersonation,
  stopImpersonation,
  getActiveImpersonation,
  revokeImpersonation,
  isImpersonationToken,
  decodeJwtPayload,
  IMPERSONATION_ERROR_CODES,
  isImpersonationErrorCode,
} from './impersonation';
export type {
  StartImpersonationRequest,
  StartImpersonationResponse,
  ImpersonationSessionResource,
  RevokeImpersonationRequest,
  ImpersonationErrorCode,
  ImpersonationLifecycleErrorCode,
} from './impersonation';
