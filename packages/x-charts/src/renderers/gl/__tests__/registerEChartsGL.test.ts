/**
 * Lazy `echarts-gl` registration unit tests (Faz 21.11 PR-A1).
 *
 * Tests focus on the contract — idempotency, single-flight promise
 * sharing, reset for tests — without actually exercising the
 * `echarts-gl` module (which only matters in browser builds and would
 * otherwise pull a 150 KB dep into the test runtime).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  isEChartsGLRegistered,
  registerEChartsGL,
  resetEChartsGLRegistration,
} from '../registerEChartsGL';

// Stub the `echarts-gl` dynamic import so tests don't need the real
// package (which has side-effect registration into the global ECharts
// namespace and is otherwise unmockable in jsdom).
vi.mock('echarts-gl', () => ({}));

describe('registerEChartsGL', () => {
  beforeEach(() => {
    resetEChartsGLRegistration();
  });

  afterEach(() => {
    resetEChartsGLRegistration();
  });

  it('starts unregistered', () => {
    expect(isEChartsGLRegistered()).toBe(false);
  });

  it('marks registered after first call', async () => {
    await registerEChartsGL();
    expect(isEChartsGLRegistered()).toBe(true);
  });

  it('resolves the same promise for concurrent callers (single-flight)', async () => {
    const a = registerEChartsGL();
    const b = registerEChartsGL();
    const c = registerEChartsGL();
    await Promise.all([a, b, c]);
    expect(isEChartsGLRegistered()).toBe(true);
  });

  it('is idempotent — second call after registration is a no-op', async () => {
    await registerEChartsGL();
    expect(isEChartsGLRegistered()).toBe(true);
    await registerEChartsGL();
    await registerEChartsGL();
    expect(isEChartsGLRegistered()).toBe(true);
  });

  it('resetEChartsGLRegistration drops the cached state', async () => {
    await registerEChartsGL();
    expect(isEChartsGLRegistered()).toBe(true);
    resetEChartsGLRegistration();
    expect(isEChartsGLRegistered()).toBe(false);
  });
});
