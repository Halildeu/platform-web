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
export type ReporterCaseStatus = 'NEW' | 'IN_REVIEW' | 'CLOSED';
export interface MailboxView {
  status: ReporterCaseStatus;
  messages: Message[];
  /**
   * When the report was filed, and when the team first wrote back.
   *
   * <p>Optional on purpose. A bundle deployed ahead of the service receives neither, and
   * absent is not the same as null: null means nobody has replied yet, absent means this
   * page cannot tell. A countdown computed from a missing date would still read to the
   * reporter as a statement about a legal deadline.
   */
  filedAt?: string | null;
  acknowledgedAt?: string | null;
}
// The complete custody vocabulary as the service emits it. `REJECTED` was
// never one of them, while every terminal *failure* state was missing — and an
// unrecognized state does not merely render oddly here, it fails validation and
// the whole attachment is dropped from the response. A reporter whose file was
// caught as malware therefore saw "no evidence files yet", as if the upload had
// never happened.
export type EvidenceState =
  | 'DECLARED'
  | 'UPLOADING'
  | 'UPLOAD_CAPABILITY_EXPIRED'
  | 'QUARANTINED'
  | 'INTEGRITY_VERIFIED'
  | 'ORIGINAL_SEALED'
  | 'SCAN_PENDING'
  | 'SCANNING'
  | 'SANITIZING'
  | 'DERIVATIVE_READY'
  | 'AVAILABLE'
  | 'MALICIOUS_QUARANTINED'
  | 'REJECTED_INTEGRITY'
  | 'REJECTED_POLICY'
  | 'SANITIZE_FAILED'
  | 'EXPIRED_UNBOUND';
