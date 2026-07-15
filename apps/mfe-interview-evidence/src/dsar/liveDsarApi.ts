import { getShellServices } from '../shell-services';
import type { InterviewEvidenceShellServices } from '../shell-services';
import { AtsClientValidationError, AtsContractError } from '../transcripts/liveTranscriptApi';
import type { CanonicalErasureScope } from './opaqueRefs';
import { scopeItemCount } from './opaqueRefs';

/**
 * 39d-7c canlı DSAR/erasure (F10) — Codex 019f535a AGREE(şartlı) planı.
 * Kontrat (DsarApiController + SecurityConfig + OutcomeHttp kaynak-kanıtlı):
 *   POST /interviews/{id}/dsar {subjectRef, reasonCode} → 201 {dsarKey}
 *     (reasonCode BACKEND'DE DE zorunlu — DsrService.receiveDsar isBlank kontrolü)
 *   POST /interviews/{id}/dsar/erasure {dsarKey, scope{5 liste}} →
 *     200 {dsarKey, tombstoneCount, deletedContentCount, caseTransitioned}
 * Hata gövdesi {error: CODE, reason}; 400 INVALID / 401 / 403 DENIED |
 * TENANT_SCOPE_VIOLATION / 404 / 409 / 422 (code=OK fail-closed) / 503.
 *
 * OUTCOME-CERTAINTY (Codex şart-1, kaynak-kanıtlı DARALTILDI): DsrService
 * executeErasure'da 503 tombstone-append DÖNGÜSÜ içinden, 400 content-delete/
 * withdraw/FULFILLED-yazım noktalarından, 404 review-case dalından yani KISMÎ
 * YÜRÜTME SONRASI dönebilir. Bu yüzden erasure için "uygulanmadığı kesin" sayılan
 * TEK küme filter-chain cevaplarıdır (401/403 — SecurityConfig handler'a girmeden
 * reddeder) + istek-öncesi client hataları. Diğer HER sonuç (4xx/5xx/malformed-200/
 * transport) 'unresolved' = yıkıcı işlem uygulanmış OLABİLİR.
 * Intake yıkıcı değildir (tek-put): 4xx/422/503 not-applied; yalnız bilinmeyen-5xx/
 * malformed-201/transport 'unresolved' (DSAR oluşmuş olabilir, dsarKey alınamadı).
 *
 * Non-idempotent POST'lar OTOMATİK RETRY EDİLMEZ (her ikisi).
 */
export interface LiveErasureReceipt {
  dsarKey: string;
  tombstoneCount: number;
  deletedContentCount: number;
  caseTransitioned: boolean;
}

export type DsarOperation = 'intake' | 'erasure';
export type DsarOutcomeCertainty = 'not-applied' | 'unresolved';

export interface ClassifiedDsarError {
  kind:
    | 'authn'
    | 'authz'
    | 'tenant-scope'
    | 'validation'
    | 'not-found'
    | 'gate'
    | 'fail-closed'
    | 'not-configured'
    | 'generic';
  detail: string;
  certainty: DsarOutcomeCertainty;
}

async function resolveServices(): Promise<InterviewEvidenceShellServices> {
  const services = getShellServices();
  const ready = await services.auth.ready();
  if (!ready.ok) {
    const error = new Error(ready.error || ready.reason);
    error.name =
      ready.reason === 'unauthenticated'
        ? 'InterviewEvidenceUnauthenticatedError'
        : 'InterviewEvidenceAuthError';
    throw error;
  }
  return services;
}

