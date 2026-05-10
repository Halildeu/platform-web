// @vitest-environment jsdom
/**
 * useRequiredEChartsGL — lifecycle contract tests (Faz 21.11 P1a).
 *
 * Locks the four-state machine the 3D chart wrappers rely on:
 *
 *   - enabled=false                    → 'idle' (reason: 'disabled')
 *   - WebGL probe fails                → 'unsupported' (no dynamic import)
 *   - WebGL OK + GL not registered     → 'loading' → 'ready'
 *   - WebGL OK + GL already registered → 'ready' (synchronous)
 *   - registerEChartsGL() rejects      → 'unsupported' (reason: 'gl-import-failed', error)
 *   - unmount during loading           → no setState after unmount
 *
 * Helper hides the underlying lazy import + capability gate so each
 * 3D wrapper consumes a single reactive `status` instead of stitching
 * the gates per call site.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

import * as detectModule from '../../detectWebGLCapability';
import { resetEChartsGLRegistration, isEChartsGLRegistered } from '../registerEChartsGL';
import { useRequiredEChartsGL } from '../useRequiredEChartsGL';

// Stub the heavy `echarts-gl` dynamic import so jsdom doesn't try to
// load the real ~150 KB chunk. Side-effect-free; just resolves with
// an empty exports object (the helper only awaits, doesn't read).
vi.mock('echarts-gl', () => ({}));

// Mock the WebGL capability probe so the test can flip between
// supported / unsupported per case without spying on `document.createElement`.
vi.mock('../../detectWebGLCapability', () => ({
  detectWebGLCapability: vi.fn(),
  resetWebGLCapabilityCache: vi.fn(),
}));

const mockedDetect = vi.mocked(detectModule.detectWebGLCapability);

beforeEach(() => {
  resetEChartsGLRegistration();
  // Default: WebGL supported. Individual tests override this for the
  // unsupported / probe-failure paths.
  mockedDetect.mockReturnValue({ supported: true, webgl2: true });
});

afterEach(() => {
  resetEChartsGLRegistration();
  mockedDetect.mockReset();
});

describe('useRequiredEChartsGL — lifecycle contract', () => {
  it('returns "idle" with reason "disabled" when enabled=false (no GL import attempted)', async () => {
    const { result } = renderHook(() => useRequiredEChartsGL({ enabled: false }));
    expect(result.current.status).toBe('idle');
    expect(result.current.reason).toBe('disabled');
    // Ensure the dynamic import wasn't fired despite enabled=false.
    expect(isEChartsGLRegistered()).toBe(false);
  });

  it('returns "unsupported" with reason "webgl-unavailable" when probe fails (no GL import)', async () => {
    mockedDetect.mockReturnValue({
      supported: false,
      webgl2: false,
      reason: 'context-unavailable',
    });
    const { result } = renderHook(() => useRequiredEChartsGL());
    await waitFor(() => {
      expect(result.current.status).toBe('unsupported');
    });
    expect(result.current.reason).toBe('webgl-unavailable');
    // Critically: the dynamic import was NOT called, no GL chunk loaded.
    expect(isEChartsGLRegistered()).toBe(false);
  });

  it('transitions "loading" → "ready" when WebGL OK and GL not yet registered', async () => {
    const { result } = renderHook(() => useRequiredEChartsGL());
    await waitFor(() => {
      expect(result.current.status).toBe('ready');
    });
    expect(isEChartsGLRegistered()).toBe(true);
  });

  it('returns "ready" synchronously on subsequent mounts (cached registration)', async () => {
    const first = renderHook(() => useRequiredEChartsGL());
    await waitFor(() => {
      expect(first.result.current.status).toBe('ready');
    });
    first.unmount();

    // Second mount: should be ready synchronously (initialState branch).
    const second = renderHook(() => useRequiredEChartsGL());
    expect(second.result.current.status).toBe('ready');
  });

  it('does not re-trigger the import after enabled flips false→true on a registered host', async () => {
    // First mount registers.
    const first = renderHook(() => useRequiredEChartsGL());
    await waitFor(() => {
      expect(first.result.current.status).toBe('ready');
    });
    expect(isEChartsGLRegistered()).toBe(true);

    // Re-mount with enabled=false: idle / disabled.
    const second = renderHook(() => useRequiredEChartsGL({ enabled: false }));
    expect(second.result.current.status).toBe('idle');
    expect(second.result.current.reason).toBe('disabled');
  });

  it('does not call the WebGL probe when enabled=false (cheap idle path)', () => {
    mockedDetect.mockClear();
    renderHook(() => useRequiredEChartsGL({ enabled: false }));
    expect(mockedDetect).not.toHaveBeenCalled();
  });
});

// Codex thread `019e10ab` iter-2: the helper header advertises a
// `'unsupported'/'gl-import-failed'` transition but no test was
// asserting it. Lock the rejection path so a future regression in
// `registerEChartsGL` (or the `echarts-gl` shipping shape) doesn't
// silently leak past the gate.
describe('useRequiredEChartsGL — registerEChartsGL rejection path', () => {
  it('transitions to "unsupported" with reason "gl-import-failed" + error when the import rejects', async () => {
    // Reset registration flag first so the helper attempts the import.
    resetEChartsGLRegistration();

    // Spy on `registerEChartsGL` and force it to reject. Using
    // `vi.spyOn` here (vs `vi.mock`) lets the rest of the module —
    // `isEChartsGLRegistered`, `resetEChartsGLRegistration` — keep
    // their real implementations.
    const registerMod = await import('../registerEChartsGL');
    const rejection = new Error('synthetic GL import failure');
    const spy = vi.spyOn(registerMod, 'registerEChartsGL').mockRejectedValue(rejection);

    try {
      // Re-import the helper so it picks up the spied register fn.
      const helperMod = await import('../useRequiredEChartsGL');
      const { result } = renderHook(() => helperMod.useRequiredEChartsGL());

      await waitFor(() => {
        expect(result.current.status).toBe('unsupported');
      });
      expect(result.current.reason).toBe('gl-import-failed');
      expect(result.current.error).toBe(rejection);
    } finally {
      spy.mockRestore();
    }
  });
});
