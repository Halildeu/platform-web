/**
 * a11y/sampling — Faz 21.11 P1b util.
 *
 * 3D chart wrappers (Surface3D, Lines3D, etc.) target the 100K soft /
 * 1M hard tier — a hidden data table with that many `<tr>`s would
 * defeat the WebGL performance claim (DOM teardown cost). The helpers
 * here build a deterministic SAMPLE of the input data so screen
 * reader users still get a representative tabular view without the
 * wrapper paying the full row count.
 *
 * Codex thread `019e10d7` iter-2 design notes:
 *
 *   - Caption MUST report the real sampled count (`sampled.length`),
 *     not the target cap. Stride math (`ceil(sqrt(N/target))`) often
 *     undershoots — e.g. 200×200 grid with target 1000 ends up
 *     ~841 samples, never exactly 1000.
 *   - Sampling logic stays OUT of the option builder helpers
 *     (`buildSurface3DOption` / `buildLines3DOption`) — option builders
 *     emit ECharts series; sampling is a separate a11y concern.
 *   - Helpers stay internal (no root barrel re-export) so the
 *     algorithm can evolve without committing to a public contract.
 *
 * @see Scatter3D.tsx — same idea inlined for the simpler 1D case
 *   (cap+title-prefix). P1b lifts the 2D / multi-path variants out.
 */

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

/** Single hidden-table row produced by the samplers. */
export interface A11ySample {
  /** Display label (e.g. `(x=12, y=4)` or `Path 3 start`). */
  label: string;
  /** Numeric value (typically z, value, or path metric). */
  value: number;
}

/** Result envelope shared by both samplers. */
export interface A11ySampleResult {
  samples: A11ySample[];
  /** Total number of source points before sampling. */
  sourceCount: number;
  /** Actual number of samples produced (≤ cap, often < cap). */
  sampledCount: number;
}

/* ------------------------------------------------------------------ */
/*  Surface3D — stratified row × column grid sampler                  */
/* ------------------------------------------------------------------ */

/**
 * Sample a row-major rectangular Surface3D grid for the hidden a11y
 * table. The stride is computed so the sample is roughly evenly
 * spaced across both axes; both edges (row 0 / col 0 and the last
 * full-stride row/col) are preserved.
 *
 * Throws if `dataShape` does not match `data.length` (Codex iter-2:
 * silent inference is unsafe — 100×400 reads as 200×200 with
 * `Math.sqrt`).
 *
 * @param data       Row-major `{x, y, z}` grid points.
 * @param dataShape  `[rows, columns]` — rows × columns must equal data.length.
 * @param cap        Maximum samples (default 1000).
 */
export function sampleSurfaceGridA11y(
  data: ReadonlyArray<{ x: number; y: number; z: number }>,
  dataShape: readonly [rows: number, columns: number],
  cap: number = 1000,
): A11ySampleResult {
  const [rows, cols] = dataShape;
  const sourceCount = data.length;
  if (rows * cols !== sourceCount) {
    throw new Error(
      `sampleSurfaceGridA11y: dataShape [${rows}, ${cols}] (= ${rows * cols}) ` +
        `does not match data.length ${sourceCount}.`,
    );
  }
  if (sourceCount === 0) {
    return { samples: [], sourceCount: 0, sampledCount: 0 };
  }
  // No sampling needed — emit the whole grid as labels/values.
  if (sourceCount <= cap) {
    const samples = data.map((p) => ({
      label: `(x=${p.x}, y=${p.y})`,
      value: p.z,
    }));
    return { samples, sourceCount, sampledCount: samples.length };
  }

  // Stride such that (rows/stride) × (cols/stride) ≈ cap.
  const stride = Math.max(1, Math.ceil(Math.sqrt(sourceCount / cap)));
  const samples: A11ySample[] = [];
  for (let r = 0; r < rows; r += stride) {
    for (let c = 0; c < cols; c += stride) {
      const idx = r * cols + c;
      const p = data[idx];
      samples.push({ label: `(x=${p.x}, y=${p.y})`, value: p.z });
    }
  }
  return { samples, sourceCount, sampledCount: samples.length };
}

