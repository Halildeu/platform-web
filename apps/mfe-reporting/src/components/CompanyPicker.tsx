import React, { useEffect, useState } from 'react';
import { fetchCompanyOptions, type CompanyOption } from '../modules/dynamic-report/api';

/* ------------------------------------------------------------------ */
/*  CompanyPicker — Active company selector (X-Company-Id header)     */
/*                                                                     */
/*  Backend `requiresSingleCompany: true` schemas (e.g. muavin v3)    */
/*  fail-closed without an X-Company-Id header. This dropdown writes  */
/*  the active company id to localStorage[reporting:currentCompanyId] */
/*  and triggers a page reload so dynamic-report/api.ts picks up the  */
/*  new value on its next fetch.                                       */
/*                                                                     */
/*  V2 (current): real firm names from backend                        */
/*    GET /api/v1/reports/company-options → [{id, nickname, name}]    */
/*    Codex 019dfb15 plan-time + iter-2 absorbed.                     */
/*                                                                     */
/*  V1 fallback (still here): hardcoded 1–43 used when the endpoint   */
/*  404s (feature flag off) or the network call fails. Live MSSQL     */
/*  evidence: workcube_mikrolink has 43 company-only schemas.         */
/* ------------------------------------------------------------------ */

const STORAGE_KEY = 'reporting:currentCompanyId';

/** Hardcoded fallback used when the API is unavailable (feature flag off, 503, etc.). */
const FALLBACK_OPTIONS: CompanyOption[] = Array.from({ length: 43 }, (_, i) => ({
  id: i + 1,
  nickname: '',
  name: `Şirket #${i + 1}`,
}));

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

/**
 * Render label for a company option.
 * Prefers the legal {@code name}; falls back to the nickname or the id.
 * Nickname is shown as a discreet prefix when both are present.
 */
const renderLabel = (opt: CompanyOption): string => {
  const name = (opt.name ?? '').trim();
  const nickname = (opt.nickname ?? '').trim();
  if (name && nickname) return `${nickname} — ${name}`;
  if (name) return name;
  if (nickname) return nickname;
  return `Şirket #${opt.id}`;
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
  const [options, setOptions] = useState<CompanyOption[]>(FALLBACK_OPTIONS);
  const [loaded, setLoaded] = useState<boolean>(false);

  // Listen for cross-tab / cross-component changes to the selected id.
  useEffect(() => {
    const handler = () => setSelected(readSelected());
    window.addEventListener('reporting:company-changed', handler);
    window.addEventListener('storage', handler);
    return () => {
      window.removeEventListener('reporting:company-changed', handler);
      window.removeEventListener('storage', handler);
    };
  }, []);

  // Fetch real firm names once on mount; fall back to the static list on
  // any failure (404 = feature flag off, 503 = MSSQL down, network = offline).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const fetched = await fetchCompanyOptions();
      if (cancelled) return;
      if (fetched && fetched.length > 0) {
        setOptions(fetched);
      }
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const onChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const next = event.target.value;
    setSelected(next);
    writeSelected(next);
    // Force the dynamic-report module to refetch with the new header.
    // V2 idea: switch to event-bus + AG Grid api.refreshServerSide().
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

  // Placeholder option text changes once we have real data so users can tell
  // whether the firm names came from the backend or the static fallback.
  const placeholder = loaded ? '— Şirket seçin —' : '— Yükleniyor —';

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
        <option value="">{placeholder}</option>
        {options.map((opt) => (
          <option key={opt.id} value={String(opt.id)}>
            {renderLabel(opt)}
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
