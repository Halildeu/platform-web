import { useState } from 'react';
import { Badge, Button, Input, Text } from '@mfe/design-system';
import * as engine from './demoReviewEngine';
import type { CaseState, CaseSummary, CitationReceipt, ExportReceipt } from './types';

/**
 * F4/F5 inceleme çalışma-alanı — standalone ATS ekranının platform-web portu
 * (design-system reuse). Standart §2'nin ÜÇ insan-yolu da UI'da: NO_CHANGE /
 * EDIT (değişiklik-özeti-ref) / REJECT (gerekçe-ref) → RATIONALE → FINALIZE →
 * F7 export. Karar DAİMA insanın: otomatik-finalize YOK.
 *
 * KANIT-KAPISI: insan-karar yolu YALNIZ SUPPORTED + kaynaklı citation için
 * açılır — NOT_SUPPORTED karar-kanıtı OLAMAZ, INSUFFICIENT export'a GİREMEZ;
 * UI bu durumda akışı açmaz ve nedenini açıkça söyler (dead-end üretmez).
 *
 * Veri kaynağı: demo motor (ATS-0016 sentetik sınır); 39d'de `/api/ats`.
 */
export function ReviewWorkspace() {
  const [claim, setClaim] = useState('');
  const [citation, setCitation] = useState<CitationReceipt | null>(null);
  const [caseKey, setCaseKey] = useState<string | null>(null);
  const [caseState, setCaseState] = useState<CaseState | null>(null);
  const [rationaleRef, setRationaleRef] = useState('');
  const [decisionRef, setDecisionRef] = useState('');
  const [editSummaryRef, setEditSummaryRef] = useState('');
  const [rejectRef, setRejectRef] = useState('');
  const [criterionId, setCriterionId] = useState('c-teknik-yetkinlik');
  const [jobRelRef, setJobRelRef] = useState('');
  const [exportReceipt, setExportReceipt] = useState<ExportReceipt | null>(null);
  const [existingCases, setExistingCases] = useState<CaseSummary[] | null>(null);
  const [resumedRefs, setResumedRefs] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  /** Demo motor senkron; ortak hata yakalama (backend'de async'e dönecek). */
  function run(step: () => void) {
    setError(null);
    try {
      step();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Beklenmeyen hata.');
    }
  }

  const clearTransient = () => {
    setExportReceipt(null);
    setRationaleRef('');
    setDecisionRef('');
    setEditSummaryRef('');
    setRejectRef('');
    setJobRelRef('');
  };

  return (
    <section
      aria-label="İnceleme çalışma alanı"
      data-testid="review-workspace"
      style={{ display: 'grid', gap: 12 }}
    >
      <Text as="h2" size="lg" weight="semibold">
        İnceleme çalışma alanı (F4/F5)
      </Text>
      <Text as="p" size="sm" variant="secondary">
        İddia → kanıt-alıntı → insan incelemesi (değişiklik yok / düzenle / reddet) → gerekçe →
        sonuçlandırma → kanıt-paketi. Karar daima insanın; otomatik sonuçlandırma yok.
      </Text>

      {/* mevcut vakalar: bağlama devam (pointer-only liste) */}
      <div style={{ display: 'grid', gap: 6, maxWidth: 560 }}>
        <Button
          data-testid="case-list-button"
          variant="secondary"
          onClick={() => run(() => setExistingCases(engine.listCases()))}
        >
          Mevcut vakaları listele
        </Button>
        {existingCases && existingCases.length === 0 && (
          <Text as="p" size="sm" variant="secondary" data-testid="case-list-empty">
            Kayıtlı vaka yok.
          </Text>
        )}
        {existingCases && existingCases.length > 0 && (
          <ul
            data-testid="case-list"
            style={{ display: 'grid', gap: 6, listStyle: 'none', padding: 0, margin: 0 }}
          >
            {existingCases.map((c) => (
              <li key={c.caseKey}>
                <Button
                  data-testid="case-row"
                  variant="ghost"
                  onClick={() =>
                    run(() => {
                      // vaka değişimi = bağlam değişimi: transient state sıfırla
                      setCaseKey(c.caseKey);
                      setCitation(null);
                      clearTransient();
                      const detail = engine.getCaseDetail(c.caseKey);
                      setCaseState(detail.state);
                      setResumedRefs(detail.sourceEvidenceRefs);
                    })
                  }
                >
                  {c.caseKey} — {c.state}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div style={{ display: 'grid', gap: 10, maxWidth: 560 }}>
        <Input
          label="İddia (aday hakkında kanıtlanacak önerme)"
          value={claim}
          onChange={(e) => setClaim(e.target.value)}
          data-testid="claim-input"
        />
        <Button
          disabled={!claim.trim()}
          data-testid="cite-button"
          onClick={() =>
            run(() => {
              setCitation(engine.evaluateClaim(claim.trim()));
              setCaseKey(null);
              setCaseState(null);
              setResumedRefs([]);
              clearTransient();
            })
          }
        >
          Kanıt-alıntı oluştur
        </Button>

        {citation && (
          <div
            data-testid="citation-result"
            style={{ display: 'flex', gap: 8, alignItems: 'center' }}
          >
            <Badge variant={citation.entailment === 'SUPPORTED' ? 'success' : 'warning'}>
              {citation.entailment === 'SUPPORTED'
                ? 'DESTEKLENİYOR'
                : citation.entailment === 'NOT_SUPPORTED'
                  ? 'DESTEKLENMİYOR'
                  : 'YETERSİZ'}
            </Badge>
            <Text as="span" size="sm" variant="secondary">
              {citation.resolvedRefCount} kaynak segment
            </Text>
          </div>
        )}

        {citation && citation.entailment !== 'SUPPORTED' && (
          <Text as="p" variant="warning" data-testid="not-decision-evidence">
            Bu sonuç karar-kanıtı OLAMAZ; insan-karar akışı yalnız DESTEKLENİYOR + kaynaklı
            alıntıyla açılır (kanıt-kapısı).
          </Text>
        )}

        {citation &&
          citation.entailment === 'SUPPORTED' &&
          citation.resolvedRefCount > 0 &&
          !caseKey && (
            <Button
              data-testid="open-case-button"
              onClick={() =>
                run(() => {
                  const opened = engine.openCase(citation);
                  const state = engine.transition(opened.caseKey, 'START');
                  setCaseKey(opened.caseKey);
                  setCaseState(state);
                })
              }
            >
              İnceleme vakası aç
            </Button>
          )}

        {caseKey && caseState && (
          <div style={{ display: 'grid', gap: 10 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <Text as="span" size="sm" variant="secondary">
                Vaka durumu
              </Text>
              <Badge
                variant={
                  caseState === 'FINALIZED' || caseState === 'EXPORTED' ? 'success' : 'default'
                }
              >
                <span data-testid="case-state">{caseState}</span>
              </Badge>
            </div>

            {caseState === 'AI_SUGGESTED' && (
              <Button
                data-testid="start-button"
                onClick={() => run(() => setCaseState(engine.transition(caseKey, 'START')))}
              >
                İncelemeyi başlat
              </Button>
            )}

            {caseState === 'HUMAN_REVIEWING' && (
              <>
                <Button
                  data-testid="no-change-button"
                  onClick={() =>
                    run(() => setCaseState(engine.transition(caseKey, 'REVIEWED_NO_CHANGE')))
                  }
                >
                  Değişiklik yok (onayla)
                </Button>
                <Input
                  label="Düzenleme özeti referansı"
                  value={editSummaryRef}
                  onChange={(e) => setEditSummaryRef(e.target.value)}
                  data-testid="edit-input"
                />
                <Button
                  disabled={!editSummaryRef.trim()}
                  data-testid="edit-button"
                  onClick={() =>
                    run(() => setCaseState(engine.transition(caseKey, 'EDIT', editSummaryRef)))
                  }
                >
                  Düzenlendi olarak işaretle
                </Button>
                <Input
                  label="Ret gerekçesi referansı"
                  value={rejectRef}
                  onChange={(e) => setRejectRef(e.target.value)}
                  data-testid="reject-input"
                />
                <Button
                  disabled={!rejectRef.trim()}
                  data-testid="reject-button"
                  onClick={() =>
                    run(() => setCaseState(engine.transition(caseKey, 'REJECT', rejectRef)))
                  }
                >
                  AI önerisini reddet
                </Button>
              </>
            )}

            {(caseState === 'HUMAN_REVIEWED_NO_CHANGE' ||
              caseState === 'HUMAN_EDITED' ||
              caseState === 'AI_SUGGESTION_REJECTED') && (
              <>
                <Input
                  label="Gerekçe referansı"
                  value={rationaleRef}
                  onChange={(e) => setRationaleRef(e.target.value)}
                  data-testid="rationale-input"
                />
                <Button
                  disabled={!rationaleRef.trim()}
                  data-testid="rationale-button"
                  onClick={() =>
                    run(() => setCaseState(engine.transition(caseKey, 'RATIONALE', rationaleRef)))
                  }
                >
                  Gerekçeyi kaydet
                </Button>
              </>
            )}

            {caseState === 'HUMAN_RATIONALE_RECORDED' && (
              <>
                <Input
                  label="Karar sonucu referansı"
                  value={decisionRef}
                  onChange={(e) => setDecisionRef(e.target.value)}
                  data-testid="decision-input"
                />
                <Button
                  disabled={!decisionRef.trim()}
                  data-testid="finalize-button"
                  onClick={() => run(() => setCaseState(engine.finalizeCase(caseKey, decisionRef)))}
                >
                  Sonuçlandır (FINALIZE)
                </Button>
              </>
            )}

            {caseState === 'FINALIZED' &&
              !exportReceipt &&
              (citation || resumedRefs.length > 0) && (
                <>
                  <Input
                    label="Değerlendirme kriteri"
                    value={criterionId}
                    onChange={(e) => setCriterionId(e.target.value)}
                    data-testid="criterion-input"
                  />
                  <Input
                    label="İş-ilgisi referansı"
                    value={jobRelRef}
                    onChange={(e) => setJobRelRef(e.target.value)}
                    data-testid="jobrel-input"
                  />
                  <Button
                    disabled={!criterionId.trim() || !jobRelRef.trim()}
                    data-testid="export-button"
                    onClick={() =>
                      run(() => {
                        // FINALIZED→EXPORTED idari geçiş: motor state'i terminale
                        // çeker (çift-export yasak); UI aynı durumu yansıtır.
                        setExportReceipt(engine.exportPacket(caseKey, criterionId, jobRelRef));
                        setCaseState('EXPORTED');
                      })
                    }
                  >
                    Kanıt-paketi oluştur (F7)
                  </Button>
                </>
              )}

            {exportReceipt && (
              <div data-testid="export-result" style={{ display: 'grid', gap: 4 }}>
                <Badge variant="success">Kanıt-paketi hazır</Badge>
                <Text as="p" size="sm" variant="secondary">
                  Özet (digest): <code>{exportReceipt.packetDigest.slice(0, 16)}…</code>
                  {' · '}
                  {exportReceipt.claimCount} iddia
                </Text>
              </div>
            )}
          </div>
        )}

        {error && (
          <Text as="p" variant="error" role="alert" data-testid="review-error">
            {error}
          </Text>
        )}
      </div>
    </section>
  );
}
