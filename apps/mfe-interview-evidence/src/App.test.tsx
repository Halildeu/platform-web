import { describe, expect, test } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from './App';

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
});
