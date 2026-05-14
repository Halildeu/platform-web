// @vitest-environment jsdom
//
// Codex `019e2022` Hybrid AGREE — FE Faz 1 source-level gate test.
//
// PR #486 chased the same boundary via Playwright on a production-preview
// shell build; that harness path consistently timed out on bootstrap
// (5 CI iter, closed without merge). The actual contract this PR is
// trying to pin is the `canImpersonate` fail-closed gate INSIDE the
// {@code ImpersonateAction} component:
//
//   const canImpersonate = (() => {
//     try {
//       return getShellServices().auth.isSuperAdmin();
//     } catch {
//       return false;
//     }
//   })();
//   if (!canImpersonate) {
//     return null;
//   }
//
// Vitest + RTL exercises that gate directly without spinning up the full
// shell. The companion drawer-level test
// (UserDetailDrawer.impersonate.spec.tsx) already pins the outer
// canShowImpersonateAction guard; this test pins the component-level
// guard ONE step closer to the rendered DOM.
//
// Per Codex Hybrid verdict, browser/runtime coverage (banner UX, stop
// flow, viewport overflow) remains Faz 2 Playwright dev-mode harness.

import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// ---------- mocks (must be defined BEFORE the SUT import) ----------

// Shell auth singleton — mocked per-case. Defaults to superAdmin=true so
// the happy case can render without extra setup.
const mockShellAuth = vi.hoisted(() => ({
  isSuperAdmin: vi.fn(() => true),
  enterImpersonationSession: vi.fn(async () => undefined),
  exitImpersonationSession: vi.fn(),
  isImpersonating: vi.fn(() => false),
}));

// Allow individual tests to swap the entire getShellServices return value
// — needed for the "auth missing" and "auth throws" branches.
let mockShellServicesImpl: (() => { auth: typeof mockShellAuth }) = () => ({
  auth: mockShellAuth,
});

vi.mock('../../../../app/services/shell-services', () => ({
  getShellServices: () => mockShellServicesImpl(),
  configureShellServices: vi.fn(),
}));

// ---------- SUT ----------

import ImpersonateAction from '../ImpersonateAction';

const buildUser = () => ({
  id: '42',
  email: 'halil.kocoglu@example.com',
  fullName: 'Halil Kocoglu',
});

describe('ImpersonateAction — canImpersonate fail-closed gate (Faz 1)', () => {
  beforeEach(() => {
    mockShellAuth.isSuperAdmin.mockReset().mockReturnValue(true);
    mockShellAuth.enterImpersonationSession.mockReset();
    mockShellAuth.exitImpersonationSession.mockReset();
    mockShellAuth.isImpersonating.mockReset().mockReturnValue(false);
    mockShellServicesImpl = () => ({ auth: mockShellAuth });
  });

  it('renders the action when shell auth reports superAdmin=true', () => {
    render(<ImpersonateAction user={buildUser() as never} />);
    expect(screen.queryByTestId('impersonate-action')).toBeTruthy();
    expect(screen.queryByTestId('impersonate-open-btn')).toBeTruthy();
  });

  it('hides the action (returns null) when shell auth reports superAdmin=false', () => {
    mockShellAuth.isSuperAdmin.mockReturnValue(false);
    const { container } = render(<ImpersonateAction user={buildUser() as never} />);
    expect(screen.queryByTestId('impersonate-action')).toBeNull();
    expect(container.firstChild).toBeNull();
  });

  it('hides the action when getShellServices throws (fail-closed)', () => {
    mockShellServicesImpl = () => {
      throw new Error('Shell services not yet configured');
    };
    const { container } = render(<ImpersonateAction user={buildUser() as never} />);
    expect(screen.queryByTestId('impersonate-action')).toBeNull();
    expect(container.firstChild).toBeNull();
  });

  it('hides the action when auth service surface is missing entirely', () => {
    mockShellServicesImpl = () => ({} as unknown as { auth: typeof mockShellAuth });
    const { container } = render(<ImpersonateAction user={buildUser() as never} />);
    expect(screen.queryByTestId('impersonate-action')).toBeNull();
    expect(container.firstChild).toBeNull();
  });

  it('opens the reason form when the SuperAdmin clicks the affordance', () => {
    render(<ImpersonateAction user={buildUser() as never} />);
    fireEvent.click(screen.getByTestId('impersonate-open-btn'));
    expect(screen.queryByTestId('impersonate-reason')).toBeTruthy();
    expect(screen.queryByTestId('impersonate-submit-btn')).toBeTruthy();
  });

  it('shows a friendly error when the orchestration returns VALIDATION_ERROR (BUG #3 regression)', async () => {
    // Codex 019e1e0f BUG #3 + this PR's Faz 1 source coverage: verify the
    // VALIDATION_ERROR short-circuit in friendlyErrorMessage surfaces the
    // localized backend message verbatim. The orchestration adapter wraps
    // the Spring response into an Error with `errorCode='VALIDATION_ERROR'`
    // and a localized `.message` string.
    const validationError = new Error("Sebep en az 10 karakter olmalı") as Error & {
      errorCode?: string;
    };
    validationError.errorCode = 'VALIDATION_ERROR';
    mockShellAuth.enterImpersonationSession.mockRejectedValue(validationError);

    render(<ImpersonateAction user={buildUser() as never} />);
    fireEvent.click(screen.getByTestId('impersonate-open-btn'));
    const textarea = screen.getByTestId('impersonate-reason');
    fireEvent.change(textarea, { target: { value: 'short' } });
    fireEvent.click(screen.getByTestId('impersonate-submit-btn'));

    // The async handler awaits the rejected promise; vitest's react-dom
    // flush surfaces the error after the next microtask.
    await Promise.resolve();
    await Promise.resolve();

    const errorNode = screen.queryByTestId('impersonate-error');
    expect(errorNode).toBeTruthy();
    expect(errorNode?.textContent).toContain('Sebep en az 10 karakter olmalı');
  });
});
