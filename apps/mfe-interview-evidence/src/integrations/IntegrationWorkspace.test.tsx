import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { IntegrationWorkspace } from './IntegrationWorkspace';
import { SYNTHETIC_CONNECTORS, SYNTHETIC_FIELD_MAPPINGS } from './syntheticRegistry';

describe('IntegrationWorkspace', () => {
  test('sentetik siniri, kapali aksiyonlari ve tum kategori kataloğunu gosterir', () => {
    render(<IntegrationWorkspace />);

    expect(screen.getByTestId('integration-synthetic-boundary')).toHaveTextContent(
      'SENTETİK / veri aktarımı yok',
    );
    for (const connector of SYNTHETIC_CONNECTORS) {
      expect(screen.getByTestId(`connector-${connector.id}`)).toBeInTheDocument();
    }
    expect(screen.getByTestId('integration-test-button')).toBeDisabled();
    expect(screen.getByTestId('integration-write-button')).toBeDisabled();
    expect(screen.getByTestId('integration-action-reason')).toHaveTextContent('API doğrulanmadı');
  });

  test('fixture hicbir baglayiciyi dogrulanmis gibi gostermez', () => {
    expect(SYNTHETIC_CONNECTORS.every((connector) => connector.apiVerified === false)).toBe(true);
    expect(SYNTHETIC_CONNECTORS.some((connector) => connector.status === 'VERIFIED')).toBe(false);
  });

  test('arama katalogu filtreler ve ayrintiyi gorunur sonuc ile senkronlar', () => {
    render(<IntegrationWorkspace />);
    const search = screen.getByLabelText('Bağlayıcı ara');

    expect(screen.getByTestId('connector-ats-generic')).toHaveAttribute('aria-pressed', 'true');

    fireEvent.change(search, { target: { value: 'SCIM' } });
    expect(screen.getByTestId('connector-identity-scim')).toBeInTheDocument();
    expect(screen.queryByTestId('connector-ats-generic')).not.toBeInTheDocument();
    expect(screen.getByTestId('connector-identity-scim')).toHaveAttribute('aria-pressed', 'true');

    expect(
      within(screen.getByTestId('connector-detail')).getByText('YAPILANDIRILMADI'),
    ).toBeVisible();
    expect(screen.getByTestId('connector-detail')).toHaveTextContent('IdP metadata');

    fireEvent.change(search, { target: { value: '' } });
    for (const connector of SYNTHETIC_CONNECTORS) {
      expect(screen.getByTestId(`connector-${connector.id}`)).toBeInTheDocument();
    }
    expect(screen.getByTestId('connector-ats-generic')).toHaveAttribute('aria-pressed', 'true');
  });

  test('bloke HRIS ayrintisini ve G0 partner gerekcesini gosterir', () => {
    render(<IntegrationWorkspace />);

    fireEvent.click(screen.getByTestId('connector-hris-generic'));
    const detail = screen.getByTestId('connector-detail');
    expect(screen.getByTestId('connector-hris-generic')).toHaveAttribute('aria-pressed', 'true');
    expect(within(detail).getByText('BLOKE')).toBeVisible();
    expect(detail).toHaveTextContent('G0 ve ücretli partner acceptance');
  });

  test('alan esleme tablosu yalniz preview-only ve kapali satirlar icerir', () => {
    render(<IntegrationWorkspace />);
    const table = screen.getByTestId('mapping-preview');

    expect(within(table).getAllByRole('row')).toHaveLength(SYNTHETIC_FIELD_MAPPINGS.length + 1);
    expect(within(table).getAllByText(/KAPALI · PREVIEW_ONLY/)).toHaveLength(
      SYNTHETIC_FIELD_MAPPINGS.length,
    );
    expect(within(table).getByText('candidate.email')).toBeInTheDocument();
    expect(within(table).getByText('PII')).toBeInTheDocument();
    expect(within(table).getByText('Sentetik alan eşleme önizlemesi')).toBeInTheDocument();
  });
});
