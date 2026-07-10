import { Badge, Button, Text } from '@mfe/design-system';
import type { TranscriptEntry } from './types';

/**
 * F-liste ürün yüzeyi: vaka/transkript liste-seçim — standalone ATS transcript
 * liste ekranının platform-web portu (design-system reuse; veri demo kayıt-defteri,
 * ATS-0016 sınırı; 39d'de `/api/ats`).
 * - Seçim tek-sayfa akışı bağlar: F3/F4-F5/F10 yüzeyleri SEÇİLİ transkripte açılır.
 * - Silinmiş girdi listeden DÜŞMEZ (denetim görünürlüğü): SİLİNDİ rozetiyle kalır,
 *   seçilirse içerik yerine silme makbuzu görünür.
 * - Etiketler pointer-only (PII yok): demo etiketi veya kanıt ref'i.
 */
export function TranscriptList({
  transcripts,
  selectedKey,
  onSelect,
}: {
  transcripts: TranscriptEntry[];
  selectedKey: string;
  onSelect: (transcriptKey: string) => void;
}) {
  return (
    <section
      aria-label="Vaka ve transkript listesi"
      data-testid="transcript-list-panel"
      style={{ display: 'grid', gap: 12 }}
    >
      <Text as="h2" size="lg" weight="semibold">
        Vakalar / Transkriptler
      </Text>
      <Text as="p" size="sm" variant="secondary">
        Bir transkript seçin; segmentler, inceleme çalışma alanı ve DSAR yüzeyi seçili transkripte
        bağlanır. Silinen transkript denetim için listede kalır.
      </Text>
      <ul
        data-testid="transcript-list"
        style={{ display: 'grid', gap: 6, listStyle: 'none', padding: 0, margin: 0 }}
      >
        {transcripts.map((t) => {
          const selected = t.transcriptKey === selectedKey;
          return (
            <li
              key={t.transcriptKey}
              style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}
            >
              <Button
                variant={selected ? 'primary' : 'ghost'}
                aria-pressed={selected}
                data-testid={`transcript-select-${t.transcriptKey}`}
                onClick={() => onSelect(t.transcriptKey)}
              >
                {t.label} — <code>{t.transcriptKey}</code>
              </Button>
              <Badge variant={t.origin === 'DEMO' ? 'muted' : 'info'}>
                {t.origin === 'DEMO' ? 'Demo' : 'Yükleme'}
              </Badge>
              {t.erasure && (
                <Badge variant="error" data-testid={`transcript-erased-${t.transcriptKey}`}>
                  SİLİNDİ
                </Badge>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
