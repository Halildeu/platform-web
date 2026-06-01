/**
 * Metadata-driven filter-state → AG Grid column-keyed filter model translator.
 *
 * PR-D1b.B (Codex thread 019e8074, 2026-06-01).
 *
 * Pure helper that converts a user's `Record<string, unknown>` filter state
 * (from the dynamic factory's `DynamicReportFilters`) into the column-keyed
 * filter model shape consumed by the backend `FilterTranslator.java`.
 *
 * The output is NOT a full AG Grid `AdvancedFilterModel` (which uses a
 * `join` top-level node). The backend traversal walks top-level keys as
 * column names and treats each value as a simple column filter — a full
 * advanced model with `{filterType:'join', conditions:[...]}` at the top
 * would be silently dropped because `'join'` is not a recognized column
 * name. Cross-AI peer review (Codex thread 019e8074 iter-2 + iter-3) pinned
 * this contract by direct read of `report-service` source.
 *
 * **Output shape:**
 * - `null` when no filter values are present
 * - `Record<string, ColumnFilter>` otherwise; each value is either a
 *   `SimpleFilterCondition` (single condition) or a compound
 *   `{filterType, operator:'AND', conditions:[...]}` (when two definitions
 *   resolve to the same `colId`)
 *
 * **Same-colId collision handling:** the translator does NOT silently
 * overwrite. Two definitions targeting the same column produce a compound
 * AND filter so the backend can AND both conditions together.
 *
 * **company-picker handling:** the `company-picker` kind is rendered by the
 * existing global `<CompanyPicker>` component which writes to localStorage
 * and emits `X-Company-Id` as a request header — NOT a column filter. The
 * translator therefore SKIPS `kind: 'company-picker'` entries. Cross-AI
 * peer review verified this matches the existing tenant-selection flow
 * (`apps/mfe-reporting/src/components/CompanyPicker.tsx`).
 */

import type { FilterDefinition, FilterKind, FilterOptionEntry } from '../types';

/* -------------------------------------------------------------------------- */
/*  Output types                                                              */
/* -------------------------------------------------------------------------- */

/**
 * AG Grid simple column filter condition shape consumed by backend
 * `FilterTranslator.translateSingleFilter`.
 */
export type SimpleFilterCondition =
  | TextSimpleFilter
  | NumberSimpleFilter
  | DateSimpleFilter
  | SetSimpleFilter;

export type TextSimpleFilterType =
  | 'contains'
  | 'notContains'
  | 'equals'
  | 'notEqual'
  | 'startsWith'
  | 'endsWith'
  | 'blank'
  | 'notBlank';

export interface TextSimpleFilter {
  filterType: 'text';
  type: TextSimpleFilterType;
  filter?: string;
}

export type NumberSimpleFilterType =
  | 'equals'
  | 'notEqual'
  | 'lessThan'
  | 'lessThanOrEqual'
  | 'greaterThan'
  | 'greaterThanOrEqual'
  | 'inRange';

export interface NumberSimpleFilter {
  filterType: 'number';
  type: NumberSimpleFilterType;
  filter?: number;
  filterTo?: number;
}

export type DateSimpleFilterType =
  | 'equals'
  | 'lessThan'
  | 'lessThanOrEqual'
  | 'greaterThan'
  | 'greaterThanOrEqual'
  | 'inRange';

export interface DateSimpleFilter {
  filterType: 'date';
  type: DateSimpleFilterType;
  /** ISO date `YYYY-MM-DD` (no time component, no Z). */
  filter?: string;
  /** ISO date `YYYY-MM-DD`. Used with `inRange`. */
  filterTo?: string;
}

export interface SetSimpleFilter {
  filterType: 'set';
  values: string[];
}

export interface CompoundFilter {
  /**
   * Discriminant carried over from the first condition. Backend
   * `FilterTranslator.translateCompoundFilter` ignores this for compound
   * payloads — it walks `conditions[]` directly. Kept on the wire for
   * symmetry with AG Grid's compound shape.
   */
  filterType: 'text' | 'number' | 'date';
  operator: 'AND' | 'OR';
  conditions: SimpleFilterCondition[];
}

export type ColumnFilter = SimpleFilterCondition | CompoundFilter;

export type MetadataFilterModel = Record<string, ColumnFilter>;

/* -------------------------------------------------------------------------- */
/*  Translator API                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Resolve the canonical AG Grid column id for a definition. Priority:
 * `advancedFilterTarget` (explicit override) > `targetField` (backend-named
 * column) > `key` (default).
 */
