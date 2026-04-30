/**
 * AiHookDemoLive — interactive demo for the @mfe/x-charts AI helper hooks.
 *
 * Five sub-demos, each picking up a real x-charts AI export and rendering
 * its result against a pre-filled sample input. Each demo button flips
 * its result panel from idle → populated, providing the mutation-killing
 * surface that the tests assert against.
 *
 *   - detect-anomalies     → detectAnomalies(number[])
 *   - identify-trends      → identifyTrends(number[])
 *   - suggest-chart        → suggestChartType(Record<string, unknown>[])
 *   - chart-description    → generateChartDescription(DescriptionInput)
 *   - nl-to-chart          → nlToChartSpec({ query, fetchFn, columns? })
 *                            uses a deterministic local mockFetchFn so
 *                            the demo + tests do not need a live LLM.
 */
import React from 'react';
import {
  detectAnomalies,
  identifyTrends,
  suggestChartType,
  generateChartDescription,
  nlToChartSpec,
  type Anomaly,
  type Trend,
  type ChartTypeSuggestion,
  type NLToChartSpecResult,
} from '@mfe/x-charts';

export type AiHookId =
  | 'detect-anomalies'
  | 'identify-trends'
  | 'suggest-chart'
  | 'chart-description'
  | 'nl-to-chart';

const SAMPLE_NUMERIC_DATA = [10, 12, 8, 15, 13, 95, 14, 11, 9, 12, 88, 10] as const;
const SAMPLE_TREND_DATA = [10, 14, 18, 22, 26, 30, 34, 38, 42, 46] as const;
const SAMPLE_TABULAR_DATA: Array<Record<string, unknown>> = [
  { month: 'Ocak', revenue: 320, channel: 'online' },
  { month: 'Şubat', revenue: 332, channel: 'online' },
  { month: 'Mart', revenue: 301, channel: 'store' },
  { month: 'Nisan', revenue: 334, channel: 'store' },
  { month: 'Mayıs', revenue: 390, channel: 'online' },
  { month: 'Haziran', revenue: 330, channel: 'online' },
];

interface ResultBoxProps {
  testId: string;
  label: string;
  output: React.ReactNode;
  empty?: boolean;
}

const ResultBox: React.FC<ResultBoxProps> = ({ testId, label, output, empty }) => (
  <div className="rounded border border-border-subtle bg-surface-default" data-testid={testId}>
    <div className="border-b border-border-subtle bg-surface-muted px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-text-secondary">
      {label}
    </div>
    <div
      className="max-h-64 overflow-auto p-3 font-mono text-xs leading-relaxed"
      data-testid={`${testId}-content`}
      data-empty={empty ? 'true' : 'false'}
    >
      {output}
    </div>
  </div>
);

const RunButton: React.FC<{ onRun: () => void; testId: string }> = ({ onRun, testId }) => (
  <button
    type="button"
    onClick={onRun}
    className="rounded bg-action-primary px-3 py-1 text-xs font-medium text-white transition hover:opacity-90"
    data-testid={testId}
  >
    Çalıştır
  </button>
);

/* ------------------------------------------------------------------ */
/*  detect-anomalies                                                   */
/* ------------------------------------------------------------------ */

