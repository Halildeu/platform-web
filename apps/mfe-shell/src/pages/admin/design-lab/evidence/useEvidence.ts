/**
 * Hook that reads the evidence registry and provides typed data to panels.
 * Production: /evidence-registry.v1.json (public, build-time synced via scripts/sync-public-evidence.mjs)
 * Dev fallback: .evidence/registry.json
 * Fallback: returns "no data" state
 *
 * Schema v1 (K2 — Wave 1.1):
 *   - schema_version: 1
 *   - per-section provenance: 'live' | 'ci' | 'derived' | 'no_data'
 *   - source_refs: workflow path eşlemesi
 */

import { useState, useEffect, useRef } from 'react';

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */

export type EvidenceStatus =
  | 'configured'
  | 'passing'
  | 'failing'
  | 'never_run'
  | 'missing'
  | 'no_data';

export type EvidenceProvenance = 'live' | 'ci' | 'derived' | 'no_data';

export interface VisualRegressionEvidence {
  provider: 'chromatic' | 'playwright' | 'none';
  workflow_exists: boolean;
  last_run: string | null;
  status: EvidenceStatus;
  stats: {
    pass: number;
    fail: number;
    changed: number;
    new: number;
    skipped: number;
  };
}

export interface SecurityCheckEvidence {
  workflow_exists: boolean;
  status: EvidenceStatus;
}

export interface SecurityEvidence {
  codeql: SecurityCheckEvidence;
  secret_scan: SecurityCheckEvidence;
  trivy: SecurityCheckEvidence;
  sbom: SecurityCheckEvidence;
  guardrails: SecurityCheckEvidence;
  [key: string]: SecurityCheckEvidence;
}

export interface BenchmarksEvidence {
  workflow_exists: boolean;
  last_run: string | null;
  threshold_enforced: boolean;
  results: Record<string, unknown>;
}

export interface CoverageEvidence {
  available: boolean;
  lines: number | null;
  branches: number | null;
  functions: number | null;
  statements: number | null;
}

export interface CompatibilityEvidence {
  workflow_exists: boolean;
  matrix: {
    node: string[];
    react: string[];
  };
}

export interface TestSuiteEvidence {
  files: number;
  tests: number;
  pass: number;
  fail: number;
}

export interface TestsEvidence {
  design_system: TestSuiteEvidence;
  x_suite: TestSuiteEvidence;
  shell: TestSuiteEvidence;
  [key: string]: TestSuiteEvidence;
}

export interface DocsTruthEvidence {
  phantom_imports: number;
  stale_examples: number;
  last_check: string | null;
}

export interface EvidenceRegistry {
  schema_version?: number;
  generated_by?: string;
  timestamp: string;
  version: string;
  visual_regression: VisualRegressionEvidence;
  security: SecurityEvidence;
  benchmarks: BenchmarksEvidence;
  coverage: CoverageEvidence;
  compatibility: CompatibilityEvidence;
  tests: TestsEvidence;
  docs_truth: DocsTruthEvidence;
  provenance?: Partial<
    Record<
      | 'visual_regression'
      | 'security'
      | 'benchmarks'
      | 'coverage'
      | 'compatibility'
      | 'tests'
      | 'docs_truth',
      EvidenceProvenance
    >
  >;
  source_refs?: Record<string, string>;
}

export type EvidenceState =
  | { status: 'loading' }
  | { status: 'loaded'; data: EvidenceRegistry }
  | { status: 'no_data' };

/* ------------------------------------------------------------------ */
/*  Fallback (no_data) registry                                         */
/* ------------------------------------------------------------------ */

const NO_DATA_CHECK: SecurityCheckEvidence = { workflow_exists: false, status: 'no_data' };
const NO_DATA_SUITE: TestSuiteEvidence = { files: 0, tests: 0, pass: 0, fail: 0 };

