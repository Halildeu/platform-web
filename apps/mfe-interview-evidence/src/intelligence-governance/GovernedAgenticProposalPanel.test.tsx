import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { GovernedAgenticProposalPanel } from './GovernedAgenticProposalPanel';
import {
  SYNTHETIC_GOVERNED_AGENTIC_PROPOSALS,
  evaluateGovernedAgenticSurface,
  validateGovernedAgenticProposal,
} from './syntheticGovernedAgenticProposals';
import type { SyntheticGovernedAgenticProposal } from './syntheticGovernedAgenticProposals';

describe('GovernedAgenticProposalPanel', () => {
  test('PRE-G0 insan approval ceiling ve kapali gate sinirini gosterir', () => {
    render(<GovernedAgenticProposalPanel />);

    const panel = screen.getByTestId('governed-agentic-proposal-panel');
    expect(panel).toHaveTextContent('HUMAN APPROVAL CEILING');
    expect(panel).toHaveTextContent('PRE-G0 · SENTETİK');
    expect(panel).toHaveTextContent('UMBRELLA CAPABILITY KAPALI');
    expect(screen.getByTestId('agentic-closed-gates')).toHaveTextContent('LEGAL · NOT_MET');
    expect(screen.getByTestId('agentic-closed-gates')).toHaveTextContent('PRODUCTION · FALSE');
    expect(screen.getByTestId('agentic-approve-button')).toBeDisabled();
  });

  test('approval, execution ve rollback anlamlarini ayri urun gercekleri olarak sunar', () => {
    render(<GovernedAgenticProposalPanel />);

    const boundary = screen.getByTestId('agentic-authority-boundary');
    expect(boundary).toHaveTextContent('FINALIZED veya bearer credential değildir');
    expect(boundary).toHaveTextContent(
      'Ayrı yetkilendirilmiş dış eylemin observation receipt’idir',
    );
    expect(boundary).toHaveTextContent('proposal’ı yeniden aktive etmez');
  });

  test('proposal secimini aria-pressed ile degistirir ve detaya fokus tasir', () => {
    render(<GovernedAgenticProposalPanel />);
    const targetLabel = screen.getByText('Aday iletişim taslağı');
    const targetButton = targetLabel.closest('button');
    expect(targetButton).not.toBeNull();

    fireEvent.click(targetButton as HTMLButtonElement);

    expect(targetButton).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('agentic-proposal-detail')).toHaveFocus();
    expect(screen.getByTestId('agentic-immutable-envelope')).toHaveTextContent(
      'CANDIDATE_COMMUNICATION_DRAFT',
    );
  });

  test('exact approval payloadini gosterir ama execution authority uretmez', () => {
    render(<GovernedAgenticProposalPanel />);
    fireEvent.click(
      screen.getByText('Aday iletişim taslağı').closest('button') as HTMLButtonElement,
    );

    const approval = screen.getByTestId('agentic-approval-receipt');
    expect(approval).toHaveTextContent('APPROVED_FOR_ACTION · ÇALIŞTIRILMADI');
    expect(approval).toHaveTextContent('EXECUTION AUTHORITY · NONE');
    expect(approval).toHaveTextContent('BEARER CREDENTIAL · FALSE');
    expect(approval).toHaveTextContent('CURRENT STATE CHECK REQUIRED');
    expect(approval).toHaveTextContent('SYNTHETIC_PREVIEW_ONLY');
    expect(approval).toHaveTextContent(`sha256:${'4'.repeat(64)}`);
    expect(screen.getByTestId('agentic-external-observations')).toHaveTextContent(
      'Approval olsa bile execution otomatik varsayılmaz',
    );
  });

  test('dista gerceklesmis execution ve rollbacki yalniz observation olarak gosterir', () => {
    render(<GovernedAgenticProposalPanel />);
    fireEvent.click(
      screen.getByText('Dış icra ve rollback gözlem örneği').closest('button') as HTMLButtonElement,
    );

    const observations = screen.getByTestId('agentic-external-observations');
    expect(observations).toHaveTextContent('EXTERNAL_EXECUTION_RECORDED');
    expect(observations).toHaveTextContent('EXTERNAL_ROLLBACK_ATTESTED');
    expect(observations).toHaveTextContent('CONTRACT EXECUTION · FALSE');
    expect(observations).toHaveTextContent('CONTRACT ROLLBACK · FALSE');
    expect(observations).toHaveTextContent('PROPOSAL REACTIVATED · FALSE');
    expect(screen.getByTestId('agentic-audit-timeline')).toHaveTextContent(
      'Dış rollback kanıtı gözlem olarak kaydedildi',
    );
  });

  test('execute send apply mutate ve toplu onay kontrollerini DOMa koymaz', () => {
    render(<GovernedAgenticProposalPanel />);

    for (const forbiddenName of [
      /^çalıştır$/i,
      /^gönder$/i,
      /^uygula$/i,
      /^mutation/i,
      /^workflow.*değiştir/i,
      /^toplu onay/i,
    ]) {
      expect(screen.queryByRole('button', { name: forbiddenName })).not.toBeInTheDocument();
    }
    expect(
      screen.getByRole('button', { name: 'Aksiyon için onayla · çalıştırmaz' }),
    ).toBeDisabled();
  });

  test('reviewer scope veya tier uyusmazliginda fail-closed olur', () => {
    const source = SYNTHETIC_GOVERNED_AGENTIC_PROPOSALS[1];
    expect(source?.reviewerAuthorization).not.toBeNull();
    const badScope = {
      ...source,
      reviewerAuthorization: {
        ...source?.reviewerAuthorization,
        allowedScopeRefs: ['scope_cccccccccccccccc'],
      },
    } as SyntheticGovernedAgenticProposal;
    expect(validateGovernedAgenticProposal(badScope)).toBe(false);

    render(<GovernedAgenticProposalPanel proposals={[badScope]} />);
    expect(screen.getByTestId('agentic-fail-closed-state')).toHaveTextContent(
      'PROPOSAL FAIL-CLOSED',
    );
    expect(screen.queryByTestId('agentic-proposal-detail')).not.toBeInTheDocument();
  });

  test('approval payload digest mismatchini fail-closed tutar', () => {
    const source = SYNTHETIC_GOVERNED_AGENTIC_PROPOSALS[2];
    expect(source?.approval).not.toBeNull();
    const mismatch = {
      ...source,
      approval: { ...source?.approval, approvedPayloadDigest: `sha256:${'0'.repeat(64)}` },
    } as SyntheticGovernedAgenticProposal;

    expect(validateGovernedAgenticProposal(mismatch)).toBe(false);
    render(<GovernedAgenticProposalPanel proposals={[mismatch]} />);
    expect(screen.getByTestId('agentic-fail-closed-state')).toBeVisible();
  });

  test('independent execution authorization zorunlulugu kaldirilirsa fail-closed olur', () => {
    const source = SYNTHETIC_GOVERNED_AGENTIC_PROPOSALS[2];
    const missingExecutionCeiling = {
      ...source,
      approval: { ...source?.approval, requiresIndependentExecutionAuthorization: false },
    } as unknown as SyntheticGovernedAgenticProposal;

    expect(validateGovernedAgenticProposal(missingExecutionCeiling)).toBe(false);
  });

  test('audit fromState onceki toState ile surekli degilse fail-closed olur', () => {
    const source = SYNTHETIC_GOVERNED_AGENTIC_PROPOSALS[2];
    const history = source?.history.map((event, index) =>
      index === 1 ? { ...event, fromState: 'REJECTED' as const } : event,
    );
    const discontinuous = { ...source, history } as SyntheticGovernedAgenticProposal;

    expect(validateGovernedAgenticProposal(discontinuous)).toBe(false);
  });

  test('proposal veya event replay conflictinde tum detay yuzeyini kapatir', () => {
    const first = SYNTHETIC_GOVERNED_AGENTIC_PROPOSALS[0];
    const second = SYNTHETIC_GOVERNED_AGENTIC_PROPOSALS[1];
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    const replay = {
      ...second,
      proposalId: first?.proposalId,
    } as SyntheticGovernedAgenticProposal;
    const surface = evaluateGovernedAgenticSurface([first!, replay]);
    expect(surface.replaySafe).toBe(false);

    render(<GovernedAgenticProposalPanel proposals={[first!, replay]} />);
    expect(screen.getByTestId('agentic-surface-status')).toHaveTextContent('REPLAY CONFLICT');
    expect(screen.getByTestId('agentic-fail-closed-state')).toBeVisible();
  });

  test('sentetik fixture raw veri, karar veya production yetkisi uydurmaz', () => {
    expect(evaluateGovernedAgenticSurface(SYNTHETIC_GOVERNED_AGENTIC_PROPOSALS)).toEqual({
      allBound: true,
      replaySafe: true,
    });
    for (const proposal of SYNTHETIC_GOVERNED_AGENTIC_PROPOSALS) {
      expect(proposal.containsRawPii).toBe(false);
      expect(proposal.containsRawContent).toBe(false);
      expect(proposal.containsProtectedAttributes).toBe(false);
      expect(proposal.automatedEmploymentDecision).toBe(false);
      expect(proposal.candidateRanking).toBe('DISALLOWED');
      expect(proposal.candidateRejection).toBe('DISALLOWED');
      expect(proposal.productionEligible).toBe(false);
      expect(proposal.legalGate).toBe('NOT_MET');
      expect(proposal.ownerGate).toBe('NOT_MET');
    }
  });

  test('review acilmadan authorization veya approval varmis gibi gostermez', () => {
    render(<GovernedAgenticProposalPanel />);
    const reviewer = screen.getByTestId('agentic-reviewer-authorization');
    expect(reviewer).toHaveTextContent('REVIEW HENÜZ AÇILMADI');
    expect(screen.getByTestId('agentic-approval-receipt')).toHaveTextContent('APPROVAL YOK');
    expect(
      within(screen.getByTestId('agentic-approval-receipt')).queryByText('APPROVED_FOR_ACTION'),
    ).not.toBeInTheDocument();
  });

  test('bos proposal listesinde ayrinti uydurmaz ve fail-closed gosterir', () => {
    render(<GovernedAgenticProposalPanel proposals={[]} />);

    expect(screen.getByTestId('agentic-surface-status')).toHaveTextContent(
      'RECEIPT BINDING FAIL-CLOSED',
    );
    expect(screen.getByTestId('agentic-fail-closed-state')).toBeVisible();
    expect(screen.queryByTestId('agentic-proposal-detail')).not.toBeInTheDocument();
  });
});
