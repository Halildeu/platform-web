/**
 * 39d-7c unresolved-erasure guard'ı (Codex 019f535a şart-3/4).
 *
 * Yıkıcı erasure POST'unun sonucu belirsiz kaldığında (transport kesintisi,
 * bilinmeyen 5xx, malformed-200) sayfa yenilense bile aynı interview için
 * yeni bir yıkıcı gönderimi kilitleyen session-scoped işaret. Backend
 * authority'sinin YERİNE GEÇMEZ (authoritative DSAR-status GET'i ayrı backend
 * dilimi) — kazara refresh→duplicate-submit riskini daraltan best-effort katman.
 *
 * Fail-closed kurallar:
 * - arm() başarısızsa (storage kapalı/quota/SecurityError) çağıran POST GÖNDERMEZ.
 * - Malformed kayıt sessizce yok sayılmaz — kilit olarak raporlanır.
 * - Kayıtta subjectRef/reasonCode/ham scope referansı TUTULMAZ (yalnız opak
 *   dsarKey + scope fingerprint + zaman damgası).
 */
export interface UnresolvedErasureRecordV1 {
  version: 1;
  dsarKey: string;
  scopeFingerprint: string;
  startedAt: string;
}

export type GuardReadResult =
  | { kind: 'none' }
  | { kind: 'unresolved'; record: UnresolvedErasureRecordV1 }
  | { kind: 'malformed' };

export interface UnresolvedErasureGuard {
  read(interviewId: string): GuardReadResult;
  /** true = işaret güvenle yazıldı (read-back doğrulamalı); false = YAZILAMADI → POST gönderilmemeli. */
  arm(interviewId: string, record: UnresolvedErasureRecordV1): boolean;
  clear(interviewId: string): void;
}

const DEFAULT_PREFIX = 'ats.dsar.unresolved';

function parseRecord(raw: string): UnresolvedErasureRecordV1 | null {
  try {
    const value = JSON.parse(raw) as Partial<UnresolvedErasureRecordV1> | null;
    if (
      value &&
      value.version === 1 &&
      typeof value.dsarKey === 'string' &&
      value.dsarKey.trim() !== '' &&
      typeof value.scopeFingerprint === 'string' &&
      value.scopeFingerprint.trim() !== '' &&
      typeof value.startedAt === 'string' &&
      value.startedAt.trim() !== ''
    ) {
      return {
        version: 1,
        dsarKey: value.dsarKey,
        scopeFingerprint: value.scopeFingerprint,
        startedAt: value.startedAt,
      };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * sessionStorage adapter'ı. `storage` parametresi test enjeksiyonu içindir;
 * default erişim her operasyonda try/catch'lidir (storage'a ERİŞİM bile
 * SecurityError atabilir). Erişilemeyen storage'da read 'none' döner — intake
 * yüzeyi açılabilir; yıkıcı POST yine de çıkamaz çünkü arm() aynı storage'a
 * yazamayıp false döner ve çağıran fail-closed durur.
 */
export function createSessionUnresolvedGuard(
  storage?: Storage,
  keyPrefix: string = DEFAULT_PREFIX,
): UnresolvedErasureGuard {
  const keyFor = (id: string) => `${keyPrefix}:${id}`;
  const resolve = (): Storage | null => {
    if (storage) return storage;
    try {
      return window.sessionStorage;
    } catch {
      return null;
    }
  };
  return {
    read(interviewId) {
      const s = resolve();
      if (!s) return { kind: 'none' };
      let raw: string | null;
      try {
        raw = s.getItem(keyFor(interviewId));
      } catch {
        return { kind: 'none' };
      }
      if (raw === null) return { kind: 'none' };
      const record = parseRecord(raw);
      return record ? { kind: 'unresolved', record } : { kind: 'malformed' };
    },
    arm(interviewId, record) {
      const s = resolve();
      if (!s) return false;
      const serialized = JSON.stringify(record);
      try {
        s.setItem(keyFor(interviewId), serialized);
        // Read-back doğrulaması: sessizce düşen yazım (quota vb.) fail-open olamaz.
        return s.getItem(keyFor(interviewId)) === serialized;
      } catch {
        return false;
      }
    },
    clear(interviewId) {
      const s = resolve();
      if (!s) return;
      try {
        s.removeItem(keyFor(interviewId));
      } catch {
        // clear başarısızlığı yıkıcı değil — kilit fazladan sürer (fail-closed yön).
      }
    },
  };
}
