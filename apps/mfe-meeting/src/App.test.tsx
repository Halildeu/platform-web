import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import MeetingApp from './App';
import { createDemoWorkbenchData } from './meeting-api';

describe('MeetingApp', () => {
  it('renders the meeting workbench with stats, controls, and transcript readiness surface', async () => {
    render(<MeetingApp />);

    expect(await screen.findByText('Demo veri')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Meeting Intelligence' })).toBeInTheDocument();
    expect(screen.getByLabelText('Veri kaynağı')).toHaveTextContent('Demo veri');
    expect(screen.getByLabelText('Meeting Intelligence metrikleri')).toHaveTextContent('Aktif');
    expect(screen.getByLabelText('Meeting Intelligence metrikleri')).toHaveTextContent('Kaynaklı');
    expect(screen.getByLabelText('Meeting Intelligence metrikleri')).toHaveTextContent('6');
    expect(screen.getByLabelText('Toplantılar')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Transkript' })).toBeInTheDocument();
    expect(screen.getByText('Recorder kanıtı')).toBeInTheDocument();
    expect(
      screen.getByText('Web ürün yüzeyi acceptance hattından bağımsız paralel ilerleyecek.'),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /00:00 · Ürün/i })).toHaveLength(2);
    expect(screen.getAllByText('Yüksek güven')).not.toHaveLength(0);
  });

  it('filters blocked meetings and keeps empty transcript state honest', async () => {
    render(<MeetingApp />);
    expect(await screen.findByText('Demo veri')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Blokeli' }));

    const meetingList = screen.getByLabelText('Toplantılar');
    expect(within(meetingList).getByText('Direct-STT mTLS unblock')).toBeInTheDocument();
    expect(within(meetingList).queryByText('Faz 24 haftalık ürün durumu')).not.toBeInTheDocument();
    expect(screen.getByText('Direct-STT bekliyor')).toBeInTheDocument();
    expect(screen.getByText('Transkript akışı bekleniyor')).toBeInTheDocument();
    expect(screen.getByText('mTLS Secret: Blokeli')).toBeInTheDocument();
    expect(screen.getAllByText(/kaynak bekliyor/i).length).toBeGreaterThan(0);
  });

  it('searches meetings and selects the demo readout detail', async () => {
    render(<MeetingApp />);
    expect(await screen.findByText('Demo veri')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Toplantı ara'), {
      target: { value: 'müşteri' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Müşteri demo hazırlığı/i }));

    expect(screen.getByRole('heading', { name: 'Müşteri demo hazırlığı' })).toBeInTheDocument();
    expect(
      screen.getByText('Demo senaryosu web workbench üzerinden tek ekranla anlatılacak.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Demo için empty/block/live state ekran görüntülerini hazırla.'),
    ).toBeInTheDocument();
  });

  it('opens policy-aware export/share/delete action surfaces without enabling mutations', async () => {
    render(<MeetingApp />);
    expect(await screen.findByText('Demo veri')).toBeInTheDocument();

    const actionRow = screen.getByLabelText('Toplantı aksiyonları');

    fireEvent.click(within(actionRow).getByRole('button', { name: 'Dışa aktar' }));

    expect(screen.getByLabelText('Dışa aktar politika durumu')).toHaveTextContent(
      'Dışa aktar politikası',
    );
    expect(screen.getByLabelText('Dışa aktar politika durumu')).toHaveTextContent(
      'Export policy + audit event + retention sınıfı',
    );
    expect(screen.getByRole('button', { name: 'Runtime mutasyon kapalı' })).toBeDisabled();

    fireEvent.click(within(actionRow).getByRole('button', { name: 'Paylaş' }));

    expect(screen.getByLabelText('Paylaş politika durumu')).toHaveTextContent('Paylaş politikası');
    expect(screen.getByLabelText('Paylaş politika durumu')).toHaveTextContent(
      'Recipient authorization + share audit + link TTL',
    );

    fireEvent.click(within(actionRow).getByRole('button', { name: 'Sil' }));

    expect(screen.getByLabelText('Sil politika durumu')).toHaveTextContent('Sil politikası');
    expect(screen.getByLabelText('Sil politika durumu')).toHaveTextContent(
      'Retention decision + dual-control approval + delete audit',
    );
  });

  it('clears an open policy panel when the selected meeting changes', async () => {
    render(<MeetingApp />);
    expect(await screen.findByText('Demo veri')).toBeInTheDocument();

    const actionRow = screen.getByLabelText('Toplantı aksiyonları');
    fireEvent.click(within(actionRow).getByRole('button', { name: 'Sil' }));
    expect(screen.getByLabelText('Sil politika durumu')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Direct-STT mTLS unblock/i }));

    expect(screen.getByRole('heading', { name: 'Direct-STT mTLS unblock' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Sil politika durumu')).not.toBeInTheDocument();
  });

  it('surfaces API fallback as a visible non-acceptance state', async () => {
    const fallback = createDemoWorkbenchData('2026-06-29T00:00:00.000Z');
    fallback.source = {
      mode: 'api-fallback',
      label: 'API ulaşılamadı',
      detail: 'Demo veriyle devam ediliyor; canlı acceptance iddiası yok.',
      checkedAt: '2026-06-29T00:00:00.000Z',
      endpoint: '/api/v1/meeting-intelligence/workbench',
    };

    render(<MeetingApp loadWorkbench={async () => fallback} />);

    expect(await screen.findByText('API ulaşılamadı')).toBeInTheDocument();
    expect(screen.getByText(/canlı acceptance iddiası yok/i)).toBeInTheDocument();
  });
});
