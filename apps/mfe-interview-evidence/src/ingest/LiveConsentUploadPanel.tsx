import { useRef, useState } from 'react';
import { Badge, Button, Stack, Text } from '@mfe/design-system';
import {
  AtsClientValidationError,
  MAX_UPLOAD_BYTES,
  isAuthnError,
  isAuthzError,
  putLiveConsent,
  transcribeLiveRecording,
  uploadLiveRecording,
} from '../transcripts/liveTranscriptApi';
import type { ConsentState, UploadReceipt } from '../transcripts/liveTranscriptApi';

/**
 * 39d-7a canlı F1/F2 — rıza(backend-persist) → RAW upload → transcribe.
 * Demo paneli DEĞİŞMEZ (demo modda o render olur); bu panel yalnız live modda.
 *
 * CHECKPOINT/RETRY state-machine (Codex 019f50b7 P0): kısmi başarıda zincir
 * BAŞTAN koşulmaz — kaldığı checkpoint'ten devam eder:
 *   idle → consent-saved → uploaded(objectKey,evidenceId) → transcribed
 * Transcribe hatasında retry AYNI objectKey ile (İKİNCİ upload ASLA — backend
 * transcribe idempotency yalnız aynı key'de korur). Rıza kapısı fail-closed:
 * PUT consent(GRANTED) BAŞARILI olmadan upload başlamaz; GRANTED-dışı seçim
 * dosyayı ve checkpoint'leri temizler. Liste-refresh üst bileşende (App):
 * refresh hatasında yalnız re-fetch tekrarlanır.
 */
type Phase = 'idle' | 'consent-saved' | 'uploaded' | 'transcribed';

type Checkpoint = {
  phase: Phase;
  receipt: UploadReceipt | null;
  transcriptKey: string | null;
};

const INITIAL: Checkpoint = { phase: 'idle', receipt: null, transcriptKey: null };

function describeError(error: unknown): string {
  if (error instanceof AtsClientValidationError) return error.message;
  if (isAuthnError(error)) {
    return 'Oturum doğrulanamadı (401) — yeniden giriş gerekebilir; rol ataması bu hatayı çözmez.';
  }
  if (isAuthzError(error)) {
    return 'Bu işlem için yetkiniz yok (ats-api yazma rolü gerekli — rol-kapısı fail-closed).';
  }
  return error instanceof Error ? error.message : 'Beklenmeyen hata';
}

