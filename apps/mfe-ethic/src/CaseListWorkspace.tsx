/**
 * Faz 35 — the case LIST as a workspace: KPIs, then filters, then the grid.
 *
 * <p>The old surface was a card list; at 200+ cases choosing between rows meant
 * scrolling past all of them. This is the platform's standard entity-grid
 * composition (EntityGridTemplate, client mode — the whole list already arrives
 * in one response) with the queue semantics preserved: rows enter the grid in
 * {@code sortForQueue} order, so before anyone touches a column header the
 * default reading order is still "what needs me next", not recency.
 *
 * <p>Filtering happens HERE, on the data before it reaches the grid — the four
 * KPI cards and the toolbar all write the one {@link CaseFilter} the manager
 * screen already had. Nothing imposes a filterModel on the grid: the grid's
 * variant system owns its own filter/sort/layout state, and these two layers
 * compose instead of fighting.
 */
import { useCallback, useMemo } from 'react';
import { EntityGridTemplate } from '@mfe/design-system/advanced/data-grid';
import type { EntityGridTemplateProps } from '@mfe/design-system/advanced/data-grid';
import {
  CASE_CATEGORIES,
  CASE_STATUSES,
  categoryLabel,
  EMPTY_CASE_FILTER,
  filterCases,
  isFilterActive,
  sortForQueue,
  statusLabel,
  type CaseFilter,
} from './case-lifecycle';
import type { EthicsCaseSummary } from './ethics-api';
import {
  buildCaseColumnDefs,
  buildCaseRows,
  CASE_GRID_ID,
  CASE_GRID_SCHEMA_VERSION,
  computeKpis,
  modeLabel,
  nextWorkReason,
  truncateSubject,
  type CaseGridRow,
} from './case-grid';

/** The intake form's modes, in its order — the filter offers the reporter's own words. */
const MODE_OPTIONS = ['ANONYMOUS', 'CONFIDENTIAL', 'NAMED'] as const;

type CaseGridOptions = NonNullable<EntityGridTemplateProps<CaseGridRow>['gridOptions']>;

const DEFAULT_COL_DEF: NonNullable<EntityGridTemplateProps<CaseGridRow>['defaultColDef']> = {
  sortable: true,
  resizable: true,
  // Row-level filtering lives in the domain toolbar above; per-column filter
  // pop-ups would be a second, rival answer to the same question.
  filter: false,
};

export interface CaseListWorkspaceProps {
  items: EthicsCaseSummary[];
  filter: CaseFilter;
  onFilterChange: (filter: CaseFilter) => void;
  onSelect: (item: EthicsCaseSummary) => void;
  /**
   * The manager screen's own load state, surfaced HERE so the workspace owns all
   * four of its states (loading / error / empty / ready) instead of the shell
   * swapping it out for a paragraph. No new fetch path exists: `onRefresh` is
   * the same `refresh()` the screen has always had, and `lastLoadedAt` is the
   * moment the list last arrived successfully — page state, nothing persisted.
   */
  loadState: 'loading' | 'ready' | 'error';
  lastLoadedAt: Date | null;
  onRefresh: () => void;
}

interface KpiCard {
  key: string;
  testId: string;
  label: string;
  value: number;
  active: boolean;
  tone: 'none' | 'warn' | 'danger';
  toggle: () => void;
}

