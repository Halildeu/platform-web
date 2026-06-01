import { describe, expect, it } from 'vitest';

import type {
  HotfixPostureSnapshot,
  HotfixPostureSnapshotSummary,
} from '../../../../../entities/endpoint-hotfix-posture/types';
import {
  isInstalledPossiblyTruncated,
  isPendingPossiblyTruncated,
} from '../../../../../entities/endpoint-hotfix-posture/truncation';

/**
 * WEB-014G HotfixPostureView truncation helper coverage — Faz 22.5
 * Track C.
 *
 * Pins Codex 019e8245 plan-iter-3 P1.7 commitment: independent 3-leg
 * OR-combined truncation hint (installed + pending). The helper is the
 * single source of truth shared by the panel, the history accordion,
 * and any future bulk export.
 *
 * Full React-tree render coverage (state precedence, stale-guard,
 * AUOptions matrix, kbIds rendering, severity static, pendingByCategory
 * full-distribution) is tracked as a separate follow-up slice — RTK
 * Query Provider integration test harness setup is non-trivial on the
 * current mfe-endpoint-admin Vitest configuration; the source-side
 * implementation is verified via the truncation helper unit tests +
 * the typechecker (tsc --noEmit clean for all hotfix-posture sources).
 */

const goldenSnapshot = (overrides: Partial<HotfixPostureSnapshot> = {}): HotfixPostureSnapshot => ({
  id: 'snap-1',
  tenantId: 'tenant-1',
  deviceId: 'device-aaaa',
  sourceCommandResultId: null,
  schemaVersion: 1,
  supported: true,
  probeComplete: true,
  installedCount: 1,
  installedTruncated: false,
  maxInstalled: 512,
  installedPossiblyTruncated: false,
  pendingTotalCount: 1,
  pendingTruncated: false,
  maxPending: 20,
  pendingPossiblyTruncated: false,
  installedSourceUsed: 'wua',
  pendingSourceUsed: 'wua',
  healthSourceUsed: 'composite',
  probeDurationMs: 410,
  payloadHashSha256: 'a'.repeat(64),
  collectedAt: '2026-06-01T12:00:00Z',
  createdAt: '2026-06-01T12:00:01Z',
  installedHotfixes: [
    { kbId: 'KB5034122', installedOn: '2026-01-15T00:00:00Z', description: 'Security Update' },
  ],
  pendingUpdates: [{ kbIds: ['KB5036899'], primaryCategory: 'SECURITY', severity: 'CRITICAL' }],
  pendingByCategory: [{ category: 'SECURITY', count: 1 }],
  agentHealth: {
    wuaServiceState: 'RUNNING',
    bitsServiceState: 'RUNNING',
    lastDetectAt: '2026-05-31T08:00:00Z',
    lastInstallAt: '2026-05-30T22:00:00Z',
    autoUpdatePolicyEnabled: true,
    autoUpdateEffectiveEnabled: true,
    notificationLevel: '4',
  },
  probeErrors: [],
  ...overrides,
});

// ------------------------------------------------------------------
// 3-leg OR — installed (Codex iter-3 P1.7)
// ------------------------------------------------------------------

describe('isInstalledPossiblyTruncated', () => {
  it('OR fires when agent-authoritative installedTruncated=true', () => {
    const snap = goldenSnapshot({
      installedTruncated: true,
      installedCount: 0,
      maxInstalled: 512,
      installedPossiblyTruncated: false,
    });
    expect(isInstalledPossiblyTruncated(snap)).toBe(true);
  });

  it('OR fires when backend-computed installedPossiblyTruncated=true', () => {
    const snap = goldenSnapshot({
      installedTruncated: false,
      installedCount: 0,
      maxInstalled: 512,
      installedPossiblyTruncated: true,
    });
    expect(isInstalledPossiblyTruncated(snap)).toBe(true);
  });

  it('OR fires when installedCount >= maxInstalled (defence-in-depth)', () => {
    const snap = goldenSnapshot({
      installedTruncated: false,
      installedPossiblyTruncated: false,
      installedCount: 512,
      maxInstalled: 512,
    });
    expect(isInstalledPossiblyTruncated(snap)).toBe(true);
  });

  it('OR fires when installedCount > maxInstalled (over-cap fallback)', () => {
    const snap = goldenSnapshot({
      installedTruncated: false,
      installedPossiblyTruncated: false,
      installedCount: 600,
      maxInstalled: 512,
    });
    expect(isInstalledPossiblyTruncated(snap)).toBe(true);
  });

  it('NO hint when all three legs false (sub-cap count, both flags false)', () => {
    const snap = goldenSnapshot({
      installedTruncated: false,
      installedPossiblyTruncated: false,
      installedCount: 10,
      maxInstalled: 512,
    });
    expect(isInstalledPossiblyTruncated(snap)).toBe(false);
  });
});