export function LiveConsentUploadPanel({
  interviewId,
  onTranscribed,
}: {
  interviewId: string;
  onTranscribed: (transcriptKey: string) => void;
}) {
  const [subjectRef, setSubjectRef] = useState('');
  const [consent, setConsent] = useState<ConsentState | ''>('');
  const [file, setFile] = useState<File | null>(null);
  const [cp, setCp] = useState<Checkpoint>(INITIAL);
  const [busyStep, setBusyStep] = useState<'consent' | 'upload' | 'transcribe' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const busy = busyStep !== null;
  const canStart = !busy && consent === 'GRANTED' && subjectRef.trim().length > 0 && file !== null;

  const resetChain = () => {
    setCp(INITIAL);
    setFile(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleConsentChange = (value: ConsentState | '') => {
    setConsent(value);
    // Rıza kapısı: GRANTED-dışı seçim dosya + checkpoint temizler (Codex #3).
    if (value !== 'GRANTED') resetChain();
  };

  /** Zinciri checkpoint'ten sürdürür — her koşumda yalnız EKSİK adımlar. */
  const runChain = async () => {
    if (busy) return; // çift-tık kilidi (state-machine tekil zincir)
    setError(null);
    try {
      let phase = cp.phase;
      let receipt = cp.receipt;

      if (phase === 'idle') {
        if (consent !== 'GRANTED') {
          setError('Rıza GRANTED olmadan yükleme başlamaz (fail-closed).');
          return;
        }
        setBusyStep('consent');
        await putLiveConsent(interviewId, subjectRef, 'GRANTED');
        phase = 'consent-saved';
        setCp({ phase, receipt: null, transcriptKey: null });
      }

      if (phase === 'consent-saved') {
        if (!file) {
          setError('Dosya seçilmedi.');
          setBusyStep(null);
          return;
        }
        setBusyStep('upload');
        receipt = await uploadLiveRecording(interviewId, file);
        phase = 'uploaded';
        setCp({ phase, receipt, transcriptKey: null });
      }

      if (phase === 'uploaded') {
        if (!receipt) throw new AtsClientValidationError('Upload checkpoint kayıp.');
        setBusyStep('transcribe');
        // Retry AYNI objectKey ile — ikinci upload ASLA (Codex P0).
        const tr = await transcribeLiveRecording(interviewId, receipt.objectKey);
        setCp({ phase: 'transcribed', receipt, transcriptKey: tr.transcriptKey });
        setBusyStep(null);
        onTranscribed(tr.transcriptKey);
        return;
      }
      setBusyStep(null);
    } catch (e) {
      setBusyStep(null);
      setError(describeError(e));
    }
  };

  const stepLabel: Record<Phase, string> = {
    idle: 'Yükle ve transkribe et',
    'consent-saved': 'Devam et — yükleme (rıza kaydedildi)',
    uploaded: 'Devam et — transkripsiyon (kayıt yüklendi; TEKRAR yüklenmez)',
    transcribed: 'Tamamlandı',
  };

  return (
    <section data-testid="live-consent-upload-panel" style={{ display: 'grid', gap: 12 }}>
      <Stack direction="column" gap={2}>
        <Text as="h2" size="lg" weight="semibold">
          Rıza + kayıt yükleme (F1/F2 — canlı)
        </Text>
        <Text as="p" size="sm" variant="secondary" data-testid="live-ingest-disclosure">
          Kayıt canlı /api/ats zincirine gider (rıza → yükleme → transkripsiyon; WORM
          kanıt-defteri). Aday referansı OPAK olmalı — PII girmeyin. Bu stage yüzeyi SENTETİK/test
          kayıtları içindir; gerçek aday verisi G0 kapısına bağlıdır (ATS-0016).
        </Text>
      </Stack>

      <label style={{ display: 'grid', gap: 4 }}>
        <Text as="span" size="sm">
          Aday referansı (opak — PII değil)
        </Text>
        <input
          value={subjectRef}
          onChange={(e) => setSubjectRef(e.target.value)}
          data-testid="live-consent-subject-input"
          disabled={busy || cp.phase !== 'idle'}
          placeholder="örn. sub-2026-0042"
        />
      </label>

      <label style={{ display: 'grid', gap: 4 }}>
        <Text as="span" size="sm">
          Açık rıza durumu
        </Text>
        <select
          value={consent}
          onChange={(e) => handleConsentChange(e.target.value as ConsentState | '')}
          data-testid="live-consent-state-select"
          disabled={busy || cp.phase !== 'idle'}
        >
          <option value="">Seçin…</option>
          <option value="GRANTED">GRANTED — açık rıza verildi</option>
          <option value="DENIED">DENIED — rıza yok</option>
          <option value="WITHDRAWN">WITHDRAWN — geri çekildi</option>
        </select>
      </label>

      <label style={{ display: 'grid', gap: 4 }}>
        <Text as="span" size="sm">
          Ses kaydı (audio/*, en çok {Math.floor(MAX_UPLOAD_BYTES / 1024 / 1024)} MiB)
        </Text>
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*"
          data-testid="live-recording-file-input"
          disabled={busy || consent !== 'GRANTED' || cp.phase === 'uploaded'}
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
      </label>

      {consent !== 'GRANTED' && (
        <Text as="p" size="sm" variant="secondary" data-testid="live-consent-gate-note">
          RIZA-KAPISI fail-closed: GRANTED rıza backend'e kaydedilmeden yükleme başlamaz.
        </Text>
      )}

      {cp.phase !== 'idle' && cp.phase !== 'transcribed' && (
        <Badge variant="info" data-testid="live-chain-checkpoint">
          {cp.phase === 'consent-saved'
            ? 'Checkpoint: rıza kaydedildi — yükleme bekliyor'
            : `Checkpoint: yüklendi (${cp.receipt?.evidenceId}) — transkripsiyon bekliyor`}
        </Badge>
      )}

      {error && (
        <Stack direction="column" gap={1} data-testid="live-ingest-error">
          <Badge variant="error">Zincir hatası</Badge>
          <Text as="p" size="sm">
            {error}
          </Text>
        </Stack>
      )}

      {cp.phase === 'transcribed' ? (
        <Stack direction="column" gap={2} data-testid="live-ingest-done">
          <Badge variant="success">
            Transkript üretildi: <code>{cp.transcriptKey}</code>
          </Badge>
          <div>
            <Button variant="ghost" onClick={resetChain} data-testid="live-ingest-new">
              Yeni kayıt yükle
            </Button>
          </div>
        </Stack>
      ) : (
        <div>
          <Button
            variant="primary"
            data-testid="live-chain-run-button"
            disabled={cp.phase === 'idle' ? !canStart : busy}
            onClick={runChain}
          >
            {busy
              ? busyStep === 'consent'
                ? 'Rıza kaydediliyor…'
                : busyStep === 'upload'
                  ? 'Yükleniyor…'
                  : 'Transkribe ediliyor…'
              : stepLabel[cp.phase]}
          </Button>
        </div>
      )}
    </section>
  );
}
