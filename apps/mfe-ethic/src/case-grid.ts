/**
 * Faz 35 — the case workspace's grid vocabulary, as pure data.
 *
 * <p>Kept out of both `ethics-api.ts` (a test that mocks transport must not erase these —
 * the same reason `case-lifecycle.ts` exists) and the workspace component (a row shape
 * and a KPI count are facts about the data, not about React). Everything here is
 * deterministic: same items + same clock in, same rows/KPIs/columns out.
 *
 * <p>Privacy contract (mirrors the manager surface's): the subject is the only free-text
 * cell. Every other column renders a closed vocabulary — labels, counts, day arithmetic —
 * so nothing a reporter typed can leak into a column the grid can sort, group or export.
 */
import type { EntityGridTemplateProps } from '@mfe/design-system/advanced/data-grid';
import {
  acknowledgementState,
  ACKNOWLEDGEMENT_DEADLINE_DAYS,
  categoryLabel,
  feedbackState,
  statusLabel,
} from './case-lifecycle';

/** Persisted-state identity for the EntityGridTemplate variant system. */
export const CASE_GRID_ID = 'ethics-cases';
export const CASE_GRID_SCHEMA_VERSION = 1;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Never colour alone: every tone travels with words in the cell text. */
export type SlaTone = 'ok' | 'warn' | 'danger' | 'muted' | 'none';

export interface SlaCell {
  text: string;
  tone: SlaTone;
  /** Sort key: milliseconds to the deadline (negative = already breached). */
  order: number;
}

/**
 * The wording the intake form uses, so the handler reads the same words the
 * reporter chose (mirrors `etik-speak-public` mode options).
 */
const MODE_LABELS: Readonly<Record<string, string>> = Object.freeze({
  ANONYMOUS: 'Anonim',
  CONFIDENTIAL: 'Gizli',
  NAMED: 'İsimli',
});

/** Unknown values render as themselves — a mode this bundle has not learned should look unfamiliar. */
export const modeLabel = (mode: string | null): string =>
  mode === null ? '—' : (MODE_LABELS[mode] ?? mode);

/** The minimum a summary must carry for this module to derive a row or a KPI. */
export interface CaseGridSource {
  id: string;
  status: string;
  legacyAssignmentLabel: string | null;
  createdAt: string;
  acknowledgedAt?: string | null;
  subject: string | null;
  category: string | null;
  mode: string | null;
  participantCount: number;
}

export interface CaseGridRow extends Record<string, unknown> {
  id: string;
  shortId: string;
  subject: string;
  subjectMissing: boolean;
  status: string;
  statusText: string;
  category: string;
  mode: string;
  owner: string;
  unattended: boolean;
  ackSlaText: string;
  ackSlaTone: SlaTone;
  ackSlaOrder: number;
  feedbackSlaText: string;
  feedbackSlaTone: SlaTone;
  feedbackSlaOrder: number;
  createdAt: string;
  createdAtOrder: number;
}

/** Deadlines that no longer count (given / unknown) sort after every live clock. */
const NO_DEADLINE = Number.MAX_SAFE_INTEGER;

/**
 * The seven-day acknowledgement clock as one grid cell: remaining or exceeded
 * time, in words. Danger only after the promise is broken — the same discipline
 * the old tag list kept (red is reserved for the breach).
 */
export function ackSlaFor(
  item: { createdAt: string; acknowledgedAt?: string | null },
  now: number = Date.now(),
): SlaCell {
  const state = acknowledgementState(item, now);
  if (!state.known) return { text: 'Okunamadı', tone: 'muted', order: NO_DEADLINE };
  if (item.acknowledgedAt) return { text: 'Verildi', tone: 'ok', order: NO_DEADLINE - 1 };
  const created = Date.parse(item.createdAt);
  const dueAt = created + ACKNOWLEDGEMENT_DEADLINE_DAYS * DAY_MS;
  if (state.overdue) {
    const late = Math.floor((now - dueAt) / DAY_MS);
    return {
      text: late === 0 ? 'Süre bugün doldu' : `${late} gün gecikti`,
      tone: 'danger',
      order: dueAt - now,
    };
  }
  const remaining = ACKNOWLEDGEMENT_DEADLINE_DAYS - Math.floor((now - created) / DAY_MS);
  return {
    text: remaining <= 1 ? 'Son gün' : `${remaining} gün kaldı`,
    tone: remaining <= 2 ? 'warn' : 'none',
    order: dueAt - now,
  };
}

/** The three-month feedback clock as one grid cell — same pattern as {@link ackSlaFor}. */
export function feedbackSlaFor(
  item: { createdAt: string; acknowledgedAt?: string | null; status: string },
  now: number = Date.now(),
): SlaCell {
  const state = feedbackState(item, now);
  if (!state.known) return { text: 'Okunamadı', tone: 'muted', order: NO_DEADLINE };
  if (state.dueAt === null) return { text: 'Kapanışta verildi', tone: 'ok', order: NO_DEADLINE - 1 };
  if (state.overdue) {
    const late = Math.floor((now - state.dueAt) / DAY_MS);
    return {
      text: late === 0 ? 'Süre bugün doldu' : `${late} gün gecikti`,
      tone: 'danger',
      order: state.dueAt - now,
    };
  }
  const remaining = Math.floor((state.dueAt - now) / DAY_MS);
  return {
    text: remaining === 0 ? 'Son gün' : `${remaining} gün kaldı`,
    tone: remaining <= 7 ? 'warn' : 'none',
    order: state.dueAt - now,
  };
}

