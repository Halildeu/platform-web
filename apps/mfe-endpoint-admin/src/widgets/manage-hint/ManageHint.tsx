import React from 'react';

import { useEndpointAdminI18n } from '../../i18n';

const hintStyle: React.CSSProperties = {
  margin: '0 0 8px',
  fontSize: 12,
  color: 'var(--text-secondary, #6b7280)',
};

/**
 * Shared, accessible MANAGE-permission hint (platform-web #922 S4b, Codex
 * 019f67ba). Render it ONCE near a page's manage-only action group when the user
 * lacks MANAGE (`!canManage`), and give each disabled manage control
 * `aria-describedby={id}` (+ optionally a `title` for pointer users). A native
 * `disabled` button does not take keyboard focus, so a `title`/tooltip alone is
 * NOT a reliable reason for keyboard/screen-reader users — this visible,
 * `aria-describedby`-referenced note is. One hint per group (not one focusable
 * tooltip per button) keeps the tab order clean.
 *
 * Bind it ONLY when the control is disabled for PERMISSION reasons — never when
 * it is merely busy (approving/revoking) — so a MANAGE operator mid-action is
 * not told they lack access.
 */
export const ManageHint: React.FC<{ id: string; testId?: string }> = ({ id, testId }) => {
  const { t } = useEndpointAdminI18n();
  return (
    <p id={id} role="note" data-testid={testId} style={hintStyle}>
      {t('endpointAdmin.authz.manageRequired')}
    </p>
  );
};

export default ManageHint;
