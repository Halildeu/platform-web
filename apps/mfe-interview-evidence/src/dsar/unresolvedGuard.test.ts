import { describe, expect, test } from 'vitest';
import { createSessionUnresolvedGuard } from './unresolvedGuard';
import type { UnresolvedErasureRecordV1 } from './unresolvedGuard';

const REC: UnresolvedErasureRecordV1 = {
  version: 1,
  dsarKey: 'dsar-1',
  scopeFingerprint: 'abcd1234',
  startedAt: '2026-07-12T00:00:00.000Z',
};

function fakeStorage(overrides: Partial<Storage> = {}): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: () => null,
    get length() {
      return map.size;
    },
    ...overrides,
  } as Storage;
}

describe('unresolvedGuard — fail-closed yıkıcı-işlem işareti', () => {
  test('arm → read unresolved; clear → none; kayıtta subjectRef/scope YOK', () => {
    const g = createSessionUnresolvedGuard(fakeStorage());
    expect(g.read('iv-1')).toEqual({ kind: 'none' });
    expect(g.arm('iv-1', REC)).toBe(true);
    const read = g.read('iv-1');
    expect(read).toEqual({ kind: 'unresolved', record: REC });
    // Yalnız opak alanlar saklanır (V1 şekli):
    expect(Object.keys((read as { record: object }).record).sort()).toEqual([
      'dsarKey',
      'scopeFingerprint',
      'startedAt',
      'version',
    ]);
    g.clear('iv-1');
    expect(g.read('iv-1')).toEqual({ kind: 'none' });
  });

  test('interview izolasyonu: iv-1 işareti iv-2 okumasını etkilemez', () => {
    const g = createSessionUnresolvedGuard(fakeStorage());
    g.arm('iv-1', REC);
    expect(g.read('iv-2')).toEqual({ kind: 'none' });
  });

  test('setItem throw ederse arm=false (POST gönderilmemeli)', () => {
    const g = createSessionUnresolvedGuard(
      fakeStorage({
        setItem: () => {
          throw new Error('quota');
        },
      }),
    );
    expect(g.arm('iv-1', REC)).toBe(false);
  });

  test('sessizce düşen yazım read-back ile yakalanır (arm=false)', () => {
    const g = createSessionUnresolvedGuard(
      fakeStorage({
        setItem: () => {
          /* yazmıyor */
        },
      }),
    );
    expect(g.arm('iv-1', REC)).toBe(false);
  });

  test.each([
    ['geçersiz JSON', '{bozuk'],
    ['eksik dsarKey', JSON.stringify({ version: 1, scopeFingerprint: 'f', startedAt: 't' })],
    ['boş dsarKey', JSON.stringify({ ...REC, dsarKey: '  ' })],
    ['yanlış versiyon', JSON.stringify({ ...REC, version: 2 })],
    ['non-string alan', JSON.stringify({ ...REC, scopeFingerprint: 7 })],
  ])('malformed kayıt (%s) → kind=malformed (sessizce yok sayılmaz)', (_n, raw) => {
    const s = fakeStorage();
    s.setItem('ats.dsar.unresolved:iv-1', raw);
    const g = createSessionUnresolvedGuard(s);
    expect(g.read('iv-1')).toEqual({ kind: 'malformed' });
  });
});