export default function CaseListWorkspace({
  items,
  filter,
  onFilterChange,
  onSelect,
  loadState,
  lastLoadedAt,
  onRefresh,
}: CaseListWorkspaceProps) {
  // Derived, not stored — the same discipline the manager screen already keeps:
  // a second copy of the list would drift the moment a refresh lands.
  const visibleItems = useMemo(() => sortForQueue(filterCases(items, filter)), [items, filter]);
  const kpis = useMemo(() => computeKpis(items), [items]);
  const rows = useMemo(() => buildCaseRows(visibleItems), [visibleItems]);
  const columnDefs = useMemo(() => buildCaseColumnDefs(), []);

  const openRow = useCallback(
    (row: CaseGridRow) => {
      const item = items.find((candidate) => candidate.id === row.id);
      if (item) onSelect(item);
    },
    [items, onSelect],
  );

  const gridOptions = useMemo<CaseGridOptions>(
    () => ({
      getRowId: (params) => params.data.id,
      // Single click opens the case (double click routes through
      // onRowDoubleClick below). Guards mirror EndpointDevicesPage: only a
      // plain left click on the row itself selects.
      onRowClicked: (event) => {
        const mouseEvent = event.event as MouseEvent | undefined;
        if (mouseEvent && mouseEvent.button !== undefined && mouseEvent.button !== 0) return;
        if (mouseEvent && mouseEvent.defaultPrevented) return;
        const target = (mouseEvent?.target as HTMLElement | null) ?? null;
        if (target?.closest('a, input, select, textarea, [role="menuitem"]')) return;
        const row = event.data;
        if (row) openRow(row);
      },
    }),
    [openRow],
  );

  const kpiCards: KpiCard[] = [
    {
      key: 'open',
      testId: 'kpi-open',
      label: 'Açık vaka',
      value: kpis.open,
      active: filter.openOnly,
      tone: 'none',
      toggle: () => onFilterChange({ ...filter, openOnly: !filter.openOnly }),
    },
    {
      key: 'unattended',
      testId: 'kpi-unattended',
      label: 'Sahipsiz',
      value: kpis.unattended,
      active: filter.unattended,
      tone: 'warn',
      toggle: () => onFilterChange({ ...filter, unattended: !filter.unattended }),
    },
    {
      key: 'ack-overdue',
      testId: 'kpi-ack-overdue',
      label: 'Teyit süresi geçen',
      value: kpis.ackOverdue,
      active: filter.overdue,
      tone: 'danger',
      toggle: () => onFilterChange({ ...filter, overdue: !filter.overdue }),
    },
    {
      key: 'feedback-overdue',
      testId: 'kpi-feedback-overdue',
      label: 'Geri bildirim gecikmiş',
      value: kpis.feedbackOverdue,
      active: filter.feedbackOverdue,
      tone: 'danger',
      toggle: () => onFilterChange({ ...filter, feedbackOverdue: !filter.feedbackOverdue }),
    },
  ];

  const refreshing = loadState === 'loading';
  const nextItem = visibleItems[0] ?? null;

  // Initial load — no list has ever arrived, so there is nothing honest to show
  // behind a spinner. A quiet skeleton instead of the grid; the moment the first
  // response lands, `lastLoadedAt` exists and this branch is never taken again.
  if (refreshing && lastLoadedAt === null) {
    return (
      <div className="ethics-list-skeleton" role="status">
        <p>Vakalar yükleniyor…</p>
        <div className="ethics-skeleton-line" aria-hidden="true" />
        <div className="ethics-skeleton-line" aria-hidden="true" />
        <div className="ethics-skeleton-line" aria-hidden="true" />
      </div>
    );
  }

  // "When is this true?" — the KPI numbers and SLA cells are clock arithmetic,
  // so the moment they were computed is part of their meaning. The button rides
  // the screen's one existing reload path; while it runs it says so and cannot
  // be pressed again.
  const freshnessRow = (
    <p className="ethics-freshness">
      {lastLoadedAt && (
        <span>
          Son güncelleme{' '}
          {lastLoadedAt.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
        </span>
      )}
      <button type="button" onClick={onRefresh} disabled={refreshing} aria-busy={refreshing}>
        {refreshing ? 'Yükleniyor…' : 'Yenile'}
      </button>
    </p>
  );

  // The load failed. The global alert (role="alert") already announces the
  // readable error; this surface replaces the list — a stale grid rendered as if
  // current would be the quiet lie — and offers the same reload path back.
  if (loadState === 'error') {
    return (
      <div className="ethics-workspace">
        <div className="ethics-list-error">
          <span>Vaka listesi alınamadı.</span>
          <button type="button" onClick={onRefresh}>
            Tekrar dene
          </button>
        </div>
      </div>
    );
  }

  // Loaded and genuinely empty — no filter is hiding anything, there is nothing
  // within this reader's authorization. Different words from the filtered-empty
  // state below, because the two mean opposite things.
  if (items.length === 0) {
    return (
      <div className="ethics-workspace">
        {freshnessRow}
        <p>Yetkiniz kapsamında açık vaka yok.</p>
      </div>
    );
  }

  return (
    <div className="ethics-workspace">
      {/* The queue's own answer to "what needs me next": the FIRST case of the
          visible, sortForQueue-ordered list, with its reason said in words (never
          colour alone). Hidden when nothing is visible — a banner pointing at
          nothing would be noise with a button on it. */}
      {nextItem && (
        <section className="ethics-next-work" aria-label="Benden beklenen sıradaki iş">
          <p className="ethics-next-work-text">
            <span className="ethics-next-work-label">Sıradaki iş:</span>{' '}
            <strong className="ethics-next-work-subject">
              {truncateSubject(nextItem.subject)}
            </strong>
            <span className="ethics-next-work-reason"> · {nextWorkReason(nextItem)}</span>
          </p>
          <button type="button" onClick={() => onSelect(nextItem)}>
            Aç
          </button>
        </section>
      )}

      {/* The four questions triage exists to answer, as one click each. A card is a
          filter, so its number and its click must agree — computeKpis counts exactly
          the predicate the toggle applies. */}
      <div className="ethics-kpi-strip">
        <div className="ethics-kpis" role="group" aria-label="Vaka göstergeleri">
          {kpiCards.map((card) => (
            <button
              key={card.key}
              type="button"
              className={`ethics-kpi is-${card.tone}`}
              aria-pressed={card.active}
              data-testid={card.testId}
              onClick={card.toggle}
            >
              <span className="ethics-kpi-value">{card.value}</span>
              <span className="ethics-kpi-label">{card.label}</span>
            </button>
          ))}
        </div>
        {freshnessRow}
      </div>

      <div className="ethics-filters">
        <label className="ethics-filter-search">
          <span>Konu ara</span>
          <input
            type="search"
            value={filter.query}
            onChange={(e) => onFilterChange({ ...filter, query: e.target.value })}
          />
        </label>
        <label>
          <span>Durum</span>
          <select
            value={filter.status}
            onChange={(e) => onFilterChange({ ...filter, status: e.target.value })}
          >
            <option value="">Hepsi</option>
            {CASE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {statusLabel(s)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Kategori</span>
          <select
            value={filter.category}
            onChange={(e) => onFilterChange({ ...filter, category: e.target.value })}
          >
            <option value="">Hepsi</option>
            {CASE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {categoryLabel(c)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Mod</span>
          <select
            value={filter.mode}
            onChange={(e) => onFilterChange({ ...filter, mode: e.target.value })}
          >
            <option value="">Hepsi</option>
            {MODE_OPTIONS.map((m) => (
              <option key={m} value={m}>
                {modeLabel(m)}
              </option>
            ))}
          </select>
        </label>
        {/* The two questions triage exists to answer, as one click each. */}
        <label className="ethics-filter-toggle">
          <input
            type="checkbox"
            checked={filter.unattended}
            onChange={(e) => onFilterChange({ ...filter, unattended: e.target.checked })}
          />
          <span>Sahipsiz</span>
        </label>
        <label className="ethics-filter-toggle">
          <input
            type="checkbox"
            checked={filter.overdue}
            onChange={(e) => onFilterChange({ ...filter, overdue: e.target.checked })}
          />
          <span>Teyit süresi geçti</span>
        </label>
      </div>

      {/* A filtered list must never look like the whole list. The count says what is
          being withheld and the button undoes it in one move. */}
      {isFilterActive(filter) && (
        <p className="ethics-filter-summary" role="status">
          <span>
            <strong>{visibleItems.length}</strong> / {items.length} vaka gösteriliyor
          </span>
          <button type="button" onClick={() => onFilterChange(EMPTY_CASE_FILTER)}>
            Süzmeyi kaldır
          </button>
        </p>
      )}
      {/* Filtered to nothing ≠ nothing exists: the cases are all still there,
          withheld by a choice — so the escape hatch sits in the same sentence. */}
      {visibleItems.length === 0 && (
        <p className="ethics-list-empty">
          <span>Bu filtreyle eşleşen vaka yok</span>
          <button type="button" onClick={() => onFilterChange(EMPTY_CASE_FILTER)}>
            Filtreleri temizle
          </button>
        </p>
      )}

      <section className="ethics-case-grid" aria-label="Etik vakaları">
        <EntityGridTemplate<CaseGridRow>
          gridId={CASE_GRID_ID}
          gridSchemaVersion={CASE_GRID_SCHEMA_VERSION}
          columnDefs={columnDefs}
          defaultColDef={DEFAULT_COL_DEF}
          rowData={rows}
          total={rows.length}
          dataSourceMode="client"
          gridOptions={gridOptions}
          onRowDoubleClick={openRow}
          themeLabel="Tema"
          quickFilterLabel="Hızlı Filtre"
          quickFilterPlaceholder="Tabloda ara…"
          resetFiltersLabel="Filtreleri Temizle"
        />
      </section>
    </div>
  );
}