// ------------------------------------------------------------------
// 3-leg OR — pending (independent of installed)
// ------------------------------------------------------------------

describe('isPendingPossiblyTruncated', () => {
  it('OR fires when agent-authoritative pendingTruncated=true', () => {
    const snap = goldenSnapshot({
      pendingTruncated: true,
      pendingTotalCount: 0,
      maxPending: 20,
      pendingPossiblyTruncated: false,
    });
    expect(isPendingPossiblyTruncated(snap)).toBe(true);
  });

  it('OR fires when backend-computed pendingPossiblyTruncated=true', () => {
    const snap = goldenSnapshot({
      pendingTruncated: false,
      pendingPossiblyTruncated: true,
      pendingTotalCount: 0,
      maxPending: 20,
    });
    expect(isPendingPossiblyTruncated(snap)).toBe(true);
  });

  it('OR fires when pendingTotalCount >= maxPending', () => {
    const snap = goldenSnapshot({
      pendingTruncated: false,
      pendingPossiblyTruncated: false,
      pendingTotalCount: 20,
      maxPending: 20,
    });
    expect(isPendingPossiblyTruncated(snap)).toBe(true);
  });

  it('OR fires when pendingTotalCount > maxPending (rollup may exceed per-item cap)', () => {
    const snap = goldenSnapshot({
      pendingTruncated: false,
      pendingPossiblyTruncated: false,
      pendingTotalCount: 25,
      maxPending: 20,
    });
    expect(isPendingPossiblyTruncated(snap)).toBe(true);
  });

  it('NO hint when total < cap + both flags false', () => {
    const snap = goldenSnapshot({
      pendingTruncated: false,
      pendingPossiblyTruncated: false,
      pendingTotalCount: 5,
      maxPending: 20,
    });
    expect(isPendingPossiblyTruncated(snap)).toBe(false);
  });

  it('installed truncation does NOT bleed into pending hint', () => {
    const snap = goldenSnapshot({
      installedTruncated: true,
      installedPossiblyTruncated: true,
      installedCount: 512,
      maxInstalled: 512,
      // pending clean
      pendingTruncated: false,
      pendingPossiblyTruncated: false,
      pendingTotalCount: 3,
      maxPending: 20,
    });
    expect(isInstalledPossiblyTruncated(snap)).toBe(true);
    expect(isPendingPossiblyTruncated(snap)).toBe(false);
  });
});

// ------------------------------------------------------------------
// Summary type compatibility — helper accepts both snapshot + summary
// ------------------------------------------------------------------

describe('Truncation helper works on summary projection', () => {
  it('summary OR fires the same way as snapshot truncation', () => {
    const summary: HotfixPostureSnapshotSummary = {
      id: 'sum-1',
      deviceId: 'device-aaaa',
      schemaVersion: 1,
      supported: true,
      probeComplete: true,
      installedCount: 512,
      installedTruncated: true,
      maxInstalled: 512,
      installedPossiblyTruncated: true,
      pendingTotalCount: 25,
      pendingTruncated: true,
      maxPending: 20,
      pendingPossiblyTruncated: true,
      installedSourceUsed: 'wua',
      pendingSourceUsed: 'wua',
      healthSourceUsed: 'composite',
      installedChildCount: 512,
      pendingChildCount: 20,
      probeErrorCount: 0,
      payloadHashSha256: 'b'.repeat(64),
      collectedAt: '2026-05-30T00:00:00Z',
      createdAt: '2026-05-30T00:00:01Z',
    };
    expect(isInstalledPossiblyTruncated(summary)).toBe(true);
    expect(isPendingPossiblyTruncated(summary)).toBe(true);
  });
});
