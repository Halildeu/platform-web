/**
 * Metadata-driven filter widgets (PR-D1b.B step 4).
 *
 * Codex thread `019e8074` iter-3 AGREE.
 *
 * Five per-kind widget renderers + the kind-dispatcher in
 * {@link FilterRenderer}. Each widget is a controlled component:
 *
 *   ({ definition, value, onChange, required, t, reportKey }) → ReactNode
 *
 * The `reportKey` prop is forwarded only to widgets that need it (the
 * `EnumSelectFilter` async options loader), but kept on the shared
 * interface so the dispatcher does not have to branch.
 *
 * The {@link CompanyPickerFilter} re-exports the legacy global
 * `<CompanyPicker>` from `apps/mfe-reporting/src/components/CompanyPicker`.
 * It does NOT take `{value, onChange}`: it is a tenant selector backed
 * by `localStorage` + the `X-Company-Id` header, not a column filter.
 * The dispatcher renders it as a side-effecting widget and the
 * {@link translateMetadataFilters} step skips its definition entirely
 * (verified in `metadata-filter-model-translator.test.ts`).
 */

import React from 'react';
import type { FilterDefinition, FilterOptionEntry } from '../../types';
import { resolveFilterOptions } from '../options-source-cache';
import { CompanyPicker } from '../../../../components/CompanyPicker';

/* -------------------------------------------------------------------------- */
/*  Shared props                                                              */
/* -------------------------------------------------------------------------- */

export type TranslateFn = (key: string, params?: Record<string, unknown>) => string;

export interface FilterWidgetProps {
  definition: FilterDefinition;
  value: unknown;
  onChange: (next: unknown) => void;
  required?: boolean;
  /** Optional translate helper for label/placeholder i18n keys. */
  t?: TranslateFn;
  /** Report key forwarded to async option loaders. */
  reportKey: string;
}

const requiredMarker = (required?: boolean): React.ReactNode =>
  required ? (
    <span className="ml-1 text-danger" aria-label="zorunlu">
      *
    </span>
  ) : null;

const resolveLabel = (definition: FilterDefinition, t: TranslateFn | undefined): string => {
  const i18nKey = definition.i18nLabelKey;
  if (i18nKey && t) {
    const translated = t(i18nKey);
    if (translated && translated !== i18nKey) return translated;
  }
  return i18nKey ?? definition.key;
};

const resolvePlaceholder = (
  definition: FilterDefinition,
  t: TranslateFn | undefined,
): string | undefined => {
  const i18nKey = definition.i18nPlaceholderKey;
  if (!i18nKey) return undefined;
  if (t) {
    const translated = t(i18nKey);
    if (translated && translated !== i18nKey) return translated;
  }
  return undefined;
};

/* -------------------------------------------------------------------------- */
/*  TextSearchFilter — debounced text input                                   */
/* -------------------------------------------------------------------------- */

/**
 * PR-D1b.B step 4 — debounced text input.
 *
 * Codex iter-3 implementation guardrail: the debounce effect MUST NOT
 * fire `onChange(draft)` on initial mount. A `didMountRef` guard skips
 * the first effect run so `isInitialFilterState` (tracked at the
 * ReportPage level) only flips on a user-driven edit.
 */
