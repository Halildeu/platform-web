/**
 * FeatureDemoLive — Faz 21.4 PR-C Design Lab live demos.
 *
 * Five feature demos dispatched by `featureId`:
 *   feature-brush         — useChartInteractions enableBrush, brushRange display
 *   feature-zoom-pan      — useChartInteractions enableZoom + enablePan
 *   feature-realtime      — local setInterval + useRealTimeData stream buffer
 *   feature-theme-switch  — BarChart theme prop radio toggle (light/dark/HC/print)
 *   feature-export        — useChartExport with mock instance (PNG/SVG/CSV)
 *
 * Each demo emits at minimum one observable DOM mutation (status text /
 * counter / preview panel) so Vitest can assert per-feature behaviour
 * without exercising real canvas rendering.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BarChart, useChartExport, useChartInteractions, useRealTimeData } from '@mfe/x-charts';

// `ChartThemePreference` is exported from `@mfe/x-charts/theme` but not
// from the package root. Local mirror keeps the root barrel narrow.
type ChartThemePreference = 'auto' | 'light' | 'default' | 'dark' | 'high-contrast' | 'print';

export type FeatureId =
  | 'feature-brush'
  | 'feature-zoom-pan'
  | 'feature-realtime'
  | 'feature-theme-switch'
  | 'feature-export';

const SAMPLE_DATA = [
  { label: 'Q1', value: 1200 },
  { label: 'Q2', value: 1850 },
  { label: 'Q3', value: 1420 },
  { label: 'Q4', value: 2100 },
];

/* ------------------------------------------------------------------ */
/*  feature-brush                                                      */
/* ------------------------------------------------------------------ */

