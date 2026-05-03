/**
 * DrillDownDemoLive — Faz 21.4 PR-B Design Lab live demo.
 *
 * Wires `useDrillDown` against a real `BarChart` + `DrillDownBreadcrumb`
 * across a 3-level hierarchical drill (region → city → store). Mode
 * toggle:
 *
 *   `basic`   — drillDown / drillUp / drillToRoot via clicks + breadcrumb.
 *   `history` — full undo/redo + Reset + drillCount counter. The cross-
 *               filter store retains both `past` and `future` snapshot
 *               stacks (with `HistoryEntry.drillPath` snapshots), so the
 *               redo button reapplies the most recent undone drill change.
 *               Faz 21.8 PR-X2 restored the redo affordance after the
 *               PR-B scope cut: the surface is wired through
 *               `useDrillDown`'s new `redo`/`canRedo` properties.
 *
 * The drill state lives in the cross-filter store (per
 * `packages/x-charts/src/drill-down/useDrillDown.ts:64-67`).
 */
import React, { useMemo, useState } from 'react';
import { BarChart, CrossFilterProvider, DrillDownBreadcrumb, useDrillDown } from '@mfe/x-charts';

// Local mirror of `useDrillDown`'s `DrillDownLevelSpec` shape — the
// type is exported from `@mfe/x-charts/drill-down/index.ts` but NOT
// re-exported from the package root (kept narrow to keep the root
// barrel lean). Mirroring locally avoids touching the root surface
// just for a Design Lab demo.
interface DrillDownLevelSpec {
  field: string;
  label?: string;
  chartType?: string;
}

interface SaleRow {
  region: 'Europe' | 'Asia' | 'Americas';
  city: string;
  store: string;
  value: number;
}

const SALES_DATA: readonly SaleRow[] = [
  { region: 'Europe', city: 'London', store: 'Camden', value: 1200 },
  { region: 'Europe', city: 'London', store: 'Soho', value: 1800 },
  { region: 'Europe', city: 'Paris', store: 'Marais', value: 1500 },
  { region: 'Europe', city: 'Paris', store: 'Opera', value: 1100 },
  { region: 'Asia', city: 'Tokyo', store: 'Shibuya', value: 2100 },
  { region: 'Asia', city: 'Tokyo', store: 'Ginza', value: 2500 },
  { region: 'Asia', city: 'Seoul', store: 'Gangnam', value: 1700 },
  { region: 'Asia', city: 'Seoul', store: 'Itaewon', value: 1400 },
  { region: 'Americas', city: 'NYC', store: 'Manhattan', value: 2800 },
  { region: 'Americas', city: 'NYC', store: 'Brooklyn', value: 1900 },
  { region: 'Americas', city: 'LA', store: 'Hollywood', value: 1600 },
  { region: 'Americas', city: 'LA', store: 'Venice', value: 1300 },
];

const LEVELS: DrillDownLevelSpec[] = [
  { field: 'region', label: 'Region' },
  { field: 'city', label: 'City' },
  { field: 'store', label: 'Store' },
];

const aggregateBy = (
  rows: readonly SaleRow[],
  field: keyof Pick<SaleRow, 'region' | 'city' | 'store'>,
): { label: string; value: number }[] => {
  const grouped = new Map<string, number>();
  for (const row of rows) {
    const key = row[field];
    grouped.set(key, (grouped.get(key) ?? 0) + row.value);
  }
  return [...grouped.entries()].map(([label, value]) => ({ label, value }));
};

interface DrillDownInnerProps {
  mode: 'basic' | 'history';
}

