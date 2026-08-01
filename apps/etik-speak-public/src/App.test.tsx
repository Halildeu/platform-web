import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import App, { reporterReplyStatus } from './App';
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
  test('lapsed tenant: refusal opens the channel-inactive view, mailbox stays reachable', async () => {
    // ES-403 (#885): only NEW intake closes. The specific refusal code routes to a view
    // that keeps the two promises — existing report reachable + external avenues named.
    const refusal = Object.assign(new Error('INTAKE_CHANNEL_INACTIVE'), {
      status: 403,
      code: 'INTAKE_CHANNEL_INACTIVE',
    });
    vi.mocked(api.createReport).mockRejectedValue(refusal);
    render(<App />);
    await userEvent.click(screen.getByRole('button', { name: 'Yeni bildirim yap' }));
    await userEvent.selectOptions(screen.getByLabelText('Kategori'), 'WORKPLACE_CONDUCT');
    await userEvent.type(screen.getByLabelText('Kısa konu'), 'Sentetik bildirim');
    await userEvent.type(screen.getByLabelText('Ne oldu?'), 'Sentetik anlatım');
    await userEvent.click(screen.getByRole('checkbox'));
    await userEvent.click(screen.getByRole('button', { name: 'Bildirimi gönder' }));
    expect(
      await screen.findByRole('heading', { name: 'Bu kanal şu an yeni bildirim almıyor.' }),
    ).toBeInTheDocument();
    // The refusal is a state, not an error line — no alert box.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    // The surface that stays open is one click away.
    await userEvent.click(screen.getByRole('button', { name: 'Mevcut bildirimimi takip et' }));
    expect(screen.getByLabelText('Bildirim numarası')).toBeInTheDocument();
  });

  test('any other intake failure still renders the plain error line', async () => {
    // Guards the routing itself: only the specific machine-readable code changes views.
    vi.mocked(api.createReport).mockRejectedValue(
      Object.assign(new Error('İstek sıklığı sınırı aşıldı.'), { status: 429, code: 'RATE_LIMITED' }),
    );
    render(<App />);
    await userEvent.click(screen.getByRole('button', { name: 'Yeni bildirim yap' }));
    await userEvent.selectOptions(screen.getByLabelText('Kategori'), 'WORKPLACE_CONDUCT');
    await userEvent.type(screen.getByLabelText('Kısa konu'), 'Sentetik bildirim');
    await userEvent.type(screen.getByLabelText('Ne oldu?'), 'Sentetik anlatım');
    await userEvent.click(screen.getByRole('checkbox'));
    await userEvent.click(screen.getByRole('button', { name: 'Bildirimi gönder' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('İstek sıklığı sınırı aşıldı.');
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
  const openMailboxView = async () => {
    await userEvent.click(screen.getByRole('button', { name: 'Bildirimi takip et' }));
    await userEvent.type(screen.getByLabelText('Bildirim numarası'), 'r-1');
    await userEvent.type(screen.getByLabelText('Erişim sırrı'), 'secret-once');
    await userEvent.click(screen.getByRole('button', { name: 'Güvenli mailbox aç' }));
  };

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
    // The intake form must not present a file control at all. A disabled one is
    // still announced as a file picker, so it reads as a broken feature rather
    // than a later step — and uploading is genuinely impossible until a receipt
    // exists to bind the evidence to.
    expect(screen.queryByLabelText('Ek dosya')).toBeNull();
    expect(document.querySelector('input[type="file"]')).toBeNull();
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

  // The seven-day acknowledgement is the promise made to the reporter at intake. The case
  // has always carried the timestamps and the handler's screen has always shown the
  // deadline in red; the person the deadline protects was told nothing. These lock the
  // three answers apart, because the one that matters most is the third: a page that
  // cannot tell must not imply it can.
  test('an unanswered report past the deadline says so', async () => {
    vi.mocked(api.getMailbox).mockResolvedValue({
      status: 'NEW',
      messages: [],
      filedAt: new Date(Date.now() - 20 * 86_400_000).toISOString(),
      acknowledgedAt: null,
    });
    render(<App />);
    await openMailboxView();

    const line = await screen.findByTestId('etik-case-acknowledgement');
    expect(line).toHaveAttribute('data-overdue', 'true');
    expect(line).toHaveTextContent(/20 gündür yanıt yazmadı/);
    // Announced, because it changed while the reporter was reading.
    expect(line).toHaveAttribute('role', 'alert');
  });

  test('an answered report says how long it took, without an alarm', async () => {
    vi.mocked(api.getMailbox).mockResolvedValue({
      status: 'IN_REVIEW',
      messages: [],
      filedAt: '2026-07-01T09:00:00Z',
      acknowledgedAt: '2026-07-04T09:00:00Z',
    });
    render(<App />);
    await openMailboxView();

    const line = await screen.findByTestId('etik-case-acknowledgement');
    expect(line).toHaveTextContent('Bildiriminiz 3 gün içinde yanıtlandı.');
    expect(line).toHaveAttribute('data-overdue', 'false');
  });

  // A bundle deployed ahead of the service receives neither timestamp. A countdown from a
  // missing date would still read as a statement about a legal deadline, so it says nothing.
  test('a response without the timestamps claims no deadline at all', async () => {
    vi.mocked(api.getMailbox).mockResolvedValue({ status: 'NEW', messages: [] });
    render(<App />);
    await openMailboxView();

    await screen.findByTestId('etik-case-status');
    expect(screen.queryByTestId('etik-case-acknowledgement')).not.toBeInTheDocument();
  });

  // İhbarcı bu sayfaya tek bir soruyla geliyor: bana cevap verdiler mi? Cevap listenin
  // içine gömülüydü; "Etik ekibi" satırını bulmak için okumak gerekiyordu.
  test('ekip yazmadıysa bu açıkça söylenir', () => {
    expect(reporterReplyStatus([]).answered).toBe(false);
    expect(reporterReplyStatus([]).text).toContain('henüz size yazmadı');
    expect(
      reporterReplyStatus([{ authorType: 'REPORTER', createdAt: '2026-07-18T12:00:00Z' }]).answered,
    ).toBe(false);
  });

  test('ekip yazdıysa en son yazdığı an gösterilir', () => {
    const status = reporterReplyStatus([
      { authorType: 'STAFF', createdAt: '2026-07-18T09:00:00Z' },
      { authorType: 'REPORTER', createdAt: '2026-07-19T09:00:00Z' },
      { authorType: 'STAFF', createdAt: '2026-07-20T15:30:00Z' },
    ]);
    expect(status.answered).toBe(true);
    // Sıraya değil damgaya bakılır: burada sorulan gerçekten "en son ne zaman".
    // Saat dilimine bağlı kalmamak için beklenen metin aynı damgadan üretiliyor; asıl
    // iddia şu: EN SON yanıtın anı yazıyor, ilkininki DEĞİL.
    const latest = new Date(Date.parse('2026-07-20T15:30:00Z')).toLocaleString('tr-TR');
    const earlier = new Date(Date.parse('2026-07-18T09:00:00Z')).toLocaleString('tr-TR');
    expect(status.text).toContain(latest);
    expect(status.text).not.toContain(earlier);
  });

  // Damgası okunamayan bir yanıt yine de bir yanıttır; eksik olan tarih. Olmayan bir tarihi
  // uydurmak, tarihi hiç yazmamaktan kötüdür.
  test('tarihi okunamayan yanıt yine de yanıt sayılır', () => {
    const status = reporterReplyStatus([{ authorType: 'STAFF', createdAt: 'bozuk' }]);
    expect(status.answered).toBe(true);
    expect(status.text).toBe('Etik ekibi size yazdı.');
  });
});
