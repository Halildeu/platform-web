import { getShellServices } from '../shell-services';
import type { InterviewEvidenceShellServices } from '../shell-services';
import { AtsClientValidationError, AtsContractError } from '../transcripts/liveTranscriptApi';
import type { ExportProfileV1 } from './exportProfile';

/**
 * 39d-7d canlı export (F7) — Codex 019f535a 3-iter plan-AGREE(şartlı).
 * Kontrat (ExportApiController + ExportService kaynak-kanıtlı):
 *   POST /interviews/{id}/export {caseKey, citationKeys[], context{14 alan}}
 *     → 201 {artifactKey, evidenceId, packetDigest, claimCount}
 * Rol: ats.export.write. YALNIZ FINALIZED vaka; başarı vakayı EXPORTED terminal
 * durumuna taşır (tek-export).
 *
 * SINGLE-EXPORT İNVARYANTI FRONTEND'DE DEĞİL DB'DEDİR: worm_ledger
 * UNIQUE(tenant_id, idempotency_key) + ExportService deterministik key
 * (tenant:interview:export:caseKey) + PostgresEvidenceLedger 23505'te
 * içerik-birebir-değilse fail-closed → aynı case için en fazla BİR
 * ledger-bağlı etkili export. Buradaki guard yalnız best-effort
 * duplicate-submit azaltmasıdır (aynı sekme kazara tekrarları).
 *
 * OUTCOME-CERTAINTY (kaynak-kanıtlı): ExportService'te İLK side-effect
 * artifactStore.put'tur; NOT_FOUND YALNIZ ondan ÖNCE üretilir (case-find
 * satır ~115 + citation-find ~134) → 404+NOT_FOUND kesin not-applied.
 * 400+INVALID hem pre-validate hem markExported-fail'den (artifact+ledger
 * MEVCUT!) dönebilir → kind:'validation' + sanitized-reason AMA certainty
 * UNRESOLVED. 503 ledger-fail dallarından (telafi-fail'de artifact kalır)
 * → unresolved. Non-idempotent POST OTOMATİK RETRY EDİLMEZ.
 */
export interface LiveExportReceipt {
  artifactKey: string;
  evidenceId: string;
  packetDigest: string;
  claimCount: number;
}

export type ExportOutcomeCertainty = 'not-applied' | 'unresolved';

export interface ClassifiedExportError {
  kind: 'authn' | 'authz' | 'tenant-scope' | 'validation' | 'not-found' | 'generic';
  detail: string;
  certainty: ExportOutcomeCertainty;
}

export interface ExportRequestContext {
  profile: ExportProfileV1;
  consentRefs: string[];
  wormChainRefs: string[];
  citationCriterion: Record<string, string>;
}