/* ------------------------------------------------------------------ */
/*  Lines3D — per-path stride sampler                                  */
/* ------------------------------------------------------------------ */

/** Single Lines3D path used by the sampler (mirrors `Lines3DPath`). */
export interface Lines3DSamplerPath {
  coords: ReadonlyArray<readonly [number, number, number]>;
  label?: string;
  value?: number;
}

/**
 * Sample a multi-path Lines3D dataset. Each path's first and last
 * coordinates are always preserved; middle samples are taken at a
 * stride sized so the total respects the cap. Empty paths are
 * skipped. Caption / sample count is the union across paths.
 *
 * @param paths Multi-path xyz payload.
 * @param cap   Maximum samples (default 1000).
 */
export function sampleLines3DA11y(
  paths: ReadonlyArray<Lines3DSamplerPath>,
  cap: number = 1000,
): A11ySampleResult {
  let sourceCount = 0;
  for (const p of paths) sourceCount += p.coords.length;
  if (sourceCount === 0) {
    return { samples: [], sourceCount: 0, sampledCount: 0 };
  }
  if (sourceCount <= cap) {
    // Emit every coord as its own row.
    const samples: A11ySample[] = [];
    for (let i = 0; i < paths.length; i++) {
      const p = paths[i];
      const baseLabel = p.label ?? `Path ${i + 1}`;
      for (let j = 0; j < p.coords.length; j++) {
        const [x, y, z] = p.coords[j];
        samples.push({ label: `${baseLabel} #${j} (x=${x}, y=${y})`, value: z });
      }
    }
    return { samples, sourceCount, sampledCount: samples.length };
  }

  // Distribute the cap roughly evenly across paths; per-path budget
  // includes the mandatory first + last samples, so middle stride is
  // computed from the remainder.
  const perPath = Math.max(2, Math.floor(cap / paths.length));
  const samples: A11ySample[] = [];
  for (let i = 0; i < paths.length; i++) {
    const p = paths[i];
    const cs = p.coords;
    if (cs.length === 0) continue;
    const baseLabel = p.label ?? `Path ${i + 1}`;
    const fallbackZ = (idx: number): number => p.value ?? cs[idx][2];
    // First (always preserved).
    samples.push({
      label: `${baseLabel} start`,
      value: fallbackZ(0),
    });
    if (cs.length === 1) continue;
    // Middle stride if budget permits. Use `ceil` for the divisor so
    // the resulting sample count stays under `perPath`; otherwise a
    // floor-based stride could overshoot the per-path budget on
    // borderline lengths and push the total above `cap`.
    if (perPath > 2 && cs.length > 2) {
      const middleBudget = perPath - 2;
      const stride = Math.max(1, Math.ceil((cs.length - 2) / middleBudget));
      for (let j = stride; j < cs.length - 1; j += stride) {
        const [x, y, z] = cs[j];
        samples.push({ label: `${baseLabel} #${j} (x=${x}, y=${y})`, value: z });
      }
    }
    // Last (always preserved when path has >1 coord).
    samples.push({
      label: `${baseLabel} end`,
      value: fallbackZ(cs.length - 1),
    });
  }
  return { samples, sourceCount, sampledCount: samples.length };
}

/* ------------------------------------------------------------------ */
/*  Caption builder                                                    */
/* ------------------------------------------------------------------ */

/**
 * Build a screen-reader-friendly title suffix that discloses the
 * sample disclosure. Returns the `title` unchanged when no sampling
 * happened (sourceCount === sampledCount). Codex iter-2: the suffix
 * always reports the real sample count, never the cap target.
 *
 * @example
 *   buildSampledCaption('Sales 3D', { sourceCount: 40000, sampledCount: 841, unit: 'vertices' })
 *   // → 'Sales 3D (showing 841 of 40000 vertices)'
 */
export function buildSampledCaption(
  title: string | undefined,
  { sourceCount, sampledCount, unit }: { sourceCount: number; sampledCount: number; unit: string },
): string | undefined {
  if (sourceCount === sampledCount) return title;
  const note = `(showing ${sampledCount} of ${sourceCount} ${unit})`;
  return title ? `${title} ${note}` : note;
}
