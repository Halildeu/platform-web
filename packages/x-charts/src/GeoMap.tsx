'use client';

/**
 * GeoMap — ECharts-powered geographic choropleth map.
 *
 * Renders an ECharts `map` series on a `geo` coordinate system,
 * colouring regions by a numeric value via `visualMap`. The map JSON
 * (TR provinces, world, etc.) is CONSUMER-supplied — `<GeoMap>` does
 * NOT bundle map data. The consumer registers the map via
 * `ensureGeoMapRegistered(name, loader)` before rendering and then
 * passes the same `name` as the `mapName` prop.
 *
 * Use cases (HR reports):
 *   - HR location distribution (replaces "Lokasyon Dağılımı" pie/bar
 *     duplicates in `DemographicDashboard`)
 *   - Branch concentration (workforce per region)
 *   - Hiring funnel by city (open positions × applicants)
 *
 * Out of scope (v1, Codex thread 019e2254 AGREE):
 *   - Bubble overlay (scatter on geo coord) — v2
 *   - Multi-map composition (TR + İstanbul ilçe drill-down) — v2
 *   - District / world maps bundled — caller decides asset hosting
 *   - Fuzzy name matching — strict by default to avoid silent data
 *     loss when Turkish characters do not normalize cleanly
 *
 * @migration ECharts map series — PR-X12c of the @mfe/x-charts
 * native-feature parity campaign (Codex thread 019e2254 AGREE iter-1).
 */
import React, { useCallback, useMemo, useRef } from 'react';
import type { AccessControlledProps } from '@mfe/shared-types';
import { resolveAccessState } from '@mfe/shared-types';
import { ChartAccessGate } from './access/ChartAccessGate';
import { guardChartCallback } from './access/guardChartCallback';
import { cn } from './utils/cn';
import { useEChartsRenderer } from './renderers';
import { useResponsiveBreakpoint } from './useResponsiveChart';
import { ChartA11yShell, useChartA11y } from './a11y';
import type { AnomalyAnnouncementFormatter } from './a11y/ChartAriaLive';
import type { AnomalySummary } from './annotations/computeAnomalyOverlay';
import { useChartTheme } from './theme/useChartTheme';
import type {
  ChartThemePreference,
  ChartDecalPreference,
  ChartDensityPreference,
  ChartAccentPreference,
} from './theme/useChartTheme';
import { scaleFontSize } from './theme/density-helpers';
import { CHART_CANVAS_HEIGHT } from './chartSize';
import { formatCompact } from './utils/formatters';
import { isGeoMapRegistered } from './geo/registerGeoMap';
import type { EChartsOption } from './renderers/echarts-imports';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type ChartSize = 'sm' | 'md' | 'lg';

/** Single region datum. */
export type GeoMapDatum = {
  /** Region name — must match `feature.properties.name` (or `nameProperty`) in the registered map JSON. */
  name: string;
  /** Numeric value (drives choropleth color via visualMap). */
  value: number;
  /** Optional alternate identifier (e.g. ISO 3166-2 code "TR-34"). */
  code?: string;
  /** Per-region style override (color, opacity, border). */
  itemStyle?: { color?: string; opacity?: number; borderColor?: string };
};

/** VisualMap (color gradient) configuration. */
export type GeoMapVisualMap = {
  min?: number;
  max?: number;
  /** Color gradient (low → high). @default uses theme palette */
  colors?: string[];
  /** Labels for [high, low] ends of the legend. */
  text?: [string, string];
  /** Show/hide the legend gradient. @default true */
  show?: boolean;
  /** Legend position. @default 'bottom-left' */
  position?: 'top' | 'bottom' | 'left' | 'right';
};

/** Cross-filter compatibility — canonical click event. */
export type { ChartClickEvent } from './types';
import type { ChartClickEvent as ChartClickEventCanonical } from './types';
type ChartClickEvent = ChartClickEventCanonical;

// Markup overlay — NO-OP on map v1.
export type { ChartMarkup, ChartMarkupClickEvent } from './types';
import type { ChartMarkup, ChartMarkupClickEvent } from './types';
import { useMarkupAdapter } from './annotations/useMarkupAdapter';

