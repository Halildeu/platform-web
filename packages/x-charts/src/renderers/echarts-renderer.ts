/**
 * ECharts Renderer Lifecycle Manager
 *
 * Handles init, update, resize, dispose for ECharts instances.
 * Used by all chart components as the single rendering integration point.
 *
 * Key responsibilities:
 * - Instance creation with proper container binding
 * - Option merge with theme + sanitization
 * - Responsive resize (ResizeObserver)
 * - Memory-safe dispose (prevents leaks)
 * - Reduced motion respect
 * - Error boundary integration
 *
 * --------------------------------------------------------------------
 * Faz 21.9 PR3h: additive callback-ref API
 * --------------------------------------------------------------------
 *
 * In addition to the existing object ref (`containerRef`, idiomatic
 * React 18 mutable ref pattern that wrappers like BarChart already
 * mutate via `containerRef.current = node`), the hook now exposes a
 * stable RefCallback (`setContainerRef`) so consumers can compose
 * forwarded refs without writing a manual mutation step.
 *
 * The lifecycle effect itself is intentionally unchanged from the
 * pre-PR3h shape — it stays gated by the same `[renderer, theme,
 * echartsLocaleKey, respectReducedMotion]` dep array and reads
 * `containerRef.current` after the DOM commit. This deliberately
 * avoids the useState(node) bridge: that pattern races against
 * synchronous test mocks and React 18 Strict Mode's double-effect,
 * which previously broke 182 tests in a single rebuild attempt. The
 * additive callback API is the actual product win here; lifecycle
 * reconciliation can be tightened in a follow-up sprint with
 * dedicated test coverage for double-mount scenarios.
 */

import { useRef, useEffect, useCallback, useState } from 'react';
import { echarts, registerECharts } from './echarts-imports';
import type { ECharts, EChartsOption } from './echarts-imports';
import { useChartsLocale } from '../i18n/locale-store';
import { registerEChartsLocale } from '../i18n/echarts-locale';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface EChartsRendererOptions {
  /** ECharts option object. */
  option: EChartsOption;
  /** Renderer type. @default 'canvas' */
  renderer?: 'canvas' | 'svg';
  /** Theme name or object (from DesignLabEChartsTheme). */
  theme?: string | object;
  /** Whether to merge or replace option on update. @default true */
  notMerge?: boolean;
  /** Whether to animate on update. @default true */
  lazyUpdate?: boolean;
  /** Callback when chart instance is ready. */
  onReady?: (instance: ECharts) => void;
  /** Callback on chart click event. */
  onClick?: (params: unknown) => void;
  /** Respect prefers-reduced-motion. @default true */
  respectReducedMotion?: boolean;
}

export interface EChartsRendererState {
  /**
   * The ECharts container ref — attach to a div via `ref={...}`.
   *
   * This remains the canonical mutable object ref. Chart wrappers that
   * pre-date the callback-ref change keep mutating
   * `containerRef.current` directly; that contract is preserved.
   */
  containerRef: React.RefObject<HTMLDivElement | null>;
  /**
   * Faz 21.9 PR3h: stable callback ref alternative. Useful for
   * `forwardRef` composition and any consumer that prefers a callable
   * ref over the object ref above. Internally writes to the same
   * `containerRef.current`. The lifecycle effect remains gated by
   * `[renderer, theme, locale, respectReducedMotion]` — it picks up
   * the node during a normal mount or whenever one of those deps
   * changes. Late conditional node attachment (deps unchanged, node
   * appearing in a later render) is NOT covered by this PR; that
   * requires the deferred lifecycle reconcile bridge (tracked as a
   * follow-up sprint, leaning on the new mock fixture's
   * duplicate-init counter as a regression net).
   */
  setContainerRef: React.RefCallback<HTMLDivElement>;
  /** The ECharts instance (null until mounted). */
  instance: ECharts | null;
  /** Whether the chart has rendered at least once. */
  isReady: boolean;
  /** Force a resize recalculation. */
  resize: () => void;
}

/* ------------------------------------------------------------------ */
/*  Reduced motion detection                                           */
/* ------------------------------------------------------------------ */

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/* ------------------------------------------------------------------ */
/*  Hook: useEChartsRenderer                                           */
/* ------------------------------------------------------------------ */

