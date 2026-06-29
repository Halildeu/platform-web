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

  it('keeps export/share/delete actions disabled until runtime policies are wired', async () => {
    render(<MeetingApp />);
    expect(await screen.findByText('Demo veri')).toBeInTheDocument();

    expect(screen.getByRole('button', { name: 'Paylaş' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Dışa aktar' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Sil' })).toBeDisabled();
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
