import React, { useState } from 'react';

type ProposalState = 'UNREVIEWED' | 'ACCEPTED' | 'EDITED' | 'REJECTED';

interface ResumeProposal {
  id: string;
  label: string;
  value: string;
  source: string;
  state: ProposalState;
}

const SYNTHETIC_PROPOSALS: readonly Omit<ResumeProposal, 'state'>[] = [
  {
    id: 'contact-email',
    label: 'E-posta',
    value: 'aday.ornek@example.invalid',
    source: 'Sentetik PDF · sayfa 1 · iletişim bölümü',
  },
  {
    id: 'experience',
    label: 'Deneyim',
    value: 'Sentetik Ürün Uzmanı · 3 yıl',
    source: 'Sentetik PDF · sayfa 1 · deneyim bölümü',
  },
  {
    id: 'education',
    label: 'Eğitim',
    value: 'Örnek Üniversite · Lisans',
    source: 'Sentetik PDF · sayfa 2 · eğitim bölümü',
  },
  {
    id: 'skills',
    label: 'Beceriler',
    value: 'Araştırma, erişilebilir ürün tasarımı',
    source: 'Sentetik PDF · sayfa 2 · beceriler bölümü',
  },
  {
    id: 'language',
    label: 'Dil',
    value: 'Türkçe, İngilizce',
    source: 'Sentetik PDF · sayfa 2 · dil bölümü',
  },
] as const;

const buildInitialProposals = (): ResumeProposal[] =>
  SYNTHETIC_PROPOSALS.map((proposal) => ({ ...proposal, state: 'UNREVIEWED' }));

const STATE_LABEL: Record<ProposalState, string> = {
  UNREVIEWED: 'İncelenmedi',
  ACCEPTED: 'Kabul edildi',
  EDITED: 'Düzenlendi',
  REJECTED: 'Reddedildi',
};

/**
 * Candidate-control demonstration for ats#163 without a real upload surface.
 * All values are bundled synthetic fixtures and never leave component state.
 */
