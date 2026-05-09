/**
 * DemographicDashboard contract test fixture (Wave 4 reporting fixture
 * — ChartDashboard.Item migration unblock).
 *
 * Why a separate fixture instead of `mock-data.ts`?
 *   - `mock-data.ts` builds 2545 employees with normal/log-normal RNG;
 *     loading the full module-side-effect mockSummary into a contract
 *     test is overkill (mounts dashboards that read every histogram).
 *   - Contract tests want a SMALL deterministic dataset that produces
 *     stable counts, ratios, and chart shapes — easy to assert on
 *     without snapshot drift.
 *   - Faz 21.10 ChartDashboard.Item migration (Wave 4) needs render-
 *     time parity guard: same `DemographicSummary` shape going in,
 *     same chart series going out. The fixture lets the test seed an
 *     exact `getSummary()` return so we can pin the migration without
 *     coupling to RNG noise.
 *
 * Determinism (Codex iter-2 absorb):
 *   - Seeded mulberry32 + uniform pick (no Box-Muller noise).
 *   - Strict `i % 2` gender alternation across the WHOLE 50-row set
 *     so the fixture produces an exact 25/25 split. The previous
 *     iteration used `i < count / 2` which still left the second half
 *     RNG-dependent and skewed the actual ratio (28F/22M).
 *
 * Summary parity (Codex iter-2 absorb):
 *   - `FIXTURE_SUMMARY` is produced by the canonical `computeSummary`
 *     from `mock-data.ts`, NOT a hand-duplicated `computeFixtureSummary`.
 *     This guarantees the fixture stays in lock-step with the
 *     production summary kernel — drift in `genderDistribution`
 *     ordering, `agePyramid` zero-fill, `disciplinaryActions`
 *     hard-coded values, or the `avgAge` rounding rule automatically
 *     propagates to the contract test (zero-cost parity).
 */
import type { HrDemographicRow, DemographicSummary } from '../types';
import { computeSummary } from '../mock-data';

/* ------------------------------------------------------------------ */
/*  Seeded RNG (mulberry32 — same kernel as mock-data.ts)              */
/* ------------------------------------------------------------------ */

function createRng(seed: number) {
  let s = seed | 0;
  return (): number => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(arr: readonly T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)];
}

/* ------------------------------------------------------------------ */
/*  Fixture row generator                                              */
/* ------------------------------------------------------------------ */

const FIXTURE_SEED = 1337;
const FIXTURE_SIZE = 50;

const DEPARTMENTS = ['Finans', 'IT', 'Satış', 'İK'] as const;
const LOCATIONS = ['İstanbul', 'Ankara'] as const;
const EDUCATIONS = ['Lisans', 'Yüksek Lisans'] as const;
const EMPLOYMENT_TYPES = ['Tam Zamanlı', 'Yarı Zamanlı'] as const;
const MARITAL_STATUSES = ['Bekar', 'Evli'] as const;
const POSITION_LEVELS = ['Uzman', 'Müdür'] as const;

/**
 * Generate a deterministic 50-employee fixture. Same seed → same rows
 * → same summary. Safe to call multiple times (no module-level state).
 *
 * Strict 25/25 gender split via `i % 2` for every row (Codex iter-2).
 */
export function generateFixtureEmployees(count: number = FIXTURE_SIZE): HrDemographicRow[] {
  const rng = createRng(FIXTURE_SEED);
  const currentYear = 2026;
  const rows: HrDemographicRow[] = [];

  for (let i = 0; i < count; i++) {
    // Strict alternation across the whole dataset → exact 25/25 split.
    const isFemale = i % 2 === 0;
    const gender: HrDemographicRow['gender'] = isFemale ? 'Kadın' : 'Erkek';

    const age = 25 + (i % 25); // 25-49 deterministic spread
    const birthYear = currentYear - age;
    const birthDate = `${birthYear}-01-15`;

    const department = pick(DEPARTMENTS, rng);
    const location = pick(LOCATIONS, rng);
    const education = pick(EDUCATIONS, rng);
    const employmentType = pick(EMPLOYMENT_TYPES, rng);
    const maritalStatus = pick(MARITAL_STATUSES, rng);
    const positionLevel = pick(POSITION_LEVELS, rng);

    const tenureYears = Math.min(age - 22, 1 + (i % 8));
    const hireYear = currentYear - Math.round(tenureYears);
    const hireDate = `${hireYear}-06-01`;

    // Force at least one manager + one disabled + one ethics-incomplete
    // so the dashboard's "manager", "disability", "ethics" KPIs are all
    // non-zero on the fixture.
    const isManager = i === 0 || i === 24;
    const hasDisability = i === 5;
    const ethicsTrainingComplete = i !== 7; // 49/50 = 98%

    const militaryStatus =
      gender === 'Erkek' ? (i % 3 === 0 ? 'Yapıldı' : i % 3 === 1 ? 'Tecilli' : 'Muaf') : 'Yok';

    const generation = birthYear >= 1997 ? 'Gen Z' : birthYear >= 1981 ? 'Milenyum' : 'Gen X';

    rows.push({
      id: `FIX-${String(i + 1).padStart(3, '0')}`,
      fullName: `${gender === 'Kadın' ? 'Ayşe' : 'Mehmet'} Test${i + 1}`,
      department,
      position: 'Uzman',
      gender,
      birthDate,
      age,
      education,
      maritalStatus,
      employmentType,
      hireDate,
      tenureYears,
      location,
      isManager,
      hasDisability,
      militaryStatus,
      generation,
      ethicsTrainingComplete,
      positionLevel,
    });
  }

  return rows;
}

/* ------------------------------------------------------------------ */
/*  Pre-computed fixture exports                                       */
/* ------------------------------------------------------------------ */

/**
 * Stable 50-employee fixture rows. Re-computed at module load; safe
 * to import from contract / story / fixture-renderer tests.
 *
 * Strict 25/25 gender split (`i % 2`) and deterministic department /
 * location / education / employment / position / marital distribution.
 */
export const FIXTURE_ROWS: HrDemographicRow[] = generateFixtureEmployees();

/**
 * `DemographicSummary` produced by the canonical `computeSummary`
 * (`mock-data.ts`). Use as the mock return value for `getSummary()`
 * in contract tests so the dashboard renders against a known
 * dataset whose summary is guaranteed in-parity with production.
 */
export const FIXTURE_SUMMARY: DemographicSummary = computeSummary(FIXTURE_ROWS);