export interface GeoMapProps extends AccessControlledProps {
  /**
   * Name of the registered map. Must match the name passed to
   * `ensureGeoMapRegistered(name, ...)`. Common values: `'TR'`,
   * `'world'`, or a caller-defined name.
   */
  mapName: string;
  /** Region data. */
  data: GeoMapDatum[];
  /**
   * GeoJSON property key for region matching. Default `'name'` reads
   * `feature.properties.name`. Set to `'iso'` or `'code'` for code-
   * based matching (e.g. ISO 3166-2 like `"TR-34"` for İstanbul).
   *
   * @default 'name'
   */
  nameProperty?: string;
  /**
   * Alias mapping: data names that don't match the GeoJSON property
   * verbatim. Useful when backend emits abbreviated names ("İstanbul"
   * vs "İstanbul İli") or English names that the map uses Turkish.
   *
   * Example: `{ 'Istanbul': 'İstanbul' }` (data → map name).
   */
  nameMap?: Record<string, string>;
  /** VisualMap (choropleth color gradient) config. */
  visualMap?: GeoMapVisualMap;
  /** Show region labels on the map. @default false (dense maps get cluttered) */
  showLabels?: boolean;
  /** Allow user to pan/zoom. @default true */
  roam?: boolean | 'scale' | 'move';
  /** Region selection mode. @default false (no selection) */
  selectedMode?: boolean | 'single' | 'multiple';
  /** Visual size variant. @default "md" */
  size?: ChartSize;
  /** Animate on mount. @default true */
  animate?: boolean;
  /** Chart title. */
  title?: string;
  /** Accessible description. */
  description?: string;
  /** Additional class name. */
  className?: string;
  /** Custom value formatter (used in tooltip + a11y data table). */
  valueFormatter?: (value: number) => string;
  /** Callback fired when a region is clicked. */
  onDataPointClick?: (event: ChartClickEvent) => void;
  /** Visual overlay markups — NO-OP on v1 (dev warning surfaces). */
  markups?: ChartMarkup[];
  /** Callback for markup clicks (NO-OP on v1). */
  onMarkupClick?: (event: ChartMarkupClickEvent) => void;
  /** Theme override. @default "auto" */
  theme?: ChartThemePreference;
  /** Decal pattern override. @default "auto" */
  decal?: ChartDecalPreference;
  /** Density override. @default "auto" */
  density?: ChartDensityPreference;
  /** Accent palette override. @default "auto" */
  accent?: ChartAccentPreference;
  /** Anomaly summary list for SR announcement. */
  anomalySummary?: AnomalySummary[];
  /** Custom anomaly announcement formatter. */
  formatAnomalyAnnouncement?: AnomalyAnnouncementFormatter;
}

const DEFAULT_VISUALMAP_COLORS = ['#dbeafe', '#93c5fd', '#3b82f6', '#1d4ed8', '#1e3a8a'];

