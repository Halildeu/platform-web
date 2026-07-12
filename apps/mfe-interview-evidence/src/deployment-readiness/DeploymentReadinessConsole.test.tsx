import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { DeploymentReadinessConsole } from './DeploymentReadinessConsole';
import {
  SYNTHETIC_DEPLOYMENT_PROFILES,
  SYNTHETIC_EVIDENCE_GATES,
} from './syntheticReadinessRegistry';

describe('DeploymentReadinessConsole', () => {
  test('sentetik siniri ve NO-GO aksiyon kapisini gosterir', () => {
    render(<DeploymentReadinessConsole />);

    expect(screen.getByTestId('deployment-synthetic-boundary')).toHaveTextContent(
      'SENTETİK / dağıtım yapılmaz',
    );
    expect(screen.getByTestId('deployment-decision')).toHaveTextContent(
      `NO-GO · 0/${SYNTHETIC_EVIDENCE_GATES.length} doğrulandı`,
    );
    expect(screen.getByTestId('deployment-verify-button')).toBeDisabled();
    expect(screen.getByTestId('deployment-promote-button')).toBeDisabled();
    expect(screen.getByTestId('deployment-verify-reason')).toHaveTextContent(
      'doğrulama adaptörü yapılandırılmadı',
    );
    expect(screen.getByTestId('deployment-promote-reason')).toHaveTextContent('owner acceptance');
  });

  test('fixture hicbir profile veya evidence gate icin hazirlik uydurmaz', () => {
    expect(SYNTHETIC_DEPLOYMENT_PROFILES.every((profile) => !profile.ownerAccepted)).toBe(true);
    expect(SYNTHETIC_DEPLOYMENT_PROFILES.some((profile) => profile.status === 'VERIFIED')).toBe(
      false,
    );
    expect(SYNTHETIC_EVIDENCE_GATES.every((gate) => !gate.evidenceVerified)).toBe(true);
    expect(SYNTHETIC_EVIDENCE_GATES.some((gate) => gate.status === 'VERIFIED')).toBe(false);
  });

  test('profil secimi ayrinti, status ve altyapi sozlesmesini senkronlar', () => {
    render(<DeploymentReadinessConsole />);
    const onPrem = screen.getByTestId('deployment-profile-SOVEREIGN_ON_PREM');

    fireEvent.click(onPrem);

    expect(onPrem).toHaveAttribute('aria-pressed', 'true');
    const detail = screen.getByTestId('deployment-profile-detail');
    expect(within(detail).getByText('Sovereign On-Prem')).toBeVisible();
    expect(within(detail).getByText('DEĞERLENDİRİLMEDİ')).toBeVisible();
    expect(detail).toHaveTextContent('Offline-capable OCI registry');
    expect(detail).toHaveTextContent('Partner discovery');
  });

  test('bes kanit kapisini standartlari ve eksik gerekceleriyle listeler', () => {
    render(<DeploymentReadinessConsole />);
    const table = screen.getByTestId('deployment-evidence-table');

    expect(within(table).getAllByRole('row')).toHaveLength(SYNTHETIC_EVIDENCE_GATES.length + 1);
    expect(within(table).getByText(/SPDX\/CycloneDX/)).toBeInTheDocument();
    expect(within(table).getByText(/Atomic cutover/)).toBeInTheDocument();
    expect(within(table).getByText(/ölçülmüş RPO\/RTO/)).toBeInTheDocument();
    expect(
      within(table).getByText('Sovereign deployment zorunlu kanıt kapıları'),
    ).toBeInTheDocument();
  });
});
