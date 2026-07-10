import { useState } from 'react';
import { Badge, Button, Input, Text } from '@mfe/design-system';
import * as engine from './demoDsarEngine';
import type { ErasureReceipt } from './types';

/**
 * F10 DSAR/erasure paneli — standalone ATS panelinin platform-web portu
 * (design-system reuse; veri demo motor, ATS-0016 sınırı; 39d'de `/api/ats`).
 * İki adım: (1) DSAR intake (subjectRef OPAK — PII girilmez; kimlik eşlemesi
 * backend/operasyon tarafındadır), (2) silme — YIKICI ve geri alınamaz
 * olduğundan İKİ-ADIMLI onay (ilk tık uyarıyı açar, ikinci tık yürütür).
 * Kapsam DÜRÜSTÇE dar: yalnız görüntülenen demo transkript içeriği; WORM
 * tombstone ÜRETMEZ — silme privacy-event'leriyle kayıtlanır. Makbuz gösterimi
 * App'te (silme sonrası içerik yüzeyi — bu panel dahil — kaldırılır).
 */
export function DsarPanel({
  transcriptKey,
  onErased,
}: {
  transcriptKey: string;
  onErased: (receipt: ErasureReceipt) => void;
}) {
  const [subjectRef, setSubjectRef] = useState('');
  const [reasonCode, setReasonCode] = useState('');
  const [dsarKey, setDsarKey] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function run(step: () => void) {
    setError(null);
    try {
      step();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Beklenmeyen hata.');
    }
  }

  return (
    <section
      aria-label="Veri sahibi talebi (DSAR) ve silme"
      data-testid="dsar-panel"
      style={{ display: 'grid', gap: 12, maxWidth: 560 }}
    >
      <Text as="h2" size="lg" weight="semibold">
        Veri sahibi talebi — DSAR/silme (F10)
      </Text>
      <Text as="p" size="sm" variant="secondary">
        KVKK m.11 kapsamındaki silme talebi bu ekrandan alınır ve yürütülür. Kapsam dürüstçe dar:
        yalnız görüntülenen transkript içeriği; WORM defteri silinmez, silme privacy-event ile
        kayıtlanır.
      </Text>

      {!dsarKey && (
        <div style={{ display: 'grid', gap: 8 }}>
          <Input
            label="Kişi referansı (opak ref — PII girmeyin)"
            value={subjectRef}
            onChange={(e) => setSubjectRef(e.target.value)}
            data-testid="dsar-subject-input"
          />
          <Input
            label="Gerekçe kodu (denetim izi)"
            value={reasonCode}
            onChange={(e) => setReasonCode(e.target.value)}
            data-testid="dsar-reason-input"
          />
          <Button
            disabled={!subjectRef.trim() || !reasonCode.trim()}
            data-testid="dsar-receive-button"
            onClick={() => run(() => setDsarKey(engine.receiveDsar(subjectRef, reasonCode)))}
          >
            DSAR talebini kaydet
          </Button>
        </div>
      )}

      {dsarKey && (
        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Badge variant="info" data-testid="dsar-key-badge">
              Talep alındı
            </Badge>
            <Text as="span" size="sm" data-testid="dsar-key">
              {dsarKey}
            </Text>
          </div>

          <Text as="p" size="sm" variant="secondary" data-testid="dsar-scope-note">
            Silme kapsamı: yalnız görüntülenen transkript ({transcriptKey}). Bu işlem geri alınamaz.
          </Text>
          {confirming && (
            <Text as="p" variant="warning" role="alert" data-testid="dsar-erase-warning">
              DİKKAT: içerik kalıcı silinecek ve bu sayfadaki içerik yüzeyleri kaldırılacak.
              Onaylıyorsanız düğmeye bir kez daha basın.
            </Text>
          )}
          <Button
            variant={confirming ? 'danger' : 'secondary'}
            data-testid="dsar-erase-button"
            onClick={() => {
              if (!confirming) {
                setConfirming(true);
                return;
              }
              run(() => {
                const receipt = engine.executeErasure(dsarKey, {
                  transcriptKeys: [transcriptKey],
                  citationKeys: [],
                  exportArtifactKeys: [],
                  reviewCaseKeys: [],
                  tombstoneTargetEvidenceIds: [],
                });
                setConfirming(false);
                onErased(receipt);
              });
            }}
          >
            {confirming ? 'Silmeyi ONAYLA (geri alınamaz)' : 'İçeriği sil'}
          </Button>
        </div>
      )}

      {error && (
        <Text as="p" variant="error" role="alert" data-testid="dsar-error">
          {error}
        </Text>
      )}
    </section>
  );
}
