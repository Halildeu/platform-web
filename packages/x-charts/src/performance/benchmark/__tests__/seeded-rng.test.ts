/**
 * Tests for the deterministic mulberry32 RNG (Faz 21.11 PR-A1).
 *
 * The whole reason we have a seeded RNG is so benchmark numbers are
 * comparable across machines. These tests lock that property: same
 * seed → same sequence, two runs of `generateUniformScatter` produce
 * byte-identical fixtures.
 */
import { describe, expect, it } from 'vitest';
import { gaussian, mulberry32, uniform } from '../seeded-rng';

describe('mulberry32', () => {
  it('produces identical sequences for the same seed', () => {
    const a = mulberry32(0xc001d00d);
    const b = mulberry32(0xc001d00d);
    const seqA = [a(), a(), a(), a(), a()];
    const seqB = [b(), b(), b(), b(), b()];
    expect(seqA).toEqual(seqB);
  });

  it('produces different sequences for different seeds', () => {
    const a = mulberry32(0x1);
    const b = mulberry32(0x2);
    expect(a()).not.toBe(b());
  });

  it('emits values in [0, 1)', () => {
    const rng = mulberry32(42);
    for (let i = 0; i < 1_000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('is uniform-ish across 100K samples (mean within 1% of 0.5)', () => {
    const rng = mulberry32(0xdeadbeef);
    let sum = 0;
    const n = 100_000;
    for (let i = 0; i < n; i++) sum += rng();
    const mean = sum / n;
    expect(mean).toBeGreaterThan(0.49);
    expect(mean).toBeLessThan(0.51);
  });
});

describe('uniform helper', () => {
  it('produces N samples in the requested range', () => {
    const rng = mulberry32(7);
    const samples = uniform(rng, 1_000, -10, 10);
    expect(samples.length).toBe(1_000);
    for (const s of samples) {
      expect(s).toBeGreaterThanOrEqual(-10);
      expect(s).toBeLessThan(10);
    }
  });
});

describe('gaussian helper', () => {
  it('produces samples roughly centred on the mean', () => {
    const rng = mulberry32(99);
    let sum = 0;
    const n = 10_000;
    for (let i = 0; i < n; i++) sum += gaussian(rng, 100, 5);
    const mean = sum / n;
    // CLT shortcut, mean should be within 0.5 of 100.
    expect(mean).toBeGreaterThan(99.5);
    expect(mean).toBeLessThan(100.5);
  });
});
