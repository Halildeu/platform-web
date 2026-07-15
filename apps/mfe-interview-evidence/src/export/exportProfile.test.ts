import { describe, expect, test } from 'vitest';
import { parseExportProfile } from './exportProfile';

const VALID = {
  version: 1,
  binding: { interviewId: 'iv-smoke-1' },
  generatorVersionRef: 'gen-1',
  locale: 'tr-TR',
  timezone: 'Europe/Istanbul',
  aiAssistanceDisclosureRef: 'disclosure-1',
  rubricVersionRef: 'rubric-v1',
  redactionPolicyRef: 'redact-pol-1',
  redactionRunRef: 'redact-run-1',
  retentionPolicyRef: 'retain-pol-1',
  signatureRef: 'sig-1',
  schemaDigest: 'a'.repeat(64),
  criteria: [
    { criterionId: 'crit-1', jobRelatednessRationaleRef: 'jr-1' },
    { criterionId: 'crit-2', jobRelatednessRationaleRef: 'jr-2' },
  ],
};

const withOverrides = (over: Record<string, unknown>) =>
  parseExportProfile(JSON.stringify({ ...VALID, ...over }));

describe('parseExportProfile — versioned strict fail-closed (Codex 7d şartları)', () => {
  test('geçerli profil frozen olarak döner', () => {
    const r = parseExportProfile(JSON.stringify(VALID));
    expect(r.kind).toBe('ok');
    if (r.kind !== 'ok') return;
    expect(r.profile.binding.interviewId).toBe('iv-smoke-1');
    expect(r.profile.criteria).toHaveLength(2);
    expect(Object.isFrozen(r.profile)).toBe(true);
    expect(Object.isFrozen(r.profile.criteria)).toBe(true);
  });

  test('boş/whitespace env → missing (config-error DEĞİL; profil opsiyonel yüzey)', () => {
    expect(parseExportProfile('')).toEqual({ kind: 'missing' });
    expect(parseExportProfile('   ')).toEqual({ kind: 'missing' });
  });

  test.each([
    ['bozuk JSON', '{bozuk'],
    ['kök dizi', '[]'],
    ['kök string', '"x"'],
  ])('%s → config-error (JSON içeriği yankılanmaz)', (_n, raw) => {
    const r = parseExportProfile(raw);
    expect(r.kind).toBe('config-error');
    if (r.kind !== 'config-error') return;
    expect(r.reason).not.toMatch(/bozuk|\[\]|"x"/);
  });

  test('kökte bilinmeyen alan REDDEDİLİR (typo görünür); değer yankılanmaz', () => {
    const r = withOverrides({ generatorVersoinRef: 'GIZLI-deger' } as Record<string, unknown>);
    expect(r.kind).toBe('config-error');
    if (r.kind !== 'config-error') return;
    expect(r.reason).toMatch(/generatorVersoinRef/); // alan ADI gösterilir
    expect(r.reason).not.toMatch(/GIZLI-deger/); // DEĞER gösterilmez
  });

  test('version!==1 + binding eksik/bilinmeyen-alan + interviewId boş → config-error', () => {
    expect(withOverrides({ version: 2 }).kind).toBe('config-error');
    expect(withOverrides({ binding: undefined }).kind).toBe('config-error');
    expect(withOverrides({ binding: { interviewId: 'iv', extra: 'x' } }).kind).toBe('config-error');
    expect(withOverrides({ binding: { interviewId: '  ' } }).kind).toBe('config-error');
  });

  test.each([
    ['generatorVersionRef'],
    ['locale'],
    ['timezone'],
    ['aiAssistanceDisclosureRef'],
    ['rubricVersionRef'],
    ['redactionPolicyRef'],
    ['redactionRunRef'],
    ['retentionPolicyRef'],
    ['signatureRef'],
  ])('%s boş/eksik → config-error (backend validateContext aynası)', (field) => {
    expect(withOverrides({ [field]: '  ' }).kind).toBe('config-error');
    expect(withOverrides({ [field]: undefined }).kind).toBe('config-error');
  });

  test('schemaDigest: yalnız lowercase 64-hex (backend regex birebir)', () => {
    expect(withOverrides({ schemaDigest: 'A'.repeat(64) }).kind).toBe('config-error'); // uppercase backend'de düşer
    expect(withOverrides({ schemaDigest: 'a'.repeat(63) }).kind).toBe('config-error');
    expect(withOverrides({ schemaDigest: 'g'.repeat(64) }).kind).toBe('config-error');
  });

  test('criteria: boş liste / duplicate criterionId (sessiz dedupe YOK) / bilinmeyen alan → config-error', () => {
    expect(withOverrides({ criteria: [] }).kind).toBe('config-error');
    expect(
      withOverrides({
        criteria: [
          { criterionId: 'c1', jobRelatednessRationaleRef: 'j1' },
          { criterionId: 'c1', jobRelatednessRationaleRef: 'j2' },
        ],
      }).kind,
    ).toBe('config-error');
    expect(
      withOverrides({
        criteria: [{ criterionId: 'c1', jobRelatednessRationaleRef: 'j1', extra: 'x' }],
      }).kind,
    ).toBe('config-error');
    expect(
      withOverrides({ criteria: [{ criterionId: 'c1', jobRelatednessRationaleRef: ' ' }] }).kind,
    ).toBe('config-error');
  });

  test('boyut sınırları: raw 32KB + criteria 100 + string 500', () => {
    expect(parseExportProfile('x'.repeat(33_000)).kind).toBe('config-error');
    const many = Array.from({ length: 101 }, (_, i) => ({
      criterionId: `c-${i}`,
      jobRelatednessRationaleRef: 'j',
    }));
    expect(withOverrides({ criteria: many }).kind).toBe('config-error');
    expect(withOverrides({ signatureRef: 'x'.repeat(501) }).kind).toBe('config-error');
  });
});
