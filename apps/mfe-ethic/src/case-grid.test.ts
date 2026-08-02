import { describe, expect, test } from 'vitest';
import {
  ackSlaFor,
  buildCaseColumnDefs,
  buildCaseRows,
  CASE_GRID_ID,
  CASE_GRID_SCHEMA_VERSION,
  computeKpis,
  feedbackSlaFor,
  modeLabel,
  ownerFor,
  type CaseGridSource,
} from './case-grid';
import { EMPTY_CASE_FILTER, filterCases } from './case-lifecycle';

// A fixed clock: every deadline below is arithmetic against this instant, so the
// suite means the same thing on any machine on any day.
const NOW = Date.parse('2026-08-01T12:00:00Z');

const daysBefore = (days: number) => new Date(NOW - days * 86_400_000).toISOString();

const base: CaseGridSource = {
  id: '11111111-1111-1111-1111-111111111111',
  status: 'NEW',
  legacyAssignmentLabel: null,
  createdAt: daysBefore(1),
  acknowledgedAt: null,
  subject: 'Sentetik bildirim',
  category: 'WORKPLACE_CONDUCT',
  mode: 'ANONYMOUS',
  participantCount: 0,
};

describe('computeKpis', () => {
  test('açık vaka CLOSED dışındaki her durumu sayar', () => {
    const items = [
      { ...base, status: 'NEW' },
      { ...base, status: 'INVESTIGATING' },
      { ...base, status: 'CLOSED' },
    ];
    expect(computeKpis(items, NOW).open).toBe(2);
  });

  test('sahipsiz yalnız katılımcısı olmayan vakaları sayar', () => {
    const items = [
      { ...base, participantCount: 0 },
      { ...base, participantCount: 2 },
    ];
    expect(computeKpis(items, NOW).unattended).toBe(1);
  });

  test('teyit gecikmesi: yedi gün geçmiş ve teyitsiz vaka sayılır, teyitli sayılmaz', () => {
    const items = [
      { ...base, createdAt: daysBefore(9), acknowledgedAt: null },
      { ...base, createdAt: daysBefore(9), acknowledgedAt: daysBefore(8) },
      { ...base, createdAt: daysBefore(1), acknowledgedAt: null },
    ];
    expect(computeKpis(items, NOW).ackOverdue).toBe(1);
  });

  test('geri bildirim gecikmesi: teyitten üç ay geçmiş açık vaka sayılır, kapalı sayılmaz', () => {
    const overdueOpen = { ...base, acknowledgedAt: '2026-04-20T12:00:00Z' };
    const overdueButClosed = { ...overdueOpen, status: 'CLOSED' };
    const withinWindow = { ...base, acknowledgedAt: '2026-07-20T12:00:00Z' };
    expect(
      computeKpis([overdueOpen, overdueButClosed, withinWindow], NOW).feedbackOverdue,
    ).toBe(1);
  });

  test('hiç teyit edilmemiş eski vaka iki saati birden geciktirir', () => {
    // Filed 2026-01-01: acknowledgement ran out 8 January, feedback (7 days + 3
    // months, the directive's own fallback) ran out 8 April.
    const stale = { ...base, createdAt: '2026-01-01T12:00:00Z', acknowledgedAt: null };
    const kpis = computeKpis([stale], NOW);
    expect(kpis.ackOverdue).toBe(1);
    expect(kpis.feedbackOverdue).toBe(1);
  });

  test('teyit alanını göndermeyen servisle konuşurken gecikme iddia edilmez', () => {
    const legacy = { ...base, createdAt: daysBefore(200) } as CaseGridSource;
    delete (legacy as { acknowledgedAt?: string | null }).acknowledgedAt;
    const kpis = computeKpis([legacy], NOW);
    expect(kpis.ackOverdue).toBe(0);
    expect(kpis.feedbackOverdue).toBe(0);
  });
});

describe('SLA hücreleri', () => {
  test('teyit: süresi geçen vaka gecikmeyi gün olarak söyler ve danger tonu taşır', () => {
    const cell = ackSlaFor({ createdAt: daysBefore(9), acknowledgedAt: null }, NOW);
    expect(cell.text).toBe('2 gün gecikti');
    expect(cell.tone).toBe('danger');
    expect(cell.order).toBeLessThan(0);
  });

  test('teyit: bekleyen vaka kalan günü söyler', () => {
    expect(ackSlaFor({ createdAt: daysBefore(0), acknowledgedAt: null }, NOW)).toMatchObject({
      text: '7 gün kaldı',
      tone: 'none',
    });
    expect(ackSlaFor({ createdAt: daysBefore(6), acknowledgedAt: null }, NOW)).toMatchObject({
      text: 'Son gün',
      tone: 'warn',
    });
  });

  test('teyit: verilmişse bunu söyler, geçmişse okunamadığını söyler', () => {
    expect(
      ackSlaFor({ createdAt: daysBefore(9), acknowledgedAt: daysBefore(8) }, NOW),
    ).toMatchObject({ text: 'Verildi', tone: 'ok' });
    const legacy = { createdAt: daysBefore(9) } as { createdAt: string };
    expect(ackSlaFor(legacy, NOW)).toMatchObject({ text: 'Okunamadı', tone: 'muted' });
  });

  test('geri bildirim: kapalı vaka kapanışta verildi der, açık ve geç vaka gecikmeyi sayar', () => {
    expect(
      feedbackSlaFor(
        { createdAt: daysBefore(120), acknowledgedAt: daysBefore(119), status: 'CLOSED' },
        NOW,
      ),
    ).toMatchObject({ text: 'Kapanışta verildi', tone: 'ok' });
    const late = feedbackSlaFor(
      { createdAt: '2026-04-15T12:00:00Z', acknowledgedAt: '2026-04-20T12:00:00Z', status: 'NEW' },
      NOW,
    );
    expect(late.text).toBe('12 gün gecikti');
    expect(late.tone).toBe('danger');
  });

  test('geri bildirim: pencere içindeki vaka kalan günü söyler', () => {
    const pending = feedbackSlaFor(
      { createdAt: daysBefore(20), acknowledgedAt: daysBefore(12), status: 'ASSESSING' },
      NOW,
    );
    expect(pending.text).toMatch(/gün kaldı$/);
    expect(pending.tone).toBe('none');
    expect(pending.order).toBeGreaterThan(0);
  });
});