export const FALLBACK_REGISTRY: EvidenceRegistry = {
  timestamp: '',
  version: '0.0.0',
  visual_regression: {
    provider: 'none',
    workflow_exists: false,
    last_run: null,
    status: 'no_data',
    stats: { pass: 0, fail: 0, changed: 0, new: 0, skipped: 0 },
  },
  security: {
    codeql: NO_DATA_CHECK,
    secret_scan: NO_DATA_CHECK,
    trivy: NO_DATA_CHECK,
    sbom: NO_DATA_CHECK,
    guardrails: NO_DATA_CHECK,
  },
  benchmarks: {
    workflow_exists: false,
    last_run: null,
    threshold_enforced: false,
    results: {},
  },
  coverage: {
    available: false,
    lines: null,
    branches: null,
    functions: null,
    statements: null,
  },
  compatibility: {
    workflow_exists: false,
    matrix: { node: [], react: [] },
  },
  tests: {
    design_system: NO_DATA_SUITE,
    x_suite: NO_DATA_SUITE,
    shell: NO_DATA_SUITE,
  },
  docs_truth: {
    phantom_imports: 0,
    stale_examples: 0,
    last_check: null,
  },
};

/* ------------------------------------------------------------------ */
/*  Session cache                                                       */
/* ------------------------------------------------------------------ */

let sessionCache: EvidenceRegistry | null = null;

/* ------------------------------------------------------------------ */
/*  Hook                                                                */
/* ------------------------------------------------------------------ */

/**
 * Fetches the evidence registry and caches for the session.
 * Returns typed evidence data for use in Design Lab panels.
 */
export function useEvidence(): EvidenceState {
  const [state, setState] = useState<EvidenceState>(
    sessionCache ? { status: 'loaded', data: sessionCache } : { status: 'loading' },
  );
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (sessionCache || fetchedRef.current) return;
    fetchedRef.current = true;

    // K2 (Wave 1.1) priority order — production path first, dev fallback last.
    const paths = [
      '/evidence-registry.v1.json',
      '/.evidence/registry.json',
      '/evidence/registry.json',
      './evidence/registry.json',
    ];

    function isValidRegistry(data: unknown): data is EvidenceRegistry {
      if (!data || typeof data !== 'object') return false;
      const r = data as Record<string, unknown>;
      // Minimum required shape for the 7-panel surface.
      return (
        'visual_regression' in r &&
        'security' in r &&
        'benchmarks' in r &&
        'coverage' in r &&
        'compatibility' in r &&
        'tests' in r &&
        'docs_truth' in r
      );
    }

    async function tryFetch() {
      for (const path of paths) {
        try {
          const res = await fetch(path, { cache: 'no-store' });
          if (res.ok) {
            const data: unknown = await res.json();
            if (!isValidRegistry(data)) continue;
            sessionCache = data;
            setState({ status: 'loaded', data });
            return;
          }
        } catch {
          // try next path
        }
      }
      // None worked — no_data
      setState({ status: 'no_data' });
    }

    tryFetch();
  }, []);

  return state;
}

/**
 * Convenience: returns the registry data or the fallback.
 * Panels that just need the data without loading states can use this.
 */
export function useEvidenceData(): EvidenceRegistry {
  const state = useEvidence();
  if (state.status === 'loaded') return state.data;
  return FALLBACK_REGISTRY;
}

/**
 * K2-2 helper: Get provenance level for a specific evidence section.
 * Falls back to 'no_data' when registry has no provenance field or section is missing.
 *
 * Usage:
 *   const provenance = getEvidenceProvenance(registry, 'visual_regression');
 *   <DataProvenanceBadge level={provenance} />
 */
export function getEvidenceProvenance(
  registry: EvidenceRegistry | null | undefined,
  key:
    | 'visual_regression'
    | 'security'
    | 'benchmarks'
    | 'coverage'
    | 'compatibility'
    | 'tests'
    | 'docs_truth',
): EvidenceProvenance {
  if (!registry?.provenance) return 'no_data';
  return registry.provenance[key] ?? 'no_data';
}

/**
 * Check if evidence is available (not fallback).
 */
export function useEvidenceAvailable(): boolean {
  const state = useEvidence();
  return state.status === 'loaded';
}
