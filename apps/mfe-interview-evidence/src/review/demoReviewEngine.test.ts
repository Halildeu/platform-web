import { beforeEach, describe, expect, test } from 'vitest';
import {
  evaluateClaim,
  exportPacket,
  finalizeCase,
  getCaseDetail,
  listCases,
  openCase,
  resetDemoEngine,
  transition,
} from './demoReviewEngine';

beforeEach(() => resetDemoEngine());

describe('evaluateClaim (deterministik entailment)', () => {
  test('demo segmentlerde geçen kelimeler → SUPPORTED + refCount', () => {
    // "teknik" + "liderliğini" segment-3 metninde geçer
    const r = evaluateClaim('aday teknik liderliğini yürüttü');
    expect(r.entailment).toBe('SUPPORTED');
    expect(r.resolvedRefCount).toBeGreaterThan(0);
  });

  test('segmentlerde geçmeyen kelimeler → NOT_SUPPORTED + 0 ref', () => {
    const r = evaluateClaim('kuantum fiziği doktorası tamamlandı');
    expect(r.entailment).toBe('NOT_SUPPORTED');
    expect(r.resolvedRefCount).toBe(0);
  });

  test('<2 anlamlı kelime → INSUFFICIENT', () => {
    expect(evaluateClaim('evet').entailment).toBe('INSUFFICIENT');
    expect(evaluateClaim('').entailment).toBe('INSUFFICIENT');
  });
});

describe('kanıt-kapısı + F5 state-machine', () => {
  const supported = () => evaluateClaim('aday teknik liderliğini yürüttü');

  test('NOT_SUPPORTED/INSUFFICIENT vaka AÇAMAZ (kanıt-kapısı)', () => {
    expect(() => openCase(evaluateClaim('kuantum fiziği doktorası'))).toThrow(/kanıt-kapısı/);
    expect(() => openCase(evaluateClaim('evet'))).toThrow(/kanıt-kapısı/);
  });

  test('mutlu yol: AI_SUGGESTED→REVIEWING→NO_CHANGE→RATIONALE→FINALIZED→export', () => {
    const { caseKey } = openCase(supported());
    expect(getCaseDetail(caseKey).state).toBe('AI_SUGGESTED');
    expect(transition(caseKey, 'START')).toBe('HUMAN_REVIEWING');
    expect(transition(caseKey, 'REVIEWED_NO_CHANGE')).toBe('HUMAN_REVIEWED_NO_CHANGE');
    expect(transition(caseKey, 'RATIONALE', 'ref-gerekce-1')).toBe('HUMAN_RATIONALE_RECORDED');
    expect(finalizeCase(caseKey, 'ref-karar-1')).toBe('FINALIZED');
    const receipt = exportPacket(caseKey, 'c-teknik-yetkinlik', 'ref-is-ilgisi');
    expect(receipt.packetDigest).toMatch(/^demo-[0-9a-f]{12}$/);
    expect(receipt.claimCount).toBe(1);
  });

  test('EDIT/REJECT/RATIONALE ref ZORUNLU (denetim izi)', () => {
    const { caseKey } = openCase(supported());
    transition(caseKey, 'START');
    expect(() => transition(caseKey, 'EDIT')).toThrow(/referans zorunlu/);
    expect(() => transition(caseKey, 'REJECT', '  ')).toThrow(/referans zorunlu/);
    transition(caseKey, 'EDIT', 'ref-duzenleme');
    expect(() => transition(caseKey, 'RATIONALE')).toThrow(/referans zorunlu/);
  });

  test('REJECT yolu da RATIONALE üzerinden FINALIZE edilir (3. insan-yolu)', () => {
    const { caseKey } = openCase(supported());
    transition(caseKey, 'START');
    expect(transition(caseKey, 'REJECT', 'ref-ret')).toBe('AI_SUGGESTION_REJECTED');
    transition(caseKey, 'RATIONALE', 'ref-gerekce');
    expect(finalizeCase(caseKey, 'ref-karar')).toBe('FINALIZED');
  });

  test('no-auto-finalize: RATIONALE olmadan FINALIZE YASAK', () => {
    const { caseKey } = openCase(supported());
    transition(caseKey, 'START');
    transition(caseKey, 'REVIEWED_NO_CHANGE');
    expect(() => finalizeCase(caseKey, 'ref-karar')).toThrow(/RATIONALE/);
  });

  test('export FINALIZED-only', () => {
    const { caseKey } = openCase(supported());
    transition(caseKey, 'START');
    expect(() => exportPacket(caseKey, 'c-1', 'ref-j')).toThrow(/FINALIZED/);
  });

  test('geçersiz geçiş reddedilir + listCases vaka durumunu yansıtır', () => {
    const { caseKey } = openCase(supported());
    expect(() => transition(caseKey, 'REVIEWED_NO_CHANGE')).toThrow(/Geçersiz geçiş/);
    expect(listCases()).toEqual([{ caseKey, state: 'AI_SUGGESTED' }]);
  });
});
