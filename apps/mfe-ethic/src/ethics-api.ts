import { api } from '@mfe/shared-http';
import type { ParticipantRole } from './case-lifecycle';

/**
 * ES-301A. `acknowledgedAt` is stamped by the service when the reporter is first
 * written to — it is not settable from here, and there is deliberately no field for
 * it on {@link updateCase}. `outcome` and `closedAt` appear only on a closed case;
 * the server refuses a closure without a finding, and a finding without a closure.
 */
export interface EthicsCaseSummary {
  id: string;
  status: string;
  /**
   * ES-203 slice 2 — what `assignedTo` became. Free text that once held
   * `team:ethics-test` and `jbjb`; it names nobody and grants nothing, and the
   * server suppresses it entirely once the case has participants. Nothing
   * renders it today: it stays on the type so a future reader sees that the
   * field exists, is legacy, and is not the answer to "who is on this case".
   */
  legacyAssignmentLabel: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  acknowledgedAt: string | null;
  outcome: string | null;
  closedAt: string | null;
  /**
   * What the list needs to tell two cases apart. The row used to carry an id
   * fragment, a status and a timestamp, so choosing between 138 reports meant
   * opening each one.
   *
   * `mode` earns its place separately: an anonymous report has no channel back
   * to the person who filed it, which changes what the handler can do next.
   *
   * Nullable because a case whose report row is missing is malformed, and a row
   * that needs attention should still appear rather than disappear.
   */
  subject: string | null;
  category: string | null;
  mode: string | null;
  /** Zero means nobody is on the case — the state that most needs to be visible. */
  participantCount: number;
}

// The status vocabulary, transition table and labels live in `case-lifecycle.ts`.
// They are domain rules rather than transport, and anything that mocks this module
// would otherwise take them down with it.

export interface EthicsMessage {
  id: string;
  authorType: string;
  visibility: 'REPORTER_VISIBLE' | 'INTERNAL';
  body: string;
  createdAt: string;
}
export interface EthicsCaseDetail extends EthicsCaseSummary {
  mode: string;
  category: string;
  subject: string;
  description: string;
  messages: EthicsMessage[];
}
export type StaffEvidenceState =
  | 'DECLARED'
  | 'UPLOADING'
  | 'QUARANTINED'
  | 'INTEGRITY_VERIFIED'
  | 'ORIGINAL_SEALED'
  | 'SCANNING'
  | 'SANITIZING'
  | 'DERIVATIVE_READY'
  | 'AVAILABLE'
  | 'REJECTED'
  | 'SCAN_PENDING'
  | 'EXPIRED_UNBOUND';
export interface StaffEvidence {
  attachmentId: string;
  state: StaffEvidenceState;
  mediaType: string;
  size: number | null;
  createdAt: string;
  derivativeAvailable: boolean;
}

const STAFF_EVIDENCE_STATES: StaffEvidenceState[] = [
  'DECLARED',
  'UPLOADING',
  'QUARANTINED',
  'INTEGRITY_VERIFIED',
  'ORIGINAL_SEALED',
  'SCANNING',
  'SANITIZING',
  'DERIVATIVE_READY',
  'AVAILABLE',
  'REJECTED',
  'SCAN_PENDING',
  'EXPIRED_UNBOUND',
];

const validStaffEvidence = (value: unknown): value is StaffEvidence => {
  const item = value as Partial<StaffEvidence> | null;
  return (
    !!item &&
    typeof item.attachmentId === 'string' &&
    STAFF_EVIDENCE_STATES.includes(item.state as StaffEvidenceState) &&
    typeof item.mediaType === 'string' &&
    (item.size === null || typeof item.size === 'number') &&
    typeof item.createdAt === 'string' &&
    typeof item.derivativeAvailable === 'boolean' &&
    item.derivativeAvailable === (item.state === 'AVAILABLE')
  );
};

