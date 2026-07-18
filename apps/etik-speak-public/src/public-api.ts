const BASE = '/api/v1/public/ethics';
const JSON_TYPE = 'application/vnd.acik.etik-speak.v1+json';
export interface Receipt {
  receiptId: string;
  accessSecret: string;
  createdAt: string;
  mailboxPath: string;
  idempotentReplay: boolean;
}
export interface Message {
  id: string;
  authorType: string;
  body: string;
  createdAt: string;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    credentials: 'include',
    cache: 'no-store',
    referrerPolicy: 'no-referrer',
    headers: {
      Accept: JSON_TYPE,
      ...(init.body ? { 'Content-Type': JSON_TYPE } : {}),
      ...(init.headers ?? {}),
    },
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(data?.error?.message ?? 'İşlem tamamlanamadı.');
    (error as Error & { status?: number }).status = response.status;
    throw error;
  }
  return data as T;
}
export const createReport = (body: unknown, idempotencyKey: string) =>
  request<Receipt>('/reports', {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify(body),
  });
export const openMailbox = (receiptId: string, accessSecret: string) =>
  request<{ expiresAt: string }>('/mailbox/sessions', {
    method: 'POST',
    body: JSON.stringify({ receiptId, accessSecret }),
  });
export const listMessages = () => request<Message[]>('/mailbox/messages');
export const sendReporterMessage = (body: string) =>
  request<Message>('/mailbox/messages', {
    method: 'POST',
    headers: { 'Idempotency-Key': crypto.randomUUID() },
    body: JSON.stringify({ body }),
  });
