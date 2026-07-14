import { useId, useState } from 'react';
import { Badge, Button, Input, Select, Text } from '@mfe/design-system';
import * as engine from './demoIngestEngine';
import type { ConsentState, IngestReceipt } from './types';

/**
 * F1/F2 ürün yüzeyi: rıza kaydı + kayıt yükleme — standalone ATS panelinin
 * platform-web portu (design-system reuse; veri demo motor, ATS-0016 sınırı;
 * 39d'de `/api/ats`).
 * - Açık-rıza UX'i: ÖN-SEÇİLİ durum YOK — kullanıcı aktif seçim yapmadan beyan
 *   kaydedilemez (KVKK açık-rıza ilkesi).
 * - subjectRef OPAK ref (UI "PII girmeyin" der).
 * - RIZA-KAPISI fail-closed: GRANTED değilse yükleme motor tarafından reddedilir;
 *   UI reddi yalnız gösterir, bypass edemez.
 * - Makbuz pointer-only; transcribe idempotent + UI kilidi.
 */
const CONSENT_OPTIONS: { value: ConsentState; label: string }[] = [
  { value: 'GRANTED', label: 'Rıza VERİLDİ (kayıt işlenebilir)' },
  { value: 'DENIED', label: 'Rıza REDDEDİLDİ (yükleme reddedilir)' },
  { value: 'WITHDRAWN', label: 'Rıza GERİ ÇEKİLDİ (yükleme reddedilir)' },
];

