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

export async function listCases(): Promise<EthicsCaseSummary[]> {
  const response = await api.get<unknown>('/v1/ethics/cases');
  if (!Array.isArray(response.data)) throw new Error('Etik case list contract invalid');
  return response.data as EthicsCaseSummary[];
}
export async function getCase(id: string): Promise<EthicsCaseDetail> {
  const response = await api.get<EthicsCaseDetail>(`/v1/ethics/cases/${encodeURIComponent(id)}`);
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
