import { describe, expect, test } from 'vitest';
import { timelineDetailLabel, timelineEventLabel, timelineMoment } from './case-timeline';

describe('vaka geçmişi sözlüğü', () => {
  // Bu ekran servisten ayrı sürümlenir; servis bu build'in bilmediği bir olay yazdığında
  // olayın kaybolması, olan bir şeyi olmamış göstermek olur.
  test('tanımadığı olay ham adıyla da olsa görünür', () => {
    expect(timelineEventLabel('ethics.case.sealed')).toBe('ethics.case.sealed');
  });

  test('bilinen olaylar okunabilir Türkçe döner', () => {
    expect(timelineEventLabel('ethics.report.created')).toBe('İhbar alındı');
    expect(timelineEventLabel('ethics.case.acknowledged')).toBe('Alındı teyidi gönderildi');
  });

  // Sunucu üç olay için tek bir ek alan taşıyor ve üçü farklı türden: durum kodu,
  // katılım rolü ve elle yazılmış bir gerekçe. İlk ikisi çevrilir, üçüncüsü yazıldığı gibi.
  test('durum kodu ve rol çevrilir, gerekçe olduğu gibi kalır', () => {
    expect(timelineDetailLabel('ethics.case.updated', 'CLOSED')).not.toBe('CLOSED');
    expect(timelineDetailLabel('ethics.case.participant.added', 'handler')).not.toBe('handler');
    expect(timelineDetailLabel('ethics.case.reopened', 'Yeni bilgi geldi')).toBe(
      'Yeni bilgi geldi',
    );
  });

  test('ek alan yoksa satır ek alan üretmez', () => {
    expect(timelineDetailLabel('ethics.case.updated', null)).toBeNull();
    expect(timelineDetailLabel('ethics.case.updated', '   ')).toBeNull();
  });

  // Kesin zaman şart: "yedi günlük teyit tutturuldu mu" sorusunu göreli zaman cevaplayamaz.
  test('zaman mutlak yazılır', () => {
    const rendered = timelineMoment('2026-07-18T09:05:00Z');
    expect(rendered).toContain('2026');
    expect(rendered).toMatch(/\d{2}:\d{2}/);
  });

  // Çözümlenemeyen bir damga "Invalid Date" değil, sunucunun gönderdiği değerdir —
  // en azından neyin geldiğinin kanıtı olur.
  test('okunamayan zaman damgası ham haliyle gösterilir', () => {
    expect(timelineMoment('bozuk-damga')).toBe('bozuk-damga');
  });
});
