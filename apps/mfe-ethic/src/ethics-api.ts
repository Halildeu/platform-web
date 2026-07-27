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
