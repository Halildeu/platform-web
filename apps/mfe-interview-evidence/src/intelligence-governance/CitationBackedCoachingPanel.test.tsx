import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { CitationBackedCoachingPanel } from './CitationBackedCoachingPanel';
import {
  BANNED_COACHING_FIXTURE_FIELDS,
  SYNTHETIC_COACHING_PROPOSAL,
} from './syntheticCoachingProposal';

describe('CitationBackedCoachingPanel', () => {
  test('proposal-only siniri ve suggestion-level SUPPORTED citation closure gosterir', () => {
    render(<CitationBackedCoachingPanel />);
    const panel = screen.getByTestId('citation-backed-coaching-panel');

    expect(panel).toHaveTextContent('PROPOSAL ONLY');
    expect(panel).toHaveTextContent('AI_SUGGESTED');
    expect(within(panel).getAllByText('1 SUPPORTED citation')).toHaveLength(2);
    expect(panel).toHaveTextContent('Sistem tasarımında trade-off açıklığı');
    expect(panel).toHaveTextContent('Rollback ve incident öğrenimi');
    expect(screen.getByTestId('coaching-apply-button')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Düzeltme isteği oluştur' })).toBeDisabled();
  });

  test('citation dugmesi kaynak detayi, entailment ve provenance gosterir', () => {
    render(<CitationBackedCoachingPanel />);
    const citationButtons = screen.getAllByRole('button', { name: /Citation aç/ });
    expect(citationButtons).toHaveLength(2);

    fireEvent.click(citationButtons[1]!);

    const detail = screen.getByTestId('coaching-citation-detail');
    expect(detail).toHaveAttribute('role', 'region');
    expect(detail).toHaveAccessibleName('Seçilen coaching citation detayı');
    expect(detail).toHaveTextContent('SUPPORTED');
    expect(detail).toHaveTextContent('ölçülen kurtarma süresi belirtilmemiş');
    expect(detail).toHaveTextContent('citation_bbbbbbbbbbbbbbbb');
    expect(detail).toHaveFocus();
    expect(citationButtons[1]).toHaveAttribute('aria-pressed', 'true');
    expect(citationButtons[1]).toHaveAttribute('aria-controls', 'coaching-citation-detail');
  });

  test('quality signals kategorik kalir ve yetersiz kaniti actiona cevirmeden gosterir', () => {
    render(<CitationBackedCoachingPanel />);
    const signals = screen.getByTestId('coaching-quality-signals');

    expect(signals).toHaveTextContent('GÖZLENDİ');
    expect(signals).toHaveTextContent('KANIT YETERSİZ');
    expect(signals).toHaveTextContent('Oturum düzeyi · kişi profili veya sayısal puan değil');
    expect(screen.getByTestId('coaching-action-block-reason')).toHaveTextContent(
      'insan review/rationale ve legal/audit/owner gate olmadan uygulanamaz',
    );
    expect(screen.getByTestId('coaching-apply-button')).toBeDisabled();
    expect(screen.getByTestId('coaching-apply-button')).toHaveAttribute(
      'aria-describedby',
      'coaching-action-block-reason',
    );
  });

  test('appeal correction audit digest ve AI output lineage gorunur', () => {
    render(<CitationBackedCoachingPanel />);
    const lineage = screen.getByTestId('coaching-governance-lineage');

    expect(lineage).toHaveTextContent('appeal:coaching:synthetic:v1');
    expect(lineage).toHaveTextContent('correction-path:coaching:synthetic:v1');
    expect(lineage).toHaveTextContent('audit:coaching:synthetic:v1');
    expect(lineage).toHaveTextContent('ai-output:coaching:synthetic:v3');
    expect(lineage).toHaveTextContent(`sha256:${'7'.repeat(64)}`);
  });

  test('fixture PII scoring ranking affect deception biometric veya action receipt tasimaz', () => {
    const fixture = SYNTHETIC_COACHING_PROPOSAL as unknown as Record<string, unknown>;
    const serialized = JSON.stringify(fixture);

    for (const field of BANNED_COACHING_FIXTURE_FIELDS) {
      expect(serialized).not.toContain(`"${field}"`);
    }
    expect(fixture.actionAllowed).toBe(false);
    expect(fixture.mutationAllowed).toBe(false);
    expect(fixture.productionEligible).toBe(false);
  });

  test('citation eksikliginde acik empty state ve kapali action gosterir', () => {
    const proposal = {
      ...SYNTHETIC_COACHING_PROPOSAL,
      suggestions: [
        {
          ...SYNTHETIC_COACHING_PROPOSAL.suggestions[0]!,
          citations: [],
        },
      ],
    };
    render(<CitationBackedCoachingPanel proposal={proposal} />);

    const card = screen.getByTestId('coaching-suggestion-list');
    expect(card).toHaveTextContent('KANIT YOK · AKSİYON KAPALI');
    expect(screen.getByTestId('coaching-citation-empty-state')).toHaveTextContent(
      'citation closure yoksa uygulama ve mutation kapalı',
    );
    expect(within(card).queryByRole('button', { name: /Citation aç/ })).not.toBeInTheDocument();
    expect(screen.getByTestId('coaching-apply-button')).toBeDisabled();
  });

  test('proposal degistiginde stale citation secimini yeni ilk citationa resetler', () => {
    const { rerender } = render(<CitationBackedCoachingPanel />);
    const nextCitation = {
      ...SYNTHETIC_COACHING_PROPOSAL.suggestions[0]!.citations[0]!,
      citationRef: 'citation_dddddddddddddddd',
      sourceSegmentRef: 'segment_dddddddddddddddd',
      sourceExcerpt: 'Sentetik segment: Yeni proposal citation içeriği.',
    };
    const nextProposal = {
      ...SYNTHETIC_COACHING_PROPOSAL,
      proposalDigest: `sha256:${'8'.repeat(64)}`,
      suggestions: [
        {
          ...SYNTHETIC_COACHING_PROPOSAL.suggestions[0]!,
          citations: [nextCitation],
        },
      ],
    };

    rerender(<CitationBackedCoachingPanel proposal={nextProposal} />);

    expect(screen.getByTestId('coaching-citation-detail')).toHaveTextContent(
      'Yeni proposal citation içeriği',
    );
  });
});
