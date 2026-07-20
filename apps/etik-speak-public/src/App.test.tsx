import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import App from './App';
import * as api from './public-api';
vi.mock('./public-api');
describe('Etik Speak public reporter', () => {
  beforeEach(() => {
    vi.mocked(api.newAccessSecret).mockReturnValue('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdef');
    vi.mocked(api.createReport).mockResolvedValue({
      receiptId: 'r-1',
      accessSecret: 'secret-once',
      createdAt: '2026-07-18T12:00:00Z',
      mailboxPath: '/mailbox',
      idempotentReplay: false,
    });
    vi.mocked(api.openMailbox).mockResolvedValue({ expiresAt: '2026-07-18T13:00:00Z' });
    vi.mocked(api.getMailbox).mockResolvedValue({
      status: 'IN_REVIEW',
      messages: [
        {
          id: 'm-1',
          authorType: 'STAFF',
          body: 'Sentetik yetkili yanıtı',
          createdAt: '2026-07-18T12:30:00Z',
        },
      ],
    });
  });
  test('anonymous intake shows receipt only after durable API success', async () => {
    render(<App />);
    await userEvent.click(screen.getByRole('button', { name: 'Yeni bildirim yap' }));
    await userEvent.selectOptions(screen.getByLabelText('Kategori'), 'WORKPLACE_CONDUCT');
    await userEvent.type(screen.getByLabelText('Kısa konu'), 'Sentetik bildirim');
    await userEvent.type(screen.getByLabelText('Ne oldu?'), 'Sentetik anlatım');
    await userEvent.click(screen.getByRole('checkbox'));
    await userEvent.click(screen.getByRole('button', { name: 'Bildirimi gönder' }));
    expect(await screen.findByText('secret-once')).toBeInTheDocument();
    expect(api.createReport).toHaveBeenCalledTimes(1);
  });
  test('mailbox secret input is password and not URL', async () => {
    render(<App />);
    await userEvent.click(screen.getByRole('button', { name: 'Bildirimi takip et' }));
    expect(screen.getByLabelText('Erişim sırrı')).toHaveAttribute('type', 'password');
    expect(window.location.search).toBe('');
  });
  test('reporter sees only safe case status and reporter-visible messages', async () => {
    render(<App />);
    await userEvent.click(screen.getByRole('button', { name: 'Bildirimi takip et' }));
    await userEvent.type(screen.getByLabelText('Bildirim numarası'), 'r-1');
    await userEvent.type(screen.getByLabelText('Erişim sırrı'), 'secret-once');
    await userEvent.click(screen.getByRole('button', { name: 'Güvenli mailbox aç' }));
    expect(await screen.findByTestId('etik-case-status')).toHaveTextContent(
      'Bildirim durumu: İncelemede',
    );
    expect(screen.getByText('Sentetik yetkili yanıtı')).toBeInTheDocument();
  });
  test('unsupported identity and attachment paths fail visibly instead of collecting data', async () => {
    render(<App />);
    await userEvent.click(screen.getByRole('button', { name: 'Yeni bildirim yap' }));
    expect(screen.getByRole('radio', { name: /Gizli/ })).toBeDisabled();
    expect(screen.getByLabelText('Ek dosya')).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('sessizce kabul edilmez');
  });
});
