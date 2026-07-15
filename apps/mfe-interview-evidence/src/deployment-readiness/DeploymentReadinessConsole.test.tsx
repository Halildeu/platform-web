import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { DeploymentReadinessConsole } from './DeploymentReadinessConsole';
import {
  CANONICAL_DEPLOYMENT_GATE_KINDS,
  CANONICAL_DEPLOYMENT_TOPOLOGIES,
  CANONICAL_SYNTHETIC_DEPLOYMENT_PROFILE_REGISTRY,
} from './canonicalDeploymentProfileRegistry';
import type { DeploymentProfileRegistryV1 } from './canonicalDeploymentProfileRegistry';
import { validateDeploymentProfileRegistryV1 } from './deploymentProfileAdapter';

const cloneFixture = () =>
  JSON.parse(
    JSON.stringify(CANONICAL_SYNTHETIC_DEPLOYMENT_PROFILE_REGISTRY),
  ) as DeploymentProfileRegistryV1;

describe('DeploymentReadinessConsole', () => {
  test('public v1 contract lineage, four profiles and PRE-G0 boundary are explicit', () => {
    render(<DeploymentReadinessConsole />);

    expect(screen.getByTestId('deployment-synthetic-boundary')).toHaveTextContent(
      'SENTETİK · PRE-G0 · VIEW-ONLY',
    );
    expect(screen.getByTestId('deployment-source-lineage')).toHaveTextContent(
      'Public ATS source pin',
    );
    expect(screen.getByTestId('deployment-source-lineage')).toHaveTextContent(
      'runtime evidence değildir',
    );
    expect(screen.getByTestId('deployment-profile-catalog').children).toHaveLength(
      CANONICAL_DEPLOYMENT_TOPOLOGIES.length,
    );
    for (const topology of CANONICAL_DEPLOYMENT_TOPOLOGIES) {
      expect(screen.getByTestId(`deployment-profile-${topology}`)).toBeVisible();
    }
  });

  test('default profile has eight independent closed gates and no readiness percentage', () => {
    render(<DeploymentReadinessConsole />);
    const table = screen.getByTestId('deployment-evidence-table');

    expect(within(table).getAllByRole('row')).toHaveLength(
      CANONICAL_DEPLOYMENT_GATE_KINDS.length + 1,
    );
    expect(within(table).getAllByRole('rowheader')).toHaveLength(
      CANONICAL_DEPLOYMENT_GATE_KINDS.length,
    );
    expect(within(table).getByRole('rowheader', { name: /Supply chain/ })).toBeVisible();
    for (const kind of CANONICAL_DEPLOYMENT_GATE_KINDS) {
      expect(screen.getByTestId(`deployment-gate-${kind}`)).toHaveTextContent('NOT_CONFIGURED');
    }
    expect(screen.getByTestId('deployment-weakest-gates')).toHaveTextContent('Owner kabulü 0/8');
    expect(screen.getByTestId('deployment-readiness-console').textContent).not.toMatch(/\b\d+%/);
    expect(screen.getByText('Tek yüzde / ortalama yok')).toBeVisible();
  });

  test('readiness tokens stay atomic while localized labels wrap only at language boundaries', () => {
    const { container } = render(<DeploymentReadinessConsole />);
    const compactBadges = container.querySelectorAll<HTMLElement>(
      '[data-readiness-density="compact"]',
    );
    const fullBadge = container.querySelector<HTMLElement>('[data-readiness-density="full"]');

    expect(compactBadges.length).toBeGreaterThan(0);
    for (const badge of compactBadges) {
      expect(badge).toHaveStyle({
        whiteSpace: 'nowrap',
        overflowWrap: 'normal',
        wordBreak: 'normal',
        hyphens: 'none',
        position: 'relative',
      });
      expect(badge).toHaveAttribute('data-readiness-state', 'NOT_CONFIGURED');
      expect(badge).not.toHaveAttribute('aria-label');
      expect(badge).toHaveTextContent('NOT_CONFIGURED: YAPILANDIRILMADI');
      expect(badge.querySelector('[data-readiness-visible="true"]')).toHaveTextContent(
        'NOT_CONFIGURED',
      );
    }

    expect(fullBadge).not.toBeNull();
    expect(fullBadge).toHaveStyle({
      whiteSpace: 'normal',
      overflowWrap: 'normal',
      wordBreak: 'normal',
      hyphens: 'none',
      position: 'relative',
    });
    expect(fullBadge).not.toHaveAttribute('aria-label');
    expect(fullBadge).toHaveTextContent('NOT_CONFIGURED: YAPILANDIRILMADI');
    expect(fullBadge?.querySelector('[data-readiness-visible="true"]')).toHaveTextContent(
      'YAPILANDIRILMADI',
    );

    const technicalValue = screen.getByText('PLATFORM_FEDERATED_OIDC_SAML');
    expect(technicalValue).toHaveTextContent('PLATFORM_FEDERATED_OIDC_SAML');
    expect(technicalValue.querySelectorAll('wbr')).toHaveLength(3);
  });

  test('profile selection synchronizes exact topology controls, thresholds and gate rows', () => {
    render(<DeploymentReadinessConsole />);
    const onPrem = screen.getByTestId('deployment-profile-SOVEREIGN_ON_PREM');

    fireEvent.click(onPrem);

    expect(onPrem).toHaveAttribute('aria-pressed', 'true');
    expect(onPrem).toHaveAttribute('aria-controls', 'deployment-profile-evidence-panel');
    expect(
      screen.getByRole('region', { name: /Sovereign On-Prem deployment readiness/ }),
    ).toBeVisible();
    const detail = screen.getByTestId('deployment-profile-detail');
    expect(within(detail).getByText('Sovereign On-Prem')).toBeVisible();
    expect(detail).toHaveTextContent('CUSTOMER_CONTROLLED_BOUNDARY');
    expect(detail).toHaveTextContent('CUSTOMER_MANAGED_OFFLINE_KEYS');
    expect(detail).toHaveTextContent('OFFLINE_SELF_HOSTED_ONLY');
    expect(detail).toHaveTextContent('CUSTOMER_OPERATED_SIGNED_BUNDLE');
    expect(detail).toHaveTextContent('0/2 · doğrulanmadı');
    expect(
      within(screen.getByTestId('deployment-evidence-table')).getAllByRole('row'),
    ).toHaveLength(9);
  });

  test('target, observed result and freshness are not conflated', () => {
    render(<DeploymentReadinessConsole />);

    const recovery = screen.getByTestId('deployment-recovery-summary');
    expect(recovery).toHaveTextContent('RPO target');
    expect(recovery).toHaveTextContent('RTO target');
    expect(recovery).toHaveTextContent('Tanımlı değil');
    expect(recovery).toHaveTextContent('Observed RPO/RTO');
    expect(recovery).toHaveTextContent('Ölçülmedi');
    expect(screen.getByTestId('deployment-freshness-boundary')).toHaveTextContent(
      'POLICY_NOT_DEFINED',
    );
  });

  test('non-public operational responsibility is not inferred and P4/P6 stays separate', () => {
    render(<DeploymentReadinessConsole />);

    const responsibility = screen.getByTestId('deployment-responsibility-boundary');
    expect(responsibility).toHaveTextContent('OPERATIONAL_RESPONSIBILITY_NOT_PROVIDED');
    expect(responsibility).toHaveTextContent('OWNER PUBLICATION DECISION REQUIRED');
    expect(responsibility).toHaveTextContent('inference yasak');

    const activation = screen.getByTestId('deployment-activation-boundary');
    expect(activation).toHaveTextContent('Connector: P4 ayrı gate');
    expect(activation).toHaveTextContent('AI capability: P6 ayrı gate');
    expect(screen.getByTestId('deployment-release-blockers')).toHaveTextContent(
      'Operasyonel sorumluluk ve destek sınırı public sözleşmede sağlanmadı',
    );
  });

  test('PRE-G0 viewer exposes status instead of inoperable action controls', () => {
    render(<DeploymentReadinessConsole />);

    expect(screen.queryByRole('button', { name: /verifier/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /release/i })).not.toBeInTheDocument();
    expect(screen.getByTestId('deployment-action-status')).toHaveTextContent(
      'Verifier action: UNAVAILABLE',
    );
    expect(screen.getByTestId('deployment-action-status')).toHaveTextContent(
      'Release action: UNAVAILABLE',
    );
    expect(screen.getByTestId('deployment-verify-reason')).toHaveTextContent(
      'dış verifier çalıştırmaz',
    );
    expect(screen.getByTestId('deployment-promote-reason')).toHaveTextContent('NO-GO');
    expect(screen.getByTestId('deployment-promote-reason')).toHaveTextContent(
      'G0 runtime kabulü yok',
    );
  });

  test('semantically valid G0 runtime registry is rejected as unsupported viewer scope', () => {
    const runtime = acceptedRuntimeFixture();
    expect(validateDeploymentProfileRegistryV1(runtime).ok).toBe(true);

    render(<DeploymentReadinessConsole registryPayload={runtime} />);

    const failClosed = screen.getByTestId('deployment-readiness-fail-closed');
    expect(failClosed).toHaveTextContent('VIEWER SCOPE CLOSED');
    expect(failClosed).toHaveTextContent('public deployment-profile/v1 sözleşmesini karşılıyor');
    expect(failClosed).toHaveTextContent('yalnız PRE-G0 contract viewer');
    expect(failClosed).toHaveTextContent('P5_VIEWER_PRE_G0_ONLY');
    expect(screen.queryByTestId('deployment-synthetic-boundary')).not.toBeInTheDocument();
    expect(screen.queryByTestId('deployment-profile-catalog')).not.toBeInTheDocument();
  });

  test('disclosure avoids compliance, certification and competitor-parity claims', () => {
    render(<DeploymentReadinessConsole />);

    expect(screen.getByTestId('deployment-disclosure-boundary')).toHaveTextContent(
      'Readiness; compliance, conformity, certification veya rakip parity sonucu değildir',
    );
    expect(screen.getByTestId('deployment-disclosure-boundary')).toHaveTextContent(
      'Partner sayısı teknik güvenlik kanıtı değildir',
    );
  });

  test.each([
    ['malformed primitive', 'deployment-profile/v1'],
    [
      'unknown field',
      (() => {
        const registry = cloneFixture() as unknown as Record<string, unknown>;
        registry.runtime_ready = true;
        return registry;
      })(),
    ],
    [
      'forged release',
      (() => {
        const registry = cloneFixture();
        const profile = registry.profiles[0] as unknown as Record<string, unknown>;
        profile.production_eligible = true;
        profile.release_allowed = true;
        return registry;
      })(),
    ],
  ])('%s payload fails closed without fixture fallback', (_name, payload) => {
    render(<DeploymentReadinessConsole registryPayload={payload} />);

    const failClosed = screen.getByTestId('deployment-readiness-fail-closed');
    expect(failClosed).toHaveTextContent('TRACE FAIL-CLOSED');
    expect(failClosed).toHaveTextContent('Sentetik fixture’a sessiz fallback yapılmadı');
    expect(screen.queryByTestId('deployment-profile-catalog')).not.toBeInTheDocument();
    expect(screen.queryByTestId('deployment-evidence-table')).not.toBeInTheDocument();
    expect(within(failClosed).queryAllByRole('button')).toHaveLength(0);
  });
});