export async function receiveLiveDsar(
  interviewId: string,
  subjectRef: string,
  reasonCode: string,
): Promise<string> {
  const canonicalSubjectRef = subjectRef.trim();
  const canonicalReasonCode = reasonCode.trim();
  if (!interviewId.trim()) throw new AtsClientValidationError('interviewId zorunlu.');
  if (!canonicalSubjectRef) {
    throw new AtsClientValidationError('Veri sahibi referansı (subjectRef) zorunlu — opak.');
  }
  if (!canonicalReasonCode) {
    throw new AtsClientValidationError('Neden kodu (reasonCode) zorunlu — opak.');
  }
  const services = await resolveServices();
  const response = await services.http.post<{ dsarKey?: unknown }>(
    `/ats/v1/interviews/${encodeURIComponent(interviewId)}/dsar`,
    { subjectRef: canonicalSubjectRef, reasonCode: canonicalReasonCode },
    { headers: { 'Content-Type': 'application/json' } },
  );
  if (
    response.status !== 201 ||
    typeof response.data?.dsarKey !== 'string' ||
    !response.data.dsarKey.trim()
  ) {
    throw new AtsContractError('dsar intake cevabı beklenen 201 {dsarKey} şeklinde değil');
  }
  return response.data.dsarKey; // ham değer — sessiz normalizasyon YOK
}

function assertCanonicalRefs(name: string, values: string[]): void {
  for (const v of values) {
    if (typeof v !== 'string' || !v.trim()) {
      throw new AtsClientValidationError(`${name} listesinde boş/geçersiz referans olamaz.`);
    }
  }
}

export async function executeLiveErasure(
  interviewId: string,
  dsarKey: string,
  scope: CanonicalErasureScope,
): Promise<LiveErasureReceipt> {
  if (!interviewId.trim()) throw new AtsClientValidationError('interviewId zorunlu.');
  if (!dsarKey.trim()) throw new AtsClientValidationError('dsarKey zorunlu.');
  if (scopeItemCount(scope) === 0) {
    throw new AtsClientValidationError('Silme kapsamı boş — en az bir hedef referans gerekli.');
  }
  assertCanonicalRefs('transcriptKeys', scope.transcriptKeys);
  assertCanonicalRefs('citationKeys', scope.citationKeys);
  assertCanonicalRefs('exportArtifactKeys', scope.exportArtifactKeys);
  assertCanonicalRefs('reviewCaseKeys', scope.reviewCaseKeys);
  assertCanonicalRefs('tombstoneTargetEvidenceIds', scope.tombstoneTargetEvidenceIds);

  const services = await resolveServices();
  const response = await services.http.post<{
    dsarKey?: unknown;
    tombstoneCount?: unknown;
    deletedContentCount?: unknown;
    caseTransitioned?: unknown;
  }>(
    `/ats/v1/interviews/${encodeURIComponent(interviewId)}/dsar/erasure`,
    {
      dsarKey,
      // 5 alan HER ZAMAN array gönderilir (tek canonical payload biçimi).
      scope: {
        transcriptKeys: scope.transcriptKeys,
        citationKeys: scope.citationKeys,
        exportArtifactKeys: scope.exportArtifactKeys,
        reviewCaseKeys: scope.reviewCaseKeys,
        tombstoneTargetEvidenceIds: scope.tombstoneTargetEvidenceIds,
      },
    },
    { headers: { 'Content-Type': 'application/json' } },
  );
  const d = response.data;
  if (
    response.status !== 200 ||
    typeof d?.dsarKey !== 'string' ||
    !d.dsarKey.trim() ||
    !Number.isSafeInteger(d?.tombstoneCount) ||
    (d.tombstoneCount as number) < 0 ||
    !Number.isSafeInteger(d?.deletedContentCount) ||
    (d.deletedContentCount as number) < 0 ||
    typeof d?.caseTransitioned !== 'boolean'
  ) {
    throw new AtsContractError(
      'erasure cevabı beklenen 200 {dsarKey, tombstoneCount, deletedContentCount, caseTransitioned} şeklinde değil',
    );
  }
  if (d.dsarKey !== dsarKey) {
    throw new AtsContractError('erasure cevabındaki dsarKey gönderilenle uyuşmuyor');
  }
  return {
    dsarKey: d.dsarKey,
    tombstoneCount: d.tombstoneCount as number,
    deletedContentCount: d.deletedContentCount as number,
    caseTransitioned: d.caseTransitioned,
  };
}

