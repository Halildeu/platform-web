import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import ForbiddenPage from './ForbiddenPage';

describe('ForbiddenPage', () => {
  it('renders the shared forbidden CapabilityState (single source, informational, no retry)', () => {
    render(<ForbiddenPage />);
    const root = screen.getByTestId('endpoint-admin-forbidden');
    expect(root.getAttribute('data-capability-kind')).toBe('forbidden');
    // forbidden is informational (role=status, polite) — not an assertive alert.
    expect(root.getAttribute('role')).toBe('status');
    // Locale-agnostic non-empty heading, no literal-key leakage.
    const title = screen.getByTestId('endpoint-admin-forbidden-title');
    expect(title.textContent).toBeTruthy();
    expect(title.textContent).not.toContain('endpointAdmin.capabilityState');
    // No retry for a forbidden surface (retrying can't change authorization).
    expect(screen.queryByTestId('endpoint-admin-forbidden-retry')).toBeNull();
  });
});