function acceptedRuntimeFixture(): unknown {
  const registry = cloneFixture() as unknown as Record<string, unknown>;
  registry.activation_gate = 'G0_ACCEPTED_RUNTIME';
  const profiles = registry.profiles as Record<string, unknown>[];

  for (const profile of profiles) {
    const topology = String(profile.topology).toLowerCase().replaceAll('_', '-');
    const minimumPaidPartners = Number(profile.minimum_paid_partners);
    profile.synthetic = false;
    profile.readiness_state = 'OWNER_ACCEPTED';
    profile.release_evidence_manifest_digest = `sha256:${'a'.repeat(64)}`;
    profile.release_evidence_manifest_verified = true;
    const recovery = profile.recovery_objectives as Record<string, unknown>;
    recovery.targets_defined = true;
    recovery.target_rpo_seconds = 3600;
    recovery.target_rto_seconds = 7200;
    profile.paid_partner_count = minimumPaidPartners;
    profile.partner_evidence_verified = minimumPaidPartners > 0;
    profile.owner_accepted = true;
    profile.production_eligible = true;
    profile.release_allowed = true;

    const gates = profile.gates as Record<string, unknown>[];
    for (const gate of gates) {
      const kind = String(gate.kind).toLowerCase().replaceAll('_', '-');
      const drillRequired = gate.drill_required === true;
      gate.status = 'OWNER_ACCEPTED';
      gate.evidence_verified = true;
      gate.drill_passed = drillRequired;
      gate.owner_accepted = true;
      const evidence: Record<string, unknown> = {
        evidence_ref:
          gate.kind === 'SUPPLY_CHAIN'
            ? profile.release_evidence_manifest_ref
            : `evidence:${topology}:${kind}:v1`,
        verifier_ref: 'verifier:deployment-profile:v1',
        verified_at: '2026-07-13T12:00:00Z',
        owner_acceptance_ref: `owner-acceptance:${topology}:${kind}:v1`,
      };
      if (drillRequired) {
        evidence.drill_evidence_ref = `drill:${topology}:${kind}:v1`;
        evidence.measured_at = '2026-07-13T12:00:00Z';
      }
      if (gate.kind === 'BACKUP_RESTORE' || gate.kind === 'UPGRADE_ROLLBACK') {
        evidence.observed_rpo_seconds = 600;
        evidence.observed_rto_seconds = 1200;
      }
      gate.evidence = evidence;
    }

    profile.activation_evidence = {
      release_receipt_ref: `release-receipt:${topology}:v1`,
      partner_evidence_refs: Array.from(
        { length: minimumPaidPartners },
        (_, index) => `partner-evidence:${topology}:${index + 1}`,
      ),
      owner_acceptance_ref: `owner-acceptance:${topology}:profile:v1`,
      accepted_at: '2026-07-13T12:00:00Z',
    };
  }

  return registry;
}
