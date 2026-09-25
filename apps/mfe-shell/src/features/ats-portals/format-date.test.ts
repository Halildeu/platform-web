import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { formatDateSafe, INVALID_DATE_TEXT } from './format-date';

const UI_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'ui');
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

describe('recruiter surfaces format dates through the shared helper only', () => {
  // Yerel kopyalar kalırsa geçersiz tarih hatası bir gün yeniden çıkar (#1193 incelemesi).
  it.each(RECRUITER_SURFACES)('%s has no local date formatter', (file) => {
    const source = readFileSync(path.join(UI_DIR, file), 'utf8');
    expect(source).toMatch(/from '\.\.\/format-date'/);
    expect(source).not.toMatch(/new Intl\.DateTimeFormat/);
  });

  it('covers every recruiter surface in the folder', () => {
    const surfaces = readdirSync(UI_DIR).filter(
      (file) => /^Recruiter.*\.tsx$/.test(file) && !file.endsWith('.test.tsx'),
    );
    expect(surfaces.sort()).toEqual([...RECRUITER_SURFACES].sort());
  });
});
