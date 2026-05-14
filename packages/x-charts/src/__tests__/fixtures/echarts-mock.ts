// @vitest-environment jsdom
/**
 * Hoisted ECharts renderer mock + dispatched-option getters.
 *
 * IMPORTANT — import order matters. This module installs `vi.mock(...)` at
 * module evaluation time. To keep the mock visible to chart wrappers, the
 * test file MUST import this module BEFORE any chart component import:
 *
 *   import { setOptionMock, lastDispatchedOption } from './fixtures/echarts-mock';
 *   // ↑ side-effect: vi.mock('../../renderers/echarts-imports', ...) hoisted
 *   import { BarChart } from '../BarChart';
 *
 * Re-using this fixture from multiple test files keeps the mock surface
 * single-source-of-truth.
 *
 * --------------------------------------------------------------------
 * Faz 21.9 PR3h: per-container alive instance map
 * --------------------------------------------------------------------
 *
 * The previous shape returned a SINGLE shared mock instance from every
 * `init()` call regardless of container, which made it impossible to
 * model the real ECharts lifecycle: a stale `dispose()` from a torn-down
 * effect could appear to kill a freshly-mounted instance, masking
 * double-init bugs in the renderer. The redesign tracks one instance
 * per container DOM element with idempotent dispose semantics so:
 *
 *   - `echarts.init(dom)` produces a fresh instance and registers it as
 *     alive against `dom`. If `dom` already has an alive instance, the
 *     existing one is returned (matching real ECharts behaviour) and a
 *     duplicate-init counter is bumped — tests can assert on it.
 *   - `instance.dispose()` is idempotent and only removes the instance
 *     from `aliveByDom` if it's still the current alive one — a stale
 *     dispose call cannot evict a fresher instance from the map.
 *   - `echarts.getInstanceByDom(dom)` returns the current alive instance
 *     or undefined if disposed.
 *
 * Backwards compatibility: every public helper from the original fixture
 * (`setOptionMock`, `dispatchMock`, `onMock`, `offMock`, `lastDispatchedOption`,
 * `allDispatchedOptions`, `seriesTypes`, `resetEChartsMock`,
 * `clickListenerRegistrations`, `clickListenerUnregistrations`) keeps the
 * same name and behaviour so the existing ~70 tests continue to pass
 * without edits. New introspection helpers are additive.
 */
import { vi, type Mock } from 'vitest';

/**
 * Vitest 4.x narrowed `ReturnType<typeof vi.fn>` to
 * `Mock<Procedure | Constructable>` — a union TS won't let us call
 * directly without `new`. The mocks here are always plain functions
 * (no `new`), so `MockFn` aliases the callable shape we actually
 * use; assertions like `instance.dispose.mock.calls.length` keep
 * working because `Mock` already exposes the `.mock` property.
 */
type MockFn = Mock & ((...args: unknown[]) => unknown);

/**
 * Hoisted refs so they survive vi.mock factory's hoisting and are stable
 * across imports. Module-internal — vitest 4.x forbids exporting hoisted
 * variables; consumers go through `lastDispatchedOption()`, `resetEChartsMock()`
 * etc. below.
 */
const { setOptionMock, dispatchMock, onMock, offMock, mockState } = vi.hoisted(() => ({
  setOptionMock: vi.fn(),
  dispatchMock: vi.fn(),
  onMock: vi.fn(),
  offMock: vi.fn(),
  /**
   * Per-container lifecycle state. The map is hoisted so the shared mock
   * factory closes over the same instance even though the factory body
   * runs at module init time before `vi.mock` rewrites import paths.
   */
  mockState: {
    /** Currently-alive mock instance for each DOM container. */
    aliveByDom: new Map<HTMLElement, MockInstance>(),
    /** All instances ever created (alive + disposed). */
    allInstances: [] as MockInstance[],
    /** Number of times init() was called against an already-alive DOM. */
    duplicateInitCount: 0,
    /** Counter for assigning unique instance ids. */
    nextInstanceId: 1,
  },
}));

