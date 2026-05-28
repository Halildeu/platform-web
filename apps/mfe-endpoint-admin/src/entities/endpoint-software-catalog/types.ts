/**
 * WEB-014C — Endpoint Software Catalog summary types (Codex 019e6dff
 * plan-time iter-2 AGREE / ready_for_impl=true).
 *
 * Used by the policy CRUD UI's catalog dropdown. Backend list endpoint
 *   GET /api/v1/admin/endpoint-software-catalog?status=&enabled=&page=&size=
 * returns a Spring `Page<AdminCatalogItemSummary>` — NOT the WEB-014B
 * custom envelope. Field names mirror the backend DTO 1:1 (Codex
 * 019e6dff §1 absorb): id, catalogItemId, status, provider, packageId,
 * displayName, publisher, riskTier, enabled, lastUpdatedAt.
 *
 * Out of scope here: full `AdminCatalogItemResponse` (detection rule +
 * version policy + silent args payload). That fetches on demand by
 * catalog item id when an operator clicks into a single catalog item.
 */

export type CatalogItemStatus = 'PROPOSED' | 'APPROVED' | 'REVOKED';

export type CatalogProvider = 'WINGET' | 'CHOCOLATEY' | 'MANUAL';

export type CatalogRiskTier = 'LOW' | 'MEDIUM' | 'HIGH';

/** Compact projection used by the BE-020 list endpoint. */
export interface AdminCatalogItemSummary {
  id: string;
  catalogItemId: string;
  status: CatalogItemStatus;
  provider: CatalogProvider;
  packageId: string;
  displayName: string;
  publisher: string | null;
  riskTier: CatalogRiskTier;
  enabled: boolean;
  lastUpdatedAt: string;
}

/**
 * Spring `Page<T>` envelope (NOT the BE-023 custom envelope). The
 * catalog list endpoint follows this shape verbatim — code that
 * consumes it reads `content` + `number` + `totalElements`, NOT
 * `items` + `page` + `totalElements`.
 */
export interface SpringPage<T> {
  content: T[];
  number: number;
  size: number;
  totalElements: number;
  totalPages: number;
  first: boolean;
  last: boolean;
  empty: boolean;
}

export interface ListCatalogItemsArgs {
  status?: CatalogItemStatus;
  enabled?: boolean;
  page?: number;
  size?: number;
}