describe('buildCaseRows', () => {
  test('sahip türetimi: katılımcı sayısı > 0 sayar, eski etiket varsa okunur, hiçbiri yoksa Sahipsiz', () => {
    expect(ownerFor({ legacyAssignmentLabel: null, participantCount: 0 })).toEqual({
      owner: 'Sahipsiz',
      unattended: true,
    });
    expect(ownerFor({ legacyAssignmentLabel: 'etik-ekibi', participantCount: 0 })).toEqual({
      owner: 'etik-ekibi',
      unattended: true,
    });
    expect(ownerFor({ legacyAssignmentLabel: 'etik-ekibi', participantCount: 2 })).toEqual({
      owner: '2 katılımcı',
      unattended: false,
    });
  });

  test('konusu okunamayan vaka satırdan düşmez, okunamadığını söyler', () => {
    const [row] = buildCaseRows([{ ...base, subject: null }], NOW);
    expect(row.subject).toBe('Konu okunamadı');
    expect(row.subjectMissing).toBe(true);
  });

  test('mod etiketi intake formunun kelimeleridir; bilinmeyen değer olduğu gibi görünür', () => {
    expect(modeLabel('ANONYMOUS')).toBe('Anonim');
    expect(modeLabel('CONFIDENTIAL')).toBe('Gizli');
    expect(modeLabel('NAMED')).toBe('İsimli');
    expect(modeLabel(null)).toBe('—');
    expect(modeLabel('FUTURE_MODE')).toBe('FUTURE_MODE');
  });

  test('satır: kısa kimlik, durum etiketi, kategori etiketi ve SLA metinleri türetilir', () => {
    const [row] = buildCaseRows(
      [{ ...base, createdAt: daysBefore(9), status: 'INVESTIGATING' }],
      NOW,
    );
    expect(row.shortId).toBe('#11111111');
    expect(row.statusText).toBe('Soruşturmada');
    expect(row.category).toBe('İş yeri davranışı');
    expect(row.mode).toBe('Anonim');
    expect(row.owner).toBe('Sahipsiz');
    expect(row.ackSlaText).toBe('2 gün gecikti');
    expect(row.feedbackSlaText).toMatch(/gün kaldı$/);
    expect(row.createdAtOrder).toBe(Date.parse(row.createdAt));
  });
});

describe('sütunlar', () => {
  test('sütun anahtarları satır alanlarıyla birebir eşleşir', () => {
    const fields = buildCaseColumnDefs().map((column) => column.field);
    expect(fields).toEqual([
      'subject',
      'statusText',
      'category',
      'mode',
      'owner',
      'ackSlaText',
      'feedbackSlaText',
      'createdAt',
    ]);
    const [row] = buildCaseRows([base], NOW);
    for (const field of fields) {
      expect(row).toHaveProperty(String(field));
    }
  });

  test('yalnız Konu sütunu esner — serbest metin tek bir hücrede yaşar', () => {
    const columns = buildCaseColumnDefs();
    const flexed = columns.filter((column) => column.flex !== undefined);
    expect(flexed).toHaveLength(1);
    expect(flexed[0]?.field).toBe('subject');
  });

  test('grid kimliği ve şema sürümü sabittir', () => {
    expect(CASE_GRID_ID).toBe('ethics-cases');
    expect(CASE_GRID_SCHEMA_VERSION).toBe(1);
  });
});

describe('filter genişletmesi (KPI kartlarının uyguladığı süzgeçler)', () => {
  test('openOnly kapalı vakayı düşürür; feedbackOverdue yalnız geciken açık vakayı bırakır; mode eşleşir', () => {
    const open = { ...base, id: '22222222-2222-2222-2222-222222222222' };
    const closed = { ...base, id: '33333333-3333-3333-3333-333333333333', status: 'CLOSED' };
    const feedbackLate = {
      ...base,
      id: '44444444-4444-4444-4444-444444444444',
      acknowledgedAt: '2026-04-20T12:00:00Z',
      mode: 'CONFIDENTIAL',
    };
    const all = [open, closed, feedbackLate];

    expect(filterCases(all, { ...EMPTY_CASE_FILTER, openOnly: true }, NOW)).toEqual([
      open,
      feedbackLate,
    ]);
    expect(filterCases(all, { ...EMPTY_CASE_FILTER, feedbackOverdue: true }, NOW)).toEqual([
      feedbackLate,
    ]);
    expect(filterCases(all, { ...EMPTY_CASE_FILTER, mode: 'CONFIDENTIAL' }, NOW)).toEqual([
      feedbackLate,
    ]);
  });
});
