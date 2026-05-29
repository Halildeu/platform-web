import React from 'react';

import {
  buildCsv,
  buildCsvFilename,
  triggerCsvDownload,
  DEFAULT_ROW_CAP,
  type CsvColumn,
} from '../../lib/csv-export';
import { useEndpointAdminI18n } from '../../i18n';

/**
 * WEB-015 v1 — RBAC-gated CSV export button.
 *
 * Renders a single "Export CSV" action that serialises the already-loaded
 * inventory `rows` (client-side, from RTK Query cache) into a downloadable
 * CSV via {@link buildCsv} + {@link triggerCsvDownload}.
 *
 * RBAC gate (`canView`): when the caller cannot view the data the button
 * is **not rendered at all** (hidden, not merely disabled) — there is no
 * client-side capability list in this MFE, so the page derives `canView`
 * from a successful (non-403) inventory load. The backend
 * `@RequireModule(VIEWER='can_view')` remains the authoritative gate; this
 * is the UI affordance mirroring it (CLAUDE.md D29: Up ≠ Functional —
 * the export is a view-layer convenience over data the backend already
 * authorised).
 *
 * Large-row cap: when `rows.length > rowCap` the CSV is truncated to the
 * first `rowCap` rows and an inline notice reports how many of how many
 * rows were exported (Codex WEB-015 guardrail).
 */

export interface InventoryExportButtonProps<Row> {
  /**
   * Whether the current operator may view (and therefore export) the
   * data. When false the button is hidden. Authoritative enforcement is
   * backend `can_view`; this mirrors it in the UI.
   */
  canView: boolean;
  /** The rows to export (already-fetched RTK Query data). */
  rows: ReadonlyArray<Row>;
  /** Column set (header + accessor) — see {@link CsvColumn}. */
  columns: ReadonlyArray<CsvColumn<Row>>;
  /** Filename slug, e.g. `endpoint-inventory`. Timestamp is appended. */
  fileBaseName: string;
  /** Max rows serialised. Defaults to {@link DEFAULT_ROW_CAP}. */
  rowCap?: number;
  /** Optional test/override hook for the download side-effect. */
  onDownload?: (content: string, filename: string) => boolean;
  /** data-testid root. Defaults to `inventory-export`. */
  testId?: string;
}

export function InventoryExportButton<Row>({
  canView,
  rows,
  columns,
  fileBaseName,
  rowCap = DEFAULT_ROW_CAP,
  onDownload = triggerCsvDownload,
  testId = 'inventory-export',
}: InventoryExportButtonProps<Row>): React.ReactElement | null {
  const { t } = useEndpointAdminI18n();
  const [notice, setNotice] = React.useState<string | null>(null);

  // RBAC gate: hidden when the operator cannot view the data.
  if (!canView) return null;

  const disabled = rows.length === 0;

  const handleExport = () => {
    const result = buildCsv(columns, rows, { rowCap });
    onDownload(result.content, buildCsvFilename(fileBaseName));

    if (result.truncated) {
      // "İlk {writtenRows} / {totalRows} satır dışa aktarıldı (üst sınır {rowCap})."
      setNotice(
        t('endpointAdmin.export.truncatedNotice')
          .replace('{writtenRows}', String(result.writtenRows))
          .replace('{totalRows}', String(result.totalRows))
          .replace('{rowCap}', String(result.rowCap)),
      );
    } else {
      setNotice(null);
    }
  };

  return (
    <span data-testid={testId} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <button
        type="button"
        onClick={handleExport}
        disabled={disabled}
        data-testid={`${testId}-button`}
        aria-label={t('endpointAdmin.export.csvAria')}
        title={disabled ? t('endpointAdmin.export.emptyHint') : t('endpointAdmin.export.csvAria')}
        style={{
          height: 32,
          padding: '0 12px',
          borderRadius: 6,
          border: '1px solid var(--border-default, #d0d5dd)',
          background: 'var(--surface-muted, #f5f5f5)',
          color: 'var(--text-secondary, #475467)',
          fontSize: 13,
          fontWeight: 500,
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.5 : 1,
        }}
      >
        {t('endpointAdmin.export.csvLabel')}
      </button>
      {notice ? (
        <span
          role="status"
          aria-live="polite"
          data-testid={`${testId}-truncation-notice`}
          style={{ fontSize: 12, color: 'var(--state-warning-text, #b54708)' }}
        >
          {notice}
        </span>
      ) : null}
    </span>
  );
}

export default InventoryExportButton;