export async function listCases(): Promise<EthicsCaseSummary[]> {
  const response = await api.get<unknown>('/v1/ethics/cases');
  if (!Array.isArray(response.data)) throw new Error('Etik case list contract invalid');
  return response.data as EthicsCaseSummary[];
}
export async function getCase(id: string): Promise<EthicsCaseDetail> {
  const response = await api.get<EthicsCaseDetail>(`/v1/ethics/cases/${encodeURIComponent(id)}`);
  return response.data;
}
export async function listCaseEvidence(id: string): Promise<StaffEvidence[]> {
  const response = await api.get<unknown>(`/v1/ethics/cases/${encodeURIComponent(id)}/attachments`);
  if (!Array.isArray(response.data) || !response.data.every(validStaffEvidence))
    throw new Error('Etik kanıt listesi sözleşmesi geçersiz');
  return response.data;
}
export async function downloadCaseEvidence(
  caseId: string,
  attachmentId: string,
): Promise<ArrayBuffer> {
  const response = await api.get<ArrayBuffer>(
    `/v1/ethics/cases/${encodeURIComponent(caseId)}/attachments/${encodeURIComponent(attachmentId)}/derivative`,
    { responseType: 'arraybuffer' },
  );
  if (!(response.data instanceof ArrayBuffer))
    throw new Error('Etik kanıt türevi sözleşmesi geçersiz');
  return response.data;
}
export async function updateCase(
  id: string,
  version: number,
  body: {
    status?: string;
    outcome?: string;
    reason?: string;
    closingMessage?: string;
  },
): Promise<EthicsCaseSummary> {
  const response = await api.patch<EthicsCaseSummary>(
    `/v1/ethics/cases/${encodeURIComponent(id)}`,
    body,
    { headers: { 'If-Match': `"${version}"` } },
  );
  return response.data;
}
export async function replyToReporter(
  id: string,
  body: string,
  idempotencyKey: string,
): Promise<EthicsMessage> {
  const response = await api.post<EthicsMessage>(
    `/v1/ethics/cases/${encodeURIComponent(id)}/messages`,
    { body },
    { headers: { 'Idempotency-Key': idempotencyKey } },
  );
  return response.data;
}
export async function addInternalNote(
  id: string,
  body: string,
  idempotencyKey: string,
): Promise<EthicsMessage> {
  const response = await api.post<EthicsMessage>(
    `/v1/ethics/cases/${encodeURIComponent(id)}/internal-notes`,
    { body },
    { headers: { 'Idempotency-Key': idempotencyKey } },
  );
  return response.data;
}

/**
 * ES-203/C+D — participants are named by opaque, case-scoped handles.
 *
 * The handle is what goes back to the server; the display name is what the
 * human reads. A subject UUID never appears on this surface: handles from two
 * different cases for the same colleague are unrelated, so nothing durable in
 * the browser can join them into "the same person".
 *
 * `displayName` on a participant is null when the directory cannot answer —
 * the view degrades, it does not lie. On the assignable list the server fails
 * closed instead (503): choosing between unnamed rows is exactly the
 * wrong-person assignment this workflow exists to prevent.
 */
export interface AssignableStaffEntry {
  handle: string;
  displayName: string;
}
export interface CaseParticipant {
  handle: string;
  displayName: string | null;
  role: string;
  addedAt: string;
}
const validHandle = (value: unknown): value is string =>
  typeof value === 'string' && /^v[0-9]+\.[A-Za-z0-9_-]+$/.test(value);

export async function listAssignableStaff(caseId: string): Promise<AssignableStaffEntry[]> {
  const response = await api.get<unknown>(
    `/v1/ethics/cases/${encodeURIComponent(caseId)}/assignable-staff`,
  );
  const rows = response.data;
  if (
    !Array.isArray(rows) ||
    !rows.every((row) => {
      const entry = row as Partial<AssignableStaffEntry> | null;
      return !!entry && validHandle(entry.handle) && typeof entry.displayName === 'string';
    })
  )
    throw new Error('Atanabilir personel sözleşmesi geçersiz');
  return rows as AssignableStaffEntry[];
}
export async function listCaseParticipants(caseId: string): Promise<CaseParticipant[]> {
  const response = await api.get<unknown>(
    `/v1/ethics/cases/${encodeURIComponent(caseId)}/participants`,
  );
  const rows = response.data;
  if (
    !Array.isArray(rows) ||
    !rows.every((row) => {
      const entry = row as Partial<CaseParticipant> | null;
      return (
        !!entry &&
        validHandle(entry.handle) &&
        (entry.displayName === null || typeof entry.displayName === 'string') &&
        typeof entry.role === 'string' &&
        typeof entry.addedAt === 'string'
      );
    })
  )
    throw new Error('Dava katılımcı listesi sözleşmesi geçersiz');
  return rows as CaseParticipant[];
}
export async function addCaseParticipant(
  caseId: string,
  handle: string,
  role: ParticipantRole,
): Promise<void> {
  await api.post(`/v1/ethics/cases/${encodeURIComponent(caseId)}/participants`, { handle, role });
}