export function resolveColId(definition: FilterDefinition): string {
  return definition.advancedFilterTarget ?? definition.targetField ?? definition.key;
}

/**
 * Translate user-edited filter state into a column-keyed filter model.
 *
 * @param definitions Backend-supplied `FilterDefinition[]`.
 * @param state User-edited filter state (`DynamicReportFilters` — search +
 *              one key per definition).
 * @returns Column-keyed model or `null` when no filter has a non-empty value.
 */
export function translateMetadataFilters(
  definitions: ReadonlyArray<FilterDefinition>,
  state: Readonly<Record<string, unknown>>,
): MetadataFilterModel | null {
  const result: MetadataFilterModel = {};

  for (const definition of definitions) {
    // company-picker NEVER appears in the output: it is a global tenant
    // selector backed by localStorage + the X-Company-Id header, NOT a
    // column-level filter. The widget still renders, but the translator
    // skips it.
    if (definition.kind === 'company-picker') continue;

    const raw = state[definition.key];
    const condition = mapDefinitionToCondition(definition, raw);
    if (condition === null) continue;

    const colId = resolveColId(definition);
    const existing = result[colId];
    if (!existing) {
      result[colId] = condition;
      continue;
    }

    // Same-colId collision: produce a compound AND filter. Backend
    // FilterTranslator.translateCompoundFilter accepts `conditions[]`
    // (modern array form); we emit that shape.
    if (isCompound(existing) && existing.operator === 'AND') {
      result[colId] = {
        ...existing,
        conditions: [...existing.conditions, condition],
      };
    } else {
      result[colId] = {
        // First condition's filterType wins for the discriminant — backend
        // ignores it for compound payloads.
        filterType: (existing as SimpleFilterCondition).filterType as 'text' | 'number' | 'date',
        operator: 'AND',
        conditions: [existing as SimpleFilterCondition, condition],
      };
    }
  }

  return Object.keys(result).length === 0 ? null : result;
}

/* -------------------------------------------------------------------------- */
/*  Per-kind mapping                                                          */
/* -------------------------------------------------------------------------- */

function mapDefinitionToCondition(
  definition: FilterDefinition,
  raw: unknown,
): SimpleFilterCondition | null {
  switch (definition.kind) {
    case 'text-search':
      return mapTextSearch(definition.operator, raw);
    case 'enum-select':
      return mapEnumSelect(definition.operator, raw, definition.options);
    case 'date-range':
      return mapDateRange(definition.operator, raw);
    case 'number-range':
      return mapNumberRange(definition.operator, raw);
    case 'month-picker':
      return mapMonthPicker(raw);
    case 'company-picker':
      // Defensive: should not reach here (caller filters above), but
      // explicit `null` keeps the switch exhaustive against the FilterKind
      // union for future linting.
      return null;
    default:
      // Unknown kind: fail soft. The widget dispatcher logs a console.warn
      // and falls back to a text input; the translator drops the filter
      // rather than emit a malformed condition.
      assertNever(definition.kind);
      return null;
  }
}

function mapTextSearch(
  operator: FilterDefinition['operator'],
  raw: unknown,
): TextSimpleFilter | null {
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (!value) return null;
  // Default operator for text-search is `contains`; explicit `equals` also
  // accepted per backend FilterTranslator support.
  const type: TextSimpleFilterType = operator === 'equals' ? 'equals' : 'contains';
  return { filterType: 'text', type, filter: value };
}

function mapEnumSelect(
  operator: FilterDefinition['operator'],
  raw: unknown,
  _options: FilterOptionEntry[] | undefined,
): TextSimpleFilter | null {
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (!value) return null;
  // Default operator for enum-select is `equals`; backend FilterDefinition
  // allows `contains` for substring search against an enum value too.
  const type: TextSimpleFilterType = operator === 'contains' ? 'contains' : 'equals';
  return { filterType: 'text', type, filter: value };
}

interface DateRangeValue {
  from?: string;
  to?: string;
}

function mapDateRange(
  operator: FilterDefinition['operator'],
  raw: unknown,
): DateSimpleFilter | null {
  const parsed = parseDateRangeValue(raw);
  if (parsed === null) return null;

  if (operator === 'gte') {
    return parsed.from
      ? { filterType: 'date', type: 'greaterThanOrEqual', filter: parsed.from }
      : null;
  }
  if (operator === 'lte') {
    return parsed.to ? { filterType: 'date', type: 'lessThanOrEqual', filter: parsed.to } : null;
  }

  // Default: `between` → inRange (both bounds required)
  if (!parsed.from || !parsed.to) return null;
  return {
    filterType: 'date',
    type: 'inRange',
    filter: parsed.from,
    filterTo: parsed.to,
  };
}

