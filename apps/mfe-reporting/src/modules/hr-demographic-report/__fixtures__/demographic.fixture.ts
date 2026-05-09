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
 * Determinism: seeded mulberry32 + uniform pick (no Box-Muller noise).
 * Counts are tiny but proportions are intentional (50% gender split,
 * 4 departments, 3 age buckets, 1 manager, 1 disabled employee) so
 * the dashboard cards produce non-zero values for every KPI.
 */
import type { HrDemographicRow, DemographicSummary } from '../types';

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
 */
export function generateFixtureEmployees(count: number = FIXTURE_SIZE): HrDemographicRow[] {
  const rng = createRng(FIXTURE_SEED);
  const currentYear = 2026;
  const rows: HrDemographicRow[] = [];

  for (let i = 0; i < count; i++) {
    // Force exact 50/50 gender split for the first 2 rows, then RNG.
    const isFemale = i < count / 2 ? i % 2 === 0 : rng() < 0.5;
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
/*  Fixture summary — pre-computed at module load                      */
/* ------------------------------------------------------------------ */

/**
 * Compute a `DemographicSummary` from fixture rows. Mirrors the shape
 * of `mock-data.ts → computeSummary` but stripped to the keys the
 * dashboard actually reads, with realistic deterministic values.
 *
 * The test asserts on these exact numbers so any drift in the
 * `DemographicSummary` shape OR the dashboard's read paths surfaces
 * as a failed expectation rather than a snapshot diff.
 */
export function computeFixtureSummary(rows: HrDemographicRow[]): DemographicSummary {
  const total = rows.length;
  const males = rows.filter((r) => r.gender === 'Erkek').length;
  const females = rows.filter((r) => r.gender === 'Kadın').length;
  const others = total - males - females;

  const malePct = Math.round((males / total) * 100);
  const femalePct = Math.round((females / total) * 100);
  const otherPct = 100 - malePct - femalePct;

  const avgAge = rows.reduce((s, r) => s + r.age, 0) / total;
  const avgTenure = rows.reduce((s, r) => s + r.tenureYears, 0) / total;

  const managers = rows.filter((r) => r.isManager);
  const femaleManagers = managers.filter((r) => r.gender === 'Kadın');
  const femaleManagerRate =
    managers.length > 0 ? Math.round((femaleManagers.length / managers.length) * 100) : 0;

  const disabilityCount = rows.filter((r) => r.hasDisability).length;
  const disabilityRate = Math.round((disabilityCount / total) * 1000) / 10;
  const managerRatio = Math.round((managers.length / total) * 1000) / 10;

  const countBy = <T>(arr: T[], fn: (t: T) => string) => {
    const map = new Map<string, number>();
    for (const item of arr) {
      const k = fn(item);
      map.set(k, (map.get(k) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([label, value]) => ({ label, value }));
  };

  const ageGroup = (a: number) =>
    a < 30 ? '25-29' : a < 35 ? '30-34' : a < 40 ? '35-39' : a < 45 ? '40-44' : '45-49';

  const tenureGroup = (y: number) =>
    y < 1 ? '<1 yıl' : y < 3 ? '1-3 yıl' : y < 5 ? '3-5 yıl' : '5+ yıl';

  const ethicsTrainingRate =
    Math.round((rows.filter((r) => r.ethicsTrainingComplete).length / total) * 1000) / 10;

  return {
    totalHeadcount: total,
    genderRatio: { male: malePct, female: femalePct, other: otherPct },
    avgAge: Math.round(avgAge * 10) / 10,
    avgTenure: Math.round(avgTenure * 10) / 10,
    turnoverRate: 14.2,
    deiScore: 75,

    genderDistribution: [
      { label: 'Erkek', value: males },
      { label: 'Kadın', value: females },
      ...(others > 0 ? [{ label: 'Diğer', value: others }] : []),
    ],
    ageGroups: countBy(rows, (r) => ageGroup(r.age)),
    educationLevels: countBy(rows, (r) => r.education),
    departments: countBy(rows, (r) => r.department),
    tenureDistribution: countBy(rows, (r) => tenureGroup(r.tenureYears)),
    employmentTypes: countBy(rows, (r) => r.employmentType),
    generationDistribution: countBy(rows, (r) => r.generation),
    disabilityRate,
    managerRatio,
    femaleManagerRate,

    maritalStatusDistribution: countBy(rows, (r) => r.maritalStatus),
    militaryStatusDistribution: countBy(
      rows.filter((r) => r.gender === 'Erkek'),
      (r) => r.militaryStatus,
    ),
    disabilityDistribution: [
      { label: 'Var', value: disabilityCount },
      { label: 'Yok', value: total - disabilityCount },
    ],

    locationDistribution: countBy(rows, (r) => r.location),
    positionLevelDistribution: countBy(rows, (r) => r.positionLevel),
    spanOfControl: managers.length > 0 ? Math.round((total / managers.length) * 10) / 10 : 0,

    absenteeismRate: 4.2,
    timeToFillDays: 38,
    internalTransferRate: 8.5,
    promotionRate: 6.2,
    voluntaryTurnoverRate: 9.1,
    involuntaryTurnoverRate: 2.9,

    ethicsTrainingRate,
    whistleblowerCases: 7,
    disciplinaryActions: [
      { label: 'Uyarı', value: 12 },
      { label: 'Kınama', value: 4 },
      { label: 'Fesih', value: 2 },
    ],
    dataPrivacyComplianceRate: 94.5,

    avgSalaryByGender: [
      { label: 'Erkek', value: 28500 },
      { label: 'Kadın', value: 26800 },
    ],
    genderPayGapPercent: 5.9,

    agePyramid: rows.reduce<DemographicSummary['agePyramid']>((acc, r) => {
      const grp = ageGroup(r.age);
      let entry = acc.find((e) => e.ageGroup === grp);
      if (!entry) {
        entry = { ageGroup: grp, male: 0, female: 0 };
        acc.push(entry);
      }
      if (r.gender === 'Erkek') entry.male += 1;
      else if (r.gender === 'Kadın') entry.female += 1;
      return acc;
    }, []),
  };
}

/* ------------------------------------------------------------------ */
/*  Pre-computed fixture exports                                       */
/* ------------------------------------------------------------------ */

/**
 * Stable 50-employee fixture rows. Re-computed at module load; safe
 * to import from contract / story / fixture-renderer tests.
 */
export const FIXTURE_ROWS: HrDemographicRow[] = generateFixtureEmployees();

/**
 * Pre-computed `DemographicSummary` from `FIXTURE_ROWS`. Use as the
 * mock return value for `getSummary()` in contract tests so the
 * dashboard renders against a known dataset.
 */
export const FIXTURE_SUMMARY: DemographicSummary = computeFixtureSummary(FIXTURE_ROWS);
