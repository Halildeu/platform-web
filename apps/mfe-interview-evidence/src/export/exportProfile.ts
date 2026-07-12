/**
 * 39d-7d ExportProfileV1 — runtime export-context profili (Codex 019f535a
 * plan-AGREE şartları).
 *
 * 14-alanlı ExportContext'in deployment-owned kısmı KULLANICI FORMU DEĞİL,
 * runtime env profili olarak gelir (`INTERVIEW_EVIDENCE_EXPORT_PROFILE`,
 * JSON; build-single-domain STAGE spread'i enjekte eder). Vaka-spesifik
 * pointer'lar (consentRefs, wormChainRefs) PROFİLDE DEĞİL kullanıcıdadır.
 *
 * FAIL-CLOSED strict parser:
 * - versioned (version===1) + ROOT/binding/criterion nesnelerinde bilinmeyen
 *   alan REDDİ (typo görünür olsun);
 * - binding.interviewId ZORUNLU — panel current-interview ile EXACT eşleşme
 *   ister (yanlış mülakata yanlış rubric/policy ile export yapısal engellenir);
 * - duplicate criterionId REDDİ (sessiz dedupe YOK);
 * - schemaDigest lowercase 64-hex (backend ExportService regex'iyle birebir);
 * - boyut üst-sınırları; hata mesajları PROFİL DEĞERLERİNİ YANKILAMAZ
 *   (yalnız alan adı/konum — profil opak pointer taşır, yine de disiplin).
 *
 * GÜVENLİK SINIRI: window.__env__ kullanıcı-görünür ve değiştirilebilirdir —
 * profil SECRET TAŞIMAZ (yalnız opak pointer); frontend doğrulaması yalnız
 * güvenli-UX/kontrat-preflight'tır, AUTHORITY DEĞİLDİR (backend tüm pointer
 * ve policy binding'lerini yeniden doğrular).
 */
export interface ExportProfileCriterion {
  criterionId: string;
  jobRelatednessRationaleRef: string;
}

export interface ExportProfileV1 {
  version: 1;
  binding: { interviewId: string; vacancyRef?: string; tenantRef?: string };
  generatorVersionRef: string;
  locale: string;
  timezone: string;
  aiAssistanceDisclosureRef: string;
  rubricVersionRef: string;
  redactionPolicyRef: string;
  redactionRunRef: string;
  retentionPolicyRef: string;
  signatureRef: string;
  schemaDigest: string;
  criteria: ExportProfileCriterion[];
}

export type ExportProfileResolution =
  | { kind: 'ok'; profile: ExportProfileV1 }
  | { kind: 'missing' }
  | { kind: 'config-error'; reason: string };

const MAX_RAW_LENGTH = 32_768;
const MAX_STRING_LENGTH = 500;
const MAX_CRITERIA = 100;

const ROOT_KEYS = [
  'version',
  'binding',
  'generatorVersionRef',
  'locale',
  'timezone',
  'aiAssistanceDisclosureRef',
  'rubricVersionRef',
  'redactionPolicyRef',
  'redactionRunRef',
  'retentionPolicyRef',
  'signatureRef',
  'schemaDigest',
  'criteria',
] as const;
const BINDING_KEYS = ['interviewId', 'vacancyRef', 'tenantRef'] as const;
const CRITERION_KEYS = ['criterionId', 'jobRelatednessRationaleRef'] as const;
const REQUIRED_REF_FIELDS = [
  'generatorVersionRef',
  'locale',
  'timezone',
  'aiAssistanceDisclosureRef',
  'rubricVersionRef',
  'redactionPolicyRef',
  'redactionRunRef',
  'retentionPolicyRef',
  'signatureRef',
] as const;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function unknownKey(obj: Record<string, unknown>, allowed: readonly string[]): string | null {
  for (const k of Object.keys(obj)) {
    if (!allowed.includes(k)) return k;
  }
  return null;
}

function boundedString(v: unknown): v is string {
  return typeof v === 'string' && v.trim() !== '' && v.length <= MAX_STRING_LENGTH;
}

function err(reason: string): ExportProfileResolution {
  // Değer YANKILANMAZ — yalnız alan adı/konum.
  return { kind: 'config-error', reason: `Export profili geçersiz: ${reason}` };
}