function parseDateRangeValue(raw: unknown): DateRangeValue | null {
  if (raw == null) return null;
  if (typeof raw === 'object' && raw !== null) {
    const { from, to } = raw as { from?: unknown; to?: unknown };
    // PR-D1b.B.1 iter-4 (Codex 019e8074 finding #4): validate YYYY-MM-DD
    // strictly. Without this guard a junk URL deep-link
    // `?from=not-a-date` would propagate to the backend as a real query
    // filter. Strings that fail validation are dropped (treated as
    // absent), letting the per-operator logic decide whether the
    // resulting partial range is still valid.
    return {
      from: isIsoDate(from) ? from : undefined,
      to: isIsoDate(to) ? to : undefined,
    };
  }
  return null;
}

/**
 * PR-D1b.B.1 iter-4 — strict ISO `YYYY-MM-DD` validator for the
 * date-range widget. Rejects arbitrary strings like "not-a-date" that
 * would otherwise leak into the backend filter payload.
 */
function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  // Also reject impossible calendar dates (e.g. 2026-02-30).
  const [yearStr, monthStr, dayStr] = value.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  // JS Date rolls over invalid combos (Feb 30 → Mar 2). Verify the round
  // trip matches.
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() + 1 === month && d.getUTCDate() === day;
}

interface NumberRangeValue {
  from?: number;
  to?: number;
}

function mapNumberRange(
  operator: FilterDefinition['operator'],
  raw: unknown,
): NumberSimpleFilter | null {
  const parsed = parseNumberRangeValue(raw);
  if (parsed === null) return null;

  if (operator === 'gte') {
    return parsed.from !== undefined
      ? { filterType: 'number', type: 'greaterThanOrEqual', filter: parsed.from }
      : null;
  }
  if (operator === 'lte') {
    return parsed.to !== undefined
      ? { filterType: 'number', type: 'lessThanOrEqual', filter: parsed.to }
      : null;
  }

  // Default: `between` → inRange (both bounds required)
  if (parsed.from === undefined || parsed.to === undefined) return null;
  return {
    filterType: 'number',
    type: 'inRange',
    filter: parsed.from,
    filterTo: parsed.to,
  };
}

function parseNumberRangeValue(raw: unknown): NumberRangeValue | null {
  if (raw == null) return null;
  if (typeof raw === 'object' && raw !== null) {
    const { from, to } = raw as { from?: unknown; to?: unknown };
    return {
      from: isFiniteNumber(from) ? from : undefined,
      to: isFiniteNumber(to) ? to : undefined,
    };
  }
  return null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function mapMonthPicker(raw: unknown): DateSimpleFilter | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  // Expected wire format: `YYYY-MM` (e.g. `2026-05`). Codex iter-3:
  // month-picker → inRange (first day of month → last day of month) so
  // backend queries against a date column without requiring the column
  // to be normalized to the 1st-of-month.
  const match = /^(\d{4})-(\d{2})$/.exec(trimmed);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  const firstDay = `${match[1]}-${match[2]}-01`;
  const lastDay = computeLastDayOfMonth(year, month);
  return {
    filterType: 'date',
    type: 'inRange',
    filter: firstDay,
    filterTo: lastDay,
  };
}

function computeLastDayOfMonth(year: number, month: number): string {
  // month is 1-based here. JS Date constructor month is 0-based, and day=0
  // yields the last day of the previous month → effectively the last day
  // of `month`. Returns `YYYY-MM-DD`.
  const lastDate = new Date(Date.UTC(year, month, 0));
  const m = String(lastDate.getUTCMonth() + 1).padStart(2, '0');
  const d = String(lastDate.getUTCDate()).padStart(2, '0');
  return `${lastDate.getUTCFullYear()}-${m}-${d}`;
}

function isCompound(filter: ColumnFilter): filter is CompoundFilter {
  return (
    typeof filter === 'object' &&
    filter !== null &&
    'operator' in filter &&
    'conditions' in filter &&
    Array.isArray((filter as CompoundFilter).conditions)
  );
}

/**
 * Exhaustive-switch helper. Receives `never` at the type level so a new
 * FilterKind variant added to the union triggers a TypeScript error here
 * until the switch is updated.
 */
function assertNever(_value: never): void {
  // intentionally empty — type-only assertion
}

/* -------------------------------------------------------------------------- */
/*  Re-exports for downstream merge helpers (api.ts, ReportPage)              */
/* -------------------------------------------------------------------------- */

export type { FilterDefinition, FilterKind };