export interface EvidenceStatus {
  attachmentId: string;
  state: EvidenceState;
  mediaType: string;
  size: number;
  failureCode: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface EvidenceDeclaration {
  attachmentId: string;
  state: EvidenceState;
  uploadPath: string;
  uploadCapability: string | null;
  uploadExpiresAt: string;
  idempotentReplay: boolean;
}

export const MAX_EVIDENCE_BYTES = 26_214_400;
// application/pdf joined with ES-104J (#2929): the backend routes PDFs to the
// dedicated no-network CDR worker, which rebuilds them as flattened page images.
// ES-104K (#2930): image/webp joined only AFTER the backend accepted it live —
// widening this list first would let the reporter upload, wait, and get refused.
// ES-306 (#2665) bulgusu: HEIC/HEIF geri cekildi. Backend seridi fail-closed
// kapatildi (donusturucu imaji 2020'den beri yamasiz, ayristirma
// kutuphanelerinde aktif somurulen CVE'ler). Listeyi acik birakmak
// ihbarciya 'yukle, bekle, reddedil' yasatirdi — kabulun tersi. Geri
// acilis bakimli donusturucuyle: #3335.
export const SUPPORTED_EVIDENCE_MEDIA_TYPES = ['text/plain', 'image/jpeg', 'image/png', 'image/webp', 'application/pdf'] as const;
const FIXED_EVIDENCE_UPLOAD_PATH = `${BASE}/evidence/uploads`;

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
    (error as Error & { status?: number; code?: string }).status = response.status;
    // The machine-readable code travels with the error so the UI can react to a
    // specific refusal (e.g. INTAKE_CHANNEL_INACTIVE) without matching on Turkish
    // message text that is free to change.
    (error as Error & { code?: string }).code = data?.error?.code;
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
export type ReportMode = 'ANONYMOUS' | 'CONFIDENTIAL' | 'NAMED';

export interface ReporterIdentity {
  fullName: string;
  email?: string;
  phone?: string;
  unit?: string;
  note?: string;
}

/**
 * Which reporting modes this tenant offers (ES-212).
 *
 * <p>Falls back to anonymous-only on any failure, mirroring the server's own floor: a
 * reachable form that can only take anonymous reports is a working form, while a form that
 * offers confidential and then refuses on submit has already made the reporter type out the
 * thing they were afraid to say. Never throws — the caller renders a form either way.
 */
export async function fetchIntakeOptions(): Promise<ReportMode[]> {
  try {
    const result = await request<{ modes?: string[] }>('/intake-options');
    const modes = (result.modes ?? []).filter((mode): mode is ReportMode =>
      mode === 'ANONYMOUS' || mode === 'CONFIDENTIAL' || mode === 'NAMED',
    );
    return modes.includes('ANONYMOUS') ? modes : ['ANONYMOUS', ...modes];
  } catch {
    return ['ANONYMOUS'];
  }
}

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
export async function getMailbox() {
  const result = await request<unknown>('/mailbox/messages');
  const mailbox = result as Partial<MailboxView> | null;
  if (
    !mailbox ||
    !['NEW', 'IN_REVIEW', 'CLOSED'].includes(mailbox.status ?? '') ||
    !Array.isArray(mailbox.messages) ||
    !mailbox.messages.every(validMessage)
  )
    throw new Error('Mailbox durumu ve mesajları doğrulanamadı.');
  return mailbox as MailboxView;
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

export const EVIDENCE_STATES: EvidenceState[] = [
  'DECLARED',
  'UPLOADING',
  'UPLOAD_CAPABILITY_EXPIRED',
  'QUARANTINED',
  'INTEGRITY_VERIFIED',
  'ORIGINAL_SEALED',
  'SCAN_PENDING',
  'SCANNING',
  'SANITIZING',
  'DERIVATIVE_READY',
  'AVAILABLE',
  'MALICIOUS_QUARANTINED',
  'REJECTED_INTEGRITY',
  'REJECTED_POLICY',
  'SANITIZE_FAILED',
  'EXPIRED_UNBOUND',
];

const validEvidenceStatus = (value: unknown): value is EvidenceStatus => {
  const item = value as Partial<EvidenceStatus> | null;
  return (
    !!item &&
    typeof item.attachmentId === 'string' &&
    EVIDENCE_STATES.includes(item.state as EvidenceState) &&
    typeof item.mediaType === 'string' &&
    typeof item.size === 'number' &&
    (item.failureCode === null || typeof item.failureCode === 'string') &&
    typeof item.createdAt === 'string' &&
    typeof item.updatedAt === 'string'
  );
};

export const validateEvidenceFile = (file: File) => {
  if (
    !SUPPORTED_EVIDENCE_MEDIA_TYPES.includes(
      file.type as (typeof SUPPORTED_EVIDENCE_MEDIA_TYPES)[number],
    )
  )
    throw new Error('Yalnız UTF-8 TXT, JPEG, PNG veya PDF kanıt dosyası yüklenebilir.');
  if (file.size < 1 || file.size > MAX_EVIDENCE_BYTES)
    throw new Error('Kanıt dosyası boş olamaz ve 25 MiB sınırını aşamaz.');
};

export async function evidenceSha256(file: File): Promise<string> {
  validateEvidenceFile(file);
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function declareEvidence(
  file: File,
  idempotencyKey: string,
): Promise<EvidenceDeclaration> {
  const sha256 = await evidenceSha256(file);
  const result = await request<unknown>('/mailbox/attachments', {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify({ mediaType: file.type, size: file.size, sha256 }),
  });
  const declaration = result as Partial<EvidenceDeclaration> | null;
  const hasFreshCapability =
    typeof declaration?.uploadCapability === 'string' && declaration.uploadCapability.length >= 32;
  const isCompletedReplay =
    declaration?.idempotentReplay === true &&
    declaration.uploadCapability === null &&
    declaration.state !== 'UPLOADING';
  if (
    !declaration ||
    typeof declaration.attachmentId !== 'string' ||
    !EVIDENCE_STATES.includes(declaration.state as EvidenceState) ||
    declaration.uploadPath !== FIXED_EVIDENCE_UPLOAD_PATH ||
    (!hasFreshCapability && !isCompletedReplay) ||
    typeof declaration.uploadExpiresAt !== 'string' ||
    typeof declaration.idempotentReplay !== 'boolean'
  )
    throw new Error('Kanıt yükleme yetkisi doğrulanamadı.');
  return declaration as EvidenceDeclaration;
}

export async function uploadEvidence(
  declaration: EvidenceDeclaration,
  file: File,
): Promise<EvidenceStatus> {
  if (declaration.uploadPath !== FIXED_EVIDENCE_UPLOAD_PATH)
    throw new Error('Kanıt yükleme hedefi güvenli değil.');
  if (!declaration.uploadCapability) throw new Error('Kanıt yükleme yetkisi yeniden kullanılamaz.');
  validateEvidenceFile(file);
  const response = await fetch(FIXED_EVIDENCE_UPLOAD_PATH, {
    method: 'PUT',
    credentials: 'omit',
    cache: 'no-store',
    referrerPolicy: 'no-referrer',
    headers: {
      Accept: JSON_TYPE,
      'Content-Type': 'application/octet-stream',
      'X-Etik-Upload-Capability': declaration.uploadCapability,
    },
    body: file,
  });
  const contentType = response.headers.get('content-type') ?? '';
  const data = contentType.toLowerCase().includes('json')
    ? await response.json().catch(() => null)
    : null;
  if (!response.ok) throw new Error(data?.error?.message ?? 'Kanıt dosyası karantinaya alınamadı.');
  if (!validEvidenceStatus(data) || data.attachmentId !== declaration.attachmentId)
    throw new Error('Kanıt karantina sonucu doğrulanamadı.');
  return data;
}

export async function listEvidence(): Promise<EvidenceStatus[]> {
  const result = await request<unknown>('/mailbox/attachments');
  if (!Array.isArray(result) || !result.every(validEvidenceStatus))
    throw new Error('Kanıt dosyası durumları doğrulanamadı.');
  return result;
}