export function useEChartsRenderer(options: EChartsRendererOptions): EChartsRendererState {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const instanceRef = useRef<ECharts | null>(null);
  const [isReady, setIsReady] = useState(false);
  // PR-E2 must-fix #1 iter-2 — bumped each time the init effect creates
  // a NEW instance (theme/renderer/locale change). The click-listener
  // effect depends on this so that, after instance re-init, the user
  // handler is re-attached to the fresh instance even when `onClick`
  // identity stayed stable across the rerender.
  const [instanceVersion, setInstanceVersion] = useState(0);

  const {
    option,
    renderer = 'canvas',
    theme,
    notMerge = false,
    lazyUpdate = true,
    onReady,
    onClick,
    respectReducedMotion = true,
  } = options;

  // Ensure ECharts modules are registered
  registerECharts();

  // Faz 21.5-A1: bind ECharts to the active charts locale. The
  // wrapper of every chart inherits this automatically — no per-chart
  // wiring required. When the shell switches language and calls
  // setChartsLocale(...), useChartsLocale fires a re-render here, the
  // dep on echartsLocaleKey changes, and the init effect re-creates
  // the ECharts instance with the new locale string.
  const currentLocale = useChartsLocale();
  const echartsLocaleKey = registerEChartsLocale(currentLocale) ?? 'EN';

  /*
   * Faz 21.9 PR3h: stable callback ref alternative to the object ref.
   * Writes go to the same `containerRef.current` that wrappers mutate
   * manually, so both patterns share a single source of truth. The
   * identity is locked across renders so passing this to
   * `<div ref={...} />` doesn't trigger spurious re-mounts.
   */
  const setContainerRef = useCallback<React.RefCallback<HTMLDivElement>>((node) => {
    containerRef.current = node;
  }, []);

  // Init / Dispose
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Init
    const instance = echarts.init(container, theme, {
      renderer,
      useDirtyRect: true, // Performance: only redraw changed areas
      locale: echartsLocaleKey,
    });

    instanceRef.current = instance;
    setIsReady(true);
    setInstanceVersion((v) => v + 1);
    onReady?.(instance);

    // ResizeObserver for responsive — Faz 21.9 PR3b (Codex `019defa5`):
    // respect prefers-reduced-motion. The previous default `duration: 200`
    // ignored the user's OS-level setting and produced a janky 200ms
    // bounce on every container size change in reduced-motion mode.
    const observer = new ResizeObserver(() => {
      const duration = respectReducedMotion && prefersReducedMotion() ? 0 : 200;
      instance.resize({ animation: { duration } });
    });
    observer.observe(container);

    // Cleanup
    return () => {
      observer.disconnect();
      instance.dispose();
      instanceRef.current = null;
      setIsReady(false);
    };
    // Faz 21.5-A1: re-init when the active charts locale flips so
    // ECharts re-resolves toolbox/legend/dataZoom strings.
    // PR3b: respectReducedMotion is also a dep — the resize-animation
    // duration we close over above changes when the consumer toggles it.
  }, [renderer, theme, echartsLocaleKey, respectReducedMotion]);

  // Click handler lifecycle (Faz 21.4 PR-E2 must-fix #1, iter-2).
  //
  // Separate effect so runtime `onClick` changes register/unregister
  // correctly across BOTH dimensions:
  //   1. Access transitions (full ↔ readonly/disabled) flip `onClick`
  //      identity at the wrapper layer (guardChartCallback returns
  //      undefined when blocked). Cleanup unbinds the previous listener
  //      before the next mount path attaches.
  //   2. Theme / renderer / locale changes dispose the old ECharts
  //      instance and create a fresh one. `instanceVersion` is bumped
  //      inside the init effect on every successful create, so this
  //      effect re-runs against the new instance even when `onClick`
  //      identity is unchanged.
  useEffect(() => {
    const instance = instanceRef.current;
    if (!instance || !onClick) return;
    instance.on('click', onClick);
    return () => {
      instance.off('click', onClick);
    };
  }, [onClick, instanceVersion]);

  // Option update
  useEffect(() => {
    const instance = instanceRef.current;
    if (!instance || !option) return;

    let finalOption = option;

    // Disable animation if reduced motion preferred
    if (respectReducedMotion && prefersReducedMotion()) {
      finalOption = {
        ...finalOption,
        animation: false,
        animationDuration: 0,
        animationDurationUpdate: 0,
      };
    }

    instance.setOption(finalOption, { notMerge, lazyUpdate });
    // Codex (PR-A1 second pass): keep `echartsLocaleKey` in this dep
    // array so a language switch — which forces the init effect to
    // dispose + re-create the ECharts instance — also replays the
    // option onto the new instance. Without this, callers whose option
    // ref is stable across renders (memoised inside chart wrappers)
    // would render an empty new instance after the locale flip.
  }, [option, notMerge, lazyUpdate, respectReducedMotion, echartsLocaleKey]);

  const resize = useCallback(() => {
    instanceRef.current?.resize();
  }, []);

  return {
    containerRef,
    setContainerRef,
    instance: instanceRef.current,
    isReady,
    resize,
  };
}
