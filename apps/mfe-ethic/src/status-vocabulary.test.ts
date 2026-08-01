import { describe, expect, it } from 'vitest';
import {
  acknowledgementCountdown,
  sortForQueue,
  CASE_STATUSES,
  isHistoricalStatus,
  KNOWN_STATUS_VALUES,
  statusLabel,
} from './case-lifecycle';

/**
 * Faz 35 — the audit trail outlives the vocabulary (#992).
 *
 * <p>The status vocabulary changed at some point and the ledger is WORM. `IN_REVIEW` was
 * written 45 times between 20 and 26 July and never again; no live case carries it. That
 * is not a rare edge — it is more than half of every status entry in the trail, so a
 * handler reading a case's history saw a raw code on most of the lines that mattered.
 *
 * <p>The fixture below is version-controlled on purpose. A test that queried the live
 * ledger would be non-deterministic and would fail on data rather than on code; the drift
 * between this list and what production actually holds belongs to a separate read-only
 * check, not to CI. What CI owns is the promise that every value we *know* can appear has
 * something to show for it.
 */

/** Every status value known to have been written to the ledger, current or retired. */
const VALUES_THE_LEDGER_CAN_HOLD = ['NEW', 'ASSESSING', 'INVESTIGATING', 'CLOSED', 'IN_REVIEW'];

describe('vaka durumu sözlüğü', () => {
  it('defterin taşıyabildiği her değerin bir karşılığı var', () => {
    for (const value of VALUES_THE_LEDGER_CAN_HOLD) {
      expect(statusLabel(value), `${value} için karşılık yok, ham kod dönüyor`).not.toBe(value);
    }
  });

  // Aynı liste iki yerde tutulmasın: modül ne bildiğini kendisi söylüyor.
  it('bilinen değerler listesi sözlükle aynı', () => {
    expect([...KNOWN_STATUS_VALUES].sort()).toEqual([...VALUES_THE_LEDGER_CAN_HOLD].sort());
  });

  /**
   * Emekli bir durum okunabilir olmalı ama seçilebilir olmamalı. Tarihsel bir değeri
   * bugünün listesine koymak, kapanmış bir sözlüğü yeniden açmak olur.
   */
  it('tarihsel durumlar bugün seçilebilir listede yok', () => {
    for (const value of VALUES_THE_LEDGER_CAN_HOLD) {
      if (!isHistoricalStatus(value)) continue;
      expect(CASE_STATUSES, `${value} tarihsel ama seçilebilir listede`).not.toContain(value);
    }
  });

  /**
   * Karşılık, değerin ne olduğunu saklamamalı. `IN_REVIEW`'ü `ASSESSING`'in eski adı say­mak
   * cazip olurdu — ama bunu söyleyen bir dönem sözlüğü ya da göç notu yok. Denetim kaydı,
   * yazıldığı anlamıyla gösterilir; geçmişi bugünün modeliyle yeniden yorumlamak, tam da
   * değiştirilemez defterin engellemek için var olduğu şey.
   */
  it('tarihsel durum, bugünkü bir durumun adıyla gösterilmez', () => {
    const historical = VALUES_THE_LEDGER_CAN_HOLD.filter(isHistoricalStatus);
    expect(historical.length).toBeGreaterThan(0);
    const currentLabels = CASE_STATUSES.map(statusLabel);
    for (const value of historical) {
      expect(currentLabels, `${value} bugünkü bir durumun adını taşıyor`).not.toContain(
        statusLabel(value),
      );
      expect(statusLabel(value)).toContain('tarihsel');
    }
  });

  // Tanınmayan bir değer gizlenmez. Servis bu build'in bilmediği bir durum yazabilir ve
  // onu düşüren bir geçmiş, olan bir şeyi olmamış gösterir.
  it('tanınmayan değer ham adıyla görünür', () => {
    expect(statusLabel('ETIK_SPEAK_GELECEK_DURUM')).toBe('ETIK_SPEAK_GELECEK_DURUM');
  });
});

describe('iş kuyruğu sırası (ES-2 — liste arşiv değil kuyruktur)', () => {
  // Frozen clock: 2026-08-01T12:00Z. Day arithmetic must not depend on when CI runs.
  const now = Date.parse('2026-08-01T12:00:00Z');
  const day = 24 * 60 * 60 * 1000;
  const caseAt = (
    createdDaysAgo: number,
    overrides: Partial<{
      acknowledgedAt: string | null;
      participantCount: number;
      updatedAt: string;
    }> = {},
  ) => ({
    createdAt: new Date(now - createdDaysAgo * day).toISOString(),
    acknowledgedAt: null as string | null,
    participantCount: 1,
    updatedAt: new Date(now - day).toISOString(),
    ...overrides,
  });

  it('süresi geçmiş teyit her şeyin önüne geçer; son güne yaklaşan onu izler', () => {
    const acknowledged = caseAt(1, {
      acknowledgedAt: new Date(now - day / 2).toISOString(),
      updatedAt: new Date(now).toISOString(),
    });
    const nearDeadline = caseAt(6);
    const fresh = caseAt(1);
    const overdue = caseAt(9);
    const sorted = sortForQueue([acknowledged, nearDeadline, fresh, overdue], now);
    expect(sorted[0]).toBe(overdue);
    expect(sorted[1]).toBe(nearDeadline);
    expect(sorted[2]).toBe(fresh);
    expect(sorted[3]).toBe(acknowledged);
  });

  it('sahipsiz vaka, teyidi verilmiş güncel vakanın önünde durur', () => {
    const unattended = caseAt(2, {
      acknowledgedAt: new Date(now - day).toISOString(),
      participantCount: 0,
    });
    const attended = caseAt(2, {
      acknowledgedAt: new Date(now - day).toISOString(),
      updatedAt: new Date(now).toISOString(),
    });
    expect(sortForQueue([attended, unattended], now)[0]).toBe(unattended);
  });

  it('bilinmeyen teyit durumu aciliyet ÇIĞLIĞI atamaz', () => {
    // A frontend deployed ahead of the service must not scream urgency it cannot
    // substantiate: absent acknowledgedAt sorts as ordinary, never as overdue.
    const unknown = { ...caseAt(9), acknowledgedAt: undefined } as never;
    const overdue = caseAt(9);
    expect(sortForQueue([unknown, overdue], now)[0]).toBe(overdue);
  });

  it('geri sayım: bugün-son-gün acil; teyit verilmişse ve süre geçmişse çip yok', () => {
    expect(acknowledgementCountdown(caseAt(6), now)).toEqual({
      text: 'Teyit için son gün',
      urgent: true,
    });
    expect(acknowledgementCountdown(caseAt(2), now)).toEqual({
      text: 'Teyit: 5 gün kaldı',
      urgent: false,
    });
    expect(
      acknowledgementCountdown(
        caseAt(2, { acknowledgedAt: new Date(now - day).toISOString() }),
        now,
      ),
    ).toBeNull();
    // Overdue already has its own, louder chip — two chips saying it twice is noise.
    expect(acknowledgementCountdown(caseAt(9), now)).toBeNull();
  });
});
