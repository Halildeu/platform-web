import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { SkillsOntologyRediscoveryPanel } from './SkillsOntologyRediscoveryPanel';
import {
  BANNED_SKILLS_SURFACE_FIELDS,
  SYNTHETIC_SKILLS_ONTOLOGY_SURFACE,
} from './syntheticSkillsOntology';

describe('SkillsOntologyRediscoveryPanel', () => {
  test('PRE-G0 proposal-only, unordered ve disabled aksiyon sinirini gosterir', () => {
    render(<SkillsOntologyRediscoveryPanel />);
    const panel = screen.getByTestId('skills-ontology-rediscovery-panel');

    expect(panel).toHaveTextContent('PROPOSAL ONLY');
    expect(panel).toHaveTextContent('AI_SUGGESTED');
    expect(panel).toHaveTextContent('UNORDERED · RANKING YOK');
    expect(screen.getByTestId('skills-apply-button')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Düzeltme isteği oluştur' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Sonucu dışa aktar' })).toBeDisabled();
    expect(screen.getByTestId('skills-action-block-reason')).toHaveTextContent(
      'legal, bağımsız-audit ve owner gate olmadan',
    );
  });

  test('immutable release, source, license ve supersedes lineageini birlikte gosterir', () => {
    render(<SkillsOntologyRediscoveryPanel />);
    const lineage = screen.getByTestId('skills-release-lineage');

    expect(lineage).toHaveTextContent('versioned-skills-ontology/v1');
    expect(lineage).toHaveTextContent('release_2222222222222222 · ontology:skills:v2');
    expect(lineage).toHaveTextContent(`sha256:${'2'.repeat(64)}`);
    expect(lineage).toHaveTextContent(`release_1111111111111111 · sha256:${'1'.repeat(64)}`);
    expect(lineage).toHaveTextContent('ESCO · esco:1.2.1 · source-uri:esco:api:v1');
    expect(lineage).toHaveTextContent('CC_BY_4_0 · license:cc-by-4.0');
    expect(lineage).toHaveTextContent('IMMUTABLE');
  });

  test('conceptleri yalniz labelRef, locale ve opaque conceptRef ile sunar', () => {
    render(<SkillsOntologyRediscoveryPanel />);
    const concepts = screen.getByTestId('skills-concept-list');

    expect(concepts).toHaveTextContent('Dağıtık sistemler');
    expect(concepts).toHaveTextContent('label:esco:distributed-systems · tr-TR');
    expect(concepts).toHaveTextContent('concept_aaaaaaaaaaaaaaaa');
    expect(screen.getByText('Serbest label yok')).toBeVisible();
    expect(SYNTHETIC_SKILLS_ONTOLOGY_SURFACE.release.concepts[0]).not.toHaveProperty('label');
  });

  test('citation secimi exact subject-concept-release lineage detayina fokus tasir', () => {
    render(<SkillsOntologyRediscoveryPanel />);
    const citationButton = screen.getByRole('button', {
      name: 'Citation aç · interview_response',
    });

    fireEvent.click(citationButton);

    const detail = screen.getByTestId('skills-citation-detail');
    expect(detail).toHaveAttribute('role', 'region');
    expect(detail).toHaveAccessibleName('Seçilen skill citation exact lineage detayı');
    expect(detail).toHaveFocus();
    expect(citationButton).toHaveAttribute('aria-pressed', 'true');
    expect(citationButton).toHaveAttribute('aria-controls', 'skills-citation-detail');
    expect(detail).toHaveTextContent('evidence_aaaaaaaaaaaaaaaa · citation_aaaaaaaaaaaaaaaa');
    expect(detail).toHaveTextContent('subject_1111111111111111 · concept_aaaaaaaaaaaaaaaa');
    expect(detail).toHaveTextContent(
      `release_2222222222222222 · ontology:skills:v2 · sha256:${'2'.repeat(64)}`,
    );
    expect(detail).toHaveTextContent('SUPPORTED');
  });

  test('concept degisince evidence detailini ayni concept scopeuna resetler', () => {
    render(<SkillsOntologyRediscoveryPanel />);
    fireEvent.click(screen.getByRole('button', { name: /Olay müdahalesi ve geri dönüş/ }));

    const detail = screen.getByTestId('skills-citation-detail');
    expect(detail).toHaveTextContent('evidence_bbbbbbbbbbbbbbbb');
    expect(detail).toHaveTextContent('concept_bbbbbbbbbbbbbbbb');
    expect(detail).not.toHaveTextContent('evidence_aaaaaaaaaaaaaaaa');
  });

  test('evidence olmayan concept icin explicit empty state ve kapali action gosterir', () => {
    render(<SkillsOntologyRediscoveryPanel />);
    fireEvent.click(screen.getByRole('button', { name: /Teknik iletişim/ }));

    expect(screen.getByTestId('skills-citation-empty-state')).toHaveTextContent(
      'EXACT CITATION YOK · AKSİYON KAPALI',
    );
    expect(screen.queryByTestId('skills-citation-detail')).not.toBeInTheDocument();
    expect(screen.getByTestId('skills-apply-button')).toBeDisabled();
  });

  test('consent purpose opt-out expiry ve real activation kapilarini gorunur tutar', () => {
    render(<SkillsOntologyRediscoveryPanel />);
    const consent = screen.getByTestId('skills-consent-purpose');

    expect(consent).toHaveTextContent('consent:rediscovery:synthetic:v1');
    expect(consent).toHaveTextContent('purpose:rediscovery:synthetic:v1');
    expect(consent).toHaveTextContent('2026-07-13T11:42:00Z · optedOut=false');
    expect(consent).toHaveTextContent('2026-07-14T11:30:00Z');
    expect(consent).toHaveTextContent('REAL SUBJECT KABUL YOK');
    expect(consent).toHaveTextContent('REAL ACTIVATION YOK');
    expect(consent).toHaveTextContent('FULL ATS KABUL YOK');
  });

  test('tombstoned historical tracei current sonuc listesinden ayirir', () => {
    render(<SkillsOntologyRediscoveryPanel />);
    const results = screen.getByTestId('skills-rediscovery-results');
    const audit = screen.getByTestId('skills-tombstone-audit');

    expect(results).toHaveTextContent('1 CURRENT · DISPLAY ORDER UNSPECIFIED');
    expect(results).toHaveTextContent('subject_1111111111111111');
    expect(results).not.toHaveTextContent('subject_2222222222222222');
    expect(audit).toHaveTextContent('1 INVALIDATED');
    expect(audit).toHaveTextContent('TRACE INVALIDATED BY TOMBSTONE');
    expect(audit).toHaveTextContent('proposal_5555555555555555');
  });

  test('cross-release veya source-proposal mismatch matchi fail-closed saklar', () => {
    const base = SYNTHETIC_SKILLS_ONTOLOGY_SURFACE;
    const invalidSurface = {
      ...base,
      rediscoveryProposal: {
        ...base.rediscoveryProposal,
        matches: [
          {
            ...base.rediscoveryProposal.matches[0]!,
            sourceProposalDigest: `sha256:${'9'.repeat(64)}`,
          },
        ],
      },
    };
    render(<SkillsOntologyRediscoveryPanel surface={invalidSurface} />);

    expect(screen.getByTestId('skills-binding-status')).toHaveTextContent(
      'REDISCOVERY TRACE FAIL-CLOSED',
    );
    expect(screen.getByTestId('skills-binding-status')).toHaveTextContent('1 TRACE REDDEDİLDİ');
    expect(screen.getByTestId('skills-rediscovery-empty-state')).toBeVisible();
    expect(screen.getByTestId('skills-apply-button')).toBeDisabled();
  });

  test('fixture kisi niteligi, protected field, score, confidence veya action receipt tasimaz', () => {
    const serialized = JSON.stringify(SYNTHETIC_SKILLS_ONTOLOGY_SURFACE);
    for (const field of BANNED_SKILLS_SURFACE_FIELDS) {
      expect(serialized).not.toContain(`"${field}"`);
    }
    expect(SYNTHETIC_SKILLS_ONTOLOGY_SURFACE.rediscoveryProposal.unordered).toBe(true);
    expect(SYNTHETIC_SKILLS_ONTOLOGY_SURFACE.rediscoveryProposal.displayOrder).toBe('UNSPECIFIED');
    expect(SYNTHETIC_SKILLS_ONTOLOGY_SURFACE.rediscoveryProposal.actionAllowed).toBe(false);
    expect(SYNTHETIC_SKILLS_ONTOLOGY_SURFACE.rediscoveryProposal.mutationAllowed).toBe(false);
  });

  test('responsive grid dar yuzey icin minmax ve kirilabilir ref kullanir', () => {
    render(<SkillsOntologyRediscoveryPanel />);
    const conceptGroup = screen.getByRole('group', { name: 'Skills ontology kavramları' });
    expect(conceptGroup).toHaveStyle({
      gridTemplateColumns: 'repeat(auto-fit, minmax(min(240px, 100%), 1fr))',
    });
    expect(within(conceptGroup).getAllByRole('button')).toHaveLength(3);
  });
});
