/**
 * Faz 21.3 PR-E: data_access.scope domain types — mirrors backend DTOs from
 * platform-backend permission-service per ADR-0008 explicit-scope contract.
 *
 * Backend mapping (1:1 with Java records):
 *   - ScopeListItem.id (Long)        → id (number)
 *   - ScopeGrantRequest/Response.userId (UUID) → userId (string)
 *   - orgId (Long)                    → orgId (number)
 *   - scopeKind (enum/String)         → ScopeKind union
 *   - scopeRef (String, JSON array)   → scopeRef (string, e.g. '["1001"]')
 *   - grantedAt (Instant)             → grantedAt (string, ISO-8601)
 *   - openFgaObjectType/Id (String)   → string
 */

export type ScopeKind = 'COMPANY' | 'PROJECT' | 'DEPOT' | 'BRANCH';

export interface DataAccessScope {
  id: number;
  userId: string;
  orgId: number;
  scopeKind: ScopeKind;
  scopeRef: string;
  grantedAt: string;
  active: boolean;
}

export interface ScopeGrantRequest {
  userId: string;
  orgId: number;
  scopeKind: ScopeKind;
  scopeRef: string;
  grantedBy?: string;
}

export interface ScopeGrantResponse {
  scopeId: number;
  userId: string;
  orgId: number;
  scopeKind: string;
  scopeRef: string;
  grantedAt: string;
  openFgaObjectType: string;
  openFgaObjectId: string;
}