/** Guard-key: tuple-safe encode (opak kimliklerde ':' collision'ı engellenir). */
export function exportGuardKey(interviewId: string, caseKey: string): string {
  return [
    'ats.export.unresolved',
    encodeURIComponent(interviewId),
    encodeURIComponent(caseKey),
  ].join(':');
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

function assertNonEmptyRefs(name: string, values: string[]): void {
  if (values.length === 0) {
    throw new AtsClientValidationError(`${name} en az bir referans içermeli.`);
  }
  for (const v of values) {
    if (typeof v !== 'string' || !v.trim()) {
      throw new AtsClientValidationError(`${name} listesinde boş/geçersiz referans olamaz.`);
    }
  }
}

/**
 * citationCriterion own-property kopyası: __proto__/constructor/prototype gibi
 * opak anahtarlar normal veri anahtarı olarak serialize edilir; prototype
 * kirliliği yapısal olarak imkânsız (Object.create(null) + defineProperty).
 */
function ownPropertyMap(entries: [string, string][]): Record<string, string> {
  const map = Object.create(null) as Record<string, string>;
  for (const [k, v] of entries) {
    Object.defineProperty(map, k, {
      value: v,
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  return map;
}

export async function executeLiveExport(
  interviewId: string,
  caseKey: string,
  citationKeys: string[],
  ctx: ExportRequestContext,
): Promise<LiveExportReceipt> {
  if (!interviewId.trim()) throw new AtsClientValidationError('interviewId zorunlu.');
  if (!caseKey.trim()) throw new AtsClientValidationError('caseKey zorunlu.');
  assertNonEmptyRefs('citationKeys', citationKeys);
  assertNonEmptyRefs('consentRefs', ctx.consentRefs);
  assertNonEmptyRefs('wormChainRefs', ctx.wormChainRefs);
  if (ctx.profile.binding.interviewId !== interviewId) {
    // Yapısal koruma — panel zaten fail-closed kapatır; API sınırında da doğrulanır.
    throw new AtsClientValidationError(
      'Export profili bu mülakata ait değil (binding uyuşmazlığı).',
    );
  }
  // Mapping exact-coverage: her citation TAM bir kritere; fazladan mapping YOK.
  const mappingKeys = Object.keys(ctx.citationCriterion).sort();
  const sortedCitations = [...new Set(citationKeys)].sort();
  if (
    mappingKeys.length !== sortedCitations.length ||
    mappingKeys.some((k, i) => k !== sortedCitations[i])
  ) {
    throw new AtsClientValidationError(
      'Her kanıt-alıntı tam bir rubric kriterine eşlenmeli (eksik/fazla eşleme var).',
    );
  }
  const criterionIds = new Set(ctx.profile.criteria.map((c) => c.criterionId));
  const mappingEntries: [string, string][] = [];
  for (const k of mappingKeys) {
    const v = ctx.citationCriterion[k];
    if (typeof v !== 'string' || !criterionIds.has(v)) {
      throw new AtsClientValidationError('Eşlenen kriter profil kriterleri içinde değil.');
    }
    mappingEntries.push([k, v]);
  }

  const services = await resolveServices();
  const response = await services.http.post<{
    artifactKey?: unknown;
    evidenceId?: unknown;
    packetDigest?: unknown;
    claimCount?: unknown;
  }>(
    `/ats/v1/interviews/${encodeURIComponent(interviewId)}/export`,
    {
      caseKey,
      citationKeys: sortedCitations,
      context: {
        generatorVersionRef: ctx.profile.generatorVersionRef,
        locale: ctx.profile.locale,
        timezone: ctx.profile.timezone,
        aiAssistanceDisclosureRef: ctx.profile.aiAssistanceDisclosureRef,
        consentRefs: ctx.consentRefs,
        rubricVersionRef: ctx.profile.rubricVersionRef,
        criteria: ctx.profile.criteria.map((c) => ({
          criterionId: c.criterionId,
          jobRelatednessRationaleRef: c.jobRelatednessRationaleRef,
        })),
        citationCriterion: ownPropertyMap(mappingEntries),
        wormChainRefs: ctx.wormChainRefs,
        redactionPolicyRef: ctx.profile.redactionPolicyRef,
        redactionRunRef: ctx.profile.redactionRunRef,
        retentionPolicyRef: ctx.profile.retentionPolicyRef,
        schemaDigest: ctx.profile.schemaDigest,
        signatureRef: ctx.profile.signatureRef,
      },
    },
    { headers: { 'Content-Type': 'application/json' } },
  );
  const d = response.data;
  if (
    response.status !== 201 ||
    typeof d?.artifactKey !== 'string' ||
    !d.artifactKey.trim() ||
    typeof d?.evidenceId !== 'string' ||
    !d.evidenceId.trim() ||
    typeof d?.packetDigest !== 'string' ||
    !/^[0-9a-f]{64}$/.test(d.packetDigest) ||
    !Number.isSafeInteger(d?.claimCount) ||
    // claimCount ≥1 KAYNAK-KANITLI: citationKeys≥1 + INSUFFICIENT sessizce
    // filtrelenmez (INVALID'e düşer) + claimCount=claims.size().
    (d.claimCount as number) < 1
  ) {
    throw new AtsContractError(
      'export cevabı beklenen 201 {artifactKey, evidenceId, packetDigest(64-hex), claimCount≥1} şeklinde değil',
    );
  }
  return {
    artifactKey: d.artifactKey,
    evidenceId: d.evidenceId,
    packetDigest: d.packetDigest,
    claimCount: d.claimCount as number,
  };
}

type HttpishError = {
  response?: { status?: number; data?: { error?: unknown; reason?: unknown } };
  request?: unknown;
};

function safeReason(data: { reason?: unknown } | undefined): string | null {
  if (!data || typeof data.reason !== 'string' || !data.reason.trim()) return null;
  // eslint-disable-next-line no-control-regex
  const cleaned = data.reason.replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
  return cleaned ? cleaned.slice(0, 200) : null;
}

export function classifyExportError(error: unknown): ClassifiedExportError {
  if (error instanceof AtsClientValidationError) {
    return { kind: 'validation', detail: error.message, certainty: 'not-applied' };
  }
  if (error instanceof Error && error.name === 'InterviewEvidenceUnauthenticatedError') {
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
    // 2xx/malformed-201 — export UYGULANMIŞ olabilir (receipt kayıp).
    return {
      kind: 'generic',
      detail: 'Backend yanıt verdi ancak export makbuzu doğrulanamadı (kontrat).',
      certainty: 'unresolved',
    };
  }
  const e = error as HttpishError | null;
  const response = e && typeof e === 'object' ? e.response : undefined;
  if (!response) {
    return {
      kind: 'generic',
      detail: 'İsteğin sonucu doğrulanamadı (bağlantı).',
      certainty: 'unresolved',
    };
  }
  const status = typeof response.status === 'number' ? response.status : 0;
  const code = typeof response.data?.error === 'string' ? response.data.error : null;

  // EXACT status×code (7c deseni): yalnız kanıtlı çiftler özel sınıf alır.
  if (status === 401 && code === 'UNAUTHENTICATED') {
    return {
      kind: 'authn',
      detail: 'Oturum doğrulanamadı (401) — yeniden giriş; rol ataması bu hatayı çözmez.',
      certainty: 'not-applied', // filter-chain, handler öncesi
    };
  }
  if (status === 403 && code === 'DENIED') {
    return {
      kind: 'authz',
      detail: 'Export için yetkiniz yok (ats.export.write rolü — rol-kapısı fail-closed).',
      certainty: 'not-applied', // filter-chain, handler öncesi
    };
  }
  if (status === 403 && code === 'TENANT_SCOPE_VIOLATION') {
    return {
      kind: 'tenant-scope',
      detail:
        'İstenen kaynaklardan en az biri tenant/mülakat kapsamı ihlali bildirdi; export sonucunun uygulanıp uygulanmadığı doğrulanamadı.',
      certainty: 'unresolved', // export akışında üretim noktası kanıtsız — fail-closed
    };
  }
  if (status === 404 && code === 'NOT_FOUND') {
    return {
      kind: 'not-found',
      // Kaynak kanıtı: ExportService NOT_FOUND yalnız case-find (~115) ve
      // citation-find (~134) noktalarında üretir — İKİSİ DE ilk side-effect
      // (artifactStore.put) ÖNCESİ → kesin not-applied.
      detail: withReason(
        'Vaka ya da kanıt-alıntı bulunamadı (tenant kapsamı).',
        safeReason(response.data),
      ),
      certainty: 'not-applied',
    };
  }
  if (status === 400 && code === 'INVALID') {
    return {
      kind: 'validation',
      // reason operatöre değerli (FINALIZED-değil / iş-ilişkililik kopuk /
      // markExported-fail) — GÖSTERİLİR ama certainty UNRESOLVED: markExported
      // -fail 400'ü artifact+ledger YAZILDIKTAN sonra döner (iki-eksen ayrımı).
      detail: withReason('Export backend doğrulamasından geçemedi.', safeReason(response.data)),
      certainty: 'unresolved',
    };
  }
  // 503 (ledger-fail dalları; telafi-fail'de artifact kalır), bilinmeyen 5xx,
  // mismatch kombinasyonlar: hepsi unresolved + reason yankılanmaz.
  return {
    kind: 'generic',
    detail:
      'Backend hata yanıtı beklenen kontratla eşleşmedi ya da geçici hata; export kısmen uygulanmış olabilir.',
    certainty: 'unresolved',
  };
}

function withReason(base: string, reason: string | null): string {
  return reason ? `${base} — teknik ayrıntı: ${reason}` : base;
}
