import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import MeetingApp from './App';

describe('MeetingApp', () => {
  it('renders the meeting workbench with stats, controls, and transcript readiness surface', () => {
    render(<MeetingApp />);

    expect(screen.getByRole('heading', { name: 'Meeting Intelligence' })).toBeInTheDocument();
    expect(screen.getByLabelText('Meeting Intelligence metrikleri')).toHaveTextContent('Aktif');
    expect(screen.getByLabelText('Toplantılar')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Transkript' })).toBeInTheDocument();
    expect(screen.getByText('Recorder kanıtı')).toBeInTheDocument();
    expect(
      screen.getByText('Web ürün yüzeyi acceptance hattından bağımsız paralel ilerleyecek.'),
    ).toBeInTheDocument();
  });

  it('filters blocked meetings and keeps empty transcript state honest', () => {
    render(<MeetingApp />);

    fireEvent.click(screen.getByRole('button', { name: 'Blokeli' }));

    const meetingList = screen.getByLabelText('Toplantılar');
    expect(within(meetingList).getByText('Direct-STT mTLS unblock')).toBeInTheDocument();
    expect(within(meetingList).queryByText('Faz 24 haftalık ürün durumu')).not.toBeInTheDocument();
    expect(screen.getByText('Direct-STT bekliyor')).toBeInTheDocument();
    expect(screen.getByText('Transkript akışı bekleniyor')).toBeInTheDocument();
    expect(screen.getByText('mTLS Secret: Blokeli')).toBeInTheDocument();
  });

  it('searches meetings and selects the demo readout detail', () => {
    render(<MeetingApp />);

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

  it('keeps export/share/delete actions disabled until runtime policies are wired', () => {
    render(<MeetingApp />);

    expect(screen.getByRole('button', { name: 'Paylaş' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Dışa aktar' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Sil' })).toBeDisabled();
  });
});
