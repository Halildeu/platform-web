import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import App from './App';
import * as api from './public-api';

vi.mock('./public-api');

/**
 * ES-212 (#3370) — the three reporting modes on the public form.
 *
 * <p>What is pinned here is not that the radios render, but that the payload matches the
 * promise the chosen mode made. Anonymous must leave no identity anywhere in the request;
 * the other two must carry one. Getting that backwards would be invisible in the UI and
 * catastrophic for the person reporting.
 */
describe('report modes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.newAccessSecret).mockReturnValue('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdef');
    vi.mocked(api.createReport).mockResolvedValue({
      receiptId: 'r-1',
      accessSecret: 'secret-once',
      createdAt: '2026-08-02T12:00:00Z',
      mailboxPath: '/mailbox',
      idempotentReplay: false,
    });
    vi.mocked(api.listEvidence).mockResolvedValue([]);
  });

  const fillNarrative = async () => {
    await userEvent.selectOptions(screen.getByLabelText('Kategori'), 'WORKPLACE_CONDUCT');
    await userEvent.type(screen.getByLabelText('Kısa konu'), 'Sentetik konu');
    await userEvent.type(screen.getByLabelText('Ne oldu?'), 'Sentetik anlatım');
    await userEvent.click(screen.getByRole('checkbox'));
  };

  test('offers only the modes this tenant runs', async () => {
    vi.mocked(api.fetchIntakeOptions).mockResolvedValue(['ANONYMOUS']);
    render(<App />);
    await userEvent.click(screen.getByRole('button', { name: 'Yeni bildirim yap' }));

    expect(screen.getByRole('radio', { name: /Anonim/ })).toBeInTheDocument();
    // Not merely disabled — absent. A greyed-out option still tells the reporter that
    // confidential reporting exists and is being withheld from them.
    expect(screen.queryByRole('radio', { name: /Gizli/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: /İsimli/ })).not.toBeInTheDocument();
  });

  test('an anonymous report carries no identity at all', async () => {
    vi.mocked(api.fetchIntakeOptions).mockResolvedValue(['ANONYMOUS', 'CONFIDENTIAL']);
    render(<App />);
    await userEvent.click(screen.getByRole('button', { name: 'Yeni bildirim yap' }));
    await waitFor(() => expect(screen.getByRole('radio', { name: /Gizli/ })).toBeInTheDocument());
    await fillNarrative();
    await userEvent.click(screen.getByRole('button', { name: 'Bildirimi gönder' }));

    await waitFor(() => expect(api.createReport).toHaveBeenCalled());
    const body = vi.mocked(api.createReport).mock.calls[0][0] as Record<string, unknown>;
    expect(body.mode).toBe('ANONYMOUS');
    // The key must be absent, not present-and-empty: the server refuses an anonymous
    // report that carries the field at all, so sending {} would break anonymous intake.
    expect('reporterIdentity' in body).toBe(false);
  });

  test('choosing confidential asks for the identity and sends it', async () => {
    vi.mocked(api.fetchIntakeOptions).mockResolvedValue(['ANONYMOUS', 'CONFIDENTIAL', 'NAMED']);
    render(<App />);
    await userEvent.click(screen.getByRole('button', { name: 'Yeni bildirim yap' }));
    await waitFor(() => expect(screen.getByRole('radio', { name: /Gizli/ })).toBeInTheDocument());

    expect(screen.queryByLabelText('Ad soyad')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('radio', { name: /Gizli/ }));
    expect(screen.getByLabelText('Ad soyad')).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Ad soyad'), 'Ayşe Yılmaz');
    await fillNarrative();
    await userEvent.click(screen.getByRole('button', { name: 'Bildirimi gönder' }));

    await waitFor(() => expect(api.createReport).toHaveBeenCalled());
    const body = vi.mocked(api.createReport).mock.calls[0][0] as Record<string, unknown>;
    expect(body.mode).toBe('CONFIDENTIAL');
    expect(body.reporterIdentity).toEqual({
      fullName: 'Ayşe Yılmaz',
      // Blank optional fields travel as undefined, never as "", so a later reader cannot
      // mistake "not given" for "given as empty".
      email: undefined,
      phone: undefined,
      unit: undefined,
    });
  });

  test('confidential and named state different promises about who sees the identity', async () => {
    vi.mocked(api.fetchIntakeOptions).mockResolvedValue(['ANONYMOUS', 'CONFIDENTIAL', 'NAMED']);
    render(<App />);
    await userEvent.click(screen.getByRole('button', { name: 'Yeni bildirim yap' }));
    await waitFor(() => expect(screen.getByRole('radio', { name: /Gizli/ })).toBeInTheDocument());

    // Anchored on the fieldset's own hint ("Bu bilgiler …"), which is the sentence shown
    // directly above the name field. The radio's hint says something similar, so a looser
    // matcher finds both and proves neither.
    await userEvent.click(screen.getByRole('radio', { name: /Gizli/ }));
    expect(screen.getByText(/^Bu bilgiler şifrelenerek saklanır/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('radio', { name: /İsimli/ }));
    expect(screen.getByText(/^Bu bilgiler vakayı inceleyen ekiple paylaşılır/)).toBeInTheDocument();
  });
});
