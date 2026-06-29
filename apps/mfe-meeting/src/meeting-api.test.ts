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
          policyActions: [
            {
              kind: 'export',
              state: 'preview',
              label: 'Dışa aktar',
              detail: 'Ön inceleme',
              requirement: 'Audit ready',
              auditTag: 'MEETING_EXPORT_PREVIEW',
            },
          ],
        },
      ],
    });

    expect(records).toHaveLength(1);
    expect(records[0]?.summary.citations[0]?.segmentId).toBe('seg-api-1');
    expect(records[0]?.gates[0]?.state).toBe('pass');
    expect(records[0]?.policyActions[0]).toMatchObject({
      kind: 'export',
      state: 'preview',
      auditTag: 'MEETING_EXPORT_PREVIEW',
    });
    expect(records[0]?.policyActions.map((action) => action.kind).sort()).toEqual([
      'delete',
      'export',
      'share',
    ]);
    expect(records[0]?.policyActions.find((action) => action.kind === 'share')).toMatchObject({
      state: 'pending',
      auditTag: 'MEETING_SHARE_REQUESTED',
    });
  });

  it('defaults missing policy actions to pending non-mutating states', () => {
    const records = normalizeWorkbenchPayload([
      {
        id: 'api-meeting-2',
        title: 'Policy fallback',
        organizer: 'Platform',
        startsAt: '2026-06-29T08:00:00+03:00',
        durationMinutes: 15,
        status: 'ready',
        language: 'tr',
        source: 'web',
        transcriptFeed: { state: 'recorded', label: 'API', detail: 'endpoint' },
        transcript: [],
        summary: 'Policy bekliyor.',
        decisions: [],
        actions: [],
        gates: [],
      },
    ]);

    expect(records[0]?.policyActions.map((action) => [action.kind, action.state])).toEqual([
      ['export', 'pending'],
      ['share', 'pending'],
      ['delete', 'pending'],
    ]);
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
