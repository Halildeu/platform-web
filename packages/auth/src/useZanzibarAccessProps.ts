/**
 * Adapter hook: bridges `useZanzibarAccess` (Zanzibar/OpenFGA permission
 * lookup) to the platform-wide `AccessControlledProps` shape consumed by
 * UI components (chart wrappers, grid wrappers, ...).
 *
 * Faz 21.4 PR-E2 introduces `access` + `accessReason` as opt-in props on
 * the 13 chart wrappers; auth callers most commonly want them populated
 * from a Zanzibar relation lookup. This hook is the standard glue.
 *
 * Usage:
 *
 * ```tsx
 * import { useZanzibarAccessProps } from '@mfe/auth';
 * import { httpPost } from '@mfe/shared-http';
 * import { BarChart } from '@mfe/x-charts';
 *
 * function ReportChart({ reportId }: { reportId: string }) {
 *   const accessProps = useZanzibarAccessProps('can_view', 'report', reportId, httpPost);
 *   return <BarChart {...accessProps} data={data} />;
 * }
 * ```
 *
 * Carries `httpPost` through verbatim (Codex iter-3 must-fix #5):
 * unresolved object-level checks otherwise fall back to the `no_server_check`
 * reason and the example would be silently incomplete.
 */
import type { AccessControlledProps } from '@mfe/shared-types';
import { useZanzibarAccess } from './useZanzibarAccess';

export function useZanzibarAccessProps(
  relation: string,
  objectType: string,
  objectId: string,
  httpPost?: Parameters<typeof useZanzibarAccess>[3],
): AccessControlledProps {
  const { access, reason } = useZanzibarAccess(relation, objectType, objectId, httpPost);
  return { access, accessReason: reason };
}
