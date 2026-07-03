import { DEMO_SEGMENTS } from '../segment-view/demo-data';
import type { CaseState, CaseSummary, CitationReceipt, Entailment, ExportReceipt } from './types';

/**
 * DEMO inceleme motoru (ATS-0016 dürüst sınır: sentetik bağlam; 39d'de `/api/ats`
 * ile değişir). F4/F5 AKIŞ-İSKELETİ invariant'larını backend kontratıyla aynı
 * uygular (tam ref-seti — actor/oversight vb. — 39d'de canlı API'ye kalır):
 * - Kanıt-kapısı: vaka YALNIZ SUPPORTED + ref'li citation'dan açılır.
 * - 3 insan-yolu (NO_CHANGE / EDIT / REJECT), EDIT/REJECT ref zorunlu.
 * - RATIONALE olmadan FINALIZE yok; otomatik-finalize YOK (karar daima insan).
 * - Export FINALIZED-only + FINALIZED→EXPORTED terminal (çift-export yasak).
 *
 * Entailment DETERMİNİSTİK: claim'in ≥4 harfli kelimeleri demo transkript
 * segmentlerinde aranır — eşleşme varsa SUPPORTED (refCount = eşleşen segment
 * sayısı), yoksa NOT_SUPPORTED; <2 anlamlı kelime = INSUFFICIENT. Böylece demo,
 * ürünün kanıt-bağlama davranışının anlamlı bir minyatürüdür (rastgelelik yok).
 */

const norm = (s: string) =>
  s
    .toLocaleLowerCase('tr-TR')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 4);

export function evaluateClaim(claim: string): CitationReceipt {
  const words = norm(claim);
  const citationKey = `cit-${words.length}-${claim.length}`;
  if (words.length < 2) {
    return { citationKey, entailment: 'INSUFFICIENT', resolvedRefCount: 0 };
  }
  const matched = DEMO_SEGMENTS.filter((seg) => {
    const text = seg.text.toLocaleLowerCase('tr-TR');
    return words.some((w) => text.includes(w));
  });
  const entailment: Entailment = matched.length > 0 ? 'SUPPORTED' : 'NOT_SUPPORTED';
  return { citationKey, entailment, resolvedRefCount: matched.length };
}

interface CaseRecord {
  state: CaseState;
  citationKey: string;
  refs: string[];
}

const cases = new Map<string, CaseRecord>();
let caseSeq = 0;

/** Test izolasyonu için (yalnız test kullanır). */
export function resetDemoEngine(): void {
  cases.clear();
  caseSeq = 0;
}

export function listCases(): CaseSummary[] {
  return Array.from(cases.entries()).map(([caseKey, r]) => ({ caseKey, state: r.state }));
}

export function getCaseDetail(caseKey: string): { state: CaseState; sourceEvidenceRefs: string[] } {
  const r = cases.get(caseKey);
  if (!r) throw new Error(`Vaka bulunamadı: ${caseKey}`);
  return { state: r.state, sourceEvidenceRefs: r.refs };
}

/** Kanıt-kapısı: yalnız SUPPORTED + ref'li citation vaka açar. */
export function openCase(citation: CitationReceipt): { caseKey: string } {
  if (citation.entailment !== 'SUPPORTED' || citation.resolvedRefCount < 1) {
    throw new Error('Yalnız SUPPORTED + kaynaklı citation vaka açabilir (kanıt-kapısı).');
  }
  caseSeq += 1;
  const caseKey = `case-${caseSeq}`;
  cases.set(caseKey, {
    state: 'AI_SUGGESTED',
    citationKey: citation.citationKey,
    refs: [citation.citationKey],
  });
  return { caseKey };
}

type Action = 'START' | 'REVIEWED_NO_CHANGE' | 'EDIT' | 'REJECT' | 'RATIONALE';

const TRANSITIONS: Record<Action, { from: CaseState[]; to: CaseState; refRequired: boolean }> = {
  START: { from: ['AI_SUGGESTED'], to: 'HUMAN_REVIEWING', refRequired: false },
  REVIEWED_NO_CHANGE: {
    from: ['HUMAN_REVIEWING'],
    to: 'HUMAN_REVIEWED_NO_CHANGE',
    refRequired: false,
  },
  EDIT: { from: ['HUMAN_REVIEWING'], to: 'HUMAN_EDITED', refRequired: true },
  REJECT: { from: ['HUMAN_REVIEWING'], to: 'AI_SUGGESTION_REJECTED', refRequired: true },
  RATIONALE: {
    from: ['HUMAN_REVIEWED_NO_CHANGE', 'HUMAN_EDITED', 'AI_SUGGESTION_REJECTED'],
    to: 'HUMAN_RATIONALE_RECORDED',
    refRequired: true,
  },
};

export function transition(caseKey: string, action: Action, ref?: string): CaseState {
  const r = cases.get(caseKey);
  if (!r) throw new Error(`Vaka bulunamadı: ${caseKey}`);
  const rule = TRANSITIONS[action];
  if (!rule.from.includes(r.state)) {
    throw new Error(`Geçersiz geçiş: ${r.state} durumunda ${action} yapılamaz.`);
  }
  if (rule.refRequired && !ref?.trim()) {
    throw new Error(`${action} için referans zorunlu (denetim izi).`);
  }
  if (ref?.trim()) r.refs.push(ref.trim());
  r.state = rule.to;
  return r.state;
}

/** FINALIZE ayrı ve açık: karar-ref zorunlu; RATIONALE sonrası tek giriş. */
export function finalizeCase(caseKey: string, decisionOutcomeRef: string): CaseState {
  const r = cases.get(caseKey);
  if (!r) throw new Error(`Vaka bulunamadı: ${caseKey}`);
  if (r.state !== 'HUMAN_RATIONALE_RECORDED') {
    throw new Error('FINALIZE yalnız RATIONALE kaydından sonra yapılabilir.');
  }
  if (!decisionOutcomeRef.trim()) throw new Error('Karar referansı zorunlu.');
  r.refs.push(decisionOutcomeRef.trim());
  r.state = 'FINALIZED';
  return r.state;
}

/**
 * Export FINALIZED-only + FINALIZED→EXPORTED idari geçiş (Codex 019f2850:
 * kanonik backend çift-export'u yapısal reddeder — vaka EXPORTED terminaline
 * geçer; ikinci export bu kapıda düşer). Digest deterministik (FNV-1a).
 */
export function exportPacket(
  caseKey: string,
  criterionId: string,
  jobRelRef: string,
): ExportReceipt {
  const r = cases.get(caseKey);
  if (!r) throw new Error(`Vaka bulunamadı: ${caseKey}`);
  if (r.state === 'EXPORTED') throw new Error('Bu vaka zaten export edildi (çift-export yasak).');
  if (r.state !== 'FINALIZED') throw new Error('Export yalnız FINALIZED vakada yapılabilir.');
  if (!criterionId.trim() || !jobRelRef.trim()) {
    throw new Error('Kriter + iş-ilgisi referansı zorunlu (F7).');
  }
  const material = [caseKey, r.citationKey, ...r.refs, criterionId.trim(), jobRelRef.trim()].join(
    '|',
  );
  let h = 0x811c9dc5;
  for (let i = 0; i < material.length; i += 1) {
    h ^= material.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  const packetDigest = `demo-${h.toString(16).padStart(8, '0')}${material.length.toString(16).padStart(4, '0')}`;
  r.state = 'EXPORTED';
  return { packetDigest, claimCount: 1 };
}
