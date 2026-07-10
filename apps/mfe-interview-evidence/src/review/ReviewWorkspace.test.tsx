import { beforeEach, describe, expect, test } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ReviewWorkspace } from './ReviewWorkspace';
import { DEMO_SEGMENTS } from '../segment-view/demo-data';
import { resetDemoEngine } from './demoReviewEngine';

beforeEach(() => resetDemoEngine());

const type = (testId: string, value: string) => {
  const label = screen.getByTestId(testId);
  const input = label.querySelector('input') ?? label;
  fireEvent.change(input, { target: { value } });
};

describe('ReviewWorkspace (F4/F5 demo akışı)', () => {
  test('tam mutlu yol: iddia → SUPPORTED → vaka → NO_CHANGE → gerekçe → FINALIZE → F7 export', () => {
    render(<ReviewWorkspace transcriptKey="tr-demo-1" segments={DEMO_SEGMENTS} />);

    type('claim-input', 'aday teknik liderliğini yürüttü');
    fireEvent.click(screen.getByTestId('cite-button'));
    expect(screen.getByText('DESTEKLENİYOR')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('open-case-button'));
    expect(screen.getByTestId('case-state')).toHaveTextContent('HUMAN_REVIEWING');

    fireEvent.click(screen.getByTestId('no-change-button'));
    expect(screen.getByTestId('case-state')).toHaveTextContent('HUMAN_REVIEWED_NO_CHANGE');

    type('rationale-input', 'ref-gerekce-1');
    fireEvent.click(screen.getByTestId('rationale-button'));
    expect(screen.getByTestId('case-state')).toHaveTextContent('HUMAN_RATIONALE_RECORDED');

    type('decision-input', 'ref-karar-1');
    fireEvent.click(screen.getByTestId('finalize-button'));
    expect(screen.getByTestId('case-state')).toHaveTextContent('FINALIZED');

    type('jobrel-input', 'ref-is-ilgisi');
    fireEvent.click(screen.getByTestId('export-button'));
    expect(screen.getByTestId('export-result')).toBeInTheDocument();
    expect(screen.getByText('Kanıt-paketi hazır')).toBeInTheDocument();

    // FINALIZED→EXPORTED terminal: durum rozeti EXPORTED + export formu kaybolur
    expect(screen.getByTestId('case-state')).toHaveTextContent('EXPORTED');
    expect(screen.queryByTestId('export-button')).not.toBeInTheDocument();
  });

  test('resume edilen EXPORTED vakada export formu render edilmez (çift-export kapısı)', () => {
    render(<ReviewWorkspace transcriptKey="tr-demo-1" segments={DEMO_SEGMENTS} />);
    // tam yolu koş → EXPORTED terminaline getir
    type('claim-input', 'aday teknik liderliğini yürüttü');
    fireEvent.click(screen.getByTestId('cite-button'));
    fireEvent.click(screen.getByTestId('open-case-button'));
    fireEvent.click(screen.getByTestId('no-change-button'));
    type('rationale-input', 'ref-g');
    fireEvent.click(screen.getByTestId('rationale-button'));
    type('decision-input', 'ref-k');
    fireEvent.click(screen.getByTestId('finalize-button'));
    type('jobrel-input', 'ref-j');
    fireEvent.click(screen.getByTestId('export-button'));

    // vakayı listeden resume et → EXPORTED durumda export yüzeyi YOK
    fireEvent.click(screen.getByTestId('case-list-button'));
    fireEvent.click(screen.getByTestId('case-row'));
    expect(screen.getByTestId('case-state')).toHaveTextContent('EXPORTED');
    expect(screen.queryByTestId('export-button')).not.toBeInTheDocument();
    expect(screen.queryByTestId('criterion-input')).not.toBeInTheDocument();
  });

  test('kanıt-kapısı: NOT_SUPPORTED sonuçta vaka-aç düğmesi YOK + uyarı görünür', () => {
    render(<ReviewWorkspace transcriptKey="tr-demo-1" segments={DEMO_SEGMENTS} />);
    type('claim-input', 'kuantum fiziği doktorası tamamlandı');
    fireEvent.click(screen.getByTestId('cite-button'));
    expect(screen.getByText('DESTEKLENMİYOR')).toBeInTheDocument();
    expect(screen.getByTestId('not-decision-evidence')).toBeInTheDocument();
    expect(screen.queryByTestId('open-case-button')).not.toBeInTheDocument();
  });

  test('REJECT yolu UI üzerinden yürür (3. insan-yolu) + vaka listesi devam', () => {
    render(<ReviewWorkspace transcriptKey="tr-demo-1" segments={DEMO_SEGMENTS} />);
    type('claim-input', 'aday mimari kararlardan sorumluydu');
    fireEvent.click(screen.getByTestId('cite-button'));
    fireEvent.click(screen.getByTestId('open-case-button'));

    type('reject-input', 'ref-ret-gerekce');
    fireEvent.click(screen.getByTestId('reject-button'));
    expect(screen.getByTestId('case-state')).toHaveTextContent('AI_SUGGESTION_REJECTED');

    // vaka listesi: pointer-only devam yüzeyi
    fireEvent.click(screen.getByTestId('case-list-button'));
    expect(screen.getByTestId('case-list')).toBeInTheDocument();
    expect(screen.getByTestId('case-row')).toHaveTextContent('AI_SUGGESTION_REJECTED');
  });
});
