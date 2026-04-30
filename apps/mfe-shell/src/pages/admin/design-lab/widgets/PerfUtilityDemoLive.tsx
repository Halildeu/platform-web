/**
 * PerfUtilityDemoLive — interactive demos for @mfe/x-charts performance
 * helpers. Each sub-demo runs the real export against a controllable
 * input so the rendered output is observable for unit + E2E tests.
 *
 *   - lttb                → downsampleLTTB(points, threshold)
 *   - progressive-render  → useProgressiveRender({ data, batchSize, ... })
 *   - lazy-chart          → useLazyChart({ rootMargin, enabled })
 *   - lru-cache           → new LRUCache<K, V>(maxSize) — set/get/eviction
 *   - code-split          → lazyChartImport(chartType) — React.lazy wrap
 */
import React from 'react';
import {
  downsampleLTTB,
  useProgressiveRender,
  useLazyChart,
  LRUCache,
  lazyChartImport,
} from '@mfe/x-charts';

export type PerfUtilityId =
  | 'lttb'
  | 'progressive-render'
  | 'lazy-chart'
  | 'lru-cache'
  | 'code-split';

const SECTION_BOX = 'rounded border border-border-subtle bg-surface-default p-3 space-y-3';
const RESULT_BOX =
  'rounded border border-border-subtle bg-surface-muted px-3 py-2 font-mono text-xs';

const RunButton: React.FC<{
  onClick: () => void;
  testId: string;
  label?: string;
  disabled?: boolean;
}> = ({ onClick, testId, label = 'Çalıştır', disabled }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className="rounded bg-action-primary px-3 py-1 text-xs font-medium text-white transition hover:opacity-90 disabled:opacity-50"
    data-testid={testId}
  >
    {label}
  </button>
);

/* ------------------------------------------------------------------ */
/*  LTTB — pure function                                               */
/* ------------------------------------------------------------------ */

