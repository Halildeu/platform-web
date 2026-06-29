import { describe, expect, it } from 'vitest';

import {
  computeStats,
  filterMeetings,
  findSelectedMeeting,
  gateStateLabel,
  meetings,
  orderTranscriptSegments,
  segmentStatusLabel,
  sourceLabel,
} from './meeting-workbench';

describe('meeting workbench domain', () => {
  it('computes product workbench stats from the available meeting records', () => {
    expect(computeStats(meetings)).toEqual({
      total: 3,
      live: 1,
      blocked: 1,
      openActions: 4,
    });
  });

  it('filters meetings by status and Turkish lowercase query', () => {
    expect(filterMeetings(meetings, { query: 'direct', status: 'blocked' })).toHaveLength(1);
    expect(filterMeetings(meetings, { query: 'müşteri', status: 'all' })[0]?.id).toBe(
      'mtg-demo-readout',
    );
    expect(filterMeetings(meetings, { query: 'olmayan', status: 'all' })).toEqual([]);
  });

  it('orders transcript segments by timestamp and keeps stronger status first on ties', () => {
    const ordered = orderTranscriptSegments([
      {
        id: 'draft',
        speaker: 'A',
        startedAtMs: 1000,
        status: 'draft',
        text: 'draft',
      },
      {
        id: 'final',
        speaker: 'A',
        startedAtMs: 1000,
        status: 'final',
        text: 'final',
      },
      {
        id: 'earlier',
        speaker: 'B',
        startedAtMs: 500,
        status: 'revised',
        text: 'earlier',
      },
    ]);

    expect(ordered.map((segment) => segment.id)).toEqual(['earlier', 'final', 'draft']);
  });

  it('falls back to the first visible meeting when selected id is not present', () => {
    expect(findSelectedMeeting(meetings, 'missing')?.id).toBe(meetings[0]?.id);
    expect(findSelectedMeeting([], 'missing')).toBeNull();
  });

  it('returns Turkish labels for transcript and gate states', () => {
    expect(segmentStatusLabel('stabilizing')).toBe('Netleşiyor');
    expect(gateStateLabel('blocked')).toBe('Blokeli');
    expect(sourceLabel('calendar')).toBe('Takvim');
    expect(meetings.find((meeting) => meeting.id === 'mtg-direct-stt')?.transcriptFeed.state).toBe(
      'blocked',
    );
  });
});
