import { api } from '@mfe/shared-http';

export interface EthicsCaseSummary {
  id: string;
  status: string;
  assignedTo: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}
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
  body: { status?: string; assignedTo?: string | null },
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
