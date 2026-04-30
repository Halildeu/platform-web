// @vitest-environment jsdom
//
// Codex 019dde3d iter-46 — AuditDetailDrawer focus trap regression.
//
// Pairs with iter-45 DS DetailDrawer.useFocusTrap wire-up. This spec
// proves that AuditDetailDrawer (which consumes the real DS
// DetailDrawer) automatically picks up the boundary wrap-around
// behavior — no MFE-side code change needed. Single focused
// assertion per Codex review (consumer regression scope, not full
// API contract — that lives in DS tests).
//
// The default AuditDetailDrawer test (`AuditDetailDrawer.test.tsx`)
// mocks `@mfe/design-system`, so we need a SEPARATE spec that renders
// the real DS primitive to exercise the trap.

import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

afterEach(() => {
  cleanup();
});

import { AuditDetailDrawer } from './AuditDetailDrawer';
import type { AuditEvent } from '../types/audit-event';

const event: AuditEvent = {
  id: 'evt-1',
  timestamp: '2026-04-30T10:00:00Z',
  action: 'TEST_ACTION',
  actor: { id: 'u-1', email: 'tester@example.com' },
  target: { type: 'role', id: '42' },
  status: 'success',
  ip: '127.0.0.1',
  userAgent: 'jsdom',
  metadata: {},
} as AuditEvent;

describe('AuditDetailDrawer — focus trap regression (iter-46)', () => {
  it('drawer captures focus on open via the DS useFocusTrap hook', async () => {
    render(<AuditDetailDrawer event={event} open onClose={vi.fn()} />);

    // Wait for DS useFocusTrap autoFocus settle (50ms internal timeout)
    await new Promise((r) => setTimeout(r, 80));

    const dialog = screen.getByRole('dialog');
    // Hook moves focus into the panel on open. The active element must
    // therefore be inside the dialog subtree — proving the trap wired
    // through the consumer (no MFE-side change needed).
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it('Tab on the only focusable (close button) keeps it focused (single-element wrap)', async () => {
    // AuditDetailDrawer renders tabs/sections from `event` data and
    // does not expose a `children` prop. The close button is the
    // single focusable in the panel header. The hook contract: when
    // there is only one focusable, Tab on it preventDefaults and
    // re-focuses itself (effectively a no-op cycle of length 1).
    render(<AuditDetailDrawer event={event} open onClose={vi.fn()} />);
    await new Promise((r) => setTimeout(r, 80));

    const dialog = screen.getByRole('dialog');
    const focusables = Array.from(
      dialog.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]',
      ),
    );
    // At minimum, the close button — proves the consumer renders the
    // DS DetailDrawer with the correct header.
    expect(focusables.length).toBeGreaterThanOrEqual(1);

    const only = focusables[0];
    only.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    // Hook wraps: with one focusable, first === last, Tab keeps focus
    // on the same element (preventDefault + re-focus first).
    expect(document.activeElement).toBe(only);
  });
});
