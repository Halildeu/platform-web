import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { IntelligenceGovernanceLab } from './IntelligenceGovernanceLab';
import {
  BANNED_INTELLIGENCE_FIELDS,
  INTELLIGENCE_HARD_BANS,
  SYNTHETIC_APPROVAL_CHECKPOINTS,
  SYNTHETIC_INTELLIGENCE_CAPABILITIES,
} from './syntheticIntelligenceRegistry';

describe('IntelligenceGovernanceLab', () => {
  test('sentetik proposal-only siniri ve disabled aksiyonlari gosterir', () => {
    render(<IntelligenceGovernanceLab />);

    expect(screen.getByTestId('intelligence-synthetic-boundary')).toHaveTextContent(
      'SENTETİK / karar veya ranking yok',
    );
    expect(screen.getByTestId('p6-decision')).toHaveTextContent(
      `PROPOSAL ONLY · 0/${SYNTHETIC_INTELLIGENCE_CAPABILITIES.length} live`,
    );
    expect(screen.getByTestId('p6-experiment-button')).toBeDisabled();
    expect(screen.getByTestId('p6-apply-button')).toBeDisabled();
  });

  test('fixture full ATS, evidence veya insan onayi uydurmaz', () => {
    expect(
      SYNTHETIC_INTELLIGENCE_CAPABILITIES.every(
        (capability) =>
          !capability.fullAtsAccepted && !capability.evidenceVerified && !capability.humanApproved,
      ),
    ).toBe(true);
    for (const capability of SYNTHETIC_INTELLIGENCE_CAPABILITIES) {
      for (const bannedField of BANNED_INTELLIGENCE_FIELDS) {
        expect(capability).not.toHaveProperty(bannedField);
      }
    }
  });

  test('alti sert yasagi gorunur ve acik gerekceleriyle listeler', () => {
    render(<IntelligenceGovernanceLab />);
    const hardBans = screen.getByTestId('intelligence-hard-bans');

    expect(INTELLIGENCE_HARD_BANS).toHaveLength(6);
    expect(hardBans).toHaveTextContent('Affect / emotion / personality çıkarımı yok');
    expect(hardBans).toHaveTextContent('Otomatik red veya işe-alım kararı yok');
    expect(hardBans).toHaveTextContent('Deepfake/provenance sinyali tek başına');
    expect(hardBans).toHaveTextContent('İnsan onayı olmadan agentic mutation yok');
  });

  test('deepfake capability sinyali adverse action degil insan incelemesi olarak tanimlar', () => {
    render(<IntelligenceGovernanceLab />);
    const deepfake = screen.getByTestId('intelligence-capability-DEEPFAKE_PROVENANCE');

    fireEvent.click(deepfake);

    expect(deepfake).toHaveAttribute('aria-pressed', 'true');
    const detail = screen.getByTestId('intelligence-capability-detail');
    expect(within(detail).getByText('BLOKE')).toBeVisible();
    expect(detail).toHaveTextContent('insan inceleme kuyruğuna proposal');
    expect(detail).toHaveTextContent('Tek sinyalle red');
    expect(detail).toHaveTextContent('FULL ATS KABUL YOK');
    expect(detail).toHaveTextContent('KANIT DOĞRULANMADI');
    expect(detail).toHaveTextContent('İNSAN ONAYI YOK');
    const table = screen.getByTestId('intelligence-measurement-table');
    expect(table).toHaveTextContent('False-positive/negative rate');
    expect(table).toHaveTextContent('appeal yolu zorunlu');
  });

  test('agentic workflow mutation icin DISALLOWED ve proposal-only kalir', () => {
    render(<IntelligenceGovernanceLab />);
    fireEvent.click(screen.getByTestId('intelligence-capability-AGENTIC_WORKFLOW'));

    const detail = screen.getByTestId('intelligence-capability-detail');
    expect(within(detail).getByText('İZİN VERİLMEZ')).toBeVisible();
    expect(detail).toHaveTextContent('Taslak sonraki-adım');
    expect(detail).toHaveTextContent('workflow mutation');
    expect(screen.getByTestId('p6-apply-button')).toBeDisabled();
    const checkpoints = screen.getByTestId('p6-approval-checkpoints');
    expect(SYNTHETIC_APPROVAL_CHECKPOINTS).toHaveLength(4);
    expect(checkpoints).toHaveTextContent('Toplu onay yok');
    expect(checkpoints).toHaveTextContent('Önceki her checkpoint ayrı ayrı onaylanmadan');
  });

  test('fairness contract 4/5 oranini tek basina karar saymaz', () => {
    render(<IntelligenceGovernanceLab />);
    fireEvent.click(screen.getByTestId('intelligence-capability-FAIRNESS_EVIDENCE'));

    const detail = screen.getByTestId('intelligence-capability-detail');
    expect(detail).toHaveTextContent('4/5 oranını tek başına');
    expect(screen.getByTestId('intelligence-measurement-table')).toHaveTextContent(
      'Selection-rate ratio',
    );
  });
});
