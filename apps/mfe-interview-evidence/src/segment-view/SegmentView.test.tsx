import { describe, expect, test } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SegmentView } from './SegmentView';
import { DEMO_SEGMENTS } from './demo-data';

describe('SegmentView', () => {
  test('segment listesini takma-ad + zaman-damgasi + metinle render eder', () => {
    render(<SegmentView segments={DEMO_SEGMENTS} />);

    // Liste + 4 demo segmenti
    expect(screen.getByTestId('segment-list')).toBeInTheDocument();
    expect(screen.getByTestId('segment-0')).toBeInTheDocument();
    expect(screen.getByTestId('segment-3')).toBeInTheDocument();

    // Konusmaci takma-adlari (ATS-0013: kimlik uretilmez; S1/S2 diarization etiketi)
    expect(screen.getAllByText('S1').length).toBeGreaterThan(0);
    expect(screen.getAllByText('S2').length).toBeGreaterThan(0);

    // Zaman-damgasi (mm:ss–mm:ss); ilk segment 00:00–00:04
    expect(screen.getByText(/00:00.*00:04/)).toBeInTheDocument();

    // Segment metni
    expect(
      screen.getByText('Merhaba, bugünkü görüşmeye katıldığınız için teşekkürler.'),
    ).toBeInTheDocument();
  });

  test('bos transkriptte segment listesi yerine bos-durum mesaji gosterir', () => {
    render(<SegmentView segments={[]} />);
    expect(screen.queryByTestId('segment-list')).not.toBeInTheDocument();
    expect(screen.getByText('Bu transkriptte segment yok.')).toBeInTheDocument();
  });
});
