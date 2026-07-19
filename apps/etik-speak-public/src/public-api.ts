const BASE = '/api/v1/public/ethics';
const JSON_TYPE = 'application/vnd.acik.etik-speak.v1+json';
export const NOTICE_VERSION = 'tr-test-pilot-v1';
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
  if (response.status === 204 && response.ok) return undefined as T;
  const contentType = response.headers.get('content-type') ?? '';
  const data = contentType.toLowerCase().includes('json')
    ? await response.json().catch(() => null)
    : null;
  if (!response.ok) {
    const error = new Error(data?.error?.message ?? 'İşlem tamamlanamadı.');
    (error as Error & { status?: number }).status = response.status;
    throw error;
  }
  if (data === null) throw new Error('Servis yanıtı doğrulanamadı; işlem sonucunu kontrol edin.');
  return data as T;
}
export const newAccessSecret = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = '';
  bytes.forEach((value) => (binary += String.fromCharCode(value)));
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
};
export async function createReport(body: object, idempotencyKey: string, accessSecret: string) {
  const result = await request<Omit<Receipt, 'accessSecret'>>('/reports', {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify({ ...body, accessSecret, noticeVersion: NOTICE_VERSION }),
  });
  if (!result.receiptId || !result.createdAt || !result.mailboxPath)
    throw new Error('Receipt yanıtı doğrulanamadı; yeniden göndermeden önce destek alın.');
  return { ...result, accessSecret };
}
export async function openMailbox(receiptId: string, accessSecret: string) {
  const result = await request<{ expiresAt?: string }>('/mailbox/sessions', {
    method: 'POST',
    body: JSON.stringify({ receiptId, accessSecret }),
  });
  if (!result.expiresAt) throw new Error('Mailbox oturumu doğrulanamadı.');
  return { expiresAt: result.expiresAt };
}
const validMessage = (value: unknown): value is Message => {
  const item = value as Partial<Message> | null;
  return (
    !!item &&
    ['REPORTER', 'STAFF'].includes(item.authorType ?? '') &&
    typeof item.id === 'string' &&
    typeof item.body === 'string' &&
    typeof item.createdAt === 'string'
  );
};
export async function listMessages() {
  const result = await request<unknown>('/mailbox/messages');
  if (!Array.isArray(result) || !result.every(validMessage))
    throw new Error('Mailbox mesajları doğrulanamadı.');
  return result;
}
export const closeMailbox = () => request<unknown>('/mailbox/session', { method: 'DELETE' });
export async function sendReporterMessage(body: string, idempotencyKey: string) {
  const result = await request<unknown>('/mailbox/messages', {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify({ body }),
  });
  if (!validMessage(result)) throw new Error('Mailbox yanıtı doğrulanamadı.');
  return result;
}
