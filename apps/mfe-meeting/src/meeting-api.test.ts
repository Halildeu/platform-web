import { describe, expect, it, vi } from 'vitest';

import {
  createDemoWorkbenchData,
  loadMeetingWorkbenchData,
  normalizeWorkbenchPayload,
} from './meeting-api';

describe('meeting workbench API boundary', () => {
  it('returns clearly labeled demo data when no endpoint is configured', async () => {
    const data = await loadMeetingWorkbenchData({ endpoint: null });

    expect(data.source.mode).toBe('demo');
    expect(data.source.label).toBe('Demo veri');
    expect(data.records.length).toBeGreaterThan(0);
  });

  it('normalizes API payloads while preserving citation metadata', () => {
    const records = normalizeWorkbenchPayload({
      meetings: [
        {
          id: 'api-meeting-1',
          title: 'API toplantısı',
          organizer: 'Platform',
          startsAt: '2026-06-29T08:00:00+03:00',
          durationMinutes: 15,
          status: 'ready',
          language: 'tr',
          source: 'web',
          transcriptFeed: { state: 'recorded', label: 'API', detail: 'endpoint' },
          transcript: [
            {
              id: 'seg-api-1',
              speaker: 'Product',
              startedAtMs: 0,
              status: 'final',
              text: 'Karar kaynaklı biçimde gösterilecek.',
            },
          ],
          summary: {
            text: 'Kaynaklı API özeti.',
            confidence: 0.92,
            citations: [
              {
                segmentId: 'seg-api-1',
                quote: 'Karar kaynaklı biçimde gösterilecek.',
                confidence: 'high',
              },
            ],
          },
          decisions: [],
          actions: [],
          gates: [{ id: 'gate-api', label: 'API contract', state: 'pass' }],
        },
      ],
    });

    expect(records).toHaveLength(1);
    expect(records[0]?.summary.citations[0]?.segmentId).toBe('seg-api-1');
    expect(records[0]?.gates[0]?.state).toBe('pass');
  });

  it('falls back visibly when the configured API endpoint cannot be read', async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new Error('network'));
    const data = await loadMeetingWorkbenchData({
      endpoint: '/api/v1/meeting-intelligence/workbench',
      fetcher,
      timeoutMs: 50,
    });

    expect(fetcher).toHaveBeenCalledWith(
      '/api/v1/meeting-intelligence/workbench',
      expect.objectContaining({
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      }),
    );
    expect(data.source.mode).toBe('api-fallback');
    expect(data.records).toEqual(createDemoWorkbenchData(data.source.checkedAt).records);
  });
});