/* ------------------------------------------------------------------ */
/*  Mock instance shape                                                */
/* ------------------------------------------------------------------ */

interface MockInstance {
  __id: number;
  __dom: HTMLElement | null;
  __disposed: boolean;
  setOption: typeof setOptionMock;
  dispose: MockFn;
  resize: ReturnType<typeof vi.fn>;
  on: typeof onMock;
  off: typeof offMock;
  getZr: () => { on: ReturnType<typeof vi.fn>; off: ReturnType<typeof vi.fn> };
  dispatchAction: typeof dispatchMock;
  getDataURL: ReturnType<typeof vi.fn>;
  getOption: () => { series: unknown[] };
}

/* ------------------------------------------------------------------ */
/*  Mock factory                                                       */
/* ------------------------------------------------------------------ */

vi.mock('../../renderers/echarts-imports', () => {
  function createInstance(dom: HTMLElement): MockInstance {
    const id = mockState.nextInstanceId++;
    const instance: MockInstance = {
      __id: id,
      __dom: dom,
      __disposed: false,
      setOption: setOptionMock,
      // Local dispose mock so each instance can be inspected independently;
      // real disposal logic lives in `disposeInstance` below.
      dispose: vi.fn(),
      resize: vi.fn(),
      on: onMock,
      off: offMock,
      getZr: () => ({ on: vi.fn(), off: vi.fn() }),
      dispatchAction: dispatchMock,
      getDataURL: vi.fn(() => 'data:image/png;base64,'),
      getOption: () => ({ series: [] }),
    };

    // Hook the dispose mock so calling it routes through the lifecycle
    // bookkeeping. The mock function still records the call for
    // assertions (`instance.dispose.mock.calls.length`).
    const originalDispose = instance.dispose;
    instance.dispose = vi.fn((...args: unknown[]) => {
      disposeInstance(instance);
      return originalDispose(...args);
    });

    mockState.allInstances.push(instance);
    return instance;
  }

  function disposeInstance(instance: MockInstance): void {
    if (instance.__disposed) return; // idempotent
    instance.__disposed = true;

    const dom = instance.__dom;
    if (dom && mockState.aliveByDom.get(dom) === instance) {
      // Only evict if this instance is still the current alive one for
      // its dom. A stale dispose call (e.g. from an effect cleanup that
      // ran AFTER a fresh init replaced the entry) cannot kill a newer
      // instance.
      mockState.aliveByDom.delete(dom);
    }
  }

  function init(dom: HTMLElement, _theme?: unknown, _opts?: unknown): MockInstance {
    const existing = mockState.aliveByDom.get(dom);
    if (existing && !existing.__disposed) {
      // Real ECharts returns the existing instance for the same DOM; we
      // mirror that and surface a counter so tests can detect renderer
      // bugs that init twice without disposing first.
      mockState.duplicateInitCount++;
      return existing;
    }
    const instance = createInstance(dom);
    mockState.aliveByDom.set(dom, instance);
    return instance;
  }

  function getInstanceByDom(dom: HTMLElement): MockInstance | undefined {
    const inst = mockState.aliveByDom.get(dom);
    return inst && !inst.__disposed ? inst : undefined;
  }

  function disposeStatic(domOrInstance: HTMLElement | MockInstance): void {
    if (domOrInstance instanceof HTMLElement) {
      const inst = mockState.aliveByDom.get(domOrInstance);
      if (inst) inst.dispose();
      return;
    }
    domOrInstance.dispose();
  }

  // PR-X12c (Codex thread 019e2254): geo map registration shims so
  // unit tests can exercise `ensureGeoMapRegistered` without a real
  // ECharts runtime. Registry lives on `globalThis` so the outer
  // `resetEChartsMock()` helper can clear it without crossing the
  // vi.mock factory boundary (which would require `require()`,
  // disallowed by lint).
  const G = globalThis as {
    __X_CHARTS_TEST_MAP_REGISTRY__?: Map<string, unknown>;
  };
  if (!G.__X_CHARTS_TEST_MAP_REGISTRY__) {
    G.__X_CHARTS_TEST_MAP_REGISTRY__ = new Map<string, unknown>();
  }
  const _registeredMaps = G.__X_CHARTS_TEST_MAP_REGISTRY__;
  function registerMap(name: string, geoJson: unknown): void {
    _registeredMaps.set(name, geoJson);
  }
  function getMap(name: string): unknown {
    return _registeredMaps.get(name);
  }

  return {
    echarts: {
      init: vi.fn(init),
      use: vi.fn(),
      registerTheme: vi.fn(),
      registerLocale: vi.fn(),
      getInstanceByDom: vi.fn(getInstanceByDom),
      dispose: vi.fn(disposeStatic),
      registerMap: vi.fn(registerMap),
      getMap: vi.fn(getMap),
      __resetRegisteredMaps: () => _registeredMaps.clear(),
    },
    registerECharts: vi.fn(),
  };
});