const LttbDemo: React.FC = () => {
  const [pointCount, setPointCount] = React.useState(1000);
  const [threshold, setThreshold] = React.useState(100);
  const [output, setOutput] = React.useState<{ inputCount: number; outputCount: number } | null>(
    null,
  );

  return (
    <div className={SECTION_BOX} data-testid="perf-lttb-demo">
      <p className="text-xs text-text-secondary">
        Sahte trend serisi → <code>downsampleLTTB</code> ile noktasını azalt. Görsel kayıp minimal,
        render maliyeti azalır.
      </p>
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <label className="flex items-center gap-2">
          Input
          <input
            type="number"
            min={10}
            max={100000}
            value={pointCount}
            onChange={(e) => setPointCount(Number(e.target.value))}
            className="w-24 rounded border border-border-subtle bg-surface-default px-2 py-1"
            data-testid="perf-lttb-input"
          />
          nokta
        </label>
        <label className="flex items-center gap-2">
          Threshold
          <input
            type="number"
            min={2}
            max={5000}
            value={threshold}
            onChange={(e) => setThreshold(Number(e.target.value))}
            className="w-24 rounded border border-border-subtle bg-surface-default px-2 py-1"
            data-testid="perf-lttb-threshold"
          />
        </label>
        <RunButton
          testId="perf-lttb-run"
          onClick={() => {
            const points = Array.from({ length: pointCount }, (_, i) => ({
              x: i,
              y: Math.sin(i / 17) * 50 + Math.random() * 5,
            }));
            const downsampled = downsampleLTTB(points, threshold);
            setOutput({ inputCount: points.length, outputCount: downsampled.length });
          }}
        />
      </div>
      <div className={RESULT_BOX} data-testid="perf-lttb-result">
        {output ? (
          <span data-testid="perf-lttb-result-text">
            input: {output.inputCount} → output: {output.outputCount}
          </span>
        ) : (
          <span className="text-text-tertiary">Henüz çalıştırılmadı.</span>
        )}
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  ProgressiveRender — hook                                           */
/* ------------------------------------------------------------------ */

const ProgressiveRenderDemo: React.FC = () => {
  const [data, setData] = React.useState<number[]>([]);
  const state = useProgressiveRender({
    data,
    batchSize: 200,
    immediateThreshold: 100,
  });

  return (
    <div className={SECTION_BOX} data-testid="perf-progressive-render-demo">
      <p className="text-xs text-text-secondary">
        <code>useProgressiveRender</code> 1000 noktayı 200’lük batch’ler hâlinde teslim eder.
        Aşağıdaki sayaç batch ilerlerken artar.
      </p>
      <RunButton
        testId="perf-progressive-render-run"
        label={data.length > 0 ? 'Tekrar başlat' : '1000 nokta üret'}
        onClick={() => setData(Array.from({ length: 1000 }, (_, i) => i))}
      />
      <div className={RESULT_BOX} data-testid="perf-progressive-render-state">
        <div data-testid="perf-progressive-render-rendered">
          rendered: {state.visibleData.length} / {data.length}
        </div>
        <div data-testid="perf-progressive-render-progress">
          progress: {(state.progress * 100).toFixed(0)}% · isComplete: {String(state.isComplete)}
        </div>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  LazyChart — IntersectionObserver hook                              */
/* ------------------------------------------------------------------ */

const LazyChartDemo: React.FC = () => {
  const { containerRef, shouldRender } = useLazyChart({ rootMargin: '0px' });

  return (
    <div className={SECTION_BOX} data-testid="perf-lazy-chart-demo">
      <p className="text-xs text-text-secondary">
        <code>useLazyChart</code> bir IntersectionObserver kuruyor; container görünür hâle gelene
        kadar <code>shouldRender</code> false kalır.
      </p>
      <div
        ref={containerRef}
        className="rounded border border-dashed border-border-default p-6 text-center text-xs"
        data-testid="perf-lazy-chart-container"
      >
        <span data-testid="perf-lazy-chart-state">shouldRender: {String(shouldRender)}</span>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  LRUCache — class                                                   */
/* ------------------------------------------------------------------ */

const LruCacheDemo: React.FC = () => {
  const cacheRef = React.useRef<LRUCache<string, number>>();
  if (!cacheRef.current) {
    cacheRef.current = new LRUCache<string, number>(3);
  }
  const cache = cacheRef.current;
  const [snapshot, setSnapshot] = React.useState<string[]>([]);
  const [lookup, setLookup] = React.useState<{ key: string; value: number | undefined }[]>([]);

  const refresh = React.useCallback(() => {
    // LRUCache exposes a Map internally; reflect insertion order.
    const internal = (cache as unknown as { map: Map<string, number> }).map;
    setSnapshot([...internal.keys()]);
  }, [cache]);

  return (
    <div className={SECTION_BOX} data-testid="perf-lru-cache-demo">
      <p className="text-xs text-text-secondary">
        Cap = 3. Üç değer ekle, sonra dördüncüyü ekle: en eski (a) atılır.
      </p>
      <div className="flex flex-wrap gap-2">
        <RunButton
          testId="perf-lru-cache-add-abc"
          label="set a, b, c"
          onClick={() => {
            cache.set('a', 1);
            cache.set('b', 2);
            cache.set('c', 3);
            refresh();
          }}
        />
        <RunButton
          testId="perf-lru-cache-add-d"
          label="set d (eviction)"
          onClick={() => {
            cache.set('d', 4);
            refresh();
          }}
        />
        <RunButton
          testId="perf-lru-cache-lookup"
          label="get a, b, c, d"
          onClick={() => {
            setLookup(
              ['a', 'b', 'c', 'd'].map((k) => ({
                key: k,
                value: cache.get(k),
              })),
            );
          }}
        />
      </div>
      <div className={RESULT_BOX}>
        <div data-testid="perf-lru-cache-keys">keys: [{snapshot.join(', ')}]</div>
        {lookup.length > 0 ? (
          <div data-testid="perf-lru-cache-lookup-result">
            {lookup
              .map(({ key, value }) => `${key}=${value === undefined ? 'miss' : value}`)
              .join(' · ')}
          </div>
        ) : null}
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  CodeSplit — lazyChartImport                                        */
/* ------------------------------------------------------------------ */

const CodeSplitDemo: React.FC = () => {
  // Default to 'gauge' because lazyChartImport only knows enterprise types
  // (gauge / radar / treemap / heatmap / waterfall / funnel / sankey /
  // sunburst). Core charts (bar / line / pie / area) are eagerly imported,
  // so they are intentionally absent from the lazy registry.
  const [chartType, setChartType] = React.useState<string>('gauge');
  const [error, setError] = React.useState<string | null>(null);
  const [importStatus, setImportStatus] = React.useState<'idle' | 'imported'>('idle');

  return (
    <div className={SECTION_BOX} data-testid="perf-code-split-demo">
      <p className="text-xs text-text-secondary">
        <code>lazyChartImport(type)</code> enterprise chart tipleri için React.lazy döner. Core
        charts (bar/line/pie/area) eager import. Bilinmeyen tip atılırsa Error fırlar.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs">
          chartType:
          <select
            value={chartType}
            onChange={(e) => setChartType(e.target.value)}
            className="ml-2 rounded border border-border-subtle bg-surface-default px-2 py-1 text-xs"
            data-testid="perf-code-split-select"
          >
            <option value="gauge">gauge</option>
            <option value="radar">radar</option>
            <option value="treemap">treemap</option>
            <option value="bogus">bogus (unknown)</option>
          </select>
        </label>
        <RunButton
          testId="perf-code-split-run"
          label="lazyChartImport"
          onClick={() => {
            setError(null);
            try {
              lazyChartImport(chartType);
              setImportStatus('imported');
            } catch (e) {
              setImportStatus('idle');
              setError(e instanceof Error ? e.message : String(e));
            }
          }}
        />
      </div>
      <div className={RESULT_BOX} data-testid="perf-code-split-result">
        {error ? (
          <span className="text-text-error" data-testid="perf-code-split-error">
            {error}
          </span>
        ) : importStatus === 'imported' ? (
          <span data-testid="perf-code-split-success">
            React.lazy({chartType}) instance oluşturuldu (chunk fetch on first render).
          </span>
        ) : (
          <span className="text-text-tertiary">Henüz çalıştırılmadı.</span>
        )}
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  Public switch                                                      */
/* ------------------------------------------------------------------ */

const PerfUtilityDemoLive: React.FC<{ utilityId: PerfUtilityId }> = ({ utilityId }) => {
  switch (utilityId) {
    case 'lttb':
      return <LttbDemo />;
    case 'progressive-render':
      return <ProgressiveRenderDemo />;
    case 'lazy-chart':
      return <LazyChartDemo />;
    case 'lru-cache':
      return <LruCacheDemo />;
    case 'code-split':
      return <CodeSplitDemo />;
    default:
      return null;
  }
};

export default PerfUtilityDemoLive;
