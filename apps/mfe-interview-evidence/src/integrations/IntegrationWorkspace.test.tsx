import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { IntegrationWorkspace } from './IntegrationWorkspace';
import {
  INTEGRATION_PLATFORM_SAMPLE_SHA256,
  INTEGRATION_PLATFORM_SOURCE_COMMIT,
} from './integrationPlatformContract';

describe('IntegrationWorkspace', () => {
  test('canonical public pin, PRE-G0 boundary, six domains and three envelopes render', () => {
    render(<IntegrationWorkspace />);

    expect(screen.getByTestId('integration-contract-status')).toHaveTextContent('CONTRACT VALID');
    expect(screen.getByTestId('integration-source-pin')).toHaveTextContent(
      INTEGRATION_PLATFORM_SOURCE_COMMIT,
    );
    expect(screen.getByTestId('integration-source-pin')).toHaveTextContent(
      INTEGRATION_PLATFORM_SAMPLE_SHA256,
    );
    expect(screen.getByText('integration-platform/v1')).toBeVisible();
    expect(screen.getByText('PRE_G0_CONTRACT_ONLY')).toBeVisible();
    expect(screen.getByText(/connector-capability\/v1 · P1 BASELINE · AYRI/)).toBeVisible();
    expect(within(screen.getByTestId('connector-catalog')).getAllByRole('button')).toHaveLength(6);
    expect(screen.getByTestId('connector-catalog')).toHaveStyle({
      gridTemplateColumns: 'repeat(auto-fit, minmax(min(240px, 100%), 1fr))',
      minWidth: 0,
    });
    expect(
      within(screen.getByTestId('synthetic-envelope-catalog')).getAllByRole('listitem'),
    ).toHaveLength(3);
  });

  test('surface is view-only and never renders test, write or activation controls', () => {
    render(<IntegrationWorkspace />);

    expect(screen.queryByRole('button', { name: /bağlantıyı test et/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /yazma yetkisini aç/i })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /aktive et|etkinleştir/i }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByText(/API VERIFIED · FALSE/)).toHaveLength(6);
    expect(screen.queryByText(/API VERIFIED · TRUE/)).not.toBeInTheDocument();
  });

  test('native keyboard selection and search keep detail aligned', () => {
    render(<IntegrationWorkspace />);
    const search = screen.getByLabelText('Bağlayıcı ara');

    fireEvent.change(search, { target: { value: 'PORTABILITY' } });
    const portability = screen.getByTestId('connector-open-portability-v1');
    expect(portability).toBeVisible();
    expect(within(screen.getByTestId('connector-catalog')).getAllByRole('button')).toHaveLength(1);

    portability.focus();
    fireEvent.keyDown(portability, { key: 'Enter' });
    fireEvent.click(portability);
    expect(portability).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('connector-detail')).toHaveTextContent('SIGNED_WEBHOOK');
    expect(screen.getByTestId('connector-detail')).toHaveTextContent('REPLAY WINDOW · 300 saniye');
    expect(screen.getByTestId('connector-detail')).toHaveTextContent('OPAQUE_REF_ONLY');

    fireEvent.change(search, { target: { value: 'eşleşmez' } });
    expect(screen.getByTestId('connector-empty-state')).toBeVisible();
    expect(screen.queryByTestId('connector-detail')).not.toBeInTheDocument();
  });

  test('mutation, transfer and reliability ceilings are explicit', () => {
    render(<IntegrationWorkspace />);
    const detail = screen.getByTestId('connector-detail');

    for (const invariant of [
      'HUMAN_APPROVAL_REQUIRED',
      'IDEMPOTENCY_REQUIRED',
      'DECISION_IMPACT · NONE',
      'DESTRUCTIVE · DISALLOWED',
      'BATCH_APPROVAL · DISALLOWED',
      'OPAQUE_REF_ONLY',
      'TENANT-SCOPED IDEMPOTENCY · REQUIRED',
    ]) {
      expect(detail).toHaveTextContent(invariant);
    }
  });

  test('malformed unknown input is a distinct fail-closed state with no partial catalog', () => {
    render(<IntegrationWorkspace registryInput={{ schema_version: 'unknown/v9' }} />);

    expect(screen.getByTestId('integration-contract-status')).toHaveTextContent(
      'CONTRACT FAIL-CLOSED',
    );
    expect(screen.getByTestId('integration-fail-closed')).toHaveTextContent(
      'Kısmi katalog, fixture fallback veya aktivasyon aksiyonu gösterilmiyor',
    );
    expect(screen.queryByTestId('connector-catalog')).not.toBeInTheDocument();
    expect(screen.queryByTestId('synthetic-envelope-catalog')).not.toBeInTheDocument();
  });

  test('catalog and horizontal detail region have accessible names', () => {
    render(<IntegrationWorkspace />);

    expect(screen.getByRole('group', { name: 'Canonical bağlayıcı kataloğu' })).toBeVisible();
    expect(
      screen.getByRole('region', { name: /generic-ats-v1 operasyon ve veri sınıfları/ }),
    ).toHaveAttribute('tabindex', '0');
  });
});
