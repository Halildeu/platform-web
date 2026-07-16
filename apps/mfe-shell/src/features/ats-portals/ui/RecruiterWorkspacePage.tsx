import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ATS_PORTAL_SAFETY_BOUNDARIES,
  RECRUITER_CANDIDATES,
  RECRUITER_DISABLED_ACTIONS,
  RECRUITER_PIPELINE_STAGES,
  RECRUITER_POSITIONS,
  type RecruiterCandidate,
} from '../model/ats-portal-registry';
import {
  ATS_PRODUCT_HUB_ENTRY,
  INTERVIEW_EVIDENCE_ENTRY,
} from '../../ats-product-catalog/model/ats-capability-registry';

const RecruiterWorkspacePage = () => {
  const [activePositionId, setActivePositionId] = useState(RECRUITER_POSITIONS[0].id);
  const [query, setQuery] = useState('');
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [draftNote, setDraftNote] = useState('');
  const [previewNote, setPreviewNote] = useState('');
  const reviewHeadingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (!selectedCandidateId) return;
    reviewHeadingRef.current?.focus();
  }, [selectedCandidateId]);

  const activePosition =
    RECRUITER_POSITIONS.find((position) => position.id === activePositionId) ??
    RECRUITER_POSITIONS[0];

  const visibleCandidates = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('tr-TR');
    return RECRUITER_CANDIDATES.filter((candidate) => {
      if (candidate.positionId !== activePositionId) return false;
      if (!normalizedQuery) return true;
      const searchable = [candidate.alias, candidate.humanReview, ...candidate.skills]
        .join(' ')
        .toLocaleLowerCase('tr-TR');
      return searchable.includes(normalizedQuery);
    });
  }, [activePositionId, query]);

  const selectedCandidate =
    RECRUITER_CANDIDATES.find((candidate) => candidate.id === selectedCandidateId) ?? null;

  const selectPosition = (positionId: string) => {
    setActivePositionId(positionId);
    setSelectedCandidateId(null);
    setDraftNote('');
    setPreviewNote('');
  };

  const selectCandidate = (candidate: RecruiterCandidate) => {
    setSelectedCandidateId(candidate.id);
    setDraftNote('');
    setPreviewNote('');
  };

  const createLocalPreview = () => {
    const normalized = draftNote.trim();
    if (!selectedCandidate || !normalized) return;
    setPreviewNote(normalized);
  };

  return (
    <div
      className="mx-auto w-full max-w-[96rem] space-y-6 px-4 pb-24 pt-6 sm:px-6 sm:pb-8 lg:px-8"
      data-testid="recruiter-workspace-page"
    >
      <nav aria-label="ATS konumu" className="flex flex-wrap items-center gap-2 text-sm">
        <Link
          to={ATS_PRODUCT_HUB_ENTRY.route}
          className="font-semibold text-text-primary underline underline-offset-4 hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
        >
          ATS Ürün Merkezi
        </Link>
        <span className="text-text-subtle" aria-hidden="true">
          /
        </span>
        <span className="text-text-secondary" aria-current="page">
          İK Çalışma Alanı
        </span>
      </nav>

      <header className="relative overflow-hidden rounded-3xl border border-border-subtle bg-linear-to-br from-action-primary/10 via-surface-default to-state-info-bg px-5 py-7 shadow-xs sm:px-8 sm:py-9">
        <div
          className="absolute -right-14 -top-16 h-48 w-48 rounded-full bg-action-primary/10"
          aria-hidden="true"
        />
        <div className="relative flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-state-warning-border bg-state-warning-bg px-3 py-1 text-xs font-bold text-text-primary">
                Yalnız öneri
              </span>
              <span className="rounded-full border border-border-subtle bg-surface-default px-3 py-1 text-xs font-semibold text-text-secondary">
                Sentetik adaylar
              </span>
            </div>
            <p className="mt-5 text-xs font-bold uppercase tracking-[0.16em] text-text-primary">
              Full ATS · İK deneyimi
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-text-primary sm:text-4xl">
              İK Çalışma Alanı
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-text-secondary sm:text-base">
              Pozisyonları, insan incelemesi bekleyen aday akışını ve kanıt eksiklerini tek yerde
              görün. Bu yüzey karar yürütmez; bütün kritik eylemler kapalıdır.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Link
              to={INTERVIEW_EVIDENCE_ENTRY.route}
              className="inline-flex min-h-11 items-center justify-center rounded-xl bg-action-primary px-4 py-2.5 text-sm font-bold text-action-primary-text shadow-sm hover:bg-action-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
            >
              Interview Evidence’ı aç
            </Link>
            <Link
              to={ATS_PRODUCT_HUB_ENTRY.route}
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border-subtle bg-surface-default px-4 py-2.5 text-sm font-bold text-text-primary hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
            >
              Ürün merkezine dön
            </Link>
          </div>
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="İK çalışma özeti">
        {[
          [String(RECRUITER_POSITIONS.length), 'Açık pozisyon', 'Sentetik pozisyon kataloğu'],
          [String(RECRUITER_CANDIDATES.length), 'Aday kartı', 'Gerçek kişi veya PII içermez'],
          [
            String(RECRUITER_CANDIDATES.filter((candidate) => candidate.stage === 'REVIEW').length),
            'İnsan incelemesi',
            'Otomatik puanlama yok',
          ],
          ['0', 'Yürütülen kritik eylem', 'Mesaj, ret ve teklif kapalı'],
        ].map(([value, label, detail]) => (
          <article
            key={label}
            className="rounded-2xl border border-border-subtle bg-surface-default p-5 shadow-xs"
          >
            <p className="text-3xl font-bold tracking-tight text-text-primary">{value}</p>
            <h2 className="mt-2 text-sm font-semibold text-text-primary">{label}</h2>
            <p className="mt-1 text-xs leading-5 text-text-secondary">{detail}</p>
          </article>
        ))}
      </section>

      <section
        className="rounded-3xl border border-border-subtle bg-surface-default p-4 shadow-xs sm:p-6"
        aria-label="Aday filtreleri"
      >
        <div className="grid gap-4 lg:grid-cols-[minmax(240px,0.65fr)_minmax(260px,0.75fr)_minmax(0,1fr)] lg:items-end">
          <div>
            <label htmlFor="recruiter-position" className="text-sm font-semibold text-text-primary">
              Pozisyon
            </label>
            <select
              id="recruiter-position"
              value={activePositionId}
              onChange={(event) => selectPosition(event.target.value)}
              className="mt-2 min-h-11 w-full rounded-xl border border-border-subtle bg-surface-default px-3.5 py-2.5 text-sm font-semibold text-text-primary outline-hidden focus:border-action-primary focus:ring-2 focus:ring-selection-outline"
            >
              {RECRUITER_POSITIONS.map((position) => (
                <option key={position.id} value={position.id}>
                  {position.title}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="recruiter-search" className="text-sm font-semibold text-text-primary">
              Aday veya beceri ara
            </label>
            <input
              id="recruiter-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Örn. erişilebilirlik"
              className="mt-2 min-h-11 w-full rounded-xl border border-border-subtle bg-surface-default px-3.5 py-2.5 text-sm text-text-primary outline-hidden placeholder:text-text-subtle focus:border-action-primary focus:ring-2 focus:ring-selection-outline"
            />
          </div>
          <dl className="grid grid-cols-2 gap-3 rounded-2xl bg-surface-muted p-4 text-sm sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4">
            <div>
              <dt className="text-xs text-text-secondary">Ekip</dt>
              <dd className="mt-1 font-semibold text-text-primary">{activePosition.team}</dd>
            </div>
            <div>
              <dt className="text-xs text-text-secondary">Konum</dt>
              <dd className="mt-1 font-semibold text-text-primary">{activePosition.location}</dd>
            </div>
            <div>
              <dt className="text-xs text-text-secondary">Sahip</dt>
              <dd className="mt-1 font-semibold text-text-primary">{activePosition.owner}</dd>
            </div>
            <div>
              <dt className="text-xs text-text-secondary">Açık gün</dt>
              <dd className="mt-1 font-semibold text-text-primary">{activePosition.openDays}</dd>
            </div>
          </dl>
        </div>
      </section>

      <div className="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_360px]">
        <section aria-labelledby="pipeline-heading" className="min-w-0">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-text-primary">
                İnsan kontrollü akış
              </p>
              <h2 id="pipeline-heading" className="mt-1 text-2xl font-bold text-text-primary">
                Aday pipeline’ı
              </h2>
            </div>
            <p className="text-sm font-medium text-text-secondary" aria-live="polite">
              {visibleCandidates.length} sentetik aday gösteriliyor
            </p>
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-4" data-testid="recruiter-pipeline">
            {RECRUITER_PIPELINE_STAGES.map((stage) => {
              const stageCandidates = visibleCandidates.filter(
                (candidate) => candidate.stage === stage.id,
              );
              return (
                <section
                  key={stage.id}
                  className="min-w-0 rounded-2xl border border-border-subtle bg-surface-muted p-3"
                  aria-labelledby={`pipeline-${stage.id.toLowerCase()}`}
                >
                  <div className="flex items-start justify-between gap-2 px-1 py-1">
                    <div>
                      <h3
                        id={`pipeline-${stage.id.toLowerCase()}`}
                        className="text-sm font-bold text-text-primary"
                      >
                        {stage.label}
                      </h3>
                      <p className="mt-1 text-xs leading-5 text-text-secondary">
                        {stage.description}
                      </p>
                    </div>
                    <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-surface-default px-2 text-xs font-bold text-text-primary">
                      {stageCandidates.length}
                    </span>
                  </div>

                  <ul className="mt-3 space-y-3">
                    {stageCandidates.map((candidate) => (
                      <li key={candidate.id}>
                        <article className="rounded-2xl border border-border-subtle bg-surface-default p-4 shadow-xs">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <h4 className="truncate text-sm font-bold text-text-primary">
                                {candidate.alias}
                              </h4>
                              <p className="mt-1 text-xs text-text-secondary">
                                {candidate.waitingLabel}
                              </p>
                            </div>
                            <span className="rounded-full border border-state-info-border bg-state-info-bg px-2 py-0.5 text-[11px] font-bold text-text-primary">
                              {candidate.evidenceReady}/{candidate.evidenceTotal} kanıt
                            </span>
                          </div>
                          <ul
                            className="mt-3 flex flex-wrap gap-1.5"
                            aria-label="Beceri etiketleri"
                          >
                            {candidate.skills.map((skill) => (
                              <li
                                key={skill}
                                className="rounded-lg bg-surface-muted px-2 py-1 text-[11px] font-medium text-text-secondary"
                              >
                                {skill}
                              </li>
                            ))}
                          </ul>
                          <p className="mt-3 text-xs leading-5 text-text-secondary">
                            {candidate.humanReview}
                          </p>
                          <button
                            type="button"
                            onClick={() => selectCandidate(candidate)}
                            aria-controls="recruiter-review-panel"
                            aria-expanded={selectedCandidateId === candidate.id}
                            className="mt-4 inline-flex min-h-10 w-full items-center justify-center rounded-xl border border-border-subtle bg-surface-default px-3 py-2 text-xs font-bold text-text-primary hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
                            aria-label={`Kanıt durumunu incele: ${candidate.alias}`}
                          >
                            Kanıt durumunu incele
                          </button>
                        </article>
                      </li>
                    ))}
                    {stageCandidates.length === 0 ? (
                      <li className="rounded-xl border border-dashed border-border-subtle p-3 text-center text-xs leading-5 text-text-secondary">
                        Bu aşamada eşleşen sentetik aday yok.
                      </li>
                    ) : null}
                  </ul>
                </section>
              );
            })}
          </div>
        </section>

        <aside
          id="recruiter-review-panel"
          className="rounded-3xl border border-border-subtle bg-surface-default p-5 shadow-xs 2xl:sticky 2xl:top-6 2xl:self-start"
          aria-labelledby="candidate-review-heading"
          data-testid="recruiter-review-panel"
        >
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-text-primary">
            Kanıta bağlı inceleme
          </p>
          <h2
            ref={reviewHeadingRef}
            id="candidate-review-heading"
            className="mt-1 text-xl font-bold text-text-primary outline-hidden"
            tabIndex={-1}
          >
            Değerlendirme taslağı
          </h2>

          {selectedCandidate ? (
            <div className="mt-5">
              <div className="rounded-2xl border border-border-subtle bg-surface-muted p-4">
                <p className="font-bold text-text-primary">{selectedCandidate.alias}</p>
                <p className="mt-1 text-sm text-text-secondary">{activePosition.title}</p>
                <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-xs text-text-secondary">Kanıt kapsamı</dt>
                    <dd className="mt-1 font-semibold text-text-primary">
                      {selectedCandidate.evidenceReady}/{selectedCandidate.evidenceTotal}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-text-secondary">Durum</dt>
                    <dd className="mt-1 font-semibold text-text-primary">İnsan kontrolünde</dd>
                  </div>
                </dl>
              </div>

              <div className="mt-4">
                <label
                  htmlFor="recruiter-draft-note"
                  className="text-sm font-semibold text-text-primary"
                >
                  İnsan değerlendirme notu
                </label>
                <textarea
                  id="recruiter-draft-note"
                  value={draftNote}
                  onChange={(event) => {
                    setDraftNote(event.target.value);
                    setPreviewNote('');
                  }}
                  rows={5}
                  placeholder="Yalnız gözlenebilir kanıta bağlı bir not yazın..."
                  className="mt-2 w-full rounded-xl border border-border-subtle bg-surface-default px-3.5 py-3 text-sm leading-6 text-text-primary outline-hidden placeholder:text-text-subtle focus:border-action-primary focus:ring-2 focus:ring-selection-outline"
                />
                <button
                  type="button"
                  onClick={createLocalPreview}
                  disabled={!draftNote.trim()}
                  className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-action-primary px-4 py-2.5 text-sm font-bold text-action-primary-text enabled:hover:bg-action-primary-hover disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
                >
                  Yerel taslağı önizle
                </button>
              </div>

              {previewNote ? (
                <div
                  className="mt-4 rounded-2xl border border-state-success-border bg-state-success-bg p-4"
                  role="status"
                  data-testid="recruiter-local-note-preview"
                >
                  <p className="text-xs font-bold uppercase tracking-wide text-text-primary">
                    Yerel önizleme
                  </p>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-text-primary">
                    {previewNote}
                  </p>
                  <p className="mt-2 text-xs text-text-secondary">
                    Kaydedilmedi veya gönderilmedi.
                  </p>
                </div>
              ) : null}
            </div>
          ) : (
            <p className="mt-5 rounded-2xl border border-dashed border-border-subtle bg-surface-muted p-4 text-sm leading-6 text-text-secondary">
              Bir aday kartındaki “Kanıt durumunu incele” düğmesini seçin. Bu panel gerçek aday
              verisi veya otomatik öneri üretmez.
            </p>
          )}

          <div
            className="mt-5 border-t border-border-subtle pt-5"
            aria-describedby="critical-actions-note"
          >
            <h3 className="text-sm font-semibold text-text-primary">Kritik eylemler</h3>
            <p id="critical-actions-note" className="mt-1 text-xs leading-5 text-text-secondary">
              Yetkili insan, canlı veri ve ayrı işlem onayı olmadan kullanılamaz.
            </p>
            <div className="mt-3 grid gap-2">
              {RECRUITER_DISABLED_ACTIONS.map((action) => (
                <button
                  key={action}
                  type="button"
                  disabled
                  className="min-h-10 cursor-not-allowed rounded-xl border border-border-subtle bg-surface-muted px-3 py-2 text-left text-xs font-semibold text-text-subtle"
                >
                  {action} · Kapalı
                </button>
              ))}
            </div>
          </div>
        </aside>
      </div>

      <aside
        className="rounded-3xl border border-state-warning-border bg-state-warning-bg p-5 sm:p-7"
        aria-labelledby="recruiter-boundary-heading"
        data-testid="recruiter-workspace-boundary"
      >
        <h2 id="recruiter-boundary-heading" className="text-lg font-bold text-text-primary">
          Çalışma alanının işlem tavanı
        </h2>
        <ul className="mt-4 grid gap-3 text-sm text-text-secondary md:grid-cols-3">
          {ATS_PORTAL_SAFETY_BOUNDARIES.map((boundary) => (
            <li
              key={boundary}
              className="rounded-xl border border-state-warning-border bg-surface-default/70 p-3"
            >
              {boundary}
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
};

export default RecruiterWorkspacePage;
