import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { CitationBackedCoachingPanel } from './CitationBackedCoachingPanel';
import {
  BANNED_COACHING_FIXTURE_FIELDS,
  calculateCanonicalCoachingDigest,
  CANONICAL_COACHING_CONTRACT_REF,
  CANONICAL_COACHING_CONTRACT_SHA256,
  resolveSyntheticCoachingSource,
  SYNTHETIC_COACHING_SOURCE,
} from './syntheticCoachingProposal';
import type {
  CanonicalSyntheticCoachingReceipt,
  SyntheticCoachingSourceEnvelope,
} from './syntheticCoachingProposal';

async function waitForVerifiedPanel() {
  expect(await screen.findByText('PINNED PROFILE + DIGEST VERIFIED')).toBeInTheDocument();
  return screen.getByTestId('citation-backed-coaching-panel');
}

describe('CitationBackedCoachingPanel', () => {
  test('canonical kaynak, proposal-only siniri ve suggestion-level SUPPORTED closure gosterir', async () => {
    render(<CitationBackedCoachingPanel />);
    const panel = await waitForVerifiedPanel();

    expect(panel).toHaveTextContent('PROPOSAL ONLY');
    expect(panel).toHaveTextContent('AI_SUGGESTED');
    expect(panel).toHaveTextContent('ARŞİV SENTETİK');
    expect(within(panel).getAllByText('1 SUPPORTED citation')).toHaveLength(2);
    expect(panel).toHaveTextContent('Sistem tasarımında trade-off açıklığı');
    expect(panel).toHaveTextContent('Rollback ve incident öğrenimi');
    expect(screen.getByTestId('coaching-apply-button')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Düzeltme isteği oluştur' })).toBeDisabled();
    expect(screen.getByTestId('coaching-apply-button')).toHaveStyle({
      minWidth: 0,
      maxWidth: '100%',
      height: 'auto',
      minHeight: '2.25rem',
      paddingBlock: '0.5rem',
      whiteSpace: 'normal',
      overflowWrap: 'anywhere',
    });
  });

  test('citation dugmesi canonical evidence, criterion, segment ve provenance gosterir', async () => {
    render(<CitationBackedCoachingPanel />);
    await waitForVerifiedPanel();
    const citationButtons = screen.getAllByRole('button', { name: /Citation aç/ });
    expect(citationButtons).toHaveLength(2);

    fireEvent.click(citationButtons[1]!);

    const detail = screen.getByTestId('coaching-citation-detail');
    expect(detail).toHaveAttribute('role', 'region');
    expect(detail).toHaveAccessibleName('Seçilen coaching citation detayı');
    expect(detail).toHaveTextContent('SUPPORTED');
    expect(detail).toHaveTextContent('ölçülen kurtarma süresi belirtilmemiş');
    expect(detail).toHaveTextContent('evidence_bbbbbbbbbbbbbbbb');
    expect(detail).toHaveTextContent('citation_bbbbbbbbbbbbbbbb');
    expect(detail).toHaveTextContent('criterion_bbbbbbbbbbbbbbbb');
    expect(detail).toHaveFocus();
    expect(citationButtons[1]).toHaveAttribute('aria-pressed', 'true');
    expect(citationButtons[1]).toHaveAttribute('aria-controls', 'coaching-citation-detail');
  });

  test('quality signals canonical citationlara bagli ve kategorik kalir', async () => {
    render(<CitationBackedCoachingPanel />);
    await waitForVerifiedPanel();
    const signals = screen.getByTestId('coaching-quality-signals');

    expect(signals).toHaveTextContent('GÖZLENDİ');
    expect(signals).toHaveTextContent('KANIT YETERSİZ');
    expect(signals).toHaveTextContent('Oturum düzeyi · kişi profili veya sayısal puan değil');
    expect(signals).toHaveTextContent('citation_aaaaaaaaaaaaaaaa');
    expect(signals).toHaveTextContent('citation_cccccccccccccccc');
    expect(screen.getByTestId('coaching-quality-signal-grid')).toHaveStyle({
      gridTemplateColumns: 'repeat(auto-fit, minmax(min(200px, 100%), 1fr))',
      minWidth: 0,
    });
    expect(screen.getByTestId('coaching-action-block-reason')).toHaveTextContent(
      'insan review/rationale ve legal/audit/owner gate olmadan uygulanamaz',
    );
    expect(screen.getByTestId('coaching-apply-button')).toBeDisabled();
  });

  test('appeal correction audit digest AI output ve pinned contract lineage gorunur', async () => {
    render(<CitationBackedCoachingPanel />);
    await waitForVerifiedPanel();
    const lineage = screen.getByTestId('coaching-governance-lineage');

    expect(lineage).toHaveTextContent('appeal:coaching:synthetic:v1');
    expect(lineage).toHaveTextContent('correction-path:coaching:synthetic:v1');
    expect(lineage).toHaveTextContent('audit:coaching:synthetic:v1');
    expect(lineage).toHaveTextContent('ai-output:coaching:synthetic:v3');
    expect(lineage).toHaveTextContent(SYNTHETIC_COACHING_SOURCE.receipt.proposalDigest);
    expect(lineage).toHaveTextContent('2026-07-13T11:00:00Z');
    expect(lineage).toHaveTextContent('2026-07-14T11:00:00Z');
    expect(lineage).toHaveTextContent('EXPIRED — yalnız arşiv demo');
    expect(screen.getByText('ARCHIVAL WINDOW EXPIRED')).toBeInTheDocument();
    expect(lineage).toHaveTextContent(CANONICAL_COACHING_CONTRACT_REF);
    expect(lineage).toHaveTextContent(CANONICAL_COACHING_CONTRACT_SHA256);
    expect(lineage).toHaveTextContent(
      'canlı freshness veya production authenticity kanıtı değildir',
    );
  });

  test('fixture digest canonical receipt icerigini gercekten adresler', async () => {
    expect(await calculateCanonicalCoachingDigest(SYNTHETIC_COACHING_SOURCE.receipt)).toBe(
      SYNTHETIC_COACHING_SOURCE.receipt.proposalDigest,
    );
  });

  test('fixture PII scoring ranking affect deception biometric veya action receipt tasimaz', () => {
    const serialized = JSON.stringify(SYNTHETIC_COACHING_SOURCE);

    for (const field of BANNED_COACHING_FIXTURE_FIELDS) {
      expect(serialized).not.toContain(`"${field}"`);
    }
    expect(SYNTHETIC_COACHING_SOURCE.receipt.actionAllowed).toBe(false);
    expect(SYNTHETIC_COACHING_SOURCE.receipt.mutationAllowed).toBe(false);
    expect(SYNTHETIC_COACHING_SOURCE.receipt.productionEligible).toBe(false);
  });

  test('citation eksikliginde oneriyi gostermek yerine tum kaynagi fail-closed reddeder', async () => {
    const source = {
      ...SYNTHETIC_COACHING_SOURCE,
      receipt: {
        ...SYNTHETIC_COACHING_SOURCE.receipt,
        suggestions: [
          {
            ...SYNTHETIC_COACHING_SOURCE.receipt.suggestions[0]!,
            citationRefs: [],
          },
        ],
      },
    };
    render(<CitationBackedCoachingPanel source={source as never} />);

    expect(await screen.findByText('KAYNAK REDDEDİLDİ')).toBeInTheDocument();
    expect(screen.queryByTestId('coaching-suggestion-list')).not.toBeInTheDocument();
    expect(screen.getByTestId('coaching-source-rejected-state')).toHaveTextContent(
      'SUGGESTION_CITATIONS_INVALID',
    );
    expect(screen.getByTestId('coaching-apply-button')).toBeDisabled();
  });

  test('runtime actionAllowed true enjeksiyonu butonu acamaz ve onerileri gizler', async () => {
    const source = {
      ...SYNTHETIC_COACHING_SOURCE,
      receipt: {
        ...SYNTHETIC_COACHING_SOURCE.receipt,
        actionAllowed: true,
      },
    } as unknown;
    render(<CitationBackedCoachingPanel source={source as never} />);

    expect(await screen.findByText('KAYNAK REDDEDİLDİ')).toBeInTheDocument();
    expect(screen.getByTestId('coaching-source-rejected-state')).toHaveTextContent(
      'ACTION_DISALLOWED',
    );
    expect(screen.queryByTestId('coaching-suggestion-list')).not.toBeInTheDocument();
    expect(screen.getByTestId('coaching-apply-button')).toBeDisabled();
  });

  test('citation criterion mismatch canonical baglamdan kopuk oneriyi reddeder', async () => {
    const source = {
      ...SYNTHETIC_COACHING_SOURCE,
      receipt: {
        ...SYNTHETIC_COACHING_SOURCE.receipt,
        suggestions: [
          {
            ...SYNTHETIC_COACHING_SOURCE.receipt.suggestions[0]!,
            criterionRef: 'criterion_bbbbbbbbbbbbbbbb',
          },
        ],
      },
    };
    render(<CitationBackedCoachingPanel source={source as never} />);

    expect(await screen.findByText('KAYNAK REDDEDİLDİ')).toBeInTheDocument();
    expect(screen.getByTestId('coaching-source-rejected-state')).toHaveTextContent(
      'SUGGESTION_CRITERION_MISMATCH',
    );
    expect(screen.queryByTestId('coaching-suggestion-list')).not.toBeInTheDocument();
  });

  test('NOT_OBSERVED yalniz SUPPORTED absence observation ile UIa cikar', async () => {
    const receipt: CanonicalSyntheticCoachingReceipt = {
      ...SYNTHETIC_COACHING_SOURCE.receipt,
      qualitySignals: [
        SYNTHETIC_COACHING_SOURCE.receipt.qualitySignals[0]!,
        {
          ...SYNTHETIC_COACHING_SOURCE.receipt.qualitySignals[1]!,
          state: 'NOT_OBSERVED',
          citationRefs: ['citation_bbbbbbbbbbbbbbbb'],
        },
      ],
    };
    const proposalDigest = await calculateCanonicalCoachingDigest(receipt);
    expect(proposalDigest).not.toBeNull();
    const source: SyntheticCoachingSourceEnvelope = {
      ...SYNTHETIC_COACHING_SOURCE,
      receipt: { ...receipt, proposalDigest: proposalDigest! },
    };

    render(<CitationBackedCoachingPanel source={source} />);
    await waitForVerifiedPanel();

    expect(screen.getByTestId('coaching-quality-signals')).toHaveTextContent('GÖZLENMEDİ');
    expect(screen.getByTestId('coaching-quality-signals')).toHaveTextContent(
      'citation_bbbbbbbbbbbbbbbb',
    );
  });

  test('NOT_OBSERVED icin INSUFFICIENT citation semantigini fail-closed reddeder', () => {
    const source = {
      ...SYNTHETIC_COACHING_SOURCE,
      receipt: {
        ...SYNTHETIC_COACHING_SOURCE.receipt,
        qualitySignals: [
          SYNTHETIC_COACHING_SOURCE.receipt.qualitySignals[0]!,
          {
            ...SYNTHETIC_COACHING_SOURCE.receipt.qualitySignals[1]!,
            state: 'NOT_OBSERVED',
          },
        ],
      },
    };

    const resolution = resolveSyntheticCoachingSource(source);

    expect(resolution).toEqual({
      status: 'REJECTED',
      reasonCode: 'QUALITY_SIGNAL_ENTAILMENT_INVALID',
    });
  });

  test('hash-sekilli ama icerikle uyusmayan proposal digest kaynagi reddeder', async () => {
    const source = {
      ...SYNTHETIC_COACHING_SOURCE,
      receipt: {
        ...SYNTHETIC_COACHING_SOURCE.receipt,
        proposalDigest: `sha256:${'0'.repeat(64)}`,
      },
    };
    render(<CitationBackedCoachingPanel source={source as never} />);

    expect(await screen.findByText('KAYNAK REDDEDİLDİ')).toBeInTheDocument();
    expect(screen.getByTestId('coaching-source-rejected-state')).toHaveTextContent(
      'PROPOSAL_DIGEST_MISMATCH_OR_CRYPTO_UNAVAILABLE',
    );
    expect(screen.queryByTestId('coaching-suggestion-list')).not.toBeInTheDocument();
    expect(screen.getByTestId('coaching-apply-button')).toBeDisabled();
  });

  test('additionalProperties benzeri ekstra receipt alani fail-closed reddedilir', async () => {
    const source = {
      ...SYNTHETIC_COACHING_SOURCE,
      receipt: {
        ...SYNTHETIC_COACHING_SOURCE.receipt,
        actionReceipt: 'forged-receipt',
      },
    };
    render(<CitationBackedCoachingPanel source={source as never} />);

    expect(await screen.findByText('KAYNAK REDDEDİLDİ')).toBeInTheDocument();
    expect(screen.getByTestId('coaching-source-rejected-state')).toHaveTextContent(
      'FORBIDDEN_FIELD:actionReceipt',
    );
    expect(screen.getByTestId('coaching-apply-button')).toBeDisabled();
  });
});
