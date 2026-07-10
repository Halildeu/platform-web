import { beforeEach, describe, expect, test } from 'vitest';
import { executeErasure, receiveDsar, resetDemoDsar } from './demoDsarEngine';
import type { ErasureScope } from './types';

beforeEach(() => resetDemoDsar());

const scope = (transcriptKeys: string[], extra?: Partial<ErasureScope>): ErasureScope => ({
  transcriptKeys,
  citationKeys: [],
  exportArtifactKeys: [],
  reviewCaseKeys: [],
  tombstoneTargetEvidenceIds: [],
  ...extra,
});

describe('demoDsarEngine (F10 akış-iskeleti)', () => {
  test('intake-first: kayıtlı DSAR olmadan silme YAPISAL RED', () => {
    expect(() => executeErasure('dsar-yok', scope(['tr-1']))).toThrow(/intake-first/);
  });

  test('intake alanları zorunlu (opak ref + gerekçe kodu)', () => {
    expect(() => receiveDsar('  ', 'r-1')).toThrow(/referansı zorunlu/);
    expect(() => receiveDsar('sub-1', '')).toThrow(/Gerekçe kodu zorunlu/);
  });

  test('BLOCKER-1 (Codex): dsarKey TALEP-BAŞINA benzersiz — aynı kişi+gerekçe yeni key alır', () => {
    const k1 = receiveDsar('sub-1', 'r-kvkk-m11');
    const k2 = receiveDsar('sub-1', 'r-kvkk-m11');
    expect(k1).not.toBe(k2);
    expect(k1).toMatch(/^dsar-\d{4}$/);
    expect(k2).toMatch(/^dsar-\d{4}$/);
  });

  test('mutlu yol: dürüst dar kapsam makbuzu (tombstone=0, caseTransitioned=false)', () => {
    const k = receiveDsar('sub-1', 'r-kvkk-m11');
    expect(executeErasure(k, scope(['tr-1']))).toEqual({
      dsarKey: k,
      tombstoneCount: 0,
      deletedContentCount: 1,
      caseTransitioned: false,
    });
  });

  test('BLOCKER-2 (Codex): FULFILLED TERMİNAL — ikinci yürütme RED (replay YOK)', () => {
    const k = receiveDsar('sub-1', 'r-1');
    executeErasure(k, scope(['tr-1']));
    expect(() => executeErasure(k, scope(['tr-1']))).toThrow(/FULFILLED terminal/);
    // yeni hukuki talep = yeni key ile yeniden mümkün
    const k2 = receiveDsar('sub-1', 'r-1');
    expect(executeErasure(k2, scope(['tr-1'])).dsarKey).toBe(k2);
  });

  test('MAJOR (Codex): transkript-dışı kapsam listeleri YAPISAL RED (sahte genel destek yok)', () => {
    const k = receiveDsar('sub-1', 'r-1');
    expect(() => executeErasure(k, scope(['tr-1'], { citationKeys: ['cit-1'] }))).toThrow(
      /yalnız görüntülenen transkripti/,
    );
    expect(() => executeErasure(k, scope(['tr-1'], { reviewCaseKeys: ['case-1'] }))).toThrow(
      /yalnız görüntülenen transkripti/,
    );
    expect(() =>
      executeErasure(k, scope(['tr-1'], { tombstoneTargetEvidenceIds: ['ev-1'] })),
    ).toThrow(/yalnız görüntülenen transkripti/);
    // reddedilen denemeler durumu FULFILLED yapmadı — geçerli kapsamla hâlâ yürütülebilir
    expect(executeErasure(k, scope(['tr-1'])).deletedContentCount).toBe(1);
  });

  test('boş transkript kapsamı reddedilir', () => {
    const k = receiveDsar('sub-1', 'r-1');
    expect(() => executeErasure(k, scope([]))).toThrow(/kapsamı boş/);
  });
});
