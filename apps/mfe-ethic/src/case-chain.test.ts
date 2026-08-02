import { describe, expect, test } from 'vitest';
import { BAND_RANGES, RETALIATION_INDICATORS, bandForScore } from './ethics-api';

/**
 * ES-213 (#3375) — the two vocabularies this UI must not drift from.
 *
 * <p>Both are written down elsewhere: the bands in Açık Holding's İHLAL AĞIRLIK CETVELİ,
 * the indicators in Directive 2019/1937 art. 19. A UI that quietly disagrees with either
 * would show a handler one thing and record another, and the divergence would surface
 * months later as a case whose band nobody can explain.
 */
describe('case chain vocabularies', () => {
  test('the bands cover 1-40 with no gap and no overlap', () => {
    const covered = new Set<number>();
    for (const [, [min, max]] of Object.entries(BAND_RANGES)) {
      for (let i = min; i <= max; i += 1) {
        // A score landing in two bands would let the same violation be filed either way.
        expect(covered.has(i)).toBe(false);
        covered.add(i);
      }
    }
    // Array.from rather than spreading the Set: the app's tsconfig targets below es2015
    // for iteration, and a spread here fails the typecheck CI runs even though vitest,
    // which does not typecheck, is perfectly happy with it.
    const scores = Array.from(covered);
    expect(scores.length).toBe(40);
    expect(Math.min.apply(null, scores)).toBe(1);
    expect(Math.max.apply(null, scores)).toBe(40);
  });

  test('bandForScore matches the scale at every boundary', () => {
    expect(bandForScore(1)).toBe('HAFIF');
    expect(bandForScore(10)).toBe('HAFIF');
    expect(bandForScore(11)).toBe('ORTA');
    expect(bandForScore(20)).toBe('ORTA');
    expect(bandForScore(21)).toBe('AGIR');
    expect(bandForScore(30)).toBe('AGIR');
    expect(bandForScore(31)).toBe('COK_AGIR');
    expect(bandForScore(40)).toBe('COK_AGIR');
    expect(bandForScore(0)).toBeNull();
    expect(bandForScore(41)).toBeNull();
  });

  test('the retaliation list is art. 19 in full, with a label for each', () => {
    // Fifteen, because the article lists fifteen. Pinning the count rather than a subset
    // means dropping one is a test failure rather than a quietly narrower question.
    expect(RETALIATION_INDICATORS).toHaveLength(15);
    const codes = RETALIATION_INDICATORS.map(([code]) => code);
    expect(new Set(codes).size).toBe(15);
    for (const [code, label] of RETALIATION_INDICATORS) {
      expect(code).toMatch(/^[A-Z_]{3,48}$/);
      // A code with no Turkish rendering would reach the handler as SCREAMING_SNAKE_CASE,
      // which reads as a system value and not as a thing that happened to a person.
      expect(label.length).toBeGreaterThan(8);
    }
  });

  test('the codes match the server vocabulary exactly', () => {
    // The server's CHECK constraint (V22) accepts these and nothing else; a code that
    // exists only here would be refused at conclude time, after the handler had already
    // typed the observation.
    expect(RETALIATION_INDICATORS.map(([c]) => c)).toEqual([
      'SUSPENSION', 'DEMOTION', 'DUTY_TRANSFER', 'TRAINING_WITHHELD', 'NEGATIVE_APPRAISAL',
      'DISCIPLINARY_MEASURE', 'COERCION', 'DISCRIMINATION', 'CONTRACT_NOT_CONVERTED',
      'CONTRACT_NOT_RENEWED', 'REPUTATION_HARM', 'BLACKLISTING', 'CONTRACT_TERMINATION',
      'LICENCE_REVOCATION', 'PSYCHIATRIC_REFERRAL',
    ]);
  });
});