/**
 * One recorded thing that happened to a case.
 *
 * <p>`actorHandle` and `actorDisplayName` are null together and mean one of two things the
 * server cannot currently tell apart: nobody was recorded as acting (an anonymous filing,
 * a pipeline step), or somebody was but no longer resolves — they left the product, or the
 * name directory was unreachable. Because the two are indistinguishable here, this client
 * shows an actor only when it has one, and never guesses.
 *
 * <p>`detail` is the single extra field the server chose to carry for a handful of event
 * types. It is never the report's narrative.
 */
export type TimelineActorState = 'NONE' | 'RESOLVED' | 'UNRESOLVED';

// Module-local on purpose: a vocabulary exported from this transport module and read
// elsewhere would be emptied by `vi.mock` automocking, and the tests that rely on it would
// keep passing against an empty list.
const ACTOR_STATES: readonly TimelineActorState[] = ['NONE', 'RESOLVED', 'UNRESOLVED'];

export interface CaseTimelineEntry {
  occurredAt: string;
  event: string;
  actorHandle: string | null;
  actorDisplayName: string | null;
  detail: string | null;
  /**
   * Whether this entry has an actor, and whether the service could name it.
   *
   * <p>Optional, and the distinction matters. **Absent** means this bundle is talking to a
   * service that predates the field and simply cannot say — the screen then behaves as it
   * did before and claims nothing. **Present** means the service answered, and `UNRESOLVED`
   * is a real statement worth showing: an actor is recorded and cannot be named right now.
   *
   * <p>This is not defensive habit. Today a bundle shipped ahead of its service and every
   * timeline read came back 403 for an endpoint that did not exist yet; the two halves of a
   * feature do not land at the same instant, and a field treated as guaranteed turns that
   * ordinary gap into a wrong claim on screen.
   */
  actorState?: TimelineActorState;
}

/**
 * The case's own history, oldest first, exactly as the server ordered it.
 *
 * <p>Deliberately not re-sorted here. The order is the server's claim about what happened
 * when; sorting it again on arrival would quietly repair a broken ledger and hide the one
 * defect this screen exists to make visible.
 */
export async function listCaseTimeline(caseId: string): Promise<CaseTimelineEntry[]> {
  const response = await api.get<unknown>(
    `/v1/ethics/cases/${encodeURIComponent(caseId)}/timeline`,
  );
  const rows = response.data;
  if (
    !Array.isArray(rows) ||
    !rows.every((row) => {
      const entry = row as Partial<CaseTimelineEntry> | null;
      return (
        !!entry &&
        typeof entry.occurredAt === 'string' &&
        typeof entry.event === 'string' &&
        entry.event !== '' &&
        (entry.actorHandle === null || validHandle(entry.actorHandle)) &&
        (entry.actorDisplayName === null || typeof entry.actorDisplayName === 'string') &&
        (entry.detail === null || typeof entry.detail === 'string') &&
        // Absent is fine (older service); a value this build does not recognise is not —
        // rendering an unknown state as if it were "no actor" is the exact confusion the
        // field exists to end.
        (entry.actorState === undefined ||
          ACTOR_STATES.includes(entry.actorState as TimelineActorState))
      );
    })
  )
    throw new Error('Vaka geçmişi sözleşmesi geçersiz');
  return rows as CaseTimelineEntry[];
}
