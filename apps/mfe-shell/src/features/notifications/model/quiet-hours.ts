/**
 * Quiet-hours canonical model + helpers (Faz 23.6 PR-B1).
 *
 * <p>Backend stores quiet hours as a free-form {@code jsonb} payload
 * ({@code Map<String, Object>}) so any shape is accepted. The frontend
 * pins a canonical v1 shape so operators can edit them with a structured
 * UI; non-canonical payloads (legacy / future formats / hand-edited rows)
 * are preserved verbatim, and the editor surfaces them as "Özel sessiz
 * saatler" rather than silently overwriting (Codex thread `019e034e`
 * iter-2 absorb).
 *
 * <p>Canonical shape:
 * <pre>
 *   {
 *     "start": "22:00",
 *     "end": "07:00",
 *     "timezone": "Europe/Istanbul",
 *     "days": ["MON","TUE","WED","THU","FRI"]
 *   }
 * </pre>
 *
 * <p>{@code start > end} is valid and represents an overnight window.
 * {@code start === end} is invalid in v1; if a 24-hour mute is needed,
 * use {@code enabled: false} on the rule instead.
 */

export type QuietHoursDay = 'MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT' | 'SUN';

export interface QuietHoursV1 {
  start: string; // "HH:mm"
  end: string; // "HH:mm"
  timezone: string;
  days: QuietHoursDay[];
}

/**
 * Parse a backend quiet-hours payload into one of three explicit states:
 *
 *  - {@code none}: payload is null / undefined / empty object
 *  - {@code canonical}: payload conforms to {@link QuietHoursV1}
 *  - {@code custom}: payload is non-empty but does not match v1 (legacy
 *    or future format); the raw object is preserved for round-trip.
 *
 * Codex thread `019e034e` iter-2 absorb: the previous design returned
 * {@code QuietHoursV1 | null}, which collapsed "no quiet hours" and
 * "custom shape we can't parse" into the same value — so an editor that
 * wrote {@code null} on save would have silently dropped the legacy
 * payload. The three-way result keeps the editor honest.
 */
