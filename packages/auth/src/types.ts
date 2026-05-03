/**
 * Authorization types matching backend AuthzControllerV1 DTOs.
 * STORY-0318: Enhanced with roles, modules, actions, reports, pages, scopes.
 */

export interface AuthzMeResponse {
  userId: string;
  superAdmin: boolean;

  // Legacy fields (backward compat)
  permissions?: string[];
  allowedModules: string[];
  allowedCompanyIds: number[];
  allowedProjectIds: number[];
  allowedWarehouseIds: number[];

  // STORY-0318: Enhanced fields
  roles?: string[];
  modules?: Record<string, AccessLevel>; // key → "VIEW" | "MANAGE"
  actions?: Record<string, GrantResult>; // key → "ALLOW" | "DENY"
  reports?: Record<string, GrantResult>; // key → "ALLOW" | "DENY"
  scopes?: ScopeAssignment;

  // P0: Cache invalidation version (CNS-20260410-001)
  authzVersion?: number;
}

/** Access levels for modules. EDIT removed per K1. */
export type AccessLevel = 'NONE' | 'VIEW' | 'MANAGE';

/** Grant result for actions/reports/pages/fields. */
export type GrantResult = 'ALLOW' | 'DENY';

/** Scope assignment for data-level authorization. */
export interface ScopeAssignment {
  companyIds?: number[];
  projectIds?: number[];
  warehouseIds?: number[];
  branchIds?: number[];
}

export interface CheckRequest {
  relation: string;
  objectType: string;
  objectId: string;
}

/**
 * Reason for check result — CNS-20260411-005: Codex MODIFY (reason field mandatory).
 *
 * 'session_expired' Codex 019dd818 iter-4 (B-prime focused semantic fix): authn
 * unknown (gateway 401) durumunda authz deny ('blocked') ile aynı UX'e düşmesin
 * diye ayrı reason. Frontend-tarafında üretilir; backend bu kelimeyi response'ta
 * dönmez — useZanzibarAccess catch'inde 401 yakalandığında inject edilir.
 */
export type CheckReason =
  | 'granted'
  | 'blocked'
  | 'no_relation'
  | 'not_found'
  | 'error'
  | 'session_expired';

export interface CheckResponse {
  allowed: boolean;
  reason?: CheckReason;
}

/** Batch check types — CNS-20260411-005: Codex REJECT (without batch). */
export interface BatchCheckRequest {
  checks: CheckRequest[];
}

export interface BatchCheckItem extends CheckResponse {
  relation: string;
  objectType: string;
  objectId: string;
}

export interface BatchCheckResponse {
  results: BatchCheckItem[];
}

/**
 * Design-system compatible access level for Zanzibar object-level checks.
 *
 * Faz 21.4 PR-E1 relocated the canonical four-state ladder
 * (`'full' | 'readonly' | 'disabled' | 'hidden'`) to
 * `@mfe/shared-types/access#AccessLevel`. This file aliases that type so
 * the existing `ZanzibarAccessLevel` name keeps working across all auth
 * callers without duplicating the union. The other `AccessLevel` declared
 * in this file (line 29 — `'NONE' | 'VIEW' | 'MANAGE'`) is module-level
 * permission tier, not related; the rename below avoids the collision.
 */
import type { AccessLevel as SharedAccessLevel } from '@mfe/shared-types';
export type ZanzibarAccessLevel = SharedAccessLevel;

/** Scope kind accepted by explain + UI pickers. Backend stores canonical upper-case keys. */
export type ExplainScopeType = 'COMPANY' | 'PROJECT' | 'WAREHOUSE' | 'BRANCH';

/** Explain response from /v1/authz/explain. */
export interface ExplainResponse {
  allowed: boolean;
  reason: 'ALLOWED' | 'NO_ROLE' | 'DENIED_BY_ROLE' | 'NO_SCOPE' | 'NO_PERMISSION';
  details: {
    roleName: string | null;
    grantType: string | null;
    permissionType: string;
    permissionKey: string;
    /** P1.9: populated only when NO_SCOPE — echoes the requested scope. */
    scopeType?: string | null;
    scopeRefId?: number | null;
  };
  userRoles: string[];
  userScopes: Record<string, number[]>;
}

/** Permission catalog item types. */
export interface PermissionCatalog {
  modules: ModuleCatalogItem[];
  actions: ActionCatalogItem[];
  reports: ReportCatalogItem[];
}

export interface ModuleCatalogItem {
  key: string;
  label: string;
  levels: AccessLevel[];
}

export interface ActionCatalogItem {
  key: string;
  label: string;
  module: string;
  deniable: boolean;
}

export interface ReportCatalogItem {
  key: string;
  label: string;
  module: string;
}

/** @deprecated P1-A: PageCatalogItem removed — use hasModule instead */

/**
 * Module permission constants matching OpenFGA model.
 */
export const MODULES = {
  USER_MANAGEMENT: 'USER_MANAGEMENT',
  ACCESS: 'ACCESS',
  AUDIT: 'AUDIT',
  REPORT: 'REPORT',
  WAREHOUSE: 'WAREHOUSE',
  PURCHASE: 'PURCHASE',
  THEME: 'THEME',
} as const;

export type ModuleKey = keyof typeof MODULES;