/**
 * Who answers for this case, as one word or one count — never free text when it
 * can be helped. `legacyAssignmentLabel` is the retired pre-ES-203 label; the
 * server suppresses it once real participants exist, so when it is present it
 * is the only ownership record the case has and hiding it would show an owned
 * case as unowned. With participants, the count says someone is on it without
 * naming anyone on a list surface. "Sahipsiz" is the state that most needs to
 * be seen — it is how a report goes unworked without anyone deciding so.
 */
export function ownerFor(item: {
  legacyAssignmentLabel: string | null;
  participantCount: number;
}): { owner: string; unattended: boolean } {
  const unattended = item.participantCount === 0;
  if (item.participantCount > 0) {
    return { owner: `${item.participantCount} katılımcı`, unattended };
  }
  const legacy = item.legacyAssignmentLabel?.trim();
  return { owner: legacy ? legacy : 'Sahipsiz', unattended };
}

/** One list item → one grid row. Derivation only; no fetching, no formatting surprises. */
export function buildCaseRows(
  items: readonly CaseGridSource[],
  now: number = Date.now(),
): CaseGridRow[] {
  return items.map((item) => {
    const ack = ackSlaFor(item, now);
    const feedback = feedbackSlaFor(item, now);
    const { owner, unattended } = ownerFor(item);
    const created = Date.parse(item.createdAt);
    return {
      id: item.id,
      shortId: `#${item.id.slice(0, 8).toUpperCase()}`,
      subject: item.subject ?? 'Konu okunamadı',
      subjectMissing: item.subject === null,
      status: item.status,
      statusText: statusLabel(item.status),
      category: categoryLabel(item.category) ?? '—',
      mode: modeLabel(item.mode),
      owner,
      unattended,
      ackSlaText: ack.text,
      ackSlaTone: ack.tone,
      ackSlaOrder: ack.order,
      feedbackSlaText: feedback.text,
      feedbackSlaTone: feedback.tone,
      feedbackSlaOrder: feedback.order,
      createdAt: item.createdAt,
      createdAtOrder: Number.isNaN(created) ? 0 : created,
    };
  });
}

export interface CaseKpis {
  open: number;
  unattended: number;
  ackOverdue: number;
  feedbackOverdue: number;
}

/**
 * The four numbers the workspace leads with. Each one counts EXACTLY what its
 * KPI card's click filters to — a card whose number and whose click disagree
 * teaches the reader to distrust both.
 */
export function computeKpis(
  items: readonly CaseGridSource[],
  now: number = Date.now(),
): CaseKpis {
  let open = 0;
  let unattended = 0;
  let ackOverdue = 0;
  let feedbackOverdue = 0;
  for (const item of items) {
    if (item.status !== 'CLOSED') open += 1;
    if (item.participantCount === 0) unattended += 1;
    if (acknowledgementState(item, now).overdue) ackOverdue += 1;
    if (feedbackState(item, now).overdue) feedbackOverdue += 1;
  }
  return { open, unattended, ackOverdue, feedbackOverdue };
}

type CaseColumnDefs = EntityGridTemplateProps<CaseGridRow>['columnDefs'];
export type CaseGridColumnDef = CaseColumnDefs[number];

const bySlaOrder =
  (key: 'ackSlaOrder' | 'feedbackSlaOrder' | 'createdAtOrder') =>
  (
    _valueA: unknown,
    _valueB: unknown,
    nodeA: { data?: CaseGridRow },
    nodeB: { data?: CaseGridRow },
  ): number =>
    (nodeA.data?.[key] ?? 0) - (nodeB.data?.[key] ?? 0);

const slaCellClass = (tone: SlaTone) => `ethics-grid-sla is-${tone}`;

/**
 * The eight columns of the case grid, in reading order. Text/tone pairs come
 * off the row (derived in {@link buildCaseRows}); classes only decorate what
 * the words already say.
 */
export function buildCaseColumnDefs(): CaseGridColumnDef[] {
  return [
    {
      field: 'subject',
      headerName: 'Konu',
      flex: 1,
      minWidth: 240,
      cellClass: 'ethics-grid-subject',
    },
    {
      field: 'statusText',
      headerName: 'Durum',
      minWidth: 140,
      cellClass: (params) =>
        `ethics-grid-status is-${(params.data?.status ?? '').toLowerCase()}`,
    },
    { field: 'category', headerName: 'Kategori', minWidth: 160 },
    { field: 'mode', headerName: 'Mod', minWidth: 110 },
    {
      field: 'owner',
      headerName: 'Sahip',
      minWidth: 130,
      cellClass: (params) =>
        params.data?.unattended ? 'ethics-grid-owner is-unattended' : 'ethics-grid-owner',
    },
    {
      field: 'ackSlaText',
      headerName: 'Teyit SLA',
      minWidth: 130,
      comparator: bySlaOrder('ackSlaOrder'),
      cellClass: (params) => slaCellClass(params.data?.ackSlaTone ?? 'none'),
    },
    {
      field: 'feedbackSlaText',
      headerName: 'Geri bildirim SLA',
      minWidth: 160,
      comparator: bySlaOrder('feedbackSlaOrder'),
      cellClass: (params) => slaCellClass(params.data?.feedbackSlaTone ?? 'none'),
    },
    {
      field: 'createdAt',
      headerName: 'Oluşturulma',
      minWidth: 160,
      comparator: bySlaOrder('createdAtOrder'),
      valueFormatter: (params) =>
        params.value ? new Date(String(params.value)).toLocaleString('tr-TR') : '—',
    },
  ];
}
