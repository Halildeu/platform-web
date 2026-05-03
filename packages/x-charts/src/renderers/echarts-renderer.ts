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
  /** The ECharts container ref — attach to a div. */
  containerRef: React.RefObject<HTMLDivElement | null>;
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
  if (typeof window === 'undefined') return false;
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
    instance: instanceRef.current,
    isReady,
    resize,
  };
}