export const TextSearchFilter: React.FC<FilterWidgetProps> = ({
  definition,
  value,
  onChange,
  required,
  t,
}) => {
  const [draft, setDraft] = React.useState<string>(typeof value === 'string' ? value : '');
  const didMountRef = React.useRef(false);
  // Track the last parent value we saw to detect TRUE parent-state
  // changes (URL rehydration, cache invalidation reset) vs the lag
  // between a user edit and the debounced onChange round-trip.
  const lastParentValueRef = React.useRef<string>(typeof value === 'string' ? value : '');

  React.useEffect(() => {
    const v = typeof value === 'string' ? value : '';
    // Only sync draft from parent if the parent value REALLY changed
    // (rehydration / external reset) — not just because our own debounced
    // onChange echoed back. The lastParentValueRef tracks the previous
    // parent emit so a stale `value === draft` check (which would fight
    // the user mid-type) is avoided.
    if (v !== lastParentValueRef.current) {
      lastParentValueRef.current = v;
      setDraft(v);
    }
  }, [value]);

  React.useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return; // Skip initial mount; only emit user edits.
    }
    const handle = setTimeout(() => onChange(draft), 250);
    return () => clearTimeout(handle);
  }, [draft, onChange]);

  const label = resolveLabel(definition, t);
  const placeholder = resolvePlaceholder(definition, t);

  return (
    <div className="flex items-center gap-2" role="group" aria-label={label}>
      <span
        className="rounded-md border border-border-subtle bg-surface-muted px-3 py-2 text-sm text-text-secondary cursor-not-allowed select-none"
        aria-readonly="true"
      >
        {label}
      </span>
      <input
        data-testid={`filter-${definition.key}`}
        className="rounded-md border border-border-subtle bg-surface-default px-3 py-2 text-sm text-text-primary placeholder:text-text-subtle focus:outline-hidden focus:ring-2 focus:ring-selection-outline focus:ring-offset-1 min-w-[240px]"
        value={draft}
        placeholder={placeholder ?? 'Arama...'}
        onChange={(event) => setDraft(event.target.value)}
        aria-required={required ? 'true' : undefined}
      />
      {requiredMarker(required)}
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/*  EnumSelectFilter — native <select> with async options resolution          */
/* -------------------------------------------------------------------------- */

/**
 * EnumSelectFilter — owns its own loading / error / empty state for
 * async options (codex iter-2 guardrail). Cancellation guard via a
 * mounted ref keeps a late resolve from clobbering state after unmount
 * or rapid definition swap.
 */
export const EnumSelectFilter: React.FC<FilterWidgetProps> = ({
  definition,
  value,
  onChange,
  required,
  t,
  reportKey,
}) => {
  type LoadState =
    | { state: 'idle' }
    | { state: 'loading' }
    | { state: 'loaded'; options: FilterOptionEntry[] }
    | { state: 'error'; message: string };

  const [load, setLoad] = React.useState<LoadState>({ state: 'idle' });
  const mountedRef = React.useRef(true);
  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    setLoad({ state: 'loading' });
    resolveFilterOptions(definition, reportKey)
      .then((options) => {
        if (cancelled || !mountedRef.current) return;
        setLoad({ state: 'loaded', options });
      })
      .catch((err: unknown) => {
        if (cancelled || !mountedRef.current) return;
        const message = err instanceof Error ? err.message : 'options load failed';
        setLoad({ state: 'error', message });
      });
    return () => {
      cancelled = true;
    };
  }, [definition, reportKey]);

  const label = resolveLabel(definition, t);
  const current = typeof value === 'string' ? value : '';

  const renderOptions = (): React.ReactNode => {
    if (load.state === 'loaded') {
      if (load.options.length === 0) {
        return <option value="">— boş —</option>;
      }
      return (
        <>
          <option value="">—</option>
          {load.options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.labelKey && t ? t(opt.labelKey) || opt.value : (opt.label ?? opt.value)}
            </option>
          ))}
        </>
      );
    }
    if (load.state === 'loading') return <option>Yükleniyor…</option>;
    if (load.state === 'error') return <option>Hata: {load.message}</option>;
    return null;
  };

  return (
    <div className="flex items-center gap-2" role="group" aria-label={label}>
      <span
        className="rounded-md border border-border-subtle bg-surface-muted px-3 py-2 text-sm text-text-secondary"
        aria-readonly="true"
      >
        {label}
      </span>
      <select
        data-testid={`filter-${definition.key}`}
        className="rounded-md border border-border-subtle bg-surface-default px-3 py-2 text-sm text-text-primary focus:outline-hidden focus:ring-2 focus:ring-selection-outline focus:ring-offset-1 min-w-[240px]"
        value={current}
        onChange={(event) => onChange(event.target.value)}
        disabled={load.state === 'loading'}
        aria-required={required ? 'true' : undefined}
      >
        {renderOptions()}
      </select>
      {requiredMarker(required)}
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/*  DateRangeFilter — two <input type="date"> bound to {from, to}             */
/* -------------------------------------------------------------------------- */

interface DateRangeValue {
  from?: string;
  to?: string;
}

const isDateRangeObject = (raw: unknown): raw is DateRangeValue =>
  raw !== null && typeof raw === 'object' && !Array.isArray(raw);

export const DateRangeFilter: React.FC<FilterWidgetProps> = ({
  definition,
  value,
  onChange,
  required,
  t,
}) => {
  const range = isDateRangeObject(value) ? value : {};
  const operator = definition.operator;
  const label = resolveLabel(definition, t);

  const update = (key: 'from' | 'to', next: string) => {
    onChange({ ...range, [key]: next === '' ? undefined : next });
  };

  return (
    <div className="flex items-center gap-2" role="group" aria-label={label}>
      <span
        className="rounded-md border border-border-subtle bg-surface-muted px-3 py-2 text-sm text-text-secondary"
        aria-readonly="true"
      >
        {label}
      </span>
      {operator !== 'lte' ? (
        <input
          type="date"
          data-testid={`filter-${definition.key}-from`}
          className="rounded-md border border-border-subtle bg-surface-default px-3 py-2 text-sm text-text-primary"
          value={range.from ?? ''}
          onChange={(event) => update('from', event.target.value)}
          aria-required={required ? 'true' : undefined}
          aria-label="Başlangıç tarihi"
        />
      ) : null}
      {operator !== 'gte' ? (
        <input
          type="date"
          data-testid={`filter-${definition.key}-to`}
          className="rounded-md border border-border-subtle bg-surface-default px-3 py-2 text-sm text-text-primary"
          value={range.to ?? ''}
          onChange={(event) => update('to', event.target.value)}
          aria-required={required ? 'true' : undefined}
          aria-label="Bitiş tarihi"
        />
      ) : null}
      {requiredMarker(required)}
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/*  NumberRangeFilter                                                         */
/* -------------------------------------------------------------------------- */

interface NumberRangeValue {
  from?: number;
  to?: number;
}

const isNumberRangeObject = (raw: unknown): raw is NumberRangeValue =>
  raw !== null && typeof raw === 'object' && !Array.isArray(raw);

export const NumberRangeFilter: React.FC<FilterWidgetProps> = ({
  definition,
  value,
  onChange,
  required,
  t,
}) => {
  const range = isNumberRangeObject(value) ? value : {};
  const operator = definition.operator;
  const label = resolveLabel(definition, t);

  const update = (key: 'from' | 'to', raw: string) => {
    if (raw === '') {
      onChange({ ...range, [key]: undefined });
      return;
    }
    const num = Number(raw);
    if (!Number.isFinite(num)) return;
    onChange({ ...range, [key]: num });
  };

  return (
    <div className="flex items-center gap-2" role="group" aria-label={label}>
      <span
        className="rounded-md border border-border-subtle bg-surface-muted px-3 py-2 text-sm text-text-secondary"
        aria-readonly="true"
      >
        {label}
      </span>
      {operator !== 'lte' ? (
        <input
          type="number"
          data-testid={`filter-${definition.key}-from`}
          className="rounded-md border border-border-subtle bg-surface-default px-3 py-2 text-sm text-text-primary w-32"
          value={range.from ?? ''}
          onChange={(event) => update('from', event.target.value)}
          aria-required={required ? 'true' : undefined}
          aria-label="Minimum"
        />
      ) : null}
      {operator !== 'gte' ? (
        <input
          type="number"
          data-testid={`filter-${definition.key}-to`}
          className="rounded-md border border-border-subtle bg-surface-default px-3 py-2 text-sm text-text-primary w-32"
          value={range.to ?? ''}
          onChange={(event) => update('to', event.target.value)}
          aria-required={required ? 'true' : undefined}
          aria-label="Maksimum"
        />
      ) : null}
      {requiredMarker(required)}
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/*  MonthPickerFilter                                                         */
/* -------------------------------------------------------------------------- */

export const MonthPickerFilter: React.FC<FilterWidgetProps> = ({
  definition,
  value,
  onChange,
  required,
  t,
}) => {
  const current = typeof value === 'string' ? value : '';
  const label = resolveLabel(definition, t);

  return (
    <div className="flex items-center gap-2" role="group" aria-label={label}>
      <span
        className="rounded-md border border-border-subtle bg-surface-muted px-3 py-2 text-sm text-text-secondary"
        aria-readonly="true"
      >
        {label}
      </span>
      <input
        type="month"
        data-testid={`filter-${definition.key}`}
        className="rounded-md border border-border-subtle bg-surface-default px-3 py-2 text-sm text-text-primary"
        value={current}
        onChange={(event) => onChange(event.target.value)}
        aria-required={required ? 'true' : undefined}
      />
      {requiredMarker(required)}
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/*  CompanyPickerFilter — re-exports the legacy global picker                 */
/* -------------------------------------------------------------------------- */

/**
 * `company-picker` kind handler. Renders the existing global
 * `<CompanyPicker>` AS-IS. The widget reads + writes `localStorage`
 * (`reporting:currentCompanyId`) and emits a `reporting:company-changed`
 * custom event; the dynamic factory's filter state is NOT updated, and
 * the translator skips this widget entirely. See
 * `metadata-filter-model-translator.test.ts:company-picker is skipped`.
 */
export const CompanyPickerFilter: React.FC<FilterWidgetProps> = ({ required }) => (
  <CompanyPicker required={required ?? false} />
);

/* -------------------------------------------------------------------------- */
/*  Dispatcher — FilterRenderer                                               */
/* -------------------------------------------------------------------------- */

/**
 * Dispatch a `FilterDefinition` to the correct per-kind widget. Unknown
 * kinds log a `console.warn` and fall back to a disabled `<input>` so
 * the rest of the filter panel stays interactive.
 */
export const FilterRenderer: React.FC<FilterWidgetProps> = (props) => {
  switch (props.definition.kind) {
    case 'text-search':
      return <TextSearchFilter {...props} />;
    case 'enum-select':
      return <EnumSelectFilter {...props} />;
    case 'date-range':
      return <DateRangeFilter {...props} />;
    case 'number-range':
      return <NumberRangeFilter {...props} />;
    case 'month-picker':
      return <MonthPickerFilter {...props} />;
    case 'company-picker':
      return <CompanyPickerFilter {...props} />;
    default: {
      if (typeof console !== 'undefined') {
        console.warn(
          `[mfe-reporting] FilterRenderer: unknown kind '${(props.definition as { kind: string }).kind}' for key '${props.definition.key}'; falling back to disabled text input`,
        );
      }
      return (
        <input
          data-testid={`filter-${props.definition.key}-fallback`}
          className="rounded-md border border-border-subtle bg-surface-muted px-3 py-2 text-sm text-text-secondary cursor-not-allowed"
          value=""
          disabled
          aria-disabled="true"
        />
      );
    }
  }
};
