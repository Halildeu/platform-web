/**
 * Resolve the org boundary header value for delivery-log queries.
 *
 * Codex thread `019e0289` iter-2 AGREE: this resolver is the only place
 * we accept org context for the new endpoints. Query-string fallback was
 * intentionally rejected — the operator must not be able to choose an
 * org from the URL because that quietly bypasses the audit semantics.
 *
 * Resolve order:
 *  1. whitelisted shell-user claim fields (`org_id`, `orgId`,
 *     `organizationId`, `tenant_id`, `tenantId`)
 *  2. `allowed_orgs` / `allowedOrgs` array — only when it carries a
 *     single string entry (multi-org users would need a UI selector
 *     which v1 does not ship; sıfır org bağlamı sızdırmamak için
 *     burada `null` döner ve fallback'e düşmez)
 *  3. literal `'default'` fallback (single-tenant pre-prod default)
 *
 * @returns the resolved org id, or `null` when the user shape is multi-org
 *          and we cannot pick deterministically.
 */
const WHITELIST_FIELDS = ['org_id', 'orgId', 'organizationId', 'tenant_id', 'tenantId'] as const;

const ALLOWED_ORGS_FIELDS = ['allowed_orgs', 'allowedOrgs'] as const;

export const DEFAULT_ORG_FALLBACK = 'default';

export function resolveDeliveryLogOrgId(user: unknown): string | null {
  if (!isRecord(user)) {
    return DEFAULT_ORG_FALLBACK;
  }

  for (const field of WHITELIST_FIELDS) {
    const value = user[field];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value;
    }
  }

  for (const field of ALLOWED_ORGS_FIELDS) {
    const value = user[field];
    if (Array.isArray(value)) {
      const stringEntries = value.filter(
        (entry): entry is string => typeof entry === 'string' && entry.trim().length > 0,
      );
      if (stringEntries.length === 1) {
        return stringEntries[0]!;
      }
      if (stringEntries.length > 1) {
        // Multi-org user without a UI selector — fail closed (Codex iter-2
        // AGREE absorb: silent default-fallback would mislead the operator
        // about which org's deliveries they're auditing).
        return null;
      }
    }
  }

  return DEFAULT_ORG_FALLBACK;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