type HttpishError = {
  response?: { status?: number; data?: { error?: unknown; reason?: unknown } };
  request?: unknown;
};

/**
 * reason gösterim politikası (Codex şart-8): sabit güvenli mesaj ÖNCE; reason
 * yalnız {INVALID, NOT_FOUND, UNSUPPORTED_IN_GATE} sınıflarında, 200 karakter
 * cap + kontrol-karakteri temizliğiyle ikincil ayrıntı olarak. DENIED /
 * TENANT_SCOPE_VIOLATION / 401 reason'ı ASLA yankılanmaz (anahtar/tenant
 * bilgisi taşıyabilir); telemetriye yazılmaz.
 */
function safeReason(data: { reason?: unknown } | undefined): string | null {
  if (!data || typeof data.reason !== 'string' || !data.reason.trim()) return null;
  // eslint-disable-next-line no-control-regex
  const cleaned = data.reason.replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
  return cleaned ? cleaned.slice(0, 200) : null;
}

function withReason(base: string, reason: string | null): string {
  return reason ? `${base} — teknik ayrıntı: ${reason}` : base;
}

export function classifyDsarError(error: unknown, op: DsarOperation): ClassifiedDsarError {
  if (error instanceof AtsClientValidationError) {
    return { kind: 'validation', detail: error.message, certainty: 'not-applied' };
  }
  if (error instanceof Error && error.name === 'InterviewEvidenceUnauthenticatedError') {
    // shell auth.ready() fail — istek hiç atılmadı.
    return {
      kind: 'authn',
      detail: 'Oturum doğrulanamadı — yeniden giriş gerekebilir; rol ataması bu hatayı çözmez.',
      certainty: 'not-applied',
    };
  }
  if (error instanceof Error && error.name === 'InterviewEvidenceAuthError') {
    return { kind: 'generic', detail: error.message, certainty: 'not-applied' };
  }
  if (error instanceof AtsContractError) {
    // 2xx alındı ama gövde doğrulanamadı — backend işlemi UYGULAMIŞ olabilir
    // (Codex şart-2: malformed başarı = unresolved; sıradan contract-hata değil).
    return {
      kind: 'generic',
      detail: 'Backend yanıt verdi ancak sonuç doğrulanamadı (kontrat).',
      certainty: 'unresolved',
    };
  }
  const e = error as HttpishError | null;
  const response = e && typeof e === 'object' ? e.response : undefined;
  if (!response) {
    // Transport belirsizliği (cevapsız POST) veya istek sınırı bilinmeyen throw —
    // fail-closed: uygulanmış olabilir.
    return {
      kind: 'generic',
      detail: 'İsteğin sonucu doğrulanamadı (bağlantı).',
      certainty: 'unresolved',
    };
  }
  const status = typeof response.status === 'number' ? response.status : 0;
  const code = typeof response.data?.error === 'string' ? response.data.error : null;

  // EXACT status×code eşleşmesi (Codex 7c post-impl blocker-2): yalnız kanıtlı
  // çiftler özel sınıf/certainty alır; beklenmeyen kombinasyon (401+DENIED,
  // 403+INVALID, gövdesiz 403, ...) kontrat-dışıdır → generic + unresolved,
  // reason ASLA yankılanmaz, yıkıcı guard TEMİZLENMEZ.
  if (status === 401 && code === 'UNAUTHENTICATED') {
    return {
      kind: 'authn',
      detail: 'Oturum doğrulanamadı (401) — yeniden giriş; rol ataması bu hatayı çözmez.',
      certainty: 'not-applied', // SecurityConfig filter-chain: handler'a girilmedi
    };
  }
  if (status === 403 && code === 'DENIED') {
    return {
      kind: 'authz',
      detail:
        op === 'intake'
          ? 'DSAR kaydı için yetkiniz yok (ats.dsar.write rolü — rol-kapısı fail-closed).'
          : 'Silme yürütme için yetkiniz yok (ats.erasure.execute rolü — AYRI yetki sınıfı; fail-closed).',
      certainty: 'not-applied', // SecurityConfig authority reddi: handler'a girilmedi
    };
  }
  if (status === 403 && code === 'TENANT_SCOPE_VIOLATION') {
    return {
      kind: 'tenant-scope',
      // Detail certainty ile tutarlı (Codex non-blocking): erasure'da "uygulanmadı"
      // İDDİA EDİLMEZ — sonuç doğrulanamadı dili kullanılır.
      detail:
        op === 'intake'
          ? 'İstenen kaynaklardan en az biri bu tenant/mülakat kapsamına ait değil. Güvenlik nedeniyle işlem uygulanmadı.'
          : 'İstenen kaynaklardan en az biri tenant/mülakat kapsamı ihlali bildirdi; silme sonucunun uygulanıp uygulanmadığı doğrulanamadı.',
      // Kaynak kanıtı: bu kod YALNIZ IdentityTenant.assertTenantScope kontratında
      // tanımlı; DsrService/DsarApiController akışında ÜRETİLMİYOR. Pre-side-effect
      // garantisi kanıtlanamadığından erasure için fail-closed 'unresolved'
      // (Codex şart-6); intake tek-put olduğundan not-applied.
      certainty: op === 'intake' ? 'not-applied' : 'unresolved',
    };
  }

  if (op === 'erasure') {
    // Kaynak-kanıt (DsrService.executeErasure): 503 tombstone-append DÖNGÜSÜ
    // içinden, 400 content-delete/withdraw/FULFILLED-yazım noktalarından, 404
    // review-case dalından — hepsi KISMÎ YÜRÜTME SONRASI dönebilir. Reason-string
    // parse etmeden "uygulanmadı" KANITLANAMAZ → 401/403 dışı her sonuç unresolved.
    return {
      kind: 'generic',
      detail: 'Silme isteği hata döndü; işlem kısmen uygulanmış olabilir.',
      certainty: 'unresolved',
    };
  }

  // intake — tek-put, yıkıcı değil; YALNIZ exact çiftler not-applied + reason
  // yalnız {INVALID, NOT_FOUND, UNSUPPORTED_IN_GATE} çiftlerinde.
  if (status === 400 && code === 'INVALID') {
    return {
      kind: 'validation',
      detail: withReason('İstek backend doğrulamasından geçemedi.', safeReason(response.data)),
      certainty: 'not-applied',
    };
  }
  if (status === 404 && code === 'NOT_FOUND') {
    return {
      kind: 'not-found',
      detail: withReason('Mülakat bulunamadı (tenant kapsamı).', safeReason(response.data)),
      certainty: 'not-applied',
    };
  }
  if (status === 409 && code === 'UNSUPPORTED_IN_GATE') {
    return {
      kind: 'gate',
      detail: withReason('Bu ortam kapısında desteklenmiyor.', safeReason(response.data)),
      certainty: 'not-applied',
    };
  }
  if (status === 422 && code === 'OK') {
    // OutcomeHttp: Fail(OK) tutarsızlığı fail-closed 422'ye maplenir.
    return {
      kind: 'fail-closed',
      detail: 'Güvenli şekilde yürütülemedi (backend tutarlılık koruması).',
      certainty: 'not-applied',
    };
  }
  if (status === 503 && code === 'NOT_CONFIGURED') {
    return {
      kind: 'not-configured',
      detail: 'Servis bu ortamda yapılandırılmamış ya da geçici olarak kullanılamıyor.',
      certainty: 'not-applied',
    };
  }
  // Mismatch fallback: kontrat-dışı kombinasyon — DSAR oluşmuş olabilir.
  return {
    kind: 'generic',
    detail: 'Backend hata yanıtı beklenen kontratla eşleşmedi; talebin sonucu doğrulanamadı.',
    certainty: 'unresolved',
  };
}
