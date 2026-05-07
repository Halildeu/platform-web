import { describe, expect, it } from 'vitest';
import {
  defaultQuietHoursTimezone,
  formatQuietHours,
  parseQuietHours,
  serializeQuietHours,
  validateQuietHours,
} from '../quiet-hours';

/**
 * Faz 23.6 PR-B1 — quiet-hours helper unit tests.
 *
 * Codex thread `019e034e` iter-2 absorb: parser must surface the three
 * states (none / canonical / custom) so the form preserves
 * non-canonical payloads instead of silently dropping them.
 */

describe('parseQuietHours', () => {
  it('returns none for null / undefined / empty object', () => {
    expect(parseQuietHours(null).kind).toBe('none');
    expect(parseQuietHours(undefined).kind).toBe('none');
    expect(parseQuietHours({}).kind).toBe('none');
  });

  it('returns none for non-object payloads', () => {
    expect(parseQuietHours('22:00-07:00').kind).toBe('none');
    expect(parseQuietHours(42).kind).toBe('none');
    expect(parseQuietHours([{ start: '22:00' }]).kind).toBe('none');
  });

  it('returns canonical for a fully-shaped v1 payload', () => {
    const raw = {
      start: '22:00',
      end: '07:00',
      timezone: 'Europe/Istanbul',
      days: ['MON', 'TUE', 'WED', 'THU', 'FRI'],
    };
    const result = parseQuietHours(raw);
    expect(result.kind).toBe('canonical');
    if (result.kind !== 'canonical') return;
    expect(result.value).toEqual(raw);
  });

  it('returns custom for missing fields', () => {
    expect(parseQuietHours({ start: '22:00' }).kind).toBe('custom');
    expect(parseQuietHours({ start: '22:00', end: '07:00' }).kind).toBe('custom');
    expect(parseQuietHours({ start: '22:00', end: '07:00', timezone: 'UTC' }).kind).toBe('custom');
    // Missing days array is custom (legacy payload)
    expect(parseQuietHours({ rules: [] }).kind).toBe('custom');
  });

  it('returns custom for invalid time formats', () => {
    expect(
      parseQuietHours({
        start: '25:00', // invalid hour
        end: '07:00',
        timezone: 'UTC',
        days: ['MON'],
      }).kind,
    ).toBe('custom');
    expect(
      parseQuietHours({
        start: '22:00',
        end: '7:00', // missing leading zero
        timezone: 'UTC',
        days: ['MON'],
      }).kind,
    ).toBe('custom');
  });

  it('returns custom for invalid day names', () => {
    expect(
      parseQuietHours({
        start: '22:00',
        end: '07:00',
        timezone: 'UTC',
        days: ['MONDAY'],
      }).kind,
    ).toBe('custom');
  });

  it('returns custom for empty days array', () => {
    expect(
      parseQuietHours({
        start: '22:00',
        end: '07:00',
        timezone: 'UTC',
        days: [],
      }).kind,
    ).toBe('custom');
  });

  it('orders days in canonical week order', () => {
    const result = parseQuietHours({
      start: '22:00',
      end: '07:00',
      timezone: 'UTC',
      days: ['SUN', 'MON', 'WED'],
    });
    if (result.kind !== 'canonical') throw new Error('expected canonical');
    expect(result.value.days).toEqual(['MON', 'WED', 'SUN']);
  });
});