export type QuietHoursParseResult =
  | { kind: 'none' }
  | { kind: 'canonical'; value: QuietHoursV1 }
  | { kind: 'custom'; raw: Record<string, unknown> };

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DAY_VALUES: ReadonlySet<QuietHoursDay> = new Set([
  'MON',
  'TUE',
  'WED',
  'THU',
  'FRI',
  'SAT',
  'SUN',
]);
const DAY_ORDER: readonly QuietHoursDay[] = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
const DAY_LABELS: Record<QuietHoursDay, string> = {
  MON: 'Pzt',
  TUE: 'Sal',
  WED: 'Çar',
  THU: 'Per',
  FRI: 'Cum',
  SAT: 'Cmt',
  SUN: 'Paz',
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isQuietHoursDay = (value: unknown): value is QuietHoursDay =>
  typeof value === 'string' && DAY_VALUES.has(value as QuietHoursDay);

const CANONICAL_KEYS: ReadonlySet<string> = new Set(['start', 'end', 'timezone', 'days']);

const isCanonical = (
  raw: Record<string, unknown>,
): raw is Record<string, unknown> & QuietHoursV1 => {
  const start = raw['start'];
  const end = raw['end'];
  const timezone = raw['timezone'];
  const days = raw['days'];
  if (typeof start !== 'string' || !TIME_RE.test(start)) return false;
  if (typeof end !== 'string' || !TIME_RE.test(end)) return false;
  if (typeof timezone !== 'string' || timezone.trim().length === 0) return false;
  if (!Array.isArray(days) || days.length === 0) return false;
  if (!days.every(isQuietHoursDay)) return false;
  // Codex thread `019e034e` post-impl P2 absorb: any extra key (e.g. a
  // future {exceptions:[]} field) means we cannot safely re-serialise.
  // Classify those payloads as custom so the raw shape round-trips
  // verbatim instead of silently losing the unknown fields on save.
  for (const key of Object.keys(raw)) {
    if (!CANONICAL_KEYS.has(key)) return false;
  }
  return true;
};

export const parseQuietHours = (raw: unknown): QuietHoursParseResult => {
  if (raw === null || raw === undefined) return { kind: 'none' };
  if (!isPlainObject(raw)) return { kind: 'none' };
  if (Object.keys(raw).length === 0) return { kind: 'none' };
  if (isCanonical(raw)) {
    return {
      kind: 'canonical',
      value: {
        start: raw['start'] as string,
        end: raw['end'] as string,
        timezone: raw['timezone'] as string,
        days: orderDays(raw['days'] as QuietHoursDay[]),
      },
    };
  }
  return { kind: 'custom', raw };
};

const orderDays = (days: QuietHoursDay[]): QuietHoursDay[] => {
  const present = new Set(days);
  return DAY_ORDER.filter((day) => present.has(day));
};

/**
 * Convert a canonical model to the wire shape the backend stores. Returns
 * {@code null} when the model is null (caller wants to clear quiet
 * hours).
 */
export const serializeQuietHours = (model: QuietHoursV1 | null): Record<string, unknown> | null => {
  if (!model) return null;
  // Codex thread `019e034e` post-impl P3 absorb: trim + fallback the
  // timezone before persisting; an empty string would round-trip as
  // "Özel sessiz saatler" on the next load (canonical contract requires
  // a non-blank IANA identifier).
  const trimmedTz = model.timezone.trim();
  return {
    start: model.start,
    end: model.end,
    timezone: trimmedTz.length > 0 ? trimmedTz : defaultQuietHoursTimezone(),
    days: orderDays(model.days),
  };
};

/**
 * Validate a canonical model. Returns {@code null} when valid, otherwise
 * a Türkçe error message suitable for surfacing to the operator.
 */
export const validateQuietHours = (model: QuietHoursV1): string | null => {
  if (!TIME_RE.test(model.start)) return 'Başlangıç saati geçerli değil (örn. 22:00).';
  if (!TIME_RE.test(model.end)) return 'Bitiş saati geçerli değil (örn. 07:00).';
  if (model.start === model.end) {
    return '24 saatlik sustur için kuralın "Etkin" değerini kapatın; sessiz saatler için farklı saatler girin.';
  }
  if (!model.days || model.days.length === 0) {
    return 'En az bir gün seçin.';
  }
  if (!model.days.every(isQuietHoursDay)) {
    return 'Geçersiz gün seçimi.';
  }
  return null;
};

/**
 * Render a quiet-hours payload as a short summary for tables / badges.
 *  - {@code none} → {@code '—'}
 *  - {@code canonical} → {@code '22:00-07:00 (Pzt-Cum)'}
 *  - {@code custom} → {@code 'Özel sessiz saatler'}
 */
export const formatQuietHours = (raw: unknown): string => {
  const parsed = parseQuietHours(raw);
  if (parsed.kind === 'none') return '—';
  if (parsed.kind === 'custom') return 'Özel sessiz saatler';
  const days = parsed.value.days;
  const dayLabel = formatDayRange(days);
  return `${parsed.value.start}-${parsed.value.end} (${dayLabel})`;
};

const formatDayRange = (days: QuietHoursDay[]): string => {
  if (days.length === 0) return '—';
  if (days.length === 7) return 'Her gün';
  // Detect a contiguous range: e.g. MON,TUE,WED,THU,FRI -> "Pzt-Cum"
  const indices = days.map((day) => DAY_ORDER.indexOf(day)).sort((a, b) => a - b);
  const isContiguous = indices.every((idx, i) => i === 0 || idx === indices[i - 1] + 1);
  if (isContiguous && indices.length >= 2) {
    return `${DAY_LABELS[DAY_ORDER[indices[0]]]}-${DAY_LABELS[DAY_ORDER[indices[indices.length - 1]]]}`;
  }
  return indices.map((idx) => DAY_LABELS[DAY_ORDER[idx]]).join(', ');
};

/**
 * Best-effort default timezone for the editor — falls back to
 * {@code Europe/Istanbul} for environments where {@link Intl} is not
 * available (Node-side rendering, ancient browsers).
 */
export const defaultQuietHoursTimezone = (): string => {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz && tz.length > 0) return tz;
  } catch {
    // ignore — fall through
  }
  return 'Europe/Istanbul';
};
