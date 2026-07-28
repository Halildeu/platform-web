import { participantRoleLabel, statusLabel } from './case-lifecycle';

/**
 * Faz 35 — what the case's recorded history is called on screen.
 *
 * <p>This vocabulary lives outside the transport module on purpose: `vi.mock` automocks a
 * module's exported constants to `undefined`, so a dictionary kept next to the fetch would
 * empty itself in every test that mocks the API — and the tests would still pass, because
 * an empty dictionary falls back to raw event names that nobody asserts on.
 *
 * <p>The keys are not invented. They are the sixteen event types actually written on the
 * running cell, counted from the audit ledger. Anything not in this list still renders —
 * see {@link timelineEventLabel} — because a history that silently drops the events it
 * does not recognise is worse than one that shows an ugly name.
 */
const EVENT_LABELS: Readonly<Record<string, string>> = Object.freeze({
  'ethics.report.created': 'İhbar alındı',
  'ethics.case.acknowledged': 'Alındı teyidi gönderildi',
  'ethics.case.updated': 'Durum değişti',
  'ethics.case.reopened': 'Vaka yeniden açıldı',
  'ethics.case.participant.added': 'Davaya kişi eklendi',
  'ethics.case.recusal.declared': 'Çekilme bildirildi',
  'ethics.mailbox.message.created': 'Posta kutusuna mesaj yazıldı',
  'ethics.evidence.declared': 'Kanıt dosyası bildirildi',
  'ethics.evidence.scan_pending': 'Kanıt taraması bekliyor',
  'ethics.evidence.integrity_verified': 'Kanıt bütünlüğü doğrulandı',
  'ethics.evidence.original_sealed': 'Kanıtın aslı mühürlendi',
  'ethics.evidence.available': 'Kanıt erişime açıldı',
  'ethics.evidence.rejected': 'Kanıt reddedildi',
  'ethics.evidence.expired_unbound': 'Kanıt yükleme süresi doldu',
  'ethics.evidence.access': 'Kanıt görüntülendi',
  'ethics.evidence.access_denied': 'Kanıt erişimi reddedildi',
});

/**
 * The event's name for a human, or the raw type when this build has never heard of it.
 *
 * <p>Falling back to the raw name is the point. A handler reading an unfamiliar
 * `ethics.case.sealed` learns that something happened and can ask; a handler reading
 * nothing at all learns that nothing happened, which would be false. This screen ships
 * on its own cadence and the service will grow events it does not know yet.
 */
export const timelineEventLabel = (event: string): string => EVENT_LABELS[event] ?? event;

/**
 * The one extra field the server chose to carry, put into the reader's language.
 *
 * <p>Only three event types carry one, and each carries a different kind of thing: a
 * status code, a participation role, and — for a reopening — the sentence a handler
 * typed. The first two are enumerations this app already has words for; the third is
 * already prose and is shown as written.
 */
export function timelineDetailLabel(event: string, detail: string | null): string | null {
  if (detail === null || detail.trim() === '') return null;
  if (event === 'ethics.case.updated') return statusLabel(detail);
  if (event === 'ethics.case.participant.added') return participantRoleLabel(detail);
  return detail;
}

/**
 * When it happened, exactly.
 *
 * <p>Absolute, never "3 gün önce". This is the record someone reaches for when a case is
 * disputed — an investigator, a regulator, a court — and relative time cannot answer
 * "was the seven-day acknowledgement met". A timestamp the browser cannot parse is shown
 * as it arrived rather than as "Invalid Date": the raw value is at least evidence of what
 * the server sent.
 */
export function timelineMoment(occurredAt: string): string {
  const parsed = Date.parse(occurredAt);
  if (Number.isNaN(parsed)) return occurredAt;
  return new Date(parsed).toLocaleString('tr-TR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