export function parseExportProfile(raw: string): ExportProfileResolution {
  if (!raw.trim()) return { kind: 'missing' };
  if (raw.length > MAX_RAW_LENGTH) return err('profil JSON boyut sınırını aşıyor');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return err('JSON parse edilemedi');
  }
  if (!isPlainObject(parsed)) return err('kök değer nesne değil');
  const badRoot = unknownKey(parsed, ROOT_KEYS);
  if (badRoot !== null) return err(`kökte bilinmeyen alan: ${badRoot}`);
  if (parsed.version !== 1) return err('version 1 olmalı');

  if (!isPlainObject(parsed.binding)) return err('binding nesnesi zorunlu');
  const badBinding = unknownKey(parsed.binding, BINDING_KEYS);
  if (badBinding !== null) return err(`binding içinde bilinmeyen alan: ${badBinding}`);
  if (!boundedString(parsed.binding.interviewId)) {
    return err('binding.interviewId zorunlu (boş olamaz)');
  }
  for (const opt of ['vacancyRef', 'tenantRef'] as const) {
    const v = parsed.binding[opt];
    if (v !== undefined && !boundedString(v)) return err(`binding.${opt} geçersiz`);
  }

  for (const field of REQUIRED_REF_FIELDS) {
    if (!boundedString(parsed[field])) return err(`${field} zorunlu (boş olamaz)`);
  }
  if (typeof parsed.schemaDigest !== 'string' || !/^[0-9a-f]{64}$/.test(parsed.schemaDigest)) {
    // Backend ExportService regex'i lowercase [0-9a-f]{64} — birebir hizalı.
    return err('schemaDigest lowercase 64-hex olmalı');
  }

  if (!Array.isArray(parsed.criteria) || parsed.criteria.length === 0) {
    return err('criteria boş olamaz');
  }
  if (parsed.criteria.length > MAX_CRITERIA) return err('criteria sayı sınırını aşıyor');
  const criteria: ExportProfileCriterion[] = [];
  const seenIds = new Set<string>();
  for (let i = 0; i < parsed.criteria.length; i++) {
    const c = parsed.criteria[i];
    if (!isPlainObject(c)) return err(`criteria[${i}] nesne değil`);
    const badCriterion = unknownKey(c, CRITERION_KEYS);
    if (badCriterion !== null) {
      return err(`criteria[${i}] içinde bilinmeyen alan: ${badCriterion}`);
    }
    if (!boundedString(c.criterionId)) return err(`criteria[${i}].criterionId zorunlu`);
    if (!boundedString(c.jobRelatednessRationaleRef)) {
      return err(`criteria[${i}].jobRelatednessRationaleRef zorunlu`);
    }
    if (seenIds.has(c.criterionId)) {
      // Sessiz dedupe YOK — config hatası görünür olur.
      return err(`criteria[${i}].criterionId tekrar ediyor`);
    }
    seenIds.add(c.criterionId);
    criteria.push({
      criterionId: c.criterionId,
      jobRelatednessRationaleRef: c.jobRelatednessRationaleRef,
    });
  }

  const profile: ExportProfileV1 = Object.freeze({
    version: 1,
    binding: Object.freeze({
      interviewId: parsed.binding.interviewId,
      ...(parsed.binding.vacancyRef !== undefined
        ? { vacancyRef: parsed.binding.vacancyRef as string }
        : {}),
      ...(parsed.binding.tenantRef !== undefined
        ? { tenantRef: parsed.binding.tenantRef as string }
        : {}),
    }),
    generatorVersionRef: parsed.generatorVersionRef as string,
    locale: parsed.locale as string,
    timezone: parsed.timezone as string,
    aiAssistanceDisclosureRef: parsed.aiAssistanceDisclosureRef as string,
    rubricVersionRef: parsed.rubricVersionRef as string,
    redactionPolicyRef: parsed.redactionPolicyRef as string,
    redactionRunRef: parsed.redactionRunRef as string,
    retentionPolicyRef: parsed.retentionPolicyRef as string,
    signatureRef: parsed.signatureRef as string,
    schemaDigest: parsed.schemaDigest,
    criteria: Object.freeze(criteria) as unknown as ExportProfileCriterion[],
  });
  return { kind: 'ok', profile };
}

type EnvBag = Record<string, string | undefined>;

function windowEnv(): EnvBag {
  const w = globalThis as { __env__?: EnvBag; __ENV__?: EnvBag };
  return { ...(w.__ENV__ ?? {}), ...(w.__env__ ?? {}) };
}

/** dataMode.readEnv aynası — window.__env__ öncelikli, build-arg fallback. */
export function resolveExportProfile(): ExportProfileResolution {
  const keys = ['INTERVIEW_EVIDENCE_EXPORT_PROFILE', 'VITE_INTERVIEW_EVIDENCE_EXPORT_PROFILE'];
  const runtime = windowEnv();
  for (const k of keys) {
    const v = runtime[k];
    if (typeof v === 'string' && v.trim()) return parseExportProfile(v);
  }
  const build = import.meta.env as EnvBag;
  for (const k of keys) {
    const v = build[k];
    if (typeof v === 'string' && v.trim()) return parseExportProfile(v);
  }
  return { kind: 'missing' };
}
