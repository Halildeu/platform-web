/**
 * a11y/sampling — pure helper tests (Faz 21.11 P1b).
 *
 * Locks the stratified Surface3D + per-path Lines3D sampling
 * contracts the 3D wrappers depend on, plus the caption builder.
 */
import { describe, it, expect } from 'vitest';
import { sampleSurfaceGridA11y, sampleLines3DA11y, buildSampledCaption } from '../sampling';

describe('sampleSurfaceGridA11y', () => {
  it('throws when dataShape does not match data.length (Codex iter-2 invariant)', () => {
    expect(() =>
      sampleSurfaceGridA11y(
        [
          { x: 0, y: 0, z: 0 },
          { x: 1, y: 0, z: 1 },
          { x: 0, y: 1, z: 2 },
          { x: 1, y: 1, z: 3 },
        ],
        [3, 3], // 9 ≠ 4
      ),
    ).toThrow(/dataShape \[3, 3\] \(= 9\) does not match data.length 4/);
  });

  it('returns empty samples for empty data', () => {
    const out = sampleSurfaceGridA11y([], [0, 0]);
    expect(out.samples).toEqual([]);
    expect(out.sourceCount).toBe(0);
    expect(out.sampledCount).toBe(0);
  });

  it('emits every point unchanged when data.length <= cap', () => {
    const data = [
      { x: 0, y: 0, z: 1 },
      { x: 1, y: 0, z: 2 },
      { x: 0, y: 1, z: 3 },
      { x: 1, y: 1, z: 4 },
    ];
    const out = sampleSurfaceGridA11y(data, [2, 2], 1000);
    expect(out.samples).toEqual([
      { label: '(x=0, y=0)', value: 1 },
      { label: '(x=1, y=0)', value: 2 },
      { label: '(x=0, y=1)', value: 3 },
      { label: '(x=1, y=1)', value: 4 },
    ]);
    expect(out.sourceCount).toBe(4);
    expect(out.sampledCount).toBe(4);
  });

  it('strides a 200x200 grid down to <= cap (Codex iter-2: real count, not the cap)', () => {
    const data = Array.from({ length: 200 * 200 }, (_, i) => ({
      x: i % 200,
      y: Math.floor(i / 200),
      z: i,
    }));
    const out = sampleSurfaceGridA11y(data, [200, 200], 1000);
    expect(out.sourceCount).toBe(40000);
    // Stride = ceil(sqrt(40000 / 1000)) = 7. (200/7) * (200/7) ≈ 841.
    expect(out.sampledCount).toBeLessThanOrEqual(1000);
    expect(out.sampledCount).toBeGreaterThan(800);
    // Both edges (row 0, col 0) preserved.
    expect(out.samples[0]).toEqual({ label: '(x=0, y=0)', value: 0 });
  });
});

describe('sampleLines3DA11y', () => {
  it('returns empty samples for empty paths', () => {
    expect(sampleLines3DA11y([], 1000)).toEqual({
      samples: [],
      sourceCount: 0,
      sampledCount: 0,
    });
  });

  it('emits every coord unchanged when total <= cap', () => {
    const paths = [
      {
        coords: [
          [0, 0, 0],
          [1, 1, 2],
        ] as ReadonlyArray<readonly [number, number, number]>,
        label: 'Alpha',
      },
      {
        coords: [
          [0, 0, 0],
          [2, 0, 4],
        ] as ReadonlyArray<readonly [number, number, number]>,
        label: 'Beta',
      },
    ];
    const out = sampleLines3DA11y(paths, 1000);
    expect(out.sourceCount).toBe(4);
    expect(out.sampledCount).toBe(4);
    expect(out.samples[0].label).toBe('Alpha #0 (x=0, y=0)');
    expect(out.samples[3].label).toBe('Beta #1 (x=2, y=0)');
  });

  it('preserves first + last per path under stride sampling', () => {
    // 5 paths × 1000 coords = 5000 → cap 1000 → ~200 per path budget.
    const paths = Array.from({ length: 5 }, (_, i) => ({
      coords: Array.from(
        { length: 1000 },
        (_, j) => [j, j, j] as readonly [number, number, number],
      ),
      label: `Path${i + 1}`,
    }));
    const out = sampleLines3DA11y(paths, 1000);
    expect(out.sourceCount).toBe(5000);
    expect(out.sampledCount).toBeLessThanOrEqual(1000);
    // First sample of each path is `<label> start`.
    const startLabels = out.samples.filter((s) => s.label.endsWith('start'));
    expect(startLabels).toHaveLength(5);
    // Last sample of each path is `<label> end`.
    const endLabels = out.samples.filter((s) => s.label.endsWith('end'));
    expect(endLabels).toHaveLength(5);
  });

  it('falls back to default labels when path.label is omitted', () => {
    const paths = [{ coords: [[0, 0, 0]] as ReadonlyArray<readonly [number, number, number]> }];
    const out = sampleLines3DA11y(paths, 1000);
    expect(out.samples[0].label).toMatch(/^Path 1/);
  });

  it('skips empty paths but preserves index numbering', () => {
    const paths = [
      { coords: [] as ReadonlyArray<readonly [number, number, number]> },
      { coords: [[0, 0, 0]] as ReadonlyArray<readonly [number, number, number]>, label: 'Beta' },
    ];
    const out = sampleLines3DA11y(paths, 1000);
    expect(out.samples).toHaveLength(1);
    expect(out.samples[0].label).toMatch(/Beta/);
  });
});

describe('buildSampledCaption', () => {
  it('returns the title unchanged when no sampling happened', () => {
    expect(
      buildSampledCaption('Title', { sourceCount: 100, sampledCount: 100, unit: 'vertices' }),
    ).toBe('Title');
  });

  it('appends the real sampled count (not the cap target) when sampling was applied', () => {
    expect(
      buildSampledCaption('Sales 3D', { sourceCount: 40000, sampledCount: 841, unit: 'vertices' }),
    ).toBe('Sales 3D (showing 841 of 40000 vertices)');
  });

  it('returns standalone caption when title is undefined', () => {
    expect(
      buildSampledCaption(undefined, { sourceCount: 5000, sampledCount: 800, unit: 'points' }),
    ).toBe('(showing 800 of 5000 points)');
  });
});
