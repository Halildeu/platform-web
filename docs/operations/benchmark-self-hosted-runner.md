# Self-hosted GPU runner runbook — `platform-web-benchmark-1m`

> Operator-owned. Sets up the runner that the
> `.github/workflows/benchmark-1m.yml` job uses to enforce the
> `design-lab-scatter-benchmark.v2` hard KPI gate (`uniform/million/
webgl < 1.5s`). The PR-A1.6c repo work shipped the workflow,
> enforcer script, threshold config and Playwright spec — but the
> physical / virtual runner is intentionally provisioned outside
> the repo so spinning new hardware up does not require a code
> change. Codex thread `019e0f63` iter-1 made this scope split
> explicit.

## Why a self-hosted GPU runner

GitHub-hosted `ubuntu-latest` runners ship with software WebGL
(SwiftShader); the 1M scatter render time on SwiftShader is 5×–10×
slower than on a real GPU and the variance is too high to gate
against. The `<1.5s` claim only holds on a real GPU + a stable
Chrome / driver pair, so the workflow is pinned to a runner labelled
with the full set `[self-hosted, linux, x64, gpu, platform-web-benchmark-1m]`.
Until at least one such runner is online the workflow stays
`queued` — that is by design.

## Recommended profile

| Spec              | Recommendation                                                                                                           |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Cloud option      | AWS `g5.xlarge` (NVIDIA A10G, 24GB VRAM)                                                                                 |
| Bare metal option | Hetzner GEX44 (NVIDIA A4000), DigitalOcean GPU droplet (A100)                                                            |
| OS                | Ubuntu 22.04 LTS, x86_64                                                                                                 |
| Driver            | NVIDIA proprietary driver matching the GPU (≥ 535)                                                                       |
| Container?        | Run the runner on the host, NOT inside Docker — the actions/setup-node + Playwright Chromium install handle dependencies |
| Disk              | ≥ 50 GB                                                                                                                  |
| RAM               | ≥ 16 GB                                                                                                                  |

The cloud cost call is the operator's; the technical recommendation
is "stable profile, real GPU, single dedicated runner". Avoid
multi-tenant / shared GPU runners — jitter would corrupt the
median.

## Runner registration

1. Install the GitHub Actions runner agent:

   ```bash
   mkdir -p ~/actions-runner && cd ~/actions-runner
   # Download URL + installer come from the per-repo
   # Settings → Actions → Runners → New self-hosted runner page
   curl -O -L https://github.com/actions/runner/releases/download/<version>/actions-runner-linux-x64-<version>.tar.gz
   tar xzf actions-runner-linux-x64-<version>.tar.gz
   ```

2. Configure the runner with the labels the workflow expects:

   ```bash
   ./config.sh \
     --url https://github.com/Halildeu/platform-web \
     --token <runner-registration-token-from-the-settings-page> \
     --name platform-web-benchmark-1m-01 \
     --labels self-hosted,linux,x64,gpu,platform-web-benchmark-1m \
     --runnergroup default \
     --work _work \
     --unattended
   ```

   The combined label set MUST match the `runs-on` line in
   `.github/workflows/benchmark-1m.yml`. Missing any label leaves
   the job queued indefinitely.

3. Install as a systemd service so the runner survives reboot:

   ```bash
   sudo ./svc.sh install $USER
   sudo ./svc.sh start
   sudo ./svc.sh status
   ```

4. Install the Chromium runtime dependencies (Playwright will pull
   the browser itself, but the GPU stack needs system packages):

   ```bash
   sudo apt-get update
   sudo apt-get install -y \
     libxss1 libnss3 libasound2 libxshmfence1 \
     fonts-liberation xvfb mesa-utils
   ```

5. Verify the GPU shows up to Chrome:
   ```bash
   sudo apt-get install -y chromium-browser
   chromium-browser --headless --no-sandbox \
     --enable-logging=stderr --v=1 --use-gl=angle --use-angle=vulkan \
     --print-to-pdf=/tmp/gpu.pdf chrome://gpu 2>&1 | grep -iE 'gpu|webgl' | head -20
   ```
   You should see `WebGL: Hardware accelerated` and the actual GPU
   vendor / renderer string.

## Security boundary (DO NOT skip)

A self-hosted runner runs arbitrary repository code on whatever
machine you've registered. Three guardrails MUST be in place before
the runner is enabled for the workflow:

1. **Same-repo PR only.** The job-level `if:` clause already pins
   the workflow to `head.repo.full_name == github.repository`, but
   if you ever expose the runner to additional workflows, copy the
   same guard. **Never** let a fork PR drive this runner.

2. **`pull_request_target` is forbidden.** That event provides write
   tokens to fork code and would let an attacker steal repo secrets
   from the GPU runner. The current workflow uses `pull_request`
   intentionally.

3. **Label management is maintainer-only.** The `bench-1m-gate`
   label is what triggers the workflow on a PR. Restrict who can
   add it on Settings → Labels (or via a `CODEOWNERS` policy on
   `.github/labels.yml` if you prefer source-of-truth).

4. **Runner identity is not a secret.** The artifact's
   `environment.runner.profile` field reports `self-hosted-gpu` so
   the enforcer can refuse to compare two runs from different
   profiles. Don't rename the label set without updating the
   workflow + threshold config in lockstep.

## First baseline bootstrap

The enforcer fail-closes on missing baselines in PR mode. Bootstrap
the `main` baseline manually:

1. Land the PR-A1.6c branch on `main` (workflow + enforcer + config).
2. Trigger the workflow against `main` from
   `Actions → Design Lab Benchmark — 1M Artifact → Run workflow`.
3. The artifact lands as `benchmark-1m-<run_id>-<sha>` under
   workflow run artifacts. Verify in `enforcer-out/verdict.json`
   that every case is `pass` (or `warn` due to the missing
   baseline — that's fine for the bootstrap run).
4. Subsequent PR runs will discover this artifact via
   `gh api .../actions/workflows/benchmark-1m.yml/runs?branch=main`
   and use it as the regression baseline.

## When the threshold needs to move

Edit `benchmark-thresholds.json` under the
`design-lab-scatter-benchmark.v2` namespace. Both the absolute cap
(`medianRenderMsMax`) and the regression budget
(`baselineRegressionMaxPct`) require a PR review like any other
config — DO NOT bump them inline from the gate-failed PR itself,
that would defeat the purpose of the gate.

If the absolute cap moves above the public `<1.5s` claim, also
update:

- `apps/mfe-shell/src/pages/admin/design-lab/pages/BenchmarkRoute.tsx`
  top docstring
- `docs/x-charts-adoption-matrix.md` if it references the cap
- The Faz 21.11 PR-A1 narrative wherever it ships

## Decommissioning a runner

```bash
cd ~/actions-runner
sudo ./svc.sh stop
sudo ./svc.sh uninstall
./config.sh remove --token <removal-token-from-settings-page>
```

Pull the runner from `Settings → Actions → Runners` afterwards. If
the only `platform-web-benchmark-1m` runner is decommissioned, the
workflow queue grows until a replacement is registered — the gate
behaviour is the same as on day zero before bootstrap.
