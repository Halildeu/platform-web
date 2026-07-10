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
import { DEMO_SEGMENTS } from '../segment-view/demo-data';

beforeEach(() => resetDemoEngine());

describe('evaluateClaim (deterministik entailment)', () => {
  test('demo segmentlerde geçen kelimeler → SUPPORTED + refCount', () => {
    // "teknik" + "liderliğini" segment-3 metninde geçer
    const r = evaluateClaim('aday teknik liderliğini yürüttü', DEMO_SEGMENTS, 'tr-demo-1');
    expect(r.entailment).toBe('SUPPORTED');
    expect(r.resolvedRefCount).toBeGreaterThan(0);
  });

  test('segmentlerde geçmeyen kelimeler → NOT_SUPPORTED + 0 ref', () => {
    const r = evaluateClaim('kuantum fiziği doktorası tamamlandı', DEMO_SEGMENTS, 'tr-demo-1');
    expect(r.entailment).toBe('NOT_SUPPORTED');
    expect(r.resolvedRefCount).toBe(0);
  });

  test('<2 anlamlı kelime → INSUFFICIENT', () => {
    expect(evaluateClaim('evet', DEMO_SEGMENTS, 'tr-demo-1').entailment).toBe('INSUFFICIENT');
    expect(evaluateClaim('', DEMO_SEGMENTS, 'tr-demo-1').entailment).toBe('INSUFFICIENT');
  });
});

describe('kanıt-kapısı + F5 state-machine', () => {
  const supported = () =>
    evaluateClaim('aday teknik liderliğini yürüttü', DEMO_SEGMENTS, 'tr-demo-1');

  test('NOT_SUPPORTED/INSUFFICIENT vaka AÇAMAZ (kanıt-kapısı)', () => {
    expect(() =>
      openCase(evaluateClaim('kuantum fiziği doktorası', DEMO_SEGMENTS, 'tr-demo-1'), 'tr-demo-1'),
    ).toThrow(/kanıt-kapısı/);
    expect(() => openCase(evaluateClaim('evet', DEMO_SEGMENTS, 'tr-demo-1'), 'tr-demo-1')).toThrow(
      /kanıt-kapısı/,
    );
  });

  test('mutlu yol: AI_SUGGESTED→REVIEWING→NO_CHANGE→RATIONALE→FINALIZED→export', () => {
    const { caseKey } = openCase(supported(), 'tr-demo-1');
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
    const { caseKey } = openCase(supported(), 'tr-demo-1');
    transition(caseKey, 'START');
    expect(() => transition(caseKey, 'EDIT')).toThrow(/referans zorunlu/);
    expect(() => transition(caseKey, 'REJECT', '  ')).toThrow(/referans zorunlu/);
    transition(caseKey, 'EDIT', 'ref-duzenleme');
    expect(() => transition(caseKey, 'RATIONALE')).toThrow(/referans zorunlu/);
  });

  test('REJECT yolu da RATIONALE üzerinden FINALIZE edilir (3. insan-yolu)', () => {
    const { caseKey } = openCase(supported(), 'tr-demo-1');
    transition(caseKey, 'START');
    expect(transition(caseKey, 'REJECT', 'ref-ret')).toBe('AI_SUGGESTION_REJECTED');
    transition(caseKey, 'RATIONALE', 'ref-gerekce');
    expect(finalizeCase(caseKey, 'ref-karar')).toBe('FINALIZED');
  });

  test('no-auto-finalize: RATIONALE olmadan FINALIZE YASAK', () => {
    const { caseKey } = openCase(supported(), 'tr-demo-1');
    transition(caseKey, 'START');
    transition(caseKey, 'REVIEWED_NO_CHANGE');
    expect(() => finalizeCase(caseKey, 'ref-karar')).toThrow(/RATIONALE/);
  });

  test('export FINALIZED-only', () => {
    const { caseKey } = openCase(supported(), 'tr-demo-1');
    transition(caseKey, 'START');
    expect(() => exportPacket(caseKey, 'c-1', 'ref-j')).toThrow(/FINALIZED/);
  });

  test('export FINALIZED→EXPORTED terminal geçişi + çift-export YASAK (Codex 019f2850)', () => {
    const { caseKey } = openCase(supported(), 'tr-demo-1');
    transition(caseKey, 'START');
    transition(caseKey, 'REVIEWED_NO_CHANGE');
    transition(caseKey, 'RATIONALE', 'ref-g');
    finalizeCase(caseKey, 'ref-k');
    exportPacket(caseKey, 'c-1', 'ref-j');
    expect(getCaseDetail(caseKey).state).toBe('EXPORTED');
    expect(listCases('tr-demo-1')).toEqual([{ caseKey, state: 'EXPORTED' }]);
    expect(() => exportPacket(caseKey, 'c-1', 'ref-j')).toThrow(/zaten export/);
  });

  test('geçersiz geçiş reddedilir + listCases vaka durumunu yansıtır', () => {
    const { caseKey } = openCase(supported(), 'tr-demo-1');
    expect(() => transition(caseKey, 'REVIEWED_NO_CHANGE')).toThrow(/Geçersiz geçiş/);
    expect(listCases('tr-demo-1')).toEqual([{ caseKey, state: 'AI_SUGGESTED' }]);
  });
});

describe('kanıt-bağlama + transkript-scope (39c-7)', () => {
  const OTHER_SEGMENTS = [
    {
      index: 0,
      speakerLabel: 'S1',
      startMs: 0,
      endMs: 1000,
      text: 'Demo yer-tutucu transkript — yüklenen kanıt ev-abc için üretilecek.',
    },
  ];

  test('entailment VERİLEN segmentlere karşı hesaplanır (transkript-başına kanıt)', () => {
    // "tutucu" + "kanıt" yalnız OTHER_SEGMENTS metninde geçer
    const onOther = evaluateClaim('yer tutucu kanıt transkript', OTHER_SEGMENTS, 'tr-other');
    expect(onOther.entailment).toBe('SUPPORTED');
    const onDemo = evaluateClaim('yer tutucu kanıt transkript', DEMO_SEGMENTS, 'tr-demo-1');
    expect(onDemo.entailment).toBe('NOT_SUPPORTED');
  });

  test('çapraz-transkript citation ile vaka açmak YAPISAL RED (kanıt-bağlama)', () => {
    const citation = evaluateClaim('yer tutucu kanıt transkript', OTHER_SEGMENTS, 'tr-other');
    expect(citation.entailment).toBe('SUPPORTED');
    expect(() => openCase(citation, 'tr-demo-1')).toThrow(/kanıt-bağlama/);
  });

  test("listCases transkript-scope'lu: başka transkriptin vakası görünmez", () => {
    const demoCase = openCase(
      evaluateClaim('aday teknik liderliğini yürüttü', DEMO_SEGMENTS, 'tr-demo-1'),
      'tr-demo-1',
    );
    const otherCase = openCase(
      evaluateClaim('yer tutucu kanıt transkript', OTHER_SEGMENTS, 'tr-other'),
      'tr-other',
    );
    expect(listCases('tr-demo-1').map((c) => c.caseKey)).toEqual([demoCase.caseKey]);
    expect(listCases('tr-other').map((c) => c.caseKey)).toEqual([otherCase.caseKey]);
  });

  test('transkript anahtarı boşsa evaluateClaim RED (fail-closed)', () => {
    expect(() => evaluateClaim('aday teknik liderlik', DEMO_SEGMENTS, ' ')).toThrow(
      /Transkript anahtarı zorunlu/,
    );
  });
});
