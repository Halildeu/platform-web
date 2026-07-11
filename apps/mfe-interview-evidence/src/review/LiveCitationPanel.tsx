import { useEffect, useRef, useState } from 'react';
import { Badge, Button, Stack, Text } from '@mfe/design-system';
import { MAX_CLAIM_LENGTH, requestLiveCitation } from './liveCitationApi';
import type { CitationEntailment, LiveCitationReceipt } from './liveCitationApi';
import {
  AtsClientValidationError,
  isAuthnError,
  isAuthzError,
} from '../transcripts/liveTranscriptApi';

/**
 * 39d-7b canlı claim-citation paneli (F4 taslak yüzeyi) — Codex 019f50b7 şartları:
 * sonuç "AI önerisi — insan onayı bekliyor" dilinde sunulur; hiçbir durum
 * FINALIZED/APPROVED görseline dönüşmez (insan-onay yolları 39d-7b-2).
 * Hata sınıfları AYRI: authn(401)/authz(403)/AI-bağımlılığı(5xx)/kontrat/doğrulama —
 * 5xx "yetki" ya da "desteklenmiyor" gibi YORUMLANMAZ. `key={transcriptKey}`
 * remount'u bağlam değişimidir; geç dönen cevap eski state'i ezemez (cleanup).
 */
const SUGGESTION_LABEL: Record<CitationEntailment, string> = {
  SUPPORTED: 'AI önerisi: destekleniyor',
  NOT_SUPPORTED: 'AI önerisi: desteklenmiyor',
  INSUFFICIENT: 'AI önerisi: kanıt yetersiz',
};

type PanelState =
  | { phase: 'idle' }
  | { phase: 'submitting' }
  | { phase: 'suggested'; receipt: LiveCitationReceipt }
  | {
      phase: 'error';
      kind: 'authn' | 'authz' | 'ai-dependency' | 'validation' | 'generic';
      detail: string;
    };

function classify(error: unknown): {
  kind: 'authn' | 'authz' | 'ai-dependency' | 'validation' | 'generic';
  detail: string;
} {
  if (error instanceof AtsClientValidationError) {
    return { kind: 'validation', detail: error.message };
  }
  if (isAuthnError(error)) {
    return {
      kind: 'authn',
      detail: 'Oturum doğrulanamadı — yeniden giriş gerekebilir; rol ataması bu hatayı çözmez.',
    };
  }
  if (isAuthzError(error)) {
    return {
      kind: 'authz',
      detail:
        'Bu işlem için yetkiniz yok (ats.citation.write rolü gerekli — rol-kapısı fail-closed).',
    };
  }
  const status = (error as { response?: { status?: number } })?.response?.status;
  if (typeof status === 'number' && status >= 500) {
    return {
      kind: 'ai-dependency',
      detail:
        'Kanıt-alıntı servisi geçici olarak kullanılamıyor (AI bağımlılığı). Bu bir yetki ya da içerik kararı DEĞİLDİR — daha sonra yeniden deneyin.',
    };
  }
  return { kind: 'generic', detail: error instanceof Error ? error.message : 'Beklenmeyen hata' };
}

