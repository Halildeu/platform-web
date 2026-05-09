/**
 * Unit tests for the WebGL capability probe (Faz 21.11 PR-A0).
 *
 * The probe is intentionally minimal so the tests stay simple — we
 * stub `document.createElement` (or check for the SSR guard via the
 * `vitest --environment node` path) rather than spinning up a real
 * WebGL context. The point is to lock the contract: every probe path
 * returns a stable {@link WebGLCapability} shape with the right
 * `reason`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { detectWebGLCapability, resetWebGLCapabilityCache } from '../detectWebGLCapability';

describe('detectWebGLCapability', () => {
  beforeEach(() => {
    resetWebGLCapabilityCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetWebGLCapabilityCache();
  });

  it('returns supported=true with webgl2 flag when both contexts work', () => {
    const fakeContext = makeFakeContext({ lost: false });
    vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
      if (tag === 'canvas') return makeFakeCanvas({ webgl: fakeContext, webgl2: fakeContext });
      return document.createElement(tag);
    }) as typeof document.createElement);

    const cap = detectWebGLCapability();
    expect(cap.supported).toBe(true);
    expect(cap.webgl2).toBe(true);
    expect(cap.reason).toBeUndefined();
  });

  it('returns supported=true with webgl2=false when only WebGL1 is available', () => {
    const fakeContext = makeFakeContext({ lost: false });
    vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
      if (tag === 'canvas') return makeFakeCanvas({ webgl: fakeContext, webgl2: null });
      return document.createElement(tag);
    }) as typeof document.createElement);

    const cap = detectWebGLCapability();
    expect(cap.supported).toBe(true);
    expect(cap.webgl2).toBe(false);
  });

  // Codex iter-4 absorb: a working WebGL2 context is sufficient even
  // when the legacy `'webgl'` key returns null. Pre-fix this would
  // produce `supported: false, webgl2: true`, contradicting the type
  // contract.
  it('returns supported=true when ONLY webgl2 is available (legacy key null)', () => {
    const fakeContext = makeFakeContext({ lost: false });
    vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
      if (tag === 'canvas') return makeFakeCanvas({ webgl: null, webgl2: fakeContext });
      return document.createElement(tag);
    }) as typeof document.createElement);

    const cap = detectWebGLCapability();
    expect(cap.supported).toBe(true);
    expect(cap.webgl2).toBe(true);
    expect(cap.reason).toBeUndefined();
  });

  it('falls back to experimental-webgl when canonical key returns null', () => {
    const fakeContext = makeFakeContext({ lost: false });
    vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
      if (tag === 'canvas') {
        return {
          getContext: (key: string) => {
            if (key === 'webgl2') return null;
            if (key === 'webgl') return null;
            if (key === 'experimental-webgl') return fakeContext;
            return null;
          },
        } as unknown as HTMLCanvasElement;
      }
      return document.createElement(tag);
    }) as typeof document.createElement);

    const cap = detectWebGLCapability();
    expect(cap.supported).toBe(true);
    expect(cap.webgl2).toBe(false);
  });

  it('returns supported=false with reason=context-unavailable when no context can be made', () => {
    vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
      if (tag === 'canvas') return makeFakeCanvas({ webgl: null, webgl2: null });
      return document.createElement(tag);
    }) as typeof document.createElement);

    const cap = detectWebGLCapability();
    expect(cap.supported).toBe(false);
    expect(cap.reason).toBe('context-unavailable');
  });

  it('returns supported=false with reason=context-lost when isContextLost reports true', () => {
    const lostContext = makeFakeContext({ lost: true });
    vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
      if (tag === 'canvas') return makeFakeCanvas({ webgl: lostContext, webgl2: null });
      return document.createElement(tag);
    }) as typeof document.createElement);

    const cap = detectWebGLCapability();
    expect(cap.supported).toBe(false);
    expect(cap.reason).toBe('context-lost');
  });

  it('returns supported=false with reason=probe-failed when createElement throws', () => {
    vi.spyOn(document, 'createElement').mockImplementation((() => {
      throw new Error('synthetic probe failure');
    }) as typeof document.createElement);

    const cap = detectWebGLCapability();
    expect(cap.supported).toBe(false);
    expect(cap.reason).toBe('probe-failed');
  });

  it('caches the probe result across invocations', () => {
    const spy = vi.spyOn(document, 'createElement');
    spy.mockImplementation(((tag: string) => {
      if (tag === 'canvas') {
        const ctx = makeFakeContext({ lost: false });
        return makeFakeCanvas({ webgl: ctx, webgl2: ctx });
      }
      return document.createElement(tag);
    }) as typeof document.createElement);

    detectWebGLCapability();
    detectWebGLCapability();
    detectWebGLCapability();
    // createElement is invoked exactly once across three probe calls.
    const canvasCalls = spy.mock.calls.filter((args) => args[0] === 'canvas');
    expect(canvasCalls.length).toBe(1);
  });

  it('resetWebGLCapabilityCache forces a fresh probe', () => {
    const spy = vi.spyOn(document, 'createElement');
    spy.mockImplementation(((tag: string) => {
      if (tag === 'canvas') {
        const ctx = makeFakeContext({ lost: false });
        return makeFakeCanvas({ webgl: ctx, webgl2: ctx });
      }
      return document.createElement(tag);
    }) as typeof document.createElement);

    detectWebGLCapability();
    resetWebGLCapabilityCache();
    detectWebGLCapability();
    const canvasCalls = spy.mock.calls.filter((args) => args[0] === 'canvas');
    expect(canvasCalls.length).toBe(2);
  });
});

/* ------------------------------------------------------------------ */
/*  Test helpers                                                       */
/* ------------------------------------------------------------------ */

function makeFakeContext(opts: { lost: boolean }): WebGLRenderingContext {
  return {
    isContextLost: () => opts.lost,
  } as unknown as WebGLRenderingContext;
}

function makeFakeCanvas(opts: {
  webgl: WebGLRenderingContext | null;
  webgl2: WebGLRenderingContext | null;
}): HTMLCanvasElement {
  return {
    getContext: (key: string) => {
      if (key === 'webgl2') return opts.webgl2;
      if (key === 'webgl') return opts.webgl;
      return null;
    },
  } as unknown as HTMLCanvasElement;
}