const SyntheticResumeDraftDemo: React.FC = () => {
  const [opened, setOpened] = useState(false);
  const [processed, setProcessed] = useState(false);
  const [proposals, setProposals] = useState<ResumeProposal[]>(buildInitialProposals);
  const [draft, setDraft] = useState<ResumeProposal[]>([]);
  const [rejectAllArmed, setRejectAllArmed] = useState(false);
  const panelId = 'ats-synthetic-resume-draft-panel';

  const reset = () => {
    setProcessed(false);
    setProposals(buildInitialProposals());
    setDraft([]);
    setRejectAllArmed(false);
  };

  const closeAndReset = () => {
    setOpened(false);
    reset();
  };

  const updateProposal = (id: string, update: Partial<ResumeProposal>) => {
    setProposals((current) =>
      current.map((proposal) => (proposal.id === id ? { ...proposal, ...update } : proposal)),
    );
    setDraft([]);
    setRejectAllArmed(false);
  };

  const selectedProposals = proposals.filter(
    (proposal) => proposal.state === 'ACCEPTED' || proposal.state === 'EDITED',
  );

  const rejectAll = () => {
    if (!rejectAllArmed) {
      setRejectAllArmed(true);
      return;
    }
    setProposals((current) =>
      current.map((proposal) => ({ ...proposal, state: 'REJECTED' as const })),
    );
    setDraft([]);
    setRejectAllArmed(false);
  };

  return (
    <div className="mt-4" data-testid="ats-synthetic-resume-demo">
      <button
        type="button"
        className="inline-flex min-h-11 items-center rounded-lg border border-action-primary px-4 py-2 text-sm font-semibold text-action-primary underline-offset-4 hover:bg-action-primary/10 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
        aria-expanded={opened}
        aria-controls={panelId}
        onClick={() => (opened ? closeAndReset() : setOpened(true))}
      >
        {opened ? 'Sentetik taslak denemesini kapat' : 'Sentetik PDF taslak akışını dene'}
      </button>

      {opened ? (
        <section
          id={panelId}
          className="mt-3 space-y-4 rounded-xl border border-state-info-border bg-state-info-bg p-4"
          aria-labelledby="ats-synthetic-resume-heading"
        >
          <div className="space-y-2">
            <h4 id="ats-synthetic-resume-heading" className="font-semibold text-text-primary">
              PDF özgeçmişten düzenlenebilir taslak · sentetik deneme
            </h4>
            <p className="text-sm text-text-secondary">
              Paket içindeki tamamen sentetik `.invalid` örnek kullanılır. Dosya seçimi, gerçek
              PDF/PII, ağ isteği, kalıcı kayıt, otomatik başvuru veya istihdam kararı yoktur.
            </p>
            <p className="text-sm font-medium text-text-secondary">
              Manuel form yolu her zaman ayrı kalır; aday yalnız kabul ettiği veya düzenlediği
              alanları taslağa aktarır.
            </p>
          </div>

          {!processed ? (
            <button
              type="button"
              className="inline-flex min-h-11 items-center rounded-lg bg-action-primary px-4 py-2 text-sm font-semibold text-action-primary-text underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
              onClick={() => setProcessed(true)}
              data-testid="ats-synthetic-resume-process"
            >
              Sentetik PDF örneğini işle
            </button>
          ) : (
            <div className="space-y-4">
              <p
                className="text-sm font-medium text-text-secondary"
                role="status"
                aria-live="polite"
              >
                {proposals.length} izinli alan önerisi üretildi. Her alanı kabul edin, düzenleyin
                veya reddedin.
              </p>

              <div className="space-y-3" data-testid="ats-synthetic-resume-proposals">
                {proposals.map((proposal) => {
                  const terminal = proposal.state === 'ACCEPTED' || proposal.state === 'REJECTED';
                  const actionable = proposal.state === 'UNREVIEWED' || proposal.state === 'EDITED';
                  return (
                    <article
                      key={proposal.id}
                      className="rounded-lg border border-border-subtle bg-surface-default p-3"
                      data-testid={`ats-resume-field-${proposal.id}`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <label
                          htmlFor={`ats-resume-input-${proposal.id}`}
                          className="font-semibold text-text-primary"
                        >
                          {proposal.label}
                        </label>
                        <span className="text-xs font-semibold text-text-secondary" role="status">
                          {STATE_LABEL[proposal.state]}
                        </span>
                      </div>
                      <input
                        id={`ats-resume-input-${proposal.id}`}
                        className="mt-2 min-h-11 w-full rounded-lg border border-border-subtle bg-surface-default px-3 py-2 text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                        value={proposal.value}
                        readOnly={terminal}
                        aria-readonly={terminal}
                        onChange={(event) =>
                          updateProposal(proposal.id, {
                            value: event.target.value,
                            state: 'EDITED',
                          })
                        }
                      />
                      <p className="mt-2 text-xs text-text-secondary">Kaynak: {proposal.source}</p>
                      {actionable ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            className="min-h-11 rounded-lg border border-action-primary px-3 py-2 text-sm font-semibold text-action-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                            onClick={() => updateProposal(proposal.id, { state: 'ACCEPTED' })}
                          >
                            {proposal.state === 'EDITED'
                              ? `${proposal.label} düzenlemesini kabul et`
                              : `${proposal.label} alanını kabul et`}
                          </button>
                          <button
                            type="button"
                            className="min-h-11 rounded-lg border border-state-warning-border px-3 py-2 text-sm font-semibold text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                            onClick={() => updateProposal(proposal.id, { state: 'REJECTED' })}
                          >
                            {proposal.state === 'EDITED'
                              ? `${proposal.label} düzenlemesini reddet`
                              : `${proposal.label} alanını reddet`}
                          </button>
                        </div>
                      ) : null}
                    </article>
                  );
                })}
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="min-h-11 rounded-lg bg-action-primary px-4 py-2 text-sm font-semibold text-action-primary-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                  disabled={selectedProposals.length === 0}
                  onClick={() => setDraft(selectedProposals.map((proposal) => ({ ...proposal })))}
                  data-testid="ats-resume-transfer-selected"
                >
                  Seçtiğim alanları taslağa aktar ({selectedProposals.length})
                </button>
                <button
                  type="button"
                  className="min-h-11 rounded-lg border border-state-warning-border px-4 py-2 text-sm font-semibold text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                  onClick={rejectAll}
                >
                  {rejectAllArmed ? 'Tümünü reddetmeyi onayla' : 'Tümünü reddet'}
                </button>
                <button
                  type="button"
                  className="min-h-11 rounded-lg border border-border-subtle bg-surface-default px-4 py-2 text-sm font-semibold text-text-primary hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                  onClick={reset}
                >
                  Denemeyi sıfırla
                </button>
              </div>

              {rejectAllArmed ? (
                <p
                  className="rounded-lg border border-state-warning-border bg-state-warning-bg p-3 text-sm text-text-secondary"
                  role="alert"
                >
                  Tüm öneriler taslak dışında kalacak. Sentetik denemede bile ikinci onay olmadan
                  toplu red uygulanmaz.
                </p>
              ) : null}

              {draft.length > 0 ? (
                <section
                  className="rounded-lg border border-state-success-border bg-state-success-bg p-3"
                  aria-labelledby="ats-synthetic-draft-heading"
                  data-testid="ats-synthetic-resume-draft"
                >
                  <h4 id="ats-synthetic-draft-heading" className="font-semibold text-text-primary">
                    Yerel başvuru taslağı
                  </h4>
                  <dl className="mt-2 space-y-2 text-sm">
                    {draft.map((proposal) => (
                      <div key={proposal.id}>
                        <dt className="font-semibold text-text-primary">{proposal.label}</dt>
                        <dd className="text-text-secondary">{proposal.value}</dd>
                      </div>
                    ))}
                  </dl>
                  <p className="mt-3 text-sm font-medium text-text-secondary">
                    Taslak yalnız bu tarayıcı bileşeninin belleğindedir; başvuru gönderilmedi ve
                    kalıcı veri yazılmadı.
                  </p>
                </section>
              ) : null}
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
};

export default SyntheticResumeDraftDemo;
