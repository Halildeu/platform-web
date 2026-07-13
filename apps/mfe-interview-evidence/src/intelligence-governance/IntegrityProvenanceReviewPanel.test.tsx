import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { IntegrityProvenanceReviewPanel } from './IntegrityProvenanceReviewPanel';
import {
  BANNED_INTEGRITY_SURFACE_FIELDS,
  SYNTHETIC_INTEGRITY_PROVENANCE_SURFACE,
} from './syntheticIntegrityProvenance';

describe('IntegrityProvenanceReviewPanel', () => {
  test('screening-only epistemic siniri ve kapali activation gate zincirini gosterir', () => {
    render(<IntegrityProvenanceReviewPanel />);
    const panel = screen.getByTestId('integrity-provenance-review-panel');

    expect(panel).toHaveTextContent('SCREENING ONLY');
    expect(panel).toHaveTextContent('Doğruluk veya içerik hükmü yok');
    expect(panel).toHaveTextContent('Kimlik, davranış, emotion veya deception çıkarımı yok');
    expect(panel).toHaveTextContent('LEGAL · OWNER NOT_MET');
    expect(panel).toHaveTextContent('PRODUCTION FALSE');
    expect(screen.getByTestId('integrity-surface-status')).toHaveTextContent(
      'ALL RECEIPT FIELD BINDINGS CONSISTENT',
    );
    expect(screen.getByTestId('integrity-surface-status')).toHaveTextContent(
      'REF / DIGEST REPLAY YOK',
    );
    expect(screen.getByTestId('integrity-apply-button')).toBeDisabled();
    expect(screen.getByTestId('integrity-apply-button')).toHaveAttribute(
      'aria-describedby',
      'integrity-action-block-reason',
    );
    expect(screen.getByRole('button', { name: 'Workflow’a aktar' })).toBeDisabled();
    expect(
      screen.queryByRole('button', { name: /reddet|fraud|deepfake doğrula/i }),
    ).not.toBeInTheDocument();
  });

  test('dort statusu birbirinden ayirir ve semantik boundary metnini tasir', () => {
    render(<IntegrityProvenanceReviewPanel />);
    const selector = screen.getByTestId('integrity-receipt-selector');

    expect(selector).toHaveTextContent('PROVENANCE BINDING DOĞRULANDI');
    expect(selector).toHaveTextContent('MANIFEST BULUNAMADI');
    expect(selector).toHaveTextContent('BINDING UYUŞMAZLIĞI · İNCELEME GEREKLİ');
    expect(selector).toHaveTextContent('SONUÇLANDIRILAMADI');
    expect(within(selector).getAllByRole('button')).toHaveLength(4);
  });

  test('NOT_PRESENT secimi yalniz manifest yoklugunu soyler ve yasakli hukum dili tasimaz', () => {
    render(<IntegrityProvenanceReviewPanel />);
    const notPresent = screen.getByRole('button', { name: /MANIFEST BULUNAMADI/ });
    fireEvent.click(notPresent);

    const lineage = screen.getByTestId('integrity-receipt-lineage');
    expect(lineage).toHaveTextContent('Yalnız manifest bulunamadığını gösterir');
    expect(lineage).toHaveTextContent('NOT_PRESENT · null · null');
    expect(lineage.textContent).not.toMatch(
      /fake|deepfake|manipulated|tampered|forged|fraudulent|sahte/i,
    );
    expect(screen.getByTestId('integrity-apply-button')).toBeDisabled();
  });

  test('VERIFIED_BINDING exact snapshot manifest claim ve policy lineageini gosterir', () => {
    render(<IntegrityProvenanceReviewPanel />);
    const lineage = screen.getByTestId('integrity-receipt-lineage');

    expect(lineage).toHaveTextContent('integrity-provenance-screening/v1');
    expect(lineage).toHaveTextContent('screening_1111111111111111');
    expect(lineage).toHaveTextContent('asset_1111111111111111 · snapshot_1111111111111111');
    expect(lineage).toHaveTextContent(`sha256:${'a'.repeat(64)}`);
    expect(lineage).toHaveTextContent(
      `PRESENT · sha256:${'b'.repeat(64)} · sha256:${'c'.repeat(64)}`,
    );
    expect(lineage).toHaveTextContent('CRYPTO VERIFY OUT_OF_SCOPE');
  });

  test('reason secimi exact evidence detayina fokus tasir', () => {
    render(<IntegrityProvenanceReviewPanel />);
    const evidenceButton = screen.getByRole('button', {
      name: 'Evidence aç · MANIFEST_BINDING_VERIFIED',
    });
    expect(screen.getByTestId('integrity-evidence-detail').style.outline).toBe('');
    fireEvent.click(evidenceButton);

    const detail = screen.getByTestId('integrity-evidence-detail');
    expect(detail).toHaveFocus();
    expect(detail).toHaveStyle({ outline: '2px solid var(--action-primary)' });
    expect(detail).toHaveAccessibleName('Seçilen integrity reason exact evidence detayı');
    expect(evidenceButton).toHaveAttribute('aria-pressed', 'true');
    expect(detail).toHaveTextContent('evidence_6666666666666660');
    expect(detail).toHaveTextContent('snapshot_1111111111111111');
    expect(detail).toHaveTextContent('verifier:c2pa:synthetic-v1');
    fireEvent.blur(detail);
    expect(detail.style.outline).toBe('');
  });

  test('receipt degisince evidence secimini ayni receipt scopeuna resetler', () => {
    render(<IntegrityProvenanceReviewPanel />);
    fireEvent.click(screen.getByRole('button', { name: /BINDING UYUŞMAZLIĞI/ }));

    const detail = screen.getByTestId('integrity-evidence-detail');
    expect(detail).toHaveTextContent('evidence_8888888888888880');
    expect(detail).toHaveTextContent('snapshot_3333333333333333');
    expect(detail).not.toHaveTextContent('snapshot_1111111111111111');
  });

  test('failed binding transcode contexti causal verdict veya actiona cevirmeden gosterir', () => {
    render(<IntegrityProvenanceReviewPanel />);
    fireEvent.click(screen.getByRole('button', { name: /BINDING UYUŞMAZLIĞI/ }));
    const evidence = screen.getByTestId('integrity-reason-evidence');

    expect(evidence).toHaveTextContent('3 REASON · ORPHAN YOK');
    expect(evidence).toHaveTextContent('Accessibility transcode context receipt');
    expect(evidence).toHaveTextContent('Digest mismatch with transcode context');
    const secondReason = screen.getByRole('button', {
      name: 'Evidence aç · ASSET_DIGEST_MISMATCH',
    });
    fireEvent.click(secondReason);
    expect(screen.getByTestId('integrity-evidence-detail')).toHaveFocus();
    expect(secondReason).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('integrity-human-review')).toHaveTextContent('VERDICT · NONE');
    expect(screen.getByTestId('integrity-apply-button')).toBeDisabled();
  });

  test('coverage receiptlerini digest-bound SYNTHETIC_ONLY ve bagimsiz kabul yok olarak gosterir', () => {
    render(<IntegrityProvenanceReviewPanel />);
    const coverage = screen.getByTestId('integrity-coverage');

    expect(coverage).toHaveTextContent('SYNTHETIC_ONLY · BAĞIMSIZ KABUL YOK');
    expect(coverage).toHaveTextContent('False-positive coverage');
    expect(coverage).toHaveTextContent('False-negative coverage');
    expect(coverage).toHaveTextContent('Device / codec coverage');
    expect(coverage).toHaveTextContent('Accessibility coverage');
    expect(coverage).toHaveTextContent('coverage_5555555555555555');
  });

  test('human review appeal correction audit ve retention yollarini gorunur tutar', () => {
    render(<IntegrityProvenanceReviewPanel />);
    const review = screen.getByTestId('integrity-human-review');
    const lineage = screen.getByTestId('integrity-receipt-lineage');

    expect(review).toHaveTextContent('HUMAN REVIEW REQUIRED');
    expect(review).toHaveTextContent('route_1111111111111111');
    expect(review).toHaveTextContent('route_2222222222222222');
    expect(review).toHaveTextContent('route_3333333333333333');
    expect(review).toHaveTextContent('audit_1111111111111111');
    expect(lineage).toHaveTextContent('CRYPTO_SHRED');
  });

  test('status reason veya evidence lineage mismatchini fail-closed saklar', () => {
    const base = SYNTHETIC_INTEGRITY_PROVENANCE_SURFACE;
    const first = base.receipts[0]!;
    const invalidSurface = {
      receipts: [
        {
          ...first,
          reasonEvidenceBindings: [
            {
              ...first.reasonEvidenceBindings[0]!,
              verifierVersionRef: 'verifier:c2pa:laundered-v9',
            },
          ],
        },
      ],
    };
    render(<IntegrityProvenanceReviewPanel surface={invalidSurface} />);

    expect(screen.getByTestId('integrity-surface-status')).toHaveTextContent(
      'RECEIPT LINEAGE FAIL-CLOSED',
    );
    expect(screen.getByTestId('integrity-fail-closed-state')).toBeVisible();
    expect(screen.queryByTestId('integrity-receipt-lineage')).not.toBeInTheDocument();
    expect(screen.getByTestId('integrity-apply-button')).toBeDisabled();
  });

  test('snapshot veya claimed attestation material mismatchini fail-closed saklar', () => {
    const first = SYNTHETIC_INTEGRITY_PROVENANCE_SURFACE.receipts[0]!;
    const invalidSurface = {
      receipts: [
        {
          ...first,
          scopeBindingAttestationDigest: `sha256:${'f'.repeat(64)}` as const,
        },
      ],
    };
    render(<IntegrityProvenanceReviewPanel surface={invalidSurface} />);

    expect(screen.getByTestId('integrity-surface-status')).toHaveTextContent(
      'RECEIPT LINEAGE FAIL-CLOSED',
    );
    expect(screen.getByTestId('integrity-fail-closed-state')).toBeVisible();
  });

  test('bos veya yanlis namespace semantic lineage reflerini fail-closed saklar', () => {
    const first = SYNTHETIC_INTEGRITY_PROVENANCE_SURFACE.receipts[0]!;
    const expectFailClosed = (receipt: typeof first) => {
      const rendered = render(<IntegrityProvenanceReviewPanel surface={{ receipts: [receipt] }} />);
      expect(screen.getByTestId('integrity-fail-closed-state')).toBeVisible();
      expect(screen.queryByTestId('integrity-receipt-lineage')).not.toBeInTheDocument();
      rendered.unmount();
    };
    const withBindingRef = (
      field: 'verifierVersionRef' | 'trustListVersionRef' | 'policyVersionRef',
      value: string,
    ) => ({
      ...first,
      [field]: value,
      reasonEvidenceBindings: first.reasonEvidenceBindings.map((binding) => ({
        ...binding,
        [field]: value,
      })),
    });

    expectFailClosed({ ...first, scopeBindingKeyVersionRef: 'email:john.doe' });
    expectFailClosed(withBindingRef('verifierVersionRef', 'email:john.doe'));
    expectFailClosed(withBindingRef('trustListVersionRef', ''));
    expectFailClosed(withBindingRef('policyVersionRef', 'candidate:john'));
    expectFailClosed({ ...first, timestampAuthorityRef: 'email:john.doe' });
    expectFailClosed({ ...first, retentionPolicyRef: '' });
    expectFailClosed({
      ...first,
      coverage: {
        ...first.coverage,
        uncertainty: {
          ...first.coverage.uncertainty,
          measurementPolicyVersionRef: 'email:john.doe',
        },
      },
    });
  });

  test('duplicate evidence digesti replay conflict olarak isaretler', () => {
    const base = SYNTHETIC_INTEGRITY_PROVENANCE_SURFACE;
    const first = base.receipts[0]!;
    const second = base.receipts[1]!;
    const replaySurface = {
      receipts: [
        first,
        {
          ...second,
          reasonEvidenceBindings: [
            {
              ...second.reasonEvidenceBindings[0]!,
              evidenceDigest: first.reasonEvidenceBindings[0]!.evidenceDigest,
            },
          ],
        },
      ],
    };
    render(<IntegrityProvenanceReviewPanel surface={replaySurface} />);
    expect(screen.getByTestId('integrity-surface-status')).toHaveTextContent('REPLAY CONFLICT');
    expect(screen.getByTestId('integrity-fail-closed-state')).toBeVisible();
    expect(screen.queryByTestId('integrity-receipt-lineage')).not.toBeInTheDocument();
    expect(screen.getByTestId('integrity-apply-button')).toBeDisabled();
  });

  test('canonical olmayan bilinmeyen statusu exception yerine fail-closed gosterir', () => {
    const first = SYNTHETIC_INTEGRITY_PROVENANCE_SURFACE.receipts[0]!;
    const unknownSurface = {
      receipts: [{ ...first, status: 'ALIEN_STATUS' }],
    };
    expect(() =>
      render(
        <IntegrityProvenanceReviewPanel
          surface={unknownSurface as unknown as typeof SYNTHETIC_INTEGRITY_PROVENANCE_SURFACE}
        />,
      ),
    ).not.toThrow();
    expect(screen.getByText('UNKNOWN STATUS · FAIL-CLOSED')).toBeVisible();
    expect(screen.getByTestId('integrity-fail-closed-state')).toBeVisible();
  });

  test('fixture banned karar biyometri veya raw-media alanlari tasimaz', () => {
    const serialized = JSON.stringify(SYNTHETIC_INTEGRITY_PROVENANCE_SURFACE);
    for (const field of BANNED_INTEGRITY_SURFACE_FIELDS) {
      expect(serialized).not.toContain(`"${field}"`);
    }
    expect(
      SYNTHETIC_INTEGRITY_PROVENANCE_SURFACE.receipts.every((receipt) => !receipt.actionAllowed),
    ).toBe(true);
    expect(
      SYNTHETIC_INTEGRITY_PROVENANCE_SURFACE.receipts.every(
        (receipt) => receipt.deepfakeConclusion === 'NONE' && receipt.verdict === 'NONE',
      ),
    ).toBe(true);
  });

  test('responsive grid 390px icin minmax ve kirilabilir digest kullanir', () => {
    render(<IntegrityProvenanceReviewPanel />);
    const selector = screen.getByRole('group', {
      name: 'Integrity screening receipt seçenekleri',
    });
    expect(selector).toHaveStyle({
      gridTemplateColumns: 'repeat(auto-fit, minmax(min(240px, 100%), 1fr))',
    });
    expect(within(selector).getAllByRole('button')).toHaveLength(4);
  });
});
