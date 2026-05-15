// @vitest-environment jsdom
//
// Codex 019e27bf fresh-context audit follow-up — defensive hardening
// unit coverage for the React root error boundary. Pinpoints:
//
//   1. Happy path: boundary renders children unchanged.
//   2. Crash path: boundary surfaces fallback DOM (body never empty)
//      with the error message + testid for Playwright diagnostics.
//   3. window.__shellRootError snapshot captured on crash for
//      operator devtools + Playwright diagnostic dump consumption.

import React from 'react';
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import RootErrorBoundary from '../RootErrorBoundary';

const Crash: React.FC<{ message: string }> = ({ message }) => {
  throw new Error(message);
};

describe('RootErrorBoundary — defensive React root hardening', () => {
  beforeEach(() => {
    // Silence noisy boundary stack output in the test run; the boundary
    // itself writes to console.error so we don't lose signal in prod.
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    (window as Window & { __shellRootError?: unknown }).__shellRootError = undefined;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders children unchanged on the happy path', () => {
    render(
      <RootErrorBoundary>
        <div data-testid="happy-child">OK</div>
      </RootErrorBoundary>,
    );
    expect(screen.getByTestId('happy-child').textContent).toBe('OK');
    expect(
      (window as Window & { __shellRootError?: unknown }).__shellRootError,
    ).toBeUndefined();
  });

  it('renders fallback DOM when a child throws (body never empty)', () => {
    render(
      <RootErrorBoundary>
        <Crash message="AppProviders mount crash regression test" />
      </RootErrorBoundary>,
    );
    expect(screen.queryByTestId('shell-root-error-boundary')).toBeTruthy();
    expect(screen.queryByTestId('shell-root-error-message')?.textContent).toContain(
      'AppProviders mount crash regression test',
    );
  });

  it('captures window.__shellRootError snapshot on crash', () => {
    render(
      <RootErrorBoundary>
        <Crash message="diagnostic snapshot test" />
      </RootErrorBoundary>,
    );
    const captured = (window as Window & {
      __shellRootError?: {
        message: string;
        stack?: string;
        componentStack?: string | null;
        capturedAt: string;
      };
    }).__shellRootError;
    expect(captured).toBeTruthy();
    expect(captured?.message).toBe('diagnostic snapshot test');
    expect(typeof captured?.capturedAt).toBe('string');
  });

  it('logs the error + component stack via console.error', () => {
    const spy = vi.spyOn(console, 'error');
    render(
      <RootErrorBoundary>
        <Crash message="console.error path" />
      </RootErrorBoundary>,
    );
    const calls = spy.mock.calls.flat().map((arg) => String(arg)).join(' ');
    expect(calls).toContain('[shell-root] React root crashed');
  });
});