const escapeHtml = (t: string): string =>
  t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const GeoMapInner = React.forwardRef<HTMLDivElement, Omit<GeoMapProps, 'access' | 'accessReason'>>(
  function GeoMapInner(
    {
      mapName,
      data,
      nameProperty = 'name',
      nameMap,
      visualMap,
      showLabels = false,
      roam = true,
      selectedMode = false,
      size = 'md',
      animate = true,
      title,
      description,
      className,
      valueFormatter,
      onDataPointClick,
      markups,
      onMarkupClick: _onMarkupClick,
      theme: themePreference = 'auto',
      decal: decalPreference = 'auto',
      density: densityPreference = 'auto',
      accent: accentPreference = 'auto',
      anomalySummary,
      formatAnomalyAnnouncement,
      ...rest
    },
    forwardedRef,
  ) {
    const height = CHART_CANVAS_HEIGHT[size];
    const isEmpty = !data || data.length === 0;
    const fmt = valueFormatter ?? formatCompact;

    const ownContainerRef = useRef<HTMLDivElement | null>(null);
    const breakpoint = useResponsiveBreakpoint(ownContainerRef);

    const { decalEnabled, decalPatterns, densityFontMultiplier, effectivePalette } = useChartTheme({
      theme: themePreference,
      decal: decalPreference,
      density: densityPreference,
      accent: accentPreference,
    });

    // Map registration check — Codex 019e2254 PR-X12c iter-2 blocker
    // fix: do NOT `useMemo([mapName])` here. The original draft cached
    // the result so a parent re-render AFTER late registration could
    // not flip the gate; the wrapper would stay in "not registered"
    // state even though `ensureGeoMapRegistered` had since completed.
    // Re-checking on every render is cheap (synchronous Map lookup on
    // the ECharts global) and lets the wrapper recover whenever the
    // consumer's async registration settles + parent triggers a
    // re-render.
    const mapReady = isGeoMapRegistered(mapName);

    // Markup adapter NO-OP — emit dev warning when consumer passes
    // markups. `chartType: 'geo'` puts the geographic-map family into
    // the support matrix as no-op so the adapter warns the consumer
    // instead of silently dropping markups (Codex 019e2254 PR-X12c
    // iter-2 finding: original draft passed `'bar'` so the matrix
    // saw markups as full-support, generated patches, and we
    // silently dropped them because GeoMap doesn't merge patches).
    useMarkupAdapter(markups, {
      chartType: 'geo',
      orientation: 'vertical',
      dataContext: { labels: data.map((d) => d.name), series: [{ data: [] }] },
    });

    const option = useMemo((): EChartsOption | null => {
      if (isEmpty || !mapReady) return null;

      // Apply nameMap alias before passing to ECharts. Strict match
      // by default — silent data loss is worse than rendering blank
      // regions, which surface the data-map mismatch visually.
      const echartsData = data.map((d) => ({
        name: nameMap?.[d.name] ?? d.name,
        value: d.value,
        itemStyle: d.itemStyle,
        // Keep the original name + code on the datum for a11y/click
        // payload — consumer code may want to round-trip back to
        // their canonical identifier.
        _originalName: d.name,
        _code: d.code,
      }));

      const values = echartsData.map((d) => d.value).filter((v) => Number.isFinite(v));
      const min = visualMap?.min ?? (values.length > 0 ? Math.min(...values) : 0);
      const max = visualMap?.max ?? (values.length > 0 ? Math.max(...values) : 1);
      const colors = visualMap?.colors ?? DEFAULT_VISUALMAP_COLORS;
      const showVisualMap = visualMap?.show ?? true;

      const position = visualMap?.position ?? 'bottom';
      const visualMapLayout: Record<string, unknown> = {
        type: 'continuous',
        min,
        max,
        inRange: { color: colors },
        text: visualMap?.text ?? ['High', 'Low'],
        calculable: true,
        show: showVisualMap,
        textStyle: { fontSize: scaleFontSize(11, densityFontMultiplier) },
      };
      if (position === 'top') {
        visualMapLayout.top = 10;
        visualMapLayout.left = 'center';
        visualMapLayout.orient = 'horizontal';
      } else if (position === 'left') {
        visualMapLayout.left = 10;
        visualMapLayout.top = 'middle';
        visualMapLayout.orient = 'vertical';
      } else if (position === 'right') {
        visualMapLayout.right = 10;
        visualMapLayout.top = 'middle';
        visualMapLayout.orient = 'vertical';
      } else {
        // bottom (default)
        visualMapLayout.bottom = 10;
        visualMapLayout.left = 'center';
        visualMapLayout.orient = 'horizontal';
      }

      return {
        animation: animate,
        animationDuration: animate ? 600 : 0,
        title: title
          ? {
              text: escapeHtml(title),
              subtext: description ? escapeHtml(description) : undefined,
              left: 'center',
              textStyle: {
                fontSize: scaleFontSize(16, densityFontMultiplier),
                fontWeight: 600,
              },
            }
          : undefined,
        tooltip: {
          trigger: 'item',
          confine: true,
          formatter: (p: { name?: string; value?: number; data?: { _originalName?: string } }) => {
            const displayName = (p.data?._originalName as string | undefined) ?? p.name ?? '';
            const v = typeof p.value === 'number' && Number.isFinite(p.value) ? fmt(p.value) : '—';
            return [`<b>${escapeHtml(displayName)}</b>`, `Value: ${v}`].join('<br/>');
          },
        },
        visualMap: visualMapLayout,
        series: [
          {
            type: 'map' as const,
            name: title ?? 'Regions',
            map: mapName,
            // Codex 019e2254 PR-X12c iter-2 blocker fix: wire
            // `nameProperty` into the series so ECharts matches
            // `data[i].name` against `feature.properties[nameProperty]`
            // instead of always `properties.name`. Lets consumers
            // route on ISO codes ("TR-34") or backend identifiers
            // without renaming the data.
            nameProperty,
            data: echartsData,
            roam,
            selectedMode,
            // Region labels (off by default for dense maps); when on,
            // ECharts auto-positions a centroid label per region.
            label: { show: showLabels, fontSize: scaleFontSize(10, densityFontMultiplier) },
            emphasis: {
              focus: 'self' as const,
              label: { show: true, fontWeight: 'bold' as const },
              itemStyle: { areaColor: undefined, borderColor: '#000', borderWidth: 1 },
            },
            select: {
              label: { show: true, fontWeight: 'bold' as const },
              itemStyle: { borderColor: '#000', borderWidth: 2 },
            },
            itemStyle: {
              borderColor: '#cbd5e1',
              borderWidth: 0.5,
            },
          },
        ],
        aria: {
          enabled: true,
          label: {
            description: description
              ? escapeHtml(description)
              : title
                ? `Geographic map: ${escapeHtml(title)}`
                : `Geographic map (${mapName})`,
          },
          ...(decalEnabled ? { decal: { show: true, decals: decalPatterns } } : {}),
        },
      } as EChartsOption;
    }, [
      isEmpty,
      mapReady,
      mapName,
      data,
      nameMap,
      visualMap,
      showLabels,
      roam,
      selectedMode,
      animate,
      title,
      description,
      fmt,
      decalEnabled,
      decalPatterns,
      densityFontMultiplier,
      effectivePalette,
      breakpoint,
    ]);

    // Dev warning when consumer forgot registration. Production builds
    // skip the console call.
    if (process.env.NODE_ENV !== 'production' && !mapReady && !isEmpty) {
      console.warn(
        `[@mfe/x-charts/GeoMap] map "${mapName}" not registered. Call ensureGeoMapRegistered("${mapName}", loader) before mounting.`,
      );
    }

    const handleClick = useCallback(
      (params: unknown) => {
        if (!onDataPointClick) return;
        const p = params as {
          name?: string;
          value?: number;
          data?: { _originalName?: string; _code?: string };
        };
        const originalName = p.data?._originalName ?? p.name ?? '';
        const code = p.data?._code;
        onDataPointClick({
          datum: { region: originalName, code },
          value: typeof p.value === 'number' ? p.value : undefined,
          label: originalName,
        });
      },
      [onDataPointClick],
    );

    // A11y data table — region list sorted by value desc with name +
    // value. Codex review note: HR usage on small-cohort cells may
    // benefit from suppression (`<5` → "<5") but that's a consumer-side
    // privacy decision, not a wrapper default. We pass raw values.
    const a11yData = useMemo(
      () =>
        [...data]
          .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
          .map((d) => ({
            label: d.name,
            value: d.value ?? 0,
          })),
      [data],
    );

    const a11yState = useChartA11y({
      chartType: 'geo',
      title,
      description,
      data: a11yData,
      valueFormatter: fmt,
      anomalySummary,
      formatAnomalyAnnouncement,
    });

    const { containerRef, instance: _instance } = useEChartsRenderer({
      option: option ?? ({} as EChartsOption),
      respectReducedMotion: true,
      onClick: onDataPointClick ? handleClick : undefined,
    });

    const setRefs = useCallback(
      (node: HTMLDivElement | null) => {
        ownContainerRef.current = node;
        (containerRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
        if (typeof forwardedRef === 'function') forwardedRef(node);
        else if (forwardedRef) forwardedRef.current = node;
      },
      [containerRef, forwardedRef],
    );

    return (
      <ChartA11yShell
        a11y={a11yState}
        className={cn('mfe-geo-map-shell', className)}
        height={height}
        testId="geo-map"
        setRefs={setRefs}
        anomalySummary={anomalySummary}
        formatAnomalyAnnouncement={formatAnomalyAnnouncement}
        {...rest}
      />
    );
  },
);

GeoMapInner.displayName = 'GeoMapInner';

/**
 * GeoMap — public wrapper. Accepts `access` + `accessReason`
 * (`AccessControlledProps`) and forwards everything else to
 * `GeoMapInner`. Pattern mirrors BarChart/LineChart outer/inner split.
 */
export const GeoMap = React.forwardRef<HTMLDivElement, GeoMapProps>(function GeoMap(
  {
    access,
    accessReason,
    onDataPointClick,
    onMarkupClick,
    anomalySummary,
    formatAnomalyAnnouncement,
    ...rest
  },
  ref,
) {
  const { state } = resolveAccessState(access);
  return (
    <ChartAccessGate access={access} accessReason={accessReason}>
      <GeoMapInner
        ref={ref}
        {...rest}
        onDataPointClick={guardChartCallback(state, onDataPointClick)}
        onMarkupClick={guardChartCallback(state, onMarkupClick)}
        anomalySummary={anomalySummary}
        formatAnomalyAnnouncement={formatAnomalyAnnouncement}
      />
    </ChartAccessGate>
  );
});
GeoMap.displayName = 'GeoMap';
