import { describe, expect, test } from 'vitest';
import {
  canonicalizeScope,
  parseOpaqueRefs,
  scopeItemCount,
  stableScopeFingerprint,
} from './opaqueRefs';

const scope = (over: Partial<Parameters<typeof canonicalizeScope>[0]> = {}) =>
  canonicalizeScope({
    transcriptKeys: [],
    citationKeys: [],
    exportArtifactKeys: [],
    reviewCaseKeys: [],
    tombstoneTargetEvidenceIds: [],
    ...over,
  });

describe('parseOpaqueRefs — newline-per-ref (virgül delimiter DEĞİL)', () => {
  test('satır başına referans; trim + boş-satır filtre + dedupe', () => {
    expect(parseOpaqueRefs('  a \n\n b\r\n a \n')).toEqual(['a', 'b']);
  });

  test('virgül içeren opak anahtar TEK değer olarak korunur', () => {
    expect(parseOpaqueRefs('citation,version,2')).toEqual(['citation,version,2']);
  });

  test('case korunur; trim dışında normalizasyon yok', () => {
    expect(parseOpaqueRefs('Key-A\nkey-a')).toEqual(['Key-A', 'key-a']);
  });

  test('boş/whitespace girdi → boş liste (null eleman yapısal olarak imkânsız)', () => {
    expect(parseOpaqueRefs('')).toEqual([]);
    expect(parseOpaqueRefs('   \n \r\n ')).toEqual([]);
  });
});

describe('canonicalizeScope + fingerprint (deterministik; kilit-bypass aracı DEĞİL)', () => {
  test('satır sırası fingerprint değiştirmez (liste sırası semantik değil)', () => {
    const a = scope({ citationKeys: ['x', 'y'] });
    const b = scope({ citationKeys: ['y', 'x'] });
    expect(stableScopeFingerprint(a)).toBe(stableScopeFingerprint(b));
  });

  test('duplicate değerler dedupe sonrası aynı fingerprint', () => {
    const a = scope({ transcriptKeys: ['t1', 't1', 't2'] });
    const b = scope({ transcriptKeys: ['t2', 't1'] });
    expect(stableScopeFingerprint(a)).toBe(stableScopeFingerprint(b));
  });

  test('case farkı FARKLI fingerprint üretir', () => {
    expect(stableScopeFingerprint(scope({ citationKeys: ['A'] }))).not.toBe(
      stableScopeFingerprint(scope({ citationKeys: ['a'] })),
    );
  });

  test('alanlar arası çapraz-karışma yok (aynı değer farklı alanda farklı fingerprint)', () => {
    expect(stableScopeFingerprint(scope({ citationKeys: ['k'] }))).not.toBe(
      stableScopeFingerprint(scope({ reviewCaseKeys: ['k'] })),
    );
  });

  test('scopeItemCount 5 alanın toplamı', () => {
    expect(
      scopeItemCount(
        scope({ transcriptKeys: ['t'], citationKeys: ['c1', 'c2'], reviewCaseKeys: [' '] }),
      ),
    ).toBe(3); // whitespace eleman canonicalize'da düşer
  });
});