export function LiveCitationPanel({
  interviewId,
  transcriptKey,
  onReceiptChange,
}: {
  interviewId: string;
  transcriptKey: string;
  /** 39d-7b-2 F4→F5 bağı: güncel receipt yukarı taşınır; invalidate'te null (Codex şart-3). */
  onReceiptChange?: (
    receipt: {
      interviewId: string;
      transcriptKey: string;
      evidenceId: string;
      citationKey: string;
    } | null,
  ) => void;
}) {
  const [claim, setClaim] = useState('');
  const [state, setState] = useState<PanelState>({ phase: 'idle' });
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const inFlight = state.phase === 'submitting';

  const submit = () => {
    if (inFlight) return;
    setState({ phase: 'submitting' });
    requestLiveCitation(interviewId, transcriptKey, claim).then(
      (receipt) => {
        if (!alive.current) return;
        setState({ phase: 'suggested', receipt });
        onReceiptChange?.({
          interviewId,
          transcriptKey,
          evidenceId: receipt.evidenceId,
          citationKey: receipt.citationKey,
        });
      },
      (error) => {
        if (!alive.current) return;
        setState({ phase: 'error', ...classify(error) });
        onReceiptChange?.(null);
      },
    );
  };

  const keyTail = (k: string) => (k.length > 12 ? `…${k.slice(-8)}` : k);

  return (
    <Stack direction="column" gap={3} data-testid="live-citation-panel">
      <Text as="h2" size="lg" weight="semibold">
        Kanıt-alıntı (F4 — canlı, AI taslağı)
      </Text>
      <Text as="p" size="sm" variant="secondary">
        İddianız seçili transkriptin segmentlerine karşı AI ile sınanır ve WORM kanıt-defterine
        pointer-only kaydedilir. Sonuç bir ÖNERİDİR — karar insan onayı gerektirir (EU AI Act m.50;
        insan-onay yolları 39d-7b-2'de bağlanır). İddiaya PII yazmayın.
      </Text>
      <label htmlFor="live-citation-claim">
        <Text as="span" size="sm">
          İddia (en çok {MAX_CLAIM_LENGTH} karakter)
        </Text>
      </label>
      <textarea
        id="live-citation-claim"
        data-testid="live-citation-claim-input"
        value={claim}
        maxLength={MAX_CLAIM_LENGTH}
        rows={2}
        disabled={inFlight}
        onChange={(e) => {
          setClaim(e.target.value);
          // Codex iter: eski öneri/hata YENİ iddiaya bağlıymış gibi kalamaz —
          // claim değişimi görünür sonucu invalidate eder (yanıt pointer-only
          // olduğundan ekrandan ayırt edilemezdi). Receipt de yukarıda invalidate
          // edilir (F5 open'ı bayat kanıta bağlanamaz).
          setState({ phase: 'idle' });
          onReceiptChange?.(null);
        }}
        placeholder="örn. Aday deneyimini somut örneklerle anlattı"
        style={{ width: '100%', resize: 'vertical' }}
      />
      <div>
        <Button
          data-testid="live-citation-submit"
          variant="primary"
          disabled={inFlight || !claim.trim()}
          onClick={submit}
        >
          {inFlight ? 'Sınanıyor…' : 'AI ile sına (taslak)'}
        </Button>
      </div>

      {state.phase === 'suggested' && (
        <Stack direction="column" gap={2} data-testid="live-citation-result">
          <div>
            <Badge variant={state.receipt.entailment === 'SUPPORTED' ? 'info' : 'warning'}>
              {SUGGESTION_LABEL[state.receipt.entailment]} — insan onayı bekliyor
            </Badge>
          </div>
          <Text as="p" size="sm" variant="secondary">
            Çözümlenen kaynak segment sayısı: {state.receipt.resolvedRefCount} · kanıt ref:{' '}
            <code>{keyTail(state.receipt.citationKey)}</code> (pointer-only; WORM'a kaydedildi). Bu
            sonuç FINALIZE EDİLMEMİŞTİR; onay/düzeltme/ret insan incelemesinde verilir.
          </Text>
        </Stack>
      )}

      {state.phase === 'error' && (
        <Stack direction="column" gap={2} data-testid="live-citation-error">
          <div>
            <Badge variant="error">
              {state.kind === 'authn' && 'Oturum hatası'}
              {state.kind === 'authz' && 'Yetki hatası'}
              {state.kind === 'ai-dependency' && 'AI bağımlılığı kullanılamıyor'}
              {state.kind === 'validation' && 'Geçersiz girdi'}
              {state.kind === 'generic' && 'Sınama başarısız'}
            </Badge>
          </div>
          <Text as="p" size="sm">
            {state.detail}
          </Text>
        </Stack>
      )}
    </Stack>
  );
}
