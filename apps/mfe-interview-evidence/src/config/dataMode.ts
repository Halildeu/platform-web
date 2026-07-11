/**
 * 39d-6 veri-modu çözümü — RUNTIME policy (build-time flag değil):
 * `window.__env__` (deploy başına enjekte; build-single-domain.mjs shellEnv)
 * ÖNCELİKLİ, `import.meta.env` (build-arg) fallback, hiçbiri yoksa 'demo'.
 *
 * Fail-closed kural (Codex 019f50b7 39d-6 iter): boş/undefined → 'demo'
 * (güvenli default); ama TANIMLI-geçersiz değer (örn. "lvie" typo'su)
 * SESSİZCE demo'ya düşmez — config-error döner ki deployment hatası
 * görünür olsun.
 */
export type DataMode = 'demo' | 'live';

export type DataModeResolution =
  | { kind: 'ok'; mode: DataMode }
  | { kind: 'config-error'; reason: string };

type EnvBag = Record<string, string | undefined>;

function windowEnv(): EnvBag {
  const w = globalThis as { __env__?: EnvBag; __ENV__?: EnvBag };
  return { ...(w.__ENV__ ?? {}), ...(w.__env__ ?? {}) };
}

function readEnv(keys: string[]): string {
  const runtime = windowEnv();
  for (const k of keys) {
    const v = runtime[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  const build = import.meta.env as EnvBag;
  for (const k of keys) {
    const v = build[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return '';
}

export function resolveDataMode(): DataModeResolution {
  const raw = readEnv(['INTERVIEW_EVIDENCE_DATA_MODE', 'VITE_INTERVIEW_EVIDENCE_DATA_MODE']);
  if (!raw) return { kind: 'ok', mode: 'demo' };
  const normalized = raw.toLowerCase();
  if (normalized === 'demo' || normalized === 'live') {
    return { kind: 'ok', mode: normalized };
  }
  return {
    kind: 'config-error',
    reason: `INTERVIEW_EVIDENCE_DATA_MODE geçersiz: "${raw}" (beklenen: demo | live)`,
  };
}

/**
 * Canlı modda okunacak mülakat scope'u. Backend'de interviews-list endpoint'i
 * henüz YOK (39d-7 backlog); READ dilimi konfigüre edilmiş tek interview
 * üzerinde çalışır. Live + boş id → fail-closed (uygulama koduna id
 * HARDCODE EDİLMEZ; testai değeri build-single-domain.mjs STAGE spread'inden
 * gelir ve sentetik fixture'dır).
 */
export function resolveLiveInterviewId(): string | null {
  const raw = readEnv(['INTERVIEW_EVIDENCE_INTERVIEW_ID', 'VITE_INTERVIEW_EVIDENCE_INTERVIEW_ID']);
  return raw || null;
}
