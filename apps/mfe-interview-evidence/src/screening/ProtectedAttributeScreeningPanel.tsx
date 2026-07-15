import { useEffect, useRef, useState } from 'react';
import { Badge, Button, Stack, Text } from '@mfe/design-system';
import type { CitationReceiptRef } from '../review/LiveReviewCasePanel';
import type { Segment } from '../segment-view/types';
import {
  createScreeningRequestKey,
  fetchLiveScreening,
  requestLiveScreening,
} from './liveScreeningApi';
import type {
  LiveScreeningEvidence,
  LiveScreeningReceipt,
  LiveScreeningRequest,
  ProtectedCategory,
  ScreeningCoverage,
  ScreeningDisposition,
  ScreeningSignal,
} from './liveScreeningApi';
import {
  AtsClientValidationError,
  AtsContractError,
  isAuthnError,
  isAuthzError,
} from '../transcripts/liveTranscriptApi';

type ErrorKind =
  | 'authn'
  | 'authz'
  | 'validation'
  | 'not-found'
  | 'conflict'
  | 'unavailable'
  | 'contract'
  | 'generic';

type OperationState<T> =
  | { phase: 'idle' }
  | { phase: 'loading' }
  | { phase: 'success'; value: T }
  | { phase: 'error'; kind: ErrorKind; detail: string };

const CATEGORY_LABELS: Record<ProtectedCategory, string> = {
  AGE: 'Yaş',
  RELIGION_BELIEF: 'Din / inanç',
  ETHNICITY_RACE: 'Etnik köken / ırk',
  TRADE_UNION: 'Sendika',
  HEALTH_DISABILITY: 'Sağlık / engellilik',
  SEX_GENDER_ORIENTATION: 'Cinsiyet / toplumsal cinsiyet / yönelim',
  MARITAL_PARENTAL_STATUS: 'Medeni / ebeveynlik durumu',
  POLITICAL_OPINION: 'Siyasi görüş',
  PHILOSOPHICAL_BELIEF: 'Felsefi inanç',
  CRIMINAL_RECORD: 'Adli sicil',
  NATIVE_LANGUAGE_ACCENT: 'Ana dil / aksan',
  ASSOCIATION_MEMBERSHIP: 'Dernek üyeliği',
  PREGNANCY_MATERNITY: 'Hamilelik / annelik',
};

const SIGNAL_LABELS: Record<ScreeningSignal, string> = {
  PROTECTED_ATTRIBUTE_MENTION: 'Korumalı özellik anılması',
  QUESTION_LIKE_PROTECTED_MENTION: 'Soru kalıbında korumalı özellik anılması',
};

const COVERAGE_LABELS: Record<ScreeningCoverage, string> = {
  SUPPORTED: 'Desteklenen kapsamda tarandı',
  UNSUPPORTED_LANGUAGE: 'Dil desteği yok — temiz sayılamaz',
  MALFORMED_INPUT: 'Kaynak biçimi taranamadı — temiz sayılamaz',
  POLICY_UNAVAILABLE: 'Politika kullanılamıyor — temiz sayılamaz',
};

const DISPOSITION_LABELS: Record<ScreeningDisposition, string> = {
  CLEAR: 'Bulgu yok — yalnız bu kaynak için',
  REVIEW_REQUIRED: 'İnsan uyum incelemesi gerekli',
  SCREENING_UNAVAILABLE: 'Tarama sonucu kullanılamıyor',
};

const ERROR_LABELS: Record<ErrorKind, string> = {
  authn: 'Oturum hatası',
  authz: 'Yetki hatası',
  validation: 'İstek doğrulanamadı',
  'not-found': 'Kaynak bulunamadı',
  conflict: 'Kapı çatışması',
  unavailable: 'Servis kullanılamıyor',
  contract: 'Yanıt doğrulanamadı',
  generic: 'Sonuç kesinleştirilemedi',
};

function status(error: unknown): number | undefined {
  return (error as { response?: { status?: number } })?.response?.status;
}

