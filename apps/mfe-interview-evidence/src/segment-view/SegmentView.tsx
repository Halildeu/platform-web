import { Badge, Text } from '@mfe/design-system';
import type { Segment } from './types';

/** ms → mm:ss (segment zaman-damgası). */
function fmtMs(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * F3: zaman-damgalı segment görünümü — `@mfe/design-system` primitifleriyle
 * (Badge + Text). Konuşmacılar DAİMA takma-ad (S1..Sn; ATS-0013 diarization:
 * sağlayıcıdan kimlik alınmaz, UI da üretmez). Renk literali YOK; ayraç semantik
 * token (`--border-subtle`) — platform lint (`semantic-theme/no-inline-color-literals`).
 */
export function SegmentView({ segments }: { segments: Segment[] }) {
  if (segments.length === 0) {
    return (
      <Text as="p" variant="muted">
        Bu transkriptte segment yok.
      </Text>
    );
  }
  return (
    <ol data-testid="segment-list" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
      {segments.map((seg) => (
        <li
          key={seg.index}
          data-testid={`segment-${seg.index}`}
          style={{
            display: 'flex',
            gap: '12px',
            alignItems: 'baseline',
            padding: '8px 4px',
            borderBottom: '1px solid var(--border-subtle)',
          }}
        >
          <Badge variant="default">{seg.speakerLabel}</Badge>
          <Text as="span" size="sm" variant="secondary">
            {fmtMs(seg.startMs)}–{fmtMs(seg.endMs)}
          </Text>
          <Text as="span">{seg.text}</Text>
        </li>
      ))}
    </ol>
  );
}
