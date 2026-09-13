import type { TranscriptSegment } from './meeting-workbench';

export function sessionTimeOrigin(startedAt: string | undefined): number | null {
  // Canonical session timestamps are Instants; never interpret a timezone-less local date.
  if (!startedAt || !/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(startedAt)) return null;
  const origin = Date.parse(startedAt);
  return Number.isFinite(origin) ? origin : null;
}

export function formatTranscriptOffset(
  segment: Pick<TranscriptSegment, 'startedAtMs' | 'timeOriginMs'>,
): string {
  if (segment.timeOriginMs === null) return '--:--';
  const offset = segment.startedAtMs - (segment.timeOriginMs ?? 0);
  if (!Number.isFinite(offset) || offset < 0) return '--:--';
  const seconds = Math.floor(offset / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}