export function ConsentRecordingPanel({
  onTranscribed,
}: {
  /**
   * Transkript üretildiğinde tetiklenir (39c-7 F-liste bağlama: App yeni
   * transkripti kayıt-defterine ekler). Pointer-only veri taşır (PII yok).
   */
  onTranscribed?: (transcriptKey: string, evidenceId: string) => void;
} = {}) {
  const consentStateId = useId();
  const [subjectRef, setSubjectRef] = useState('');
  const [state, setState] = useState<ConsentState | ''>('');
  const [savedState, setSavedState] = useState<ConsentState | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [receipt, setReceipt] = useState<IngestReceipt | null>(null);
  const [transcribedKey, setTranscribedKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(step: () => void | Promise<void>) {
    setError(null);
    try {
      await step();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Beklenmeyen hata.');
    }
  }

  /**
   * Yükleme kimliği = dosya BAYTLARININ SHA-256'sı (dosya adı anahtara girmez —
   * PII hijyeni). Baytlar mevcut realm'e Uint8Array olarak KOPYALANIR: jsdom
   * testinde File.arrayBuffer() farklı realm'den döner ve webcrypto brand-check'i
   * reddeder ("not instance of ArrayBuffer"); TypedArray kopyası her ortamda
   * geçerli WebCrypto girdisidir (tarayıcı davranışı değişmez).
   */
  async function sha256Hex(f: File): Promise<string> {
    const bytes = Uint8Array.from(new Uint8Array(await f.arrayBuffer()));
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  return (
    <section
      aria-label="Rıza ve kayıt yükleme"
      data-testid="consent-recording-panel"
      style={{ ...REFLOW_GRID_STYLE, gap: 12, maxWidth: 560, width: '100%' }}
    >
      <Text as="h2" size="lg" weight="semibold">
        Rıza ve kayıt yükleme (F1/F2)
      </Text>

      {/* Aydınlatma — beyan kaydından ÖNCE görünür (KVKK m.10) */}
      <div data-testid="consent-disclosure" style={{ ...REFLOW_GRID_STYLE, gap: 4 }}>
        <Text as="p" size="sm">
          Görüşme kaydı yalnız açık rıza VERİLDİYSE işlenir; rıza her an geri çekilebilir. Yapay
          zeka yalnız kanıt/alıntı çıkarımında yardımcıdır; kararı insan verir.
        </Text>
        <Text as="p" size="sm" variant="secondary">
          Bu ekran, operatörün görüşme ÖNCESİNDE usulünce alınmış rıza beyanını sisteme kaydettiği
          ekrandır — rıza burada üretilmez. Kişi referansı OPAK bir ref'tir; bu alana ad/e-posta
          gibi PII girmeyin.
        </Text>
        <Text as="p" size="sm" variant="secondary">
          Bu özet KVKK m.10 aydınlatmasının yerine geçmez — tam aydınlatma metni (sürüm ref:
          aydinlatma-v1) süreç sahibince adaya iletilir.
        </Text>
      </div>

      <div style={{ ...REFLOW_GRID_STYLE, gap: 8 }}>
        <Input
          label="Kişi referansı (opak ref — PII girmeyin)"
          value={subjectRef}
          onChange={(e) => setSubjectRef(e.target.value)}
          data-testid="consent-subject-input"
        />
        <div style={{ ...REFLOW_GRID_STYLE, gap: 4 }}>
          <label htmlFor={consentStateId}>
            <Text as="span" size="sm" weight="medium">
              Rıza durumu
            </Text>
          </label>
          <Select
            id={consentStateId}
            options={CONSENT_OPTIONS}
            placeholder="Durum seçin (ön-seçili yok — açık rıza)"
            value={state}
            onChange={(e) => setState(e.target.value as ConsentState | '')}
            data-testid="consent-state-select"
          />
        </div>
        <Text as="p" size="sm" variant="secondary" data-testid="consent-gate-note">
          Rıza-kapısı fail-closed: durum GRANTED değilse yükleme reddedilir; bu ekran kapıyı aşamaz.
        </Text>

        <Button
          disabled={!subjectRef.trim() || !state}
          data-testid="consent-save-button"
          onClick={() =>
            run(() => {
              if (!state) return;
              engine.putConsent(subjectRef, state);
              setSavedState(state);
            })
          }
        >
          Rıza beyanını kaydet
        </Button>

        {savedState && (
          <div
            style={{ display: 'flex', gap: 8, alignItems: 'center' }}
            data-testid="consent-saved"
          >
            <Badge variant={savedState === 'GRANTED' ? 'success' : 'warning'}>
              Beyan kaydedildi
            </Badge>
            <Text as="span" size="sm">
              {savedState}
            </Text>
          </div>
        )}
      </div>

      <div style={{ ...REFLOW_GRID_STYLE, gap: 8 }}>
        <Text as="h3" size="base" weight="semibold">
          Görüşme kaydını yükle
        </Text>
        <label style={{ ...REFLOW_GRID_STYLE, gap: 4, fontSize: 14 }}>
          Kayıt dosyası (kapalı allowlist: wav/mpeg/mp4/webm ses + mp4/webm video)
          <input
            type="file"
            accept="audio/wav,audio/mpeg,audio/mp4,audio/webm,video/mp4,video/webm"
            data-testid="upload-file-input"
            style={{ width: '100%', minWidth: 0, maxWidth: '100%' }}
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setReceipt(null);
              setTranscribedKey(null);
            }}
          />
        </label>
        {file && (
          <Text as="p" size="sm" data-testid="upload-file-info">
            {file.name} · {file.size} bayt
          </Text>
        )}
        <Button
          disabled={!file}
          data-testid="upload-button"
          onClick={() =>
            void run(async () => {
              if (!file) return;
              // Kapı ÖNCE (fail-fast): rıza kapalıyken hash hesaplanmaz; hata
              // metni kapı gerçeğini söyler (crypto ortam farklarından bağımsız).
              engine.assertUploadAllowed();
              const contentHash = await sha256Hex(file);
              setReceipt(engine.uploadRecording(contentHash, file.type, file.size));
            })
          }
        >
          Kaydı yükle
        </Button>

        {receipt && (
          <div data-testid="upload-receipt" style={{ ...REFLOW_GRID_STYLE, gap: 4 }}>
            <Badge variant="success">Yükleme makbuzu alındı</Badge>
            <Text as="p" size="sm">
              Kanıt: <code>{receipt.evidenceId}</code> · defter sırası {receipt.ledgerSequence}{' '}
              (pointer-only)
            </Text>
            {!transcribedKey && (
              <Button
                data-testid="transcribe-button"
                onClick={() =>
                  run(() => {
                    const { transcriptKey } = engine.transcribeRecording(receipt.objectKey);
                    setTranscribedKey(transcriptKey);
                    onTranscribed?.(transcriptKey, receipt.evidenceId);
                  })
                }
              >
                Transkript üret
              </Button>
            )}
            {transcribedKey && (
              <Badge variant="success" data-testid="transcribed-badge">
                Transkript üretildi: {transcribedKey}
              </Badge>
            )}
          </div>
        )}
      </div>

      {error && (
        <Text as="p" variant="error" role="alert" data-testid="ingest-error">
          {error}
        </Text>
      )}
    </section>
  );
}

const REFLOW_GRID_STYLE = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr)',
  minWidth: 0,
} as const;