function classify(
  error: unknown,
  operation: 'read' | 'write',
): { kind: ErrorKind; detail: string } {
  if (error instanceof AtsClientValidationError) {
    return { kind: 'validation', detail: error.message };
  }
  if (isAuthnError(error)) {
    return {
      kind: 'authn',
      detail: 'Oturum doğrulanamadı; yeniden giriş gerekebilir. Rol ataması bu hatayı çözmez.',
    };
  }
  if (isAuthzError(error)) {
    return {
      kind: 'authz',
      detail:
        operation === 'write'
          ? 'Tarama üretme yetkiniz yok (ats.screening.write). Bu oturumda yeni tarama kapatıldı.'
          : 'Tarama kanıtı okuma yetkiniz yok (ats.screening.read). Bu oturumda kanıt okuma kapatıldı.',
    };
  }
  if (error instanceof AtsContractError) {
    return {
      kind: 'contract',
      detail: 'Backend yanıtı doğrulanamadı; sonuç karar desteği olarak gösterilmedi.',
    };
  }
  if (status(error) === 400) return { kind: 'validation', detail: 'İstek sözleşmesi reddedildi.' };
  if (status(error) === 404) {
    return { kind: 'not-found', detail: 'Kanonik kaynak/kanıt bu mülakat kapsamında bulunamadı.' };
  }
  if (status(error) === 409) {
    return {
      kind: 'conflict',
      detail:
        'Tarama kapısı veya idempotency bağı çatıştı. Aynı kaynak için aynı güvenli istek kimliği korunmuştur.',
    };
  }
  if (status(error) === 503) {
    return {
      kind: 'unavailable',
      detail:
        operation === 'write'
          ? 'Tarama kanıt düzlemi geçici olarak kullanılamıyor; aynı istek güvenle yeniden denenebilir.'
          : 'Tarama kanıt düzlemi geçici olarak kullanılamıyor; kayıtlı kanıtı yeniden okuyabilirsiniz.',
    };
  }
  return {
    kind: 'generic',
    detail:
      operation === 'write'
        ? 'İşlemin sonucu kesinleştirilemedi; aynı istek kimliğiyle yeniden deneyin.'
        : 'Okuma sonucu kesinleştirilemedi; kayıtlı kanıtı yeniden okuyun.',
  };
}

function shortRef(value: string): string {
  return value.length > 20 ? `${value.slice(0, 8)}…${value.slice(-8)}` : value;
}

function ScreeningResult({
  evidence,
  replayed,
}: {
  evidence: LiveScreeningEvidence;
  replayed?: boolean;
}) {
  return (
    <Stack direction="column" gap={3} data-testid="screening-result">
      <Stack direction="row" gap={2} style={{ flexWrap: 'wrap' }}>
        <Badge
          variant={
            evidence.disposition === 'CLEAR'
              ? 'success'
              : evidence.disposition === 'REVIEW_REQUIRED'
                ? 'warning'
                : 'error'
          }
        >
          {DISPOSITION_LABELS[evidence.disposition]}
        </Badge>
        <Badge variant="info">{COVERAGE_LABELS[evidence.coverage]}</Badge>
        {replayed !== undefined && (
          <Badge variant="muted" data-testid="screening-replay-status">
            {replayed ? 'Doğrulanmış tekrar — yeni kanıt yok' : 'Yeni kanıt'}
          </Badge>
        )}
      </Stack>

      <Text as="p" size="sm">
        Politika: <code>{evidence.policyRef}</code> · bulgu kümesi:{' '}
        <code title={evidence.findingSetRef}>{shortRef(evidence.findingSetRef)}</code> · kayıt:{' '}
        <code title={evidence.evidenceId}>{shortRef(evidence.evidenceId)}</code>
      </Text>
      <Text as="p" size="sm" variant="secondary">
        Bu sonuç bir aday kararı, puan, güven skoru veya işe al/ele önerisi değildir. Yalnız seçili
        kanonik kaynak için insan uyum incelemesine yardımcı olur.
      </Text>

      {evidence.findings.length === 0 ? (
        <Text as="p" size="sm" data-testid="screening-findings-empty">
          {evidence.disposition === 'CLEAR'
            ? 'Desteklenen kapsamda korumalı-özellik sinyali bulunmadı.'
            : 'Bulgu listesi boş olsa da tarama kapsamı otoritatif değil; kaynak temiz sayılamaz.'}
        </Text>
      ) : (
        <ol style={{ margin: 0, paddingInlineStart: '1.5rem' }} data-testid="screening-findings">
          {evidence.findings.map((finding, index) => (
            <li key={`${finding.category}-${finding.span.startInclusive}-${index}`}>
              <Text as="span" size="sm" weight="semibold">
                {CATEGORY_LABELS[finding.category]}
              </Text>{' '}
              <Text as="span" size="sm" variant="secondary">
                — {SIGNAL_LABELS[finding.signal]} · UTF‑16 aralığı [{finding.span.startInclusive},{' '}
                {finding.span.endExclusive})
                {finding.span.segmentIndex !== null
                  ? ` · segment ${finding.span.segmentIndex}`
                  : ''}
              </Text>
            </li>
          ))}
        </ol>
      )}
    </Stack>
  );
}

