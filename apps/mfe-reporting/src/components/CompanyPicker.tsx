import React, { useEffect, useState } from 'react';

/* ------------------------------------------------------------------ */
/*  CompanyPicker — Active company selector (X-Company-Id header)     */
/*                                                                     */
/*  Backend `requiresSingleCompany: true` schemas (e.g. muavin v3)    */
/*  fail-closed without an X-Company-Id header. This dropdown writes  */
/*  the active company id to localStorage[reporting:currentCompanyId] */
/*  and triggers a page reload so dynamic-report/api.ts picks up the  */
/*  new value on its next fetch.                                       */
/*                                                                     */
/*  V1 (MVP): hardcoded 1–43 (live MSSQL evidence: workcube_mikrolink */
/*  has 43 company-only schemas).                                      */
/*  V2 (followup): dynamic list from `/api/v1/users/me/companies`     */
/*  once that endpoint stabilises (currently 500).                    */
/* ------------------------------------------------------------------ */

const STORAGE_KEY = 'reporting:currentCompanyId';

const COMPANY_IDS: number[] = Array.from({ length: 43 }, (_, i) => i + 1);

const readSelected = (): string => {
  if (typeof window === 'undefined' || !window.localStorage) return '';
  return window.localStorage.getItem(STORAGE_KEY) ?? '';
};

const writeSelected = (value: string): void => {
  try {
    if (value) {
      window.localStorage.setItem(STORAGE_KEY, value);
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
    window.dispatchEvent(
      new CustomEvent('reporting:company-changed', { detail: { companyId: value } }),
    );
  } catch {
    /* storage unavailable */
  }
};

export interface CompanyPickerProps {
  /** Required-field marker. When true a small red asterisk renders at the end
   *  of the row, matching the rest of the report drawer. */
  required?: boolean;
  /** Compact mode (smaller width on the value select). */
  compact?: boolean;
}

export const CompanyPicker: React.FC<CompanyPickerProps> = ({ required, compact }) => {
  const [selected, setSelected] = useState<string>(readSelected);

  useEffect(() => {
    const handler = () => setSelected(readSelected());
    window.addEventListener('reporting:company-changed', handler);
    window.addEventListener('storage', handler);
    return () => {
      window.removeEventListener('reporting:company-changed', handler);
      window.removeEventListener('storage', handler);
    };
  }, []);

  const onChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const next = event.target.value;
    setSelected(next);
    writeSelected(next);
    // Force the dynamic-report module to refetch with the new header.
    // V2: switch to event-bus + AG Grid api.refreshServerSide().
    if (next) {
      // Brief delay so localStorage write commits before navigation.
      window.setTimeout(() => window.location.reload(), 80);
    }
  };

  // Three-segment row mirrors AG Grid's Advanced Filter Builder pattern:
  // [Column (locked)] [Operator (locked)] [Value (editable)]. Visual mantra
  // stays identical to the user's existing filter UI; only the value cell
  // is interactive — column and operator are pre-selected and read-only.
  const segmentBase =
    'rounded-md border border-border-subtle px-3 py-2 text-sm text-text-primary';
  const segmentLocked =
    `${segmentBase} bg-surface-muted text-text-secondary cursor-not-allowed select-none`;
  const valueWidth = compact ? 'min-w-[180px]' : 'min-w-[240px]';

  return (
    <div
      className="flex items-center gap-2"
      role="group"
      aria-label="Şirket filtresi"
      data-testid="reporting-company-picker-row"
    >
      <span className={segmentLocked} aria-readonly="true">
        Şirket
      </span>
      <span className={segmentLocked} aria-readonly="true">
        Eşittir
      </span>
      <select
        data-testid="reporting-company-picker"
        className={`${segmentBase} ${valueWidth} bg-surface-default focus:outline-hidden focus:ring-2 focus:ring-selection-outline focus:ring-offset-1`}
        value={selected}
        onChange={onChange}
        aria-required={required ? 'true' : undefined}
      >
        <option value="">— Şirket seçin —</option>
        {COMPANY_IDS.map((id) => (
          <option key={id} value={String(id)}>
            Şirket #{id}
          </option>
        ))}
      </select>
      {required ? (
        <span className="ml-1 text-danger" aria-label="zorunlu" title="Zorunlu">
          *
        </span>
      ) : null}
    </div>
  );
};

export default CompanyPicker;