/* ------------------------------------------------------------------ */
/*  Public API — option dispatch (backcompat)                          */
/* ------------------------------------------------------------------ */

export type DispatchedOption = Record<string, unknown>;

/** Last option object passed to ECharts.setOption(). */
export const lastDispatchedOption = (): DispatchedOption | null => {
  const lastCall = setOptionMock.mock.calls.at(-1);
  return (lastCall?.[0] as DispatchedOption) ?? null;
};

/** All option objects ever passed to setOption() in chronological order. */
export const allDispatchedOptions = (): DispatchedOption[] =>
  setOptionMock.mock.calls.map((call) => call[0] as DispatchedOption);

/**
 * Second argument passed to the most recent `setOption(option, opts)` call,
 * or `null` when the wrapper called `setOption(option)` without opts.
 * Use to assert merge behaviour like `{ notMerge: true }` opt-in.
 *
 * Codex 019e25ee post-impl test note: rerender stale tests should
 * verify the wrapper actually opts into `notMerge: true`, not just
 * that the last option object lost the stale series — without the
 * args check, removing `notMerge` from the wrapper would silently
 * pass the same test (mock does not simulate ECharts merge).
 */
export const lastSetOptionOpts = (): Record<string, unknown> | null => {
  const lastCall = setOptionMock.mock.calls.at(-1);
  return (lastCall?.[1] as Record<string, unknown> | undefined) ?? null;
};

/** series[*].type literals on the last dispatched option, or []. */
export const seriesTypes = (option: DispatchedOption | null): string[] => {
  if (!option) return [];
  const series = option.series as Array<{ type?: string }> | undefined;
  return Array.isArray(series) ? series.map((s) => s?.type ?? '') : [];
};

/** Reset captured calls — call this in `beforeEach`. */
export const resetEChartsMock = (): void => {
  setOptionMock.mockClear();
  dispatchMock.mockClear();
  onMock.mockClear();
  offMock.mockClear();
  // Faz 21.9 PR3h: also reset the per-container lifecycle bookkeeping
  // so `aliveInstanceCount()` / `initCallCount()` etc. are isolated
  // across test cases. Existing per-instance dispose mocks survive
  // because they are owned by the (now-discarded) instances.
  mockState.aliveByDom.clear();
  mockState.allInstances.length = 0;
  mockState.duplicateInitCount = 0;
  mockState.nextInstanceId = 1;
  // PR-X12c (Codex thread 019e2254): clear geo-map registry between
  // tests so GeoMap suites start with no preregistered names. Registry
  // lives on `globalThis` (see vi.mock factory above) so we can clear
  // it here without crossing the mock-module boundary.
  const G = globalThis as {
    __X_CHARTS_TEST_MAP_REGISTRY__?: Map<string, unknown>;
  };
  G.__X_CHARTS_TEST_MAP_REGISTRY__?.clear();
};

