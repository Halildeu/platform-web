import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { formatCalendarDaySafe, formatDateSafe, INVALID_DATE_TEXT } from './format-date';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const UI_DIR = path.join(HERE, 'ui');
/**
 * Aday portali paylasilan yardimciya BAGLANMAMISTI: #1193 yalniz İK yuzeylerini
 * tasidi, aday tarafinda ayni govdenin kopyasi kaldi. Muhafiz onu da kapsar, yoksa
 * geçersiz-tarih hatasi bir gun yalniz aday ekraninda yeniden cikar.
 */
const CANDIDATE_SURFACES = [
  path.join(HERE, '..', '..', 'pages', 'candidate', 'CandidatePortalPage.tsx'),
];
const RECRUITER_SURFACES = [
  'RecruiterApplicationReviewPanel.tsx',
  'RecruiterInterviewPanel.tsx',
  'RecruiterJobsPanel.tsx',
  'RecruiterOfferPanel.tsx',
  'RecruiterWorkspacePage.tsx',
];

describe('formatDateSafe (#1193 review)', () => {
  it('formats a valid timestamp with and without the time', () => {
    expect(formatDateSafe('2026-09-22T13:59:00Z', { timeZone: 'UTC' })).toMatch(
      /^22 Eyl 2026 13:59$/,
    );
    expect(formatDateSafe('2026-09-22T13:59:00Z', { withTime: false, timeZone: 'UTC' })).toMatch(
      /^22 Eyl 2026$/,
    );
  });

  it('honours the interview time zone', () => {
    expect(formatDateSafe('2026-09-22T13:59:00Z', { timeZone: 'Europe/Istanbul' })).toMatch(
      /16:59$/,
    );
  });

  it.each(['abc', '', 'not-a-date', '2026-13-45'])(
    'writes "—" instead of throwing for an invalid value: %j',
    (value) => {
      expect(() => formatDateSafe(value)).not.toThrow();
      expect(formatDateSafe(value)).toBe(INVALID_DATE_TEXT);
    },
  );

  it('treats a missing value the same way', () => {
    expect(formatDateSafe(null)).toBe(INVALID_DATE_TEXT);
    expect(formatDateSafe(undefined)).toBe(INVALID_DATE_TEXT);
  });
});

describe('formatCalendarDaySafe (aday portalinden tasindi)', () => {
  it('writes a YYYY-MM-DD day without a clock and without shifting the time zone', () => {
    // Saat dilimine cevrilirse 1 Ocak, UTC+3'te 31 Aralik gorunebilir.
    expect(formatCalendarDaySafe('2026-01-01')).toMatch(/1 Oca 2026/);
    expect(formatCalendarDaySafe('2026-01-01')).not.toMatch(/\d{2}:\d{2}/);
  });

  it('falls back to the full formatter when the value is not a calendar day', () => {
    expect(formatCalendarDaySafe('2026-09-22T13:59:00Z')).toBe(
      formatDateSafe('2026-09-22T13:59:00Z'),
    );
  });

  it('writes the placeholder for an invalid or missing day', () => {
    for (const value of ['abc', '2026-13-45', '', null, undefined]) {
      expect(formatCalendarDaySafe(value)).toBe(INVALID_DATE_TEXT);
    }
  });
});

describe('ATS surfaces format dates through the shared helper only', () => {
  // Yerel kopyalar kalırsa geçersiz tarih hatası bir gün yeniden çıkar (#1193 incelemesi).
  it.each(RECRUITER_SURFACES)('%s has no local date formatter', (file) => {
    const source = readFileSync(path.join(UI_DIR, file), 'utf8');
    expect(source).toMatch(/from '.*format-date'/);
    expect(source).not.toMatch(/new Intl\.DateTimeFormat/);
  });

  it.each(CANDIDATE_SURFACES)('%s has no local date formatter', (file) => {
    const source = readFileSync(file, 'utf8');
    expect(source).toMatch(/from '.*format-date'/);
    expect(source).not.toMatch(/new Intl\.DateTimeFormat/);
  });

  it('covers every recruiter surface in the folder', () => {
    const surfaces = readdirSync(UI_DIR).filter(
      (file) => /^Recruiter.*\.tsx$/.test(file) && !file.endsWith('.test.tsx'),
    );
    expect(surfaces.sort()).toEqual([...RECRUITER_SURFACES].sort());
  });
});