/** #913 Faz 25 canlı reviewer yüzeyi: pointer-only kaynak, ayrı read/write rol kapıları. */
export function ProtectedAttributeScreeningPanel({
  interviewId,
  transcriptKey,
  segments,
  citationReceipt,
}: {
  interviewId: string;
  transcriptKey: string;
  segments: Segment[];
  citationReceipt: CitationReceiptRef | null;
}) {
  const [sourceKind, setSourceKind] = useState<'segment' | 'citation'>('segment');
  const [segmentIndex, setSegmentIndex] = useState(segments[0]?.index ?? 0);
  const [writeState, setWriteState] = useState<OperationState<LiveScreeningReceipt>>({
    phase: 'idle',
  });
  const [readRef, setReadRef] = useState('');
  const [readState, setReadState] = useState<OperationState<LiveScreeningEvidence>>({
    phase: 'idle',
  });
  const [writeDenied, setWriteDenied] = useState(false);
  const [readDenied, setReadDenied] = useState(false);
  const pending = useRef<{ signature: string; key: string } | null>(null);
  const writeResultHeading = useRef<HTMLHeadingElement>(null);
  const readResultHeading = useRef<HTMLHeadingElement>(null);

  const citationKey =
    citationReceipt?.interviewId === interviewId && citationReceipt.transcriptKey === transcriptKey
      ? citationReceipt.citationKey
      : '';
  useEffect(() => {
    if (!segments.some((segment) => segment.index === segmentIndex)) {
      setSegmentIndex(segments[0]?.index ?? 0);
    }
  }, [segments, segmentIndex]);
  useEffect(() => {
    if (sourceKind === 'citation' && !citationKey) setSourceKind('segment');
    pending.current = null;
    setWriteState({ phase: 'idle' });
  }, [citationKey, sourceKind, transcriptKey]);
  useEffect(() => {
    if (writeState.phase === 'success' || writeState.phase === 'error') {
      writeResultHeading.current?.focus();
    }
  }, [writeState]);
  useEffect(() => {
    if (readState.phase === 'success' || readState.phase === 'error') {
      readResultHeading.current?.focus();
    }
  }, [readState]);

  const buildRequest = (): LiveScreeningRequest =>
    sourceKind === 'citation'
      ? { sourceKind: 'CITATION_CLAIM', citationKey }
      : { sourceKind: 'TRANSCRIPT_SEGMENT', transcriptKey, segmentIndex };

  const submit = () => {
    if (writeState.phase === 'loading' || writeDenied) return;
    const request = buildRequest();
    const signature = JSON.stringify(request);
    try {
      if (!pending.current || pending.current.signature !== signature) {
        pending.current = { signature, key: createScreeningRequestKey() };
      }
    } catch (error) {
      setWriteState({ phase: 'error', ...classify(error, 'write') });
      return;
    }
    setWriteState({ phase: 'loading' });
    requestLiveScreening(interviewId, request, pending.current.key).then(
      (receipt) => {
        setWriteState({ phase: 'success', value: receipt });
        setReadRef(receipt.findingSetRef);
        // Input yeni ref'e dönerken eski GET sonucu yeni ref'e aitmiş gibi ekranda kalamaz.
        setReadState({ phase: 'idle' });
      },
      (error) => {
        const classified = classify(error, 'write');
        if (classified.kind === 'authz') setWriteDenied(true);
        setWriteState({ phase: 'error', ...classified });
      },
    );
  };

  const read = () => {
    if (readState.phase === 'loading' || readDenied) return;
    setReadState({ phase: 'loading' });
    fetchLiveScreening(interviewId, readRef.trim()).then(
      (evidence) => setReadState({ phase: 'success', value: evidence }),
      (error) => {
        const classified = classify(error, 'read');
        if (classified.kind === 'authz') setReadDenied(true);
        setReadState({ phase: 'error', ...classified });
      },
    );
  };

  const segmentAvailable = segments.some((segment) => segment.index === segmentIndex);
  const sourceAvailable = sourceKind === 'citation' ? Boolean(citationKey) : segmentAvailable;

  return (
    <Stack direction="column" gap={4} data-testid="protected-screening-panel">
      <Stack direction="column" gap={2}>
        <Text as="h2" size="lg" weight="semibold">
          Korumalı özellik uyum taraması
        </Text>
        <Text as="p" size="sm" variant="secondary">
          Tarama servisine ham transkript veya iddia metni gönderilmez; yalnız sunucunun zaten
          bildiği opak kaynak referansı gönderilir. Sonuç insan kararının yerine geçmez.
        </Text>
      </Stack>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))',
          gap: '1rem',
        }}
      >
        <Stack direction="column" gap={3}>
          <div>
            <Badge variant={writeDenied ? 'error' : 'info'}>
              Yazma yetkisi · ats.screening.write {writeDenied ? '— kapalı' : ''}
            </Badge>
          </div>
          <fieldset disabled={writeDenied || writeState.phase === 'loading'} style={{ margin: 0 }}>
            <legend>Tarama kaynağı</legend>
            <Stack direction="column" gap={2}>
              <label>
                <input
                  type="radio"
                  name="screening-source"
                  value="segment"
                  checked={sourceKind === 'segment'}
                  onChange={() => setSourceKind('segment')}
                />{' '}
                Transkript segmenti
              </label>
              <label htmlFor="screening-segment-index">
                <Text as="span" size="sm">
                  Segment
                </Text>
              </label>
              <select
                id="screening-segment-index"
                data-testid="screening-segment-select"
                value={segmentIndex}
                disabled={sourceKind !== 'segment' || segments.length === 0}
                onChange={(event) => {
                  setSegmentIndex(Number(event.target.value));
                  pending.current = null;
                  setWriteState({ phase: 'idle' });
                }}
              >
                {segments.length === 0 && <option value={0}>Segment yok</option>}
                {segments.map((segment) => (
                  <option key={segment.index} value={segment.index}>
                    Segment {segment.index} · {segment.speakerLabel}
                  </option>
                ))}
              </select>
              <label>
                <input
                  type="radio"
                  name="screening-source"
                  value="citation"
                  checked={sourceKind === 'citation'}
                  disabled={!citationKey}
                  onChange={() => setSourceKind('citation')}
                />{' '}
                Son kanıt-alıntı iddiası
              </label>
              {!citationKey && (
                <Text as="p" size="sm" variant="secondary">
                  Atıf-iddiası taraması için önce yukarıdaki kanıt-alıntı yüzeyinden geçerli bir
                  öneri üretin.
                </Text>
              )}
            </Stack>
          </fieldset>
          <div>
            <Button
              variant="primary"
              data-testid="screening-submit"
              disabled={!sourceAvailable || writeDenied || writeState.phase === 'loading'}
              onClick={submit}
            >
              {writeState.phase === 'loading'
                ? 'Taranıyor…'
                : pending.current
                  ? 'Aynı isteği güvenle doğrula'
                  : 'Seçili kaynağı tara'}
            </Button>
          </div>
          <div role="status" aria-live="polite" aria-atomic="true">
            {writeState.phase === 'loading' && <Text as="p">Tarama kanıtı üretiliyor…</Text>}
            {(writeState.phase === 'success' || writeState.phase === 'error') && (
              <Text ref={writeResultHeading} tabIndex={-1} as="h3" size="lg" weight="semibold">
                {writeState.phase === 'success' ? 'Tarama sonucu' : 'Tarama üretilemedi'}
              </Text>
            )}
            {writeState.phase === 'error' && (
              <Stack direction="column" gap={2} data-testid="screening-write-error">
                <Badge variant="error">{ERROR_LABELS[writeState.kind]}</Badge>
                <Text as="p" size="sm">
                  {writeState.detail}
                </Text>
              </Stack>
            )}
            {writeState.phase === 'success' && (
              <ScreeningResult evidence={writeState.value} replayed={writeState.value.replayed} />
            )}
          </div>
        </Stack>

        <Stack direction="column" gap={3}>
          <div>
            <Badge variant={readDenied ? 'error' : 'info'}>
              Okuma yetkisi · ats.screening.read {readDenied ? '— kapalı' : ''}
            </Badge>
          </div>
          <label htmlFor="screening-finding-set-ref">
            <Text as="span" size="sm">
              Bulgu-kümesi referansı
            </Text>
          </label>
          <input
            id="screening-finding-set-ref"
            data-testid="screening-read-ref"
            value={readRef}
            disabled={readDenied || readState.phase === 'loading'}
            onChange={(event) => {
              setReadRef(event.target.value);
              setReadState({ phase: 'idle' });
            }}
            placeholder="fsr_<64-küçük-hex>"
            autoComplete="off"
            spellCheck={false}
          />
          <div>
            <Button
              variant="ghost"
              data-testid="screening-read"
              disabled={!readRef.trim() || readDenied || readState.phase === 'loading'}
              onClick={read}
            >
              {readState.phase === 'loading' ? 'Kanıt okunuyor…' : 'Kayıtlı kanıtı getir'}
            </Button>
          </div>
          <div role="status" aria-live="polite" aria-atomic="true">
            {(readState.phase === 'success' || readState.phase === 'error') && (
              <Text ref={readResultHeading} tabIndex={-1} as="h3" size="lg" weight="semibold">
                {readState.phase === 'success' ? 'Kayıtlı tarama kanıtı' : 'Kanıt okunamadı'}
              </Text>
            )}
            {readState.phase === 'error' && (
              <Stack direction="column" gap={2} data-testid="screening-read-error">
                <Badge variant="error">{ERROR_LABELS[readState.kind]}</Badge>
                <Text as="p" size="sm">
                  {readState.detail}
                </Text>
              </Stack>
            )}
            {readState.phase === 'success' && <ScreeningResult evidence={readState.value} />}
          </div>
        </Stack>
      </div>
    </Stack>
  );
}
