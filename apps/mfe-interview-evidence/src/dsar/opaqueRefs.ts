/**
 * 39d-7c F10 opak-referans yardımcıları (Codex 019f535a plan şartları).
 *
 * Opak anahtarların karakter grameri kontratta TANIMSIZ — bu yüzden virgül
 * delimiter olarak VARSAYILMAZ (`"citation,version,2"` TEK anahtar olabilir).
 * Girdi biçimi: HER SATIRA BİR REFERANS. Trim dışında hiçbir normalizasyon
 * yapılmaz (case korunur); null/whitespace eleman yapısal olarak üretilemez.
 */
export interface CanonicalErasureScope {
  transcriptKeys: string[];
  citationKeys: string[];
  exportArtifactKeys: string[];
  reviewCaseKeys: string[];
  tombstoneTargetEvidenceIds: string[];
}

export function parseOpaqueRefs(value: string): string[] {
  return [
    ...new Set(
      value
        .split(/\r?\n/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
}

/**
 * Canonical liste: trim + boş-filtre + dedupe + lexicographic sıralama.
 * Sıralama yalnız deterministik fingerprint/karşılaştırma içindir — backend
 * kontratında liste sırası semantik değildir (ErasureScope set-gibi işlenir).
 */
export function canonicalizeRefs(values: string[]): string[] {
  return [...new Set(values.map((v) => v.trim()).filter(Boolean))].sort();
}

export function canonicalizeScope(input: {
  transcriptKeys: string[];
  citationKeys: string[];
  exportArtifactKeys: string[];
  reviewCaseKeys: string[];
  tombstoneTargetEvidenceIds: string[];
}): CanonicalErasureScope {
  return {
    transcriptKeys: canonicalizeRefs(input.transcriptKeys),
    citationKeys: canonicalizeRefs(input.citationKeys),
    exportArtifactKeys: canonicalizeRefs(input.exportArtifactKeys),
    reviewCaseKeys: canonicalizeRefs(input.reviewCaseKeys),
    tombstoneTargetEvidenceIds: canonicalizeRefs(input.tombstoneTargetEvidenceIds),
  };
}

export function scopeItemCount(scope: CanonicalErasureScope): number {
  return (
    scope.transcriptKeys.length +
    scope.citationKeys.length +
    scope.exportArtifactKeys.length +
    scope.reviewCaseKeys.length +
    scope.tombstoneTargetEvidenceIds.length
  );
}

/**
 * Deterministik stable-serialization hash'i (FNV-1a 32-bit, hex).
 *
 * GÜVENLİK KARARI VERMEZ (Codex şart-4): unresolved-guard kilidi interview-
 * düzeyindedir — marker VARSA scope fingerprint'i eşleşmese bile erasure
 * kilitlidir (collision/canonicalization farkı kilit bypass'ı yaratamaz).
 * Fingerprint yalnız audit/görsel kısa-tanımlayıcıdır.
 */
export function stableScopeFingerprint(scope: CanonicalErasureScope): string {
  const serialized = JSON.stringify({
    transcriptKeys: scope.transcriptKeys,
    citationKeys: scope.citationKeys,
    exportArtifactKeys: scope.exportArtifactKeys,
    reviewCaseKeys: scope.reviewCaseKeys,
    tombstoneTargetEvidenceIds: scope.tombstoneTargetEvidenceIds,
  });
  let hash = 0x811c9dc5;
  for (let i = 0; i < serialized.length; i++) {
    hash ^= serialized.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