const DetectAnomaliesDemo: React.FC = () => {
  const [anomalies, setAnomalies] = React.useState<Anomaly[] | null>(null);
  return (
    <div className="space-y-3 p-3" data-testid="ai-detect-anomalies-demo">
      <div className="text-xs text-text-secondary">
        Sample data:{' '}
        <span className="font-mono" data-testid="ai-detect-anomalies-input">
          [{SAMPLE_NUMERIC_DATA.join(', ')}]
        </span>
      </div>
      <RunButton
        onRun={() => setAnomalies(detectAnomalies([...SAMPLE_NUMERIC_DATA]))}
        testId="ai-detect-anomalies-run"
      />
      <ResultBox
        testId="ai-detect-anomalies-result"
        label={`Sonuç (${anomalies?.length ?? 0} anomali)`}
        empty={anomalies === null}
        output={
          anomalies === null ? (
            <span className="text-text-tertiary">Henüz çalıştırılmadı.</span>
          ) : anomalies.length === 0 ? (
            <span className="text-text-tertiary">Anomali yok.</span>
          ) : (
            <pre>{JSON.stringify(anomalies, null, 2)}</pre>
          )
        }
      />
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  identify-trends                                                    */
/* ------------------------------------------------------------------ */

const IdentifyTrendsDemo: React.FC = () => {
  const [trend, setTrend] = React.useState<Trend | null | undefined>(undefined);
  return (
    <div className="space-y-3 p-3" data-testid="ai-identify-trends-demo">
      <div className="text-xs text-text-secondary">
        Sample data:{' '}
        <span className="font-mono" data-testid="ai-identify-trends-input">
          [{SAMPLE_TREND_DATA.join(', ')}]
        </span>
      </div>
      <RunButton
        onRun={() => setTrend(identifyTrends([...SAMPLE_TREND_DATA]))}
        testId="ai-identify-trends-run"
      />
      <ResultBox
        testId="ai-identify-trends-result"
        label="Trend"
        empty={trend === undefined}
        output={
          trend === undefined ? (
            <span className="text-text-tertiary">Henüz çalıştırılmadı.</span>
          ) : trend === null ? (
            <span className="text-text-tertiary">Trend belirlenemedi.</span>
          ) : (
            <pre data-testid="ai-identify-trends-summary">{JSON.stringify(trend, null, 2)}</pre>
          )
        }
      />
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  suggest-chart                                                      */
/* ------------------------------------------------------------------ */

const SuggestChartDemo: React.FC = () => {
  const [suggestions, setSuggestions] = React.useState<ChartTypeSuggestion[] | null>(null);
  return (
    <div className="space-y-3 p-3" data-testid="ai-suggest-chart-demo">
      <div className="text-xs text-text-secondary">
        Sample tabular data:{' '}
        <span className="font-mono" data-testid="ai-suggest-chart-input">
          {SAMPLE_TABULAR_DATA.length} row × {Object.keys(SAMPLE_TABULAR_DATA[0]).length} col
        </span>
      </div>
      <RunButton
        onRun={() => setSuggestions(suggestChartType(SAMPLE_TABULAR_DATA, 5))}
        testId="ai-suggest-chart-run"
      />
      <ResultBox
        testId="ai-suggest-chart-result"
        label={`Öneriler (${suggestions?.length ?? 0})`}
        empty={suggestions === null}
        output={
          suggestions === null ? (
            <span className="text-text-tertiary">Henüz çalıştırılmadı.</span>
          ) : suggestions.length === 0 ? (
            <span className="text-text-tertiary">Öneri bulunamadı.</span>
          ) : (
            <ol className="space-y-1" data-testid="ai-suggest-chart-list">
              {suggestions.map((s, i) => (
                <li key={i} data-testid={`ai-suggest-chart-item-${i}`}>
                  <span className="font-semibold">{s.type}</span> ·{' '}
                  <span className="text-text-tertiary">
                    confidence {(s.confidence * 100).toFixed(0)}%
                  </span>{' '}
                  · {s.reason}
                </li>
              ))}
            </ol>
          )
        }
      />
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  chart-description                                                  */
/* ------------------------------------------------------------------ */

const ChartDescriptionDemo: React.FC = () => {
  const [description, setDescription] = React.useState<string | null>(null);
  return (
    <div className="space-y-3 p-3" data-testid="ai-chart-description-demo">
      <div className="text-xs text-text-secondary">
        Sample input: bar chart, 6 ay, min 301, max 390
      </div>
      <RunButton
        onRun={() =>
          setDescription(
            generateChartDescription({
              chartType: 'bar',
              title: 'Aylık Gelir',
              dataPointCount: 6,
              seriesCount: 1,
              minValue: 301,
              maxValue: 390,
              categories: ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran'],
            }),
          )
        }
        testId="ai-chart-description-run"
      />
      <ResultBox
        testId="ai-chart-description-result"
        label="Açıklama"
        empty={description === null}
        output={
          description === null ? (
            <span className="text-text-tertiary">Henüz çalıştırılmadı.</span>
          ) : (
            <p className="whitespace-pre-wrap font-sans" data-testid="ai-chart-description-text">
              {description}
            </p>
          )
        }
      />
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  nl-to-chart  (mocked LLM via deterministic fetchFn)                */
/* ------------------------------------------------------------------ */

// Real ChartSpec v1 (matches packages/x-charts/src/spec/ChartSpec.ts).
// Codex (PR-FIX-1) caught the previous mock returning an LLM-only shape
// `{ type, data: [...], encoding: { x: 'label', y: 'value' } }`. That
// shape fails ChartSpec validation (chart_type missing, data must be
// ChartDataSpec, encoding channels must be ChartChannel objects). The
// updated mock conforms so nlToChartSpec.isValid === true.
const MOCK_LLM_RESPONSE = JSON.stringify({
  version: 'v1',
  chart_type: 'bar',
  title: 'Çeyreklik Satış',
  data: {
    source: 'inline',
    values: [
      { label: 'Q1', value: 1200 },
      { label: 'Q2', value: 1500 },
      { label: 'Q3', value: 1800 },
      { label: 'Q4', value: 2100 },
    ],
  },
  encoding: {
    x: { field: 'label', type: 'nominal' },
    y: { field: 'value', type: 'quantitative' },
  },
});

const NlToChartDemo: React.FC = () => {
  const [result, setResult] = React.useState<NLToChartSpecResult | null>(null);
  const [pending, setPending] = React.useState(false);
  const [query, setQuery] = React.useState('Çeyreklere göre satışları bar chart olarak göster');
  return (
    <div className="space-y-3 p-3" data-testid="ai-nl-to-chart-demo">
      <label className="block space-y-1">
        <span className="text-xs text-text-secondary">Doğal dil sorgusu</span>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full rounded border border-border-subtle bg-surface-default px-2 py-1 text-sm"
          data-testid="ai-nl-to-chart-input"
        />
      </label>
      <button
        type="button"
        onClick={async () => {
          setPending(true);
          const res = await nlToChartSpec({
            query,
            fetchFn: async () => MOCK_LLM_RESPONSE,
            locale: 'tr-TR',
          });
          setResult(res);
          setPending(false);
        }}
        disabled={pending}
        className="rounded bg-action-primary px-3 py-1 text-xs font-medium text-white transition hover:opacity-90 disabled:opacity-50"
        data-testid="ai-nl-to-chart-run"
      >
        {pending ? 'Çalışıyor…' : 'Spec üret'}
      </button>
      <ResultBox
        testId="ai-nl-to-chart-result"
        label={
          result ? (result.isValid ? 'ChartSpec (valid)' : 'ChartSpec (invalid)') : 'ChartSpec'
        }
        empty={result === null}
        output={
          result === null ? (
            <span className="text-text-tertiary">Henüz çalıştırılmadı.</span>
          ) : (
            <pre data-testid="ai-nl-to-chart-spec">{JSON.stringify(result.spec, null, 2)}</pre>
          )
        }
      />
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  Public switch                                                      */
/* ------------------------------------------------------------------ */

const AiHookDemoLive: React.FC<{ hookId: AiHookId }> = ({ hookId }) => {
  switch (hookId) {
    case 'detect-anomalies':
      return <DetectAnomaliesDemo />;
    case 'identify-trends':
      return <IdentifyTrendsDemo />;
    case 'suggest-chart':
      return <SuggestChartDemo />;
    case 'chart-description':
      return <ChartDescriptionDemo />;
    case 'nl-to-chart':
      return <NlToChartDemo />;
    default:
      return null;
  }
};

export default AiHookDemoLive;