const BrushDemo: React.FC = () => {
  const [state, handlers] = useChartInteractions({ enableBrush: true });
  return (
    <div className="space-y-3" data-testid="feature-brush-demo">
      <p className="text-xs text-text-secondary">
        Click + drag the canvas: <code>useChartInteractions</code> tracks the brush range in
        data-space indices and re-renders the panel.
      </p>
      <div
        data-testid="feature-brush-surface"
        onMouseDown={handlers.onMouseDown}
        onMouseMove={handlers.onMouseMove}
        onMouseUp={handlers.onMouseUp}
        onMouseLeave={handlers.onMouseLeave}
        style={{
          height: 160,
          border: '1px solid var(--border-subtle, #e5e7eb)',
          borderRadius: 6,
          padding: 12,
          cursor: 'crosshair',
          fontFamily: 'monospace',
          fontSize: 12,
        }}
      >
        Brush surface — drag here to capture a range.
      </div>
      <div className="flex items-center justify-between text-xs">
        <span data-testid="feature-brush-state">
          isBrushing: <strong>{String(state.isBrushing)}</strong>
        </span>
        <span data-testid="feature-brush-range">
          range: {state.brushRange ? `${state.brushRange.start} → ${state.brushRange.end}` : 'null'}
        </span>
        <button
          type="button"
          onClick={state.clearBrush}
          disabled={!state.brushRange}
          className="rounded border border-border-subtle bg-surface-default px-3 py-1 font-medium text-text-secondary disabled:opacity-50"
          data-testid="feature-brush-clear"
        >
          Clear brush
        </button>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  feature-zoom-pan                                                   */
/* ------------------------------------------------------------------ */

const ZoomPanDemo: React.FC = () => {
  const [state, handlers] = useChartInteractions({
    enableZoom: true,
    enablePan: true,
    zoomStep: 0.25,
  });
  return (
    <div className="space-y-3" data-testid="feature-zoom-pan-demo">
      <p className="text-xs text-text-secondary">
        Wheel = zoom; click + drag (when zoomed) = pan.
        <code> useChartInteractions</code> tracks both into a single state block.
      </p>
      <div className="flex items-center gap-2 text-xs">
        <button
          type="button"
          onClick={state.zoomIn}
          className="rounded border border-border-subtle bg-surface-default px-3 py-1"
          data-testid="feature-zoom-in"
        >
          +
        </button>
        <button
          type="button"
          onClick={state.zoomOut}
          disabled={state.zoomLevel <= 1}
          className="rounded border border-border-subtle bg-surface-default px-3 py-1 disabled:opacity-50"
          data-testid="feature-zoom-out"
        >
          −
        </button>
        <button
          type="button"
          onClick={state.resetZoom}
          disabled={state.zoomLevel === 1}
          className="rounded border border-border-subtle bg-surface-default px-3 py-1 disabled:opacity-50"
          data-testid="feature-zoom-reset"
        >
          Reset
        </button>
        <span data-testid="feature-zoom-level" className="ml-auto font-mono">
          zoom: {state.zoomLevel.toFixed(2)}×
        </span>
      </div>
      <div
        data-testid="feature-zoom-surface"
        onWheel={handlers.onWheel}
        onMouseDown={handlers.onMouseDown}
        onMouseMove={handlers.onMouseMove}
        onMouseUp={handlers.onMouseUp}
        onMouseLeave={handlers.onMouseLeave}
        style={{
          height: 160,
          border: '1px solid var(--border-subtle, #e5e7eb)',
          borderRadius: 6,
          padding: 12,
          fontFamily: 'monospace',
          fontSize: 12,
        }}
      >
        Zoom + pan surface — wheel to zoom, drag to pan.
        <div data-testid="feature-pan-offset">
          panOffset: ({state.panOffset.x.toFixed(0)}, {state.panOffset.y.toFixed(0)})
        </div>
        <div data-testid="feature-pan-active">isPanning: {String(state.isPanning)}</div>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  feature-realtime                                                   */
/* ------------------------------------------------------------------ */

interface Tick {
  t: number;
  v: number;
}

const RealtimeDemo: React.FC = () => {
  // Demo owns the timer; useRealTimeData buffers incoming points (no
  // setInterval inside the hook). This keeps deterministic testing
  // possible via vi.useFakeTimers().
  const stream = useRealTimeData<Tick>({ maxPoints: 50 });
  const [running, setRunning] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const start = () => {
    if (intervalRef.current) return;
    intervalRef.current = setInterval(() => {
      stream.addPoint({ t: Date.now(), v: Math.round(Math.random() * 100) });
    }, 250);
    setRunning(true);
  };

  const stop = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setRunning(false);
  };

  // Cleanup on unmount.
  useEffect(() => () => stop(), []);

  return (
    <div className="space-y-3" data-testid="feature-realtime-demo">
      <p className="text-xs text-text-secondary">
        Local <code>setInterval</code> emits ticks every 250ms;
        <code> useRealTimeData</code> buffers them with a circular max-points cap. Pause via the
        hook to freeze the buffer.
      </p>
      <div className="flex items-center gap-2 text-xs">
        <button
          type="button"
          onClick={running ? stop : start}
          className="rounded border border-border-subtle bg-surface-default px-3 py-1"
          data-testid="feature-realtime-toggle"
        >
          {running ? 'Stop stream' : 'Start stream'}
        </button>
        <button
          type="button"
          onClick={stream.isPaused ? stream.resume : stream.pause}
          className="rounded border border-border-subtle bg-surface-default px-3 py-1"
          data-testid="feature-realtime-pause"
        >
          {stream.isPaused ? 'Resume buffer' : 'Pause buffer'}
        </button>
        <span data-testid="feature-realtime-count" className="ml-auto font-mono">
          points: {stream.data.length}
        </span>
      </div>
      <pre
        className="max-h-32 overflow-auto rounded border border-border-subtle bg-surface-default p-2 font-mono text-[11px]"
        data-testid="feature-realtime-tail"
      >
        {stream.data
          .slice(-5)
          .map((tick, i) => `[${i}] t=${tick.t} v=${tick.v}`)
          .join('\n') || '(no points yet — start the stream)'}
      </pre>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  feature-theme-switch                                               */
/* ------------------------------------------------------------------ */

const ThemeSwitchDemo: React.FC = () => {
  const [theme, setTheme] = useState<ChartThemePreference>('light');
  const themes: ChartThemePreference[] = ['light', 'default', 'dark', 'high-contrast', 'print'];
  return (
    <div className="space-y-3" data-testid="feature-theme-switch-demo">
      <p className="text-xs text-text-secondary">
        Switch the <code>theme</code> prop on a real <code>BarChart</code>. The wrapper feeds the
        resolved theme into ECharts.init / setOption.
      </p>
      <fieldset className="flex flex-wrap items-center gap-2 text-xs">
        <legend className="sr-only">Theme</legend>
        {themes.map((t) => (
          <label
            key={t}
            className="flex items-center gap-1 rounded border border-border-subtle bg-surface-default px-2 py-1"
          >
            <input
              type="radio"
              name="feature-theme-switch"
              value={t}
              checked={theme === t}
              onChange={() => setTheme(t)}
              data-testid={`feature-theme-${t}`}
            />
            {t}
          </label>
        ))}
      </fieldset>
      <div data-testid="feature-theme-active" className="text-xs">
        active: <strong>{theme}</strong>
      </div>
      <BarChart data={SAMPLE_DATA} theme={theme} animate={false} />
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  feature-export                                                     */
/* ------------------------------------------------------------------ */

// Matches the internal `EChartsLike` shape that `useChartExport` reads
// (packages/x-charts/src/collaboration/chart-export.ts:25). The opts
// argument is required (not optional) because the hook always passes
// at least { type }.
interface MockEChartsLike {
  getDataURL: (opts: { type: string; pixelRatio?: number; backgroundColor?: string }) => string;
  getConnectedDataURL?: (opts: { type: string; pixelRatio?: number }) => string;
}

const ExportDemo: React.FC = () => {
  const exporter = useChartExport();
  const [lastExport, setLastExport] = useState<string>('—');

  // Mock instance — useChartExport calls instance.getDataURL for PNG/SVG
  // and bypasses it entirely for CSV (which goes through Blob/URL.createObjectURL).
  // The mock returns a tiny stable data URL so the demo can show a
  // human-readable summary in the status line.
  const mockInstance: MockEChartsLike = useMemo(
    () => ({
      getDataURL: ({ type }) =>
        type === 'svg'
          ? 'data:image/svg+xml;base64,PHN2Zy8+'
          : 'data:image/png;base64,iVBORw0KGgo=',
    }),
    [],
  );

  const handlePng = () => {
    exporter.exportChart(mockInstance, 'png', { filename: 'chart-demo' });
    setLastExport('png · data:image/png;base64,…');
  };

  const handleSvg = () => {
    exporter.exportChart(mockInstance, 'svg', { filename: 'chart-demo' });
    setLastExport('svg · data:image/svg+xml;base64,…');
  };

  const handleCsv = () => {
    exporter.exportChart(null, 'csv', {
      filename: 'chart-demo',
      data: SAMPLE_DATA,
      columns: [
        { field: 'label', headerName: 'Quarter' },
        { field: 'value', headerName: 'Revenue' },
      ],
    });
    setLastExport('csv · 2 columns × 4 rows');
  };

  return (
    <div className="space-y-3" data-testid="feature-export-demo">
      <p className="text-xs text-text-secondary">
        <code>useChartExport</code> dispatches PNG/SVG via <code>instance.getDataURL</code> and CSV
        via Blob ➜<code> URL.createObjectURL</code>. Real consumers wire the ECharts instance ref;
        here we use a deterministic mock so the demo runs offline.
      </p>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <button
          type="button"
          onClick={handlePng}
          className="rounded border border-border-subtle bg-surface-default px-3 py-1"
          data-testid="feature-export-png"
        >
          Export PNG
        </button>
        <button
          type="button"
          onClick={handleSvg}
          className="rounded border border-border-subtle bg-surface-default px-3 py-1"
          data-testid="feature-export-svg"
        >
          Export SVG
        </button>
        <button
          type="button"
          onClick={handleCsv}
          className="rounded border border-border-subtle bg-surface-default px-3 py-1"
          data-testid="feature-export-csv"
        >
          Export CSV
        </button>
        <span data-testid="feature-export-last" className="ml-auto font-mono">
          last: {lastExport}
        </span>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  Switch                                                             */
/* ------------------------------------------------------------------ */

export interface FeatureDemoLiveProps {
  featureId: FeatureId;
}

export const FeatureDemoLive: React.FC<FeatureDemoLiveProps> = ({ featureId }) => {
  switch (featureId) {
    case 'feature-brush':
      return <BrushDemo />;
    case 'feature-zoom-pan':
      return <ZoomPanDemo />;
    case 'feature-realtime':
      return <RealtimeDemo />;
    case 'feature-theme-switch':
      return <ThemeSwitchDemo />;
    case 'feature-export':
      return <ExportDemo />;
    default:
      return null;
  }
};

export default FeatureDemoLive;
