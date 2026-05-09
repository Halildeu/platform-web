/**
 * Unit tests for the deterministic renderer router (Faz 21.11 PR-A0,
 * Codex thread `019e0e7a` iter-3 consensus).
 *
 * Every dispatch path through {@link chooseRenderer} is locked here so
 * later PRs (PR-A1 WebGL adapter, PR-A2 anomaly LTTB + AI pill) can
 * extend the matrix without silently changing the contract.
 */
import { describe, expect, it } from 'vitest';
import { chooseRenderer } from '../chooseRenderer';
import {
  AUTO_WEBGL_POINT_THRESHOLD,
  CANVAS_LTTB_POINT_THRESHOLD,
  CROSS_FILTER_WEBGL_MAX_POINTS,
  type WebGLCapability,
} from '../types';

const SUPPORTED: WebGLCapability = { supported: true, webgl2: true };
const UNSUPPORTED: WebGLCapability = {
  supported: false,
  webgl2: false,
  reason: 'context-unavailable',
};

describe('chooseRenderer — explicit modes', () => {
  it('routes svg explicitly to SVG with svg-explicit reason', () => {
    const d = chooseRenderer({
      requestedMode: 'svg',
      pointCount: 1_000,
      webgl: SUPPORTED,
    });
    expect(d.backend).toBe('svg');
    expect(d.reason).toBe('svg-explicit');
    expect(d.sampled).toBe(false);
    expect(d.crossFilter).toBe('on');
  });

  it('routes canvas explicitly to Canvas, marking sampled when over threshold', () => {
    const d = chooseRenderer({
      requestedMode: 'canvas',
      pointCount: AUTO_WEBGL_POINT_THRESHOLD + 1,
      webgl: SUPPORTED,
    });
    expect(d.backend).toBe('canvas');
    expect(d.reason).toBe('forced-by-user');
    expect(d.sampled).toBe(true);
    expect(d.crossFilter).toBe('on');
  });

  it('routes canvas explicitly to Canvas without sampling when under threshold', () => {
    const d = chooseRenderer({
      requestedMode: 'canvas',
      pointCount: 1_000,
      webgl: SUPPORTED,
    });
    expect(d.backend).toBe('canvas');
    expect(d.sampled).toBe(false);
  });

  it('routes webgl explicitly to WebGL when supported', () => {
    const d = chooseRenderer({
      requestedMode: 'webgl',
      pointCount: 1_000,
      webgl: SUPPORTED,
    });
    expect(d.backend).toBe('webgl');
    expect(d.reason).toBe('forced-by-user');
    expect(d.crossFilter).toBe('on');
  });

  it('falls back to Canvas when webgl is requested but unsupported', () => {
    const d = chooseRenderer({
      requestedMode: 'webgl',
      pointCount: 5_000,
      webgl: UNSUPPORTED,
    });
    expect(d.backend).toBe('canvas');
    expect(d.reason).toBe('webgl-fallback-unsupported');
    expect(d.requestedMode).toBe('webgl');
  });
});

describe('chooseRenderer — auto routing', () => {
  it('picks Canvas for low-volume auto', () => {
    const d = chooseRenderer({
      requestedMode: 'auto',
      pointCount: 1_000,
      webgl: SUPPORTED,
    });
    expect(d.backend).toBe('canvas');
    expect(d.reason).toBe('auto-low-volume');
    expect(d.sampled).toBe(false);
  });

  // Codex iter-4 absorb: medium-volume band (50K..100K) was previously
  // declared in the reason enum but never produced. Lock it now.
  it('picks Canvas + LTTB for medium-volume auto (50K..100K)', () => {
    const d = chooseRenderer({
      requestedMode: 'auto',
      pointCount: CANVAS_LTTB_POINT_THRESHOLD + 1,
      webgl: SUPPORTED,
    });
    expect(d.backend).toBe('canvas');
    expect(d.reason).toBe('auto-medium-volume-canvas-lttb');
    expect(d.sampled).toBe(true);
  });

  it('still picks medium-volume Canvas just below the WebGL threshold', () => {
    const d = chooseRenderer({
      requestedMode: 'auto',
      pointCount: AUTO_WEBGL_POINT_THRESHOLD - 1,
      webgl: SUPPORTED,
    });
    expect(d.backend).toBe('canvas');
    expect(d.reason).toBe('auto-medium-volume-canvas-lttb');
    expect(d.sampled).toBe(true);
  });

  it('picks WebGL for high-volume auto when supported', () => {
    const d = chooseRenderer({
      requestedMode: 'auto',
      pointCount: 250_000,
      webgl: SUPPORTED,
    });
    expect(d.backend).toBe('webgl');
    expect(d.reason).toBe('auto-high-volume-webgl');
    expect(d.crossFilter).toBe('on');
  });

  it('marks crossFilter partial above CROSS_FILTER_WEBGL_MAX_POINTS', () => {
    const d = chooseRenderer({
      requestedMode: 'auto',
      pointCount: CROSS_FILTER_WEBGL_MAX_POINTS + 1,
      webgl: SUPPORTED,
    });
    expect(d.backend).toBe('webgl');
    expect(d.crossFilter).toBe('partial');
  });

  it('falls back to Canvas + LTTB when high-volume auto + webgl unsupported', () => {
    const d = chooseRenderer({
      requestedMode: 'auto',
      pointCount: 250_000,
      webgl: UNSUPPORTED,
    });
    expect(d.backend).toBe('canvas');
    expect(d.reason).toBe('webgl-fallback-unsupported');
    expect(d.sampled).toBe(true);
  });
});

