import { beforeEach, describe, expect, test } from 'vitest';
import { executeErasure, receiveDsar, resetDemoDsar } from './demoDsarEngine';
import type { ErasureScope } from './types';

beforeEach(() => resetDemoDsar());

const scope = (transcriptKeys: string[]): ErasureScope => ({
  transcriptKeys,
  citationKeys: [],
  exportArtifactKeys: [],
  reviewCaseKeys: [],
  tombstoneTargetEvidenceIds: [],
});

describe('demoDsarEngine (F10 akış-iskeleti)', () => {
  test('intake-first: kayıtlı DSAR olmadan silme YAPISAL RED', () => {
    expect(() => executeErasure('dsar-yok', scope(['tr-1']))).toThrow(/intake-first/);
  });

  test('intake alanları zorunlu (opak ref + gerekçe kodu)', () => {
    expect(() => receiveDsar('  ', 'r-1')).toThrow(/referansı zorunlu/);
    expect(() => receiveDsar('sub-1', '')).toThrow(/Gerekçe kodu zorunlu/);
  });

  test('dsarKey deterministik + silme makbuzu dürüst dar kapsam (tombstone=0)', () => {
    const k1 = receiveDsar('sub-1', 'r-kvkk-m11');
    const k2 = receiveDsar('sub-1', 'r-kvkk-m11');
    expect(k1).toBe(k2);
    const r = executeErasure(k1, scope(['tr-1']));
    expect(r).toEqual({
      dsarKey: k1,
      tombstoneCount: 0,
      deletedContentCount: 1,
      caseTransitioned: false,
    });
  });

  test('idempotent replay: aynı dsarKey ikinci silme AYNI makbuzu döndürür', () => {
    const k = receiveDsar('sub-1', 'r-1');
    const r1 = executeErasure(k, scope(['tr-1']));
    const r2 = executeErasure(k, scope(['tr-1', 'tr-2'])); // scope farklı olsa bile replay
    expect(r2).toEqual(r1);
  });

  test('boş kapsam reddedilir', () => {
    const k = receiveDsar('sub-1', 'r-1');
    expect(() => executeErasure(k, scope([]))).toThrow(/kapsamı boş/);
  });
});
