import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import App from './App';
import * as api from './public-api';
vi.mock('./public-api');
describe('Etik Speak public reporter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    vi.mocked(api.listEvidence).mockResolvedValue([]);
    vi.mocked(api.declareEvidence).mockResolvedValue({
      attachmentId: 'a-1',
      state: 'UPLOADING',
      uploadPath: '/api/v1/public/ethics/evidence/uploads',
      uploadCapability: 'capability-with-more-than-thirty-two-characters',
      uploadExpiresAt: '2026-07-18T12:10:00Z',
      idempotentReplay: false,
    });
    vi.mocked(api.uploadEvidence).mockResolvedValue({
      attachmentId: 'a-1',
      state: 'QUARANTINED',
      mediaType: 'text/plain',
      size: 18,
      failureCode: null,
      createdAt: '2026-07-18T12:00:00Z',
      updatedAt: '2026-07-18T12:01:00Z',
    });
    vi.mocked(api.validateEvidenceFile).mockReturnValue(undefined);
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
  test('unsupported identity path remains disabled and attachment starts only after durable receipt', async () => {
    render(<App />);
    await userEvent.click(screen.getByRole('button', { name: 'Yeni bildirim yap' }));
    expect(screen.getByRole('radio', { name: /Gizli/ })).toBeDisabled();
    expect(screen.getByLabelText('Ek dosya')).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('Önce bildiriminiz kalıcı');
  });
  test('saved receipt opens mailbox without putting the access secret in the URL', async () => {
    render(<App />);
    await userEvent.click(screen.getByRole('button', { name: 'Yeni bildirim yap' }));
    await userEvent.selectOptions(screen.getByLabelText('Kategori'), 'WORKPLACE_CONDUCT');
    await userEvent.type(screen.getByLabelText('Kısa konu'), 'Sentetik bildirim');
    await userEvent.type(screen.getByLabelText('Ne oldu?'), 'Sentetik anlatım');
    await userEvent.click(screen.getByRole('checkbox'));
    await userEvent.click(screen.getByRole('button', { name: 'Bildirimi gönder' }));
    await userEvent.click(
      await screen.findByRole('checkbox', {
        name: /Bildirim numarası ile erişim sırrını güvenli bir yere kaydettim/,
      }),
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Mailbox’a geç ve kanıt dosyası ekle' }),
    );
    expect(await screen.findByRole('heading', { name: 'Kanıt dosyaları' })).toBeInTheDocument();
    expect(api.openMailbox).toHaveBeenCalledWith('r-1', 'secret-once');
    expect(window.location.search).toBe('');
  });
  test('reporter uploads a supported file through declaration and fixed capability flow', async () => {
    vi.mocked(api.listEvidence)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          attachmentId: 'a-1',
          state: 'QUARANTINED',
          mediaType: 'text/plain',
          size: 18,
          failureCode: null,
          createdAt: '2026-07-18T12:00:00Z',
          updatedAt: '2026-07-18T12:01:00Z',
        },
      ]);
    render(<App />);
    await userEvent.click(screen.getByRole('button', { name: 'Bildirimi takip et' }));
    await userEvent.type(screen.getByLabelText('Bildirim numarası'), 'r-1');
    await userEvent.type(screen.getByLabelText('Erişim sırrı'), 'secret-once');
    await userEvent.click(screen.getByRole('button', { name: 'Güvenli mailbox aç' }));
    const file = new File(['sentetik kanıt'], 'yerel-ad-gonderilmemeli.txt', {
      type: 'text/plain',
      lastModified: 1,
    });
    await userEvent.upload(await screen.findByLabelText('Kanıt dosyası seç'), file);
    expect(api.declareEvidence).toHaveBeenCalledWith(file, expect.any(String));
    expect(api.uploadEvidence).toHaveBeenCalledWith(
      expect.objectContaining({ attachmentId: 'a-1' }),
      file,
    );
    expect(await screen.findByText('Karantinada')).toBeInTheDocument();
  });
  test('completed declaration replay reads back status without reusing upload capability', async () => {
    vi.mocked(api.declareEvidence).mockResolvedValueOnce({
      attachmentId: 'a-1',
      state: 'AVAILABLE',
      uploadPath: '/api/v1/public/ethics/evidence/uploads',
      uploadCapability: null,
      uploadExpiresAt: '2026-07-18T12:10:00Z',
      idempotentReplay: true,
    });
    vi.mocked(api.listEvidence)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          attachmentId: 'a-1',
          state: 'AVAILABLE',
          mediaType: 'text/plain',
          size: 18,
          failureCode: null,
          createdAt: '2026-07-18T12:00:00Z',
          updatedAt: '2026-07-18T12:01:00Z',
        },
      ]);
    render(<App />);
    await userEvent.click(screen.getByRole('button', { name: 'Bildirimi takip et' }));
    await userEvent.type(screen.getByLabelText('Bildirim numarası'), 'r-1');
    await userEvent.type(screen.getByLabelText('Erişim sırrı'), 'secret-once');
    await userEvent.click(screen.getByRole('button', { name: 'Güvenli mailbox aç' }));
    const evidence = new File(['sentetik kanıt'], 'yerel-ad-gonderilmemeli.txt', {
      type: 'text/plain',
      lastModified: 1,
    });

    await userEvent.upload(await screen.findByLabelText('Kanıt dosyası seç'), evidence);

    expect(api.uploadEvidence).not.toHaveBeenCalled();
    expect(await screen.findByText('Güvenli türev hazır')).toBeInTheDocument();
  });
});