describe('serializeQuietHours', () => {
  it('returns null when the model is null (clear)', () => {
    expect(serializeQuietHours(null)).toBeNull();
  });

  it('mirrors the canonical wire shape and orders days', () => {
    const wire = serializeQuietHours({
      start: '22:00',
      end: '07:00',
      timezone: 'Europe/Istanbul',
      days: ['SUN', 'MON', 'WED'],
    });
    expect(wire).toEqual({
      start: '22:00',
      end: '07:00',
      timezone: 'Europe/Istanbul',
      days: ['MON', 'WED', 'SUN'],
    });
  });

  it('round-trips through parseQuietHours for canonical models', () => {
    const model = {
      start: '08:00',
      end: '17:00',
      timezone: 'UTC',
      days: ['MON', 'FRI'] as ReturnType<typeof serializeQuietHours> extends infer T ? T : never,
    };
    const wire = serializeQuietHours({
      start: '08:00',
      end: '17:00',
      timezone: 'UTC',
      days: ['MON', 'FRI'],
    });
    const parsed = parseQuietHours(wire);
    expect(parsed.kind).toBe('canonical');
    if (parsed.kind === 'canonical') {
      expect(parsed.value.start).toBe('08:00');
      expect(parsed.value.end).toBe('17:00');
      expect(parsed.value.days).toEqual(['MON', 'FRI']);
    }
    void model;
  });
});

describe('validateQuietHours', () => {
  it('accepts a fully valid model', () => {
    expect(
      validateQuietHours({
        start: '22:00',
        end: '07:00',
        timezone: 'Europe/Istanbul',
        days: ['MON', 'TUE'],
      }),
    ).toBeNull();
  });

  it('rejects start == end (use enabled=false for 24h mute)', () => {
    expect(
      validateQuietHours({
        start: '08:00',
        end: '08:00',
        timezone: 'UTC',
        days: ['MON'],
      }),
    ).toMatch(/24 saatlik/);
  });

  it('accepts overnight windows (start > end)', () => {
    expect(
      validateQuietHours({
        start: '22:00',
        end: '07:00',
        timezone: 'UTC',
        days: ['MON'],
      }),
    ).toBeNull();
  });

  it('rejects empty days', () => {
    expect(
      validateQuietHours({
        start: '08:00',
        end: '17:00',
        timezone: 'UTC',
        days: [],
      }),
    ).toMatch(/gün seçin/);
  });

  it('rejects malformed times', () => {
    expect(
      validateQuietHours({
        start: '24:00',
        end: '07:00',
        timezone: 'UTC',
        days: ['MON'],
      }),
    ).toMatch(/Başlangıç/);
    expect(
      validateQuietHours({
        start: '08:00',
        end: '7:00',
        timezone: 'UTC',
        days: ['MON'],
      }),
    ).toMatch(/Bitiş/);
  });
});

describe('formatQuietHours', () => {
  it('returns em-dash for none / null', () => {
    expect(formatQuietHours(null)).toBe('—');
    expect(formatQuietHours({})).toBe('—');
  });

  it('renders a contiguous weekday range (Pzt-Cum)', () => {
    expect(
      formatQuietHours({
        start: '22:00',
        end: '07:00',
        timezone: 'UTC',
        days: ['MON', 'TUE', 'WED', 'THU', 'FRI'],
      }),
    ).toBe('22:00-07:00 (Pzt-Cum)');
  });

  it('renders Her gün for the full week', () => {
    expect(
      formatQuietHours({
        start: '22:00',
        end: '07:00',
        timezone: 'UTC',
        days: ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'],
      }),
    ).toBe('22:00-07:00 (Her gün)');
  });

  it('renders disjoint days as a comma-separated list', () => {
    expect(
      formatQuietHours({
        start: '08:00',
        end: '17:00',
        timezone: 'UTC',
        days: ['MON', 'WED', 'FRI'],
      }),
    ).toBe('08:00-17:00 (Pzt, Çar, Cum)');
  });

  it('renders custom payloads as Özel sessiz saatler', () => {
    expect(formatQuietHours({ rules: [{ from: 22 }] })).toBe('Özel sessiz saatler');
    expect(formatQuietHours({ start: '22:00' })).toBe('Özel sessiz saatler');
  });
});

describe('defaultQuietHoursTimezone', () => {
  it('returns a non-empty IANA timezone identifier', () => {
    const tz = defaultQuietHoursTimezone();
    expect(typeof tz).toBe('string');
    expect(tz.length).toBeGreaterThan(0);
  });
});