/* ------------------------------------------------------------------ */
/*  Click listener register/unregister inspection (PR-E2 must-fix #1) */
/* ------------------------------------------------------------------ */

/**
 * Number of times `instance.on('click', handler)` was called since
 * the last reset. Use to assert listener registration on access state
 * transitions (e.g. readonly → full should fire one new register).
 */
export const clickListenerRegistrations = (): Array<(...args: unknown[]) => void> =>
  onMock.mock.calls
    .filter((args) => args[0] === 'click')
    .map((args) => args[1] as (...args: unknown[]) => void);

/**
 * Number of times `instance.off('click', handler)` was called since
 * the last reset. Mirror of `clickListenerRegistrations()` for
 * teardown assertions.
 */
export const clickListenerUnregistrations = (): Array<(...args: unknown[]) => void> =>
  offMock.mock.calls
    .filter((args) => args[0] === 'click')
    .map((args) => args[1] as (...args: unknown[]) => void);

/* ------------------------------------------------------------------ */
/*  Faz 21.9 PR3h — lifecycle introspection helpers                    */
/* ------------------------------------------------------------------ */

/** Number of fresh instances ever created since the last reset. */
export const initCallCount = (): number => mockState.allInstances.length;

/**
 * Number of dispose() calls across every instance since the last reset.
 * Sums per-instance dispose mock counts, so an idempotent double-dispose
 * counts as 2 even though the instance only transitions to disposed once.
 */
export const disposeCallCount = (): number =>
  mockState.allInstances.reduce((sum, inst) => sum + inst.dispose.mock.calls.length, 0);

/** Number of instances currently alive (created and not yet disposed). */
export const aliveInstanceCount = (): number => mockState.aliveByDom.size;

/**
 * Number of init() calls that hit an already-alive DOM container. A
 * healthy renderer should keep this at 0 — anything higher signals a
 * double-mount bug.
 */
export const duplicateInitCount = (): number => mockState.duplicateInitCount;

/** Snapshot of every instance ever created (alive + disposed). */
export const allMockInstances = (): readonly MockInstance[] => mockState.allInstances;

/* ------------------------------------------------------------------ */
/*  Faz 21.11 PR-A2c-wire — generic event listener inspection         */
/* ------------------------------------------------------------------ */

/**
 * Generic listener registration inspector. Matches every
 * `instance.on(eventName, handler)` call recorded since the last
 * reset. Callers can dispatch a fake event by invoking the handler
 * directly:
 *
 *   const [handler] = eventListenerRegistrations('brushselected');
 *   handler({ batch: [...] });
 *
 * `clickListenerRegistrations()` keeps its dedicated alias so the
 * existing PR-E2 must-fix #1 tests continue to compile.
 */
export const eventListenerRegistrations = (
  eventName: string,
): Array<(...args: unknown[]) => void> =>
  onMock.mock.calls
    .filter((args) => args[0] === eventName)
    .map((args) => args[1] as (...args: unknown[]) => void);

/** Mirror of `eventListenerRegistrations` for `off()` calls. */
export const eventListenerUnregistrations = (
  eventName: string,
): Array<(...args: unknown[]) => void> =>
  offMock.mock.calls
    .filter((args) => args[0] === eventName)
    .map((args) => args[1] as (...args: unknown[]) => void);

/**
 * Snapshot of every `instance.dispatchAction(...)` call recorded
 * since the last reset. Used by PR-A2c-wire tests to verify the
 * brush programmatic clear path (`dispatchAction({ type: 'brush',
 * areas: [] })`) when those tests land in a follow-up PR.
 */
export const dispatchActionCalls = (): unknown[][] =>
  dispatchMock.mock.calls.map((call) => [...call]);
