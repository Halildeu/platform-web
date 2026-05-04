#!/usr/bin/env node
/**
 * backend-contract-smoke.mjs — opt-in backend SSRM contract smoke
 *
 * Why this script:
 *   `.claude/rules/backend-integration.md` documents the SSRM contract
 *   that every grid endpoint must honor (page/pageSize/sort/filter/
 *   rowGroupCols/groupKeys/valueCols). Today nothing enforces it at
 *   the network boundary — unit tests mock the fetch layer, Playwright
 *   smoke verifies UI, but real-backend contract drift can land
 *   silently. This script fills that gap by hitting a deterministic
 *   stage backend with the documented param shapes and asserting the
 *   response envelope.
 *
 * Scope:
 *   - SSRM standard params (pagination, sort, search, filter)
 *   - SSRM grouping (rowGroupCols + groupKeys → group level vs leaf)
 *   - SSRM aggregation (valueCols + aggData)
 *   - Common error envelopes (auth failure, validation failure)
 *
 * Out of scope:
 *   - Pivot mode (deferred — pivot adoption is low across the surface)
 *   - Performance / latency targets (separate SLO)
 *   - Cross-MFE integration (one endpoint at a time)
 *
 * Run modes:
 *   - `--check`              dry-run; print plan, exit 0
 *   - `--endpoint=<URL>`     target endpoint base
 *   - `--token=<JWT>`        bearer token (or BACKEND_SMOKE_TOKEN env)
 *   - `--module=users|reports`
 *                            which contract to exercise
 *   - `--json`               machine-readable output
 *
 * Exit codes:
 *   0   all assertions pass
 *   1   contract violation (envelope mismatch, missing param support)
 *   2   transport / auth failure (cannot reach the backend)
 *   3   CLI error (bad args)
 *
 * Wired into CI by `.github/workflows/backend-contract-smoke.yml`
 * (workflow_dispatch + nightly schedule). Never auto-runs on PR — the
 * smoke needs a real stage backend and credentials.
 *
 * Status: SCAFFOLD. The script + workflow ship together as the
 * contract enforcement mechanism. Concrete `assertEnvelope(...)` rules
 * land in a follow-up PR after a stage env has been provisioned (see
 * `docs/d30-cutover-runbook.md` §2.1 for the stage parity dependency).
 */

const args = parseArgs(process.argv.slice(2));

if (args.check) {
  console.log(JSON.stringify({
    mode: 'dry-run',
    plan: planForModule(args.module ?? 'users'),
  }, null, 2));
  process.exit(0);
}

if (!args.endpoint) {
  console.error('Missing --endpoint. See file header for usage.');
  process.exit(3);
}

const token = args.token ?? process.env.BACKEND_SMOKE_TOKEN;
if (!token) {
  console.error('Missing bearer token (--token or BACKEND_SMOKE_TOKEN).');
  process.exit(3);
}

const plan = planForModule(args.module ?? 'users');
const failures = [];

for (const step of plan.steps) {
  try {
    const result = await runStep(args.endpoint, token, step);
    if (!result.ok) failures.push({ step: step.name, reason: result.reason });
  } catch (e) {
    failures.push({ step: step.name, reason: `transport: ${e.message ?? e}` });
  }
}

const summary = {
  endpoint: args.endpoint,
  module: args.module ?? 'users',
  total: plan.steps.length,
  failed: failures.length,
  failures,
};

if (args.json) {
  console.log(JSON.stringify(summary, null, 2));
} else {
  printHumanSummary(summary);
}

if (failures.length > 0) {
  // Distinguish transport failures (exit 2) from contract failures
  // (exit 1) so the workflow can route alerts differently.
  const transportFail = failures.some((f) => /transport/.test(f.reason));
  process.exit(transportFail ? 2 : 1);
}

/* ------------------------------------------------------------------ */
/*  Plan factories                                                     */
/* ------------------------------------------------------------------ */