describe('chooseRenderer — cross-filter required path', () => {
  it('refuses WebGL when crossFilterRequired is true and pointCount exceeds ceiling', () => {
    const d = chooseRenderer({
      requestedMode: 'auto',
      pointCount: CROSS_FILTER_WEBGL_MAX_POINTS + 1,
      webgl: SUPPORTED,
      crossFilterRequired: true,
    });
    expect(d.backend).toBe('canvas');
    expect(d.reason).toBe('webgl-fallback-cross-filter-required');
    expect(d.sampled).toBe(true);
    expect(d.crossFilter).toBe('on');
  });

  it('still picks WebGL when crossFilterRequired is true but pointCount is below ceiling', () => {
    const d = chooseRenderer({
      requestedMode: 'auto',
      pointCount: 250_000,
      webgl: SUPPORTED,
      crossFilterRequired: true,
    });
    expect(d.backend).toBe('webgl');
    expect(d.reason).toBe('auto-high-volume-webgl');
    expect(d.crossFilter).toBe('on');
  });

  it('honours crossFilterRequired even when user explicitly requests webgl', () => {
    // Note: PR-A0 keeps explicit `requestedMode='webgl'` as a hard
    // override; the cross-filter advisory still degrades to 'partial'
    // above ceiling so the consumer can react via callback.
    const d = chooseRenderer({
      requestedMode: 'webgl',
      pointCount: CROSS_FILTER_WEBGL_MAX_POINTS + 1,
      webgl: SUPPORTED,
      crossFilterRequired: true,
    });
    expect(d.backend).toBe('webgl');
    expect(d.reason).toBe('forced-by-user');
    expect(d.crossFilter).toBe('partial');
  });
});

describe('chooseRenderer — configurable thresholds', () => {
  it('honours custom autoWebGLThreshold', () => {
    const d = chooseRenderer({
      requestedMode: 'auto',
      pointCount: 50_001,
      webgl: SUPPORTED,
      autoWebGLThreshold: 50_000,
    });
    expect(d.backend).toBe('webgl');
  });

  it('honours custom crossFilterWebGLMaxPoints', () => {
    const d = chooseRenderer({
      requestedMode: 'auto',
      pointCount: 250_001,
      webgl: SUPPORTED,
      crossFilterWebGLMaxPoints: 250_000,
    });
    expect(d.backend).toBe('webgl');
    expect(d.crossFilter).toBe('partial');
  });

  it('honours custom canvasLTTBThreshold', () => {
    // Drop the LTTB threshold to 10K so 25K becomes "medium volume"
    // even though the raw default would treat it as low volume.
    const d = chooseRenderer({
      requestedMode: 'auto',
      pointCount: 25_000,
      webgl: SUPPORTED,
      canvasLTTBThreshold: 10_000,
    });
    expect(d.backend).toBe('canvas');
    expect(d.reason).toBe('auto-medium-volume-canvas-lttb');
    expect(d.sampled).toBe(true);
  });
});

describe('chooseRenderer — output contract', () => {
  it('always echoes requestedMode for fallback detection', () => {
    const d = chooseRenderer({
      requestedMode: 'webgl',
      pointCount: 5_000,
      webgl: UNSUPPORTED,
    });
    expect(d.requestedMode).toBe('webgl');
    expect(d.backend).toBe('canvas');
    // The consumer can detect a fallback via this gap.
    expect(d.requestedMode !== d.backend).toBe(true);
  });

  it('exposes pointCount unchanged on every decision', () => {
    const cases: number[] = [0, 1_000, 100_000, 1_000_000, 10_000_000];
    for (const pointCount of cases) {
      const d = chooseRenderer({
        requestedMode: 'auto',
        pointCount,
        webgl: SUPPORTED,
      });
      expect(d.pointCount).toBe(pointCount);
    }
  });

  it('returns identical decisions for identical inputs (purity check)', () => {
    const input = {
      requestedMode: 'auto' as const,
      pointCount: 750_000,
      webgl: SUPPORTED,
      crossFilterRequired: false,
    };
    const a = chooseRenderer(input);
    const b = chooseRenderer(input);
    expect(a).toEqual(b);
  });
});
