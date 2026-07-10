import { beforeEach, describe, expect, test } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import App from './App';
import { resetDemoDsar } from './dsar/demoDsarEngine';

beforeEach(() => resetDemoDsar());

const typeInto = (testId: string, value: string) => {
  const el = screen.getByTestId(testId);
  const input = el.querySelector('input') ?? el;
  fireEvent.change(input, { target: { value } });
};

describe('InterviewEvidenceApp', () => {
  test('baslik + demo-veri siniri rozeti + F3 segment listesini render eder', () => {
    render(<App />);

    // Urun basligi
    expect(screen.getByText('Mülakat Kanıt Platformu')).toBeInTheDocument();

    // ATS-0016 durust sinir: demo-veri rozeti gorunur
    expect(screen.getByText(/Demo veri/)).toBeInTheDocument();

    // design-system'den turetilmis Segment View mount oldu (demo segmentler)
    expect(screen.getByTestId('segment-list')).toBeInTheDocument();
    expect(screen.getByTestId('segment-0')).toBeInTheDocument();
  });

  test('F10 silme: iki-adimli onay sonrasi ICERIK YUZEYLERI kaldirilir + makbuz karti gelir', () => {
    render(<App />);
    // once icerik yuzeyleri var
    expect(screen.getByTestId('segment-list')).toBeInTheDocument();
    expect(screen.getByTestId('review-workspace')).toBeInTheDocument();

    // DSAR intake + iki-adimli silme
    typeInto('dsar-subject-input', 'sub-opak-9');
    typeInto('dsar-reason-input', 'r-kvkk-m11');
    fireEvent.click(screen.getByTestId('dsar-receive-button'));
    fireEvent.click(screen.getByTestId('dsar-erase-button')); // 1. tik: uyari
    fireEvent.click(screen.getByTestId('dsar-erase-button')); // 2. tik: yurut

    // icerik yuzeyleri KALKTI (kanonik davranis) — makbuz karti geldi
    expect(screen.queryByTestId('segment-list')).not.toBeInTheDocument();
    expect(screen.queryByTestId('review-workspace')).not.toBeInTheDocument();
    expect(screen.queryByTestId('dsar-panel')).not.toBeInTheDocument();
    expect(screen.getByTestId('erasure-receipt')).toBeInTheDocument();
    expect(screen.getByText(/WORM defteri silinmez/)).toBeInTheDocument();

    // riza paneli (icerik-disi operasyon yuzeyi) KALIR
    expect(screen.getByTestId('consent-recording-panel')).toBeInTheDocument();
  });
});