function planForModule(module) {
  const plans = {
    users: {
      base: '/api/v1/users',
      steps: [
        {
          name: 'standard pagination',
          params: { page: 1, pageSize: 25 },
          asserts: ['envelope.items', 'envelope.total', 'envelope.page', 'envelope.pageSize'],
        },
        {
          name: 'sort single column ascending',
          params: { sort: 'name,asc' },
          asserts: ['envelope.items', 'sortedAscBy(name)'],
        },
        {
          name: 'sort multi column with secondary',
          params: { sort: 'role,asc;name,asc' },
          asserts: ['envelope.items'],
        },
        {
          name: 'search quick filter',
          params: { search: 'admin' },
          asserts: ['envelope.items', 'allRowsContain(admin)'],
        },
        {
          name: 'domain filter (status)',
          params: { status: 'ACTIVE' },
          asserts: ['envelope.items', 'allRowsHaveStatus(ACTIVE)'],
        },
        {
          name: 'group level — rowGroupCols=role, groupKeys=[]',
          params: { rowGroupCols: 'role' },
          asserts: ['envelope.items', 'eachItemHas(name)', 'eachItemHas(role)'],
        },
        {
          name: 'leaf level — rowGroupCols=role, groupKeys=ADMIN',
          params: { rowGroupCols: 'role', groupKeys: 'ADMIN' },
          asserts: ['envelope.items', 'allRowsHaveRole(ADMIN)'],
        },
        {
          name: 'aggregation — valueCols=sessionTimeoutMinutes:sum',
          params: { rowGroupCols: 'role', valueCols: 'sessionTimeoutMinutes:sum' },
          asserts: ['envelope.aggData', 'envelope.aggData.sessionTimeoutMinutes'],
        },
      ],
    },
    reports: {
      base: '/api/v1/reports',
      steps: [
        {
          name: 'reports list pagination',
          params: { page: 1, pageSize: 25 },
          asserts: ['envelope.items', 'envelope.total'],
        },
        // Report-data endpoint is keyed; exercise via key presence.
        // Concrete report keys land with stage env provisioning.
      ],
    },
  };
  if (!plans[module]) {
    console.error(`Unknown module: ${module}. Valid: users, reports`);
    process.exit(3);
  }
  return plans[module];
}

/* ------------------------------------------------------------------ */
/*  HTTP step runner                                                   */
/* ------------------------------------------------------------------ */

async function runStep(endpoint, token, step) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(step.params ?? {})) {
    qs.set(k, String(v));
  }
  const url = `${endpoint}${step.base ?? ''}?${qs.toString()}`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    return { ok: false, reason: `HTTP ${res.status}` };
  }

  const body = await res.json();
  // Hard contract: items + total are mandatory on every paginated call.
  if (!Array.isArray(body.items)) {
    return { ok: false, reason: 'envelope.items missing or not an array' };
  }
  if (typeof body.total !== 'number') {
    return { ok: false, reason: 'envelope.total missing or not a number' };
  }

  // Step-specific assertions (named string list — implementations land
  // in the follow-up PR once stage env shape is verified).
  for (const a of step.asserts ?? []) {
    if (!supportsAssert(a)) {
      // Soft-skip unimplemented asserts so the scaffold remains useful
      // before the follow-up PR fills in the rule library.
      continue;
    }
    if (!evaluateAssert(a, body)) {
      return { ok: false, reason: `assertion failed: ${a}` };
    }
  }

  return { ok: true };
}

/* ------------------------------------------------------------------ */
/*  Assertion library (placeholder — fills in follow-up PR)           */
/* ------------------------------------------------------------------ */

function supportsAssert(name) {
  // Currently only the envelope-presence asserts are implemented;
  // semantic asserts (sortedAscBy, allRowsContain, …) will land
  // alongside the stage env that produces deterministic seed data.
  return /^envelope\./.test(name);
}

function evaluateAssert(name, body) {
  if (name === 'envelope.items') return Array.isArray(body.items);
  if (name === 'envelope.total') return typeof body.total === 'number';
  if (name === 'envelope.page') return typeof body.page === 'number';
  if (name === 'envelope.pageSize') return typeof body.pageSize === 'number';
  if (name === 'envelope.aggData') return body.aggData != null;
  if (name === 'envelope.aggData.sessionTimeoutMinutes') {
    return body.aggData?.sessionTimeoutMinutes != null;
  }
  return true;
}

/* ------------------------------------------------------------------ */
/*  CLI plumbing                                                       */
/* ------------------------------------------------------------------ */

function parseArgs(argv) {
  const out = {};
  for (const a of argv) {
    if (a === '--check') out.check = true;
    else if (a === '--json') out.json = true;
    else if (a.startsWith('--endpoint=')) out.endpoint = a.slice('--endpoint='.length);
    else if (a.startsWith('--token=')) out.token = a.slice('--token='.length);
    else if (a.startsWith('--module=')) out.module = a.slice('--module='.length);
    else {
      console.error(`Unknown arg: ${a}`);
      process.exit(3);
    }
  }
  return out;
}

function printHumanSummary(summary) {
  console.log('Backend SSRM contract smoke');
  console.log(`  endpoint:   ${summary.endpoint}`);
  console.log(`  module:     ${summary.module}`);
  console.log(`  steps:      ${summary.total}`);
  console.log(`  failed:     ${summary.failed}`);
  if (summary.failures.length > 0) {
    console.log('');
    console.log('  Failures:');
    for (const f of summary.failures) {
      console.log(`    ✗ ${f.step}`);
      console.log(`        ${f.reason}`);
    }
  } else {
    console.log('');
    console.log('  ✓ all assertions passed');
  }
}