const DrillDownInner: React.FC<DrillDownInnerProps> = ({ mode }) => {
  const drill = useDrillDown({ levels: LEVELS, rootLabel: 'All Sales' });

  // History mode tracks how many drill operations the user has fired
  // since mount. The cross-filter store retains both `past` and
  // `future` HistoryEntry snapshots (each snapshot includes the full
  // drill path), so `useDrillDown` can expose `redo()` directly.
  // Faz 21.8 PR-X2 added redo + canRedo to the hook surface; the demo
  // now wires the redo button against `drill.redo` / `drill.canRedo`.
  const [drillCount, setDrillCount] = useState(0);

  const filteredRows = useMemo(() => {
    let rows: readonly SaleRow[] = SALES_DATA;
    drill.drillPath.forEach((step) => {
      rows = rows.filter((row) => row[step.field as keyof SaleRow] === step.value);
    });
    return rows;
  }, [drill.drillPath]);

  const currentField = drill.canDrillDeeper
    ? (LEVELS[drill.currentDepth].field as 'region' | 'city' | 'store')
    : 'store';

  const chartData = aggregateBy(filteredRows, currentField);
  const total = chartData.reduce((sum, point) => sum + point.value, 0);

  const handleClick = (label: string) => {
    if (!drill.canDrillDeeper) return;
    drill.drillDown(label, label);
    if (mode === 'history') setDrillCount((c) => c + 1);
  };

  const handleUndo = () => {
    if (!drill.canUndo) return;
    drill.undo();
  };

  const handleRedo = () => {
    if (!drill.canRedo) return;
    drill.redo();
  };

  // Label the level the user IS LOOKING AT — i.e. the field the chart
  // bars are aggregated by next, which equals LEVELS[currentDepth].
  // The previous code used drill.currentLevel which is always one step
  // behind (Codex iter-1 must-fix #4).
  const visibleLevelSpec = LEVELS[drill.currentDepth];
  const levelLabel = visibleLevelSpec?.label ?? 'Sales total';

  return (
    <div className="space-y-3 p-3" data-testid={`drill-down-demo-${mode}`}>
      <p className="text-xs text-text-secondary">
        {mode === 'basic'
          ? 'Bir bara tıklayın → bir alt seviyeye iner. Breadcrumb ile yukarı çıkın.'
          : 'Bir bara tıklayın → bir alt seviyeye iner. Undo geri alır, Reset köke döner, depth + drill counter aktiviteyi gösterir.'}
      </p>

      <DrillDownBreadcrumb items={drill.breadcrumbs} onNavigate={drill.drillTo} />

      {mode === 'history' ? (
        <div className="flex items-center gap-2 text-xs">
          <button
            type="button"
            onClick={handleUndo}
            disabled={!drill.canUndo}
            className="rounded border border-border-subtle bg-surface-default px-3 py-1 font-medium text-text-secondary transition hover:bg-surface-muted disabled:opacity-50"
            data-testid="drill-down-undo"
          >
            ↶ Undo
          </button>
          <button
            type="button"
            onClick={handleRedo}
            disabled={!drill.canRedo}
            className="rounded border border-border-subtle bg-surface-default px-3 py-1 font-medium text-text-secondary transition hover:bg-surface-muted disabled:opacity-50"
            data-testid="drill-down-redo"
          >
            ↷ Redo
          </button>
          <button
            type="button"
            onClick={drill.drillToRoot}
            disabled={drill.currentDepth === 0}
            className="rounded border border-border-subtle bg-surface-default px-3 py-1 font-medium text-text-secondary transition hover:bg-surface-muted disabled:opacity-50"
            data-testid="drill-down-history-reset"
          >
            ↺ Reset
          </button>
          <span className="text-text-secondary" data-testid="drill-down-history-counter">
            depth {drill.currentDepth} · drills fired {drillCount}
          </span>
        </div>
      ) : (
        <button
          type="button"
          onClick={drill.drillToRoot}
          disabled={drill.currentDepth === 0}
          className="rounded border border-border-subtle bg-surface-default px-3 py-1 text-xs font-medium text-text-secondary transition hover:bg-surface-muted disabled:opacity-50"
          data-testid="drill-down-reset"
        >
          Tüm seviyelere dön
        </button>
      )}

      <div className="flex items-center justify-between text-xs text-text-secondary">
        <span className="font-semibold">
          {levelLabel}
          <span
            className="ml-2 rounded bg-state-info-bg px-2 py-0.5 text-state-info-text"
            data-testid="drill-down-level"
          >
            level {drill.currentDepth} / {LEVELS.length}
          </span>
        </span>
        <span className="font-mono tabular-nums" data-testid="drill-down-total">
          {total}
        </span>
      </div>

      <BarChart
        data={chartData}
        title={`Sales by ${levelLabel}`}
        showValues
        showGrid
        size="md"
        animate={false}
        onDataPointClick={(event) => {
          if (typeof event.label === 'string') handleClick(event.label);
        }}
      />
    </div>
  );
};

export interface DrillDownDemoLiveProps {
  mode?: 'basic' | 'history';
}

export const DrillDownDemoLive: React.FC<DrillDownDemoLiveProps> = ({ mode = 'basic' }) => (
  <CrossFilterProvider>
    <DrillDownInner mode={mode} />
  </CrossFilterProvider>
);

export default DrillDownDemoLive;
