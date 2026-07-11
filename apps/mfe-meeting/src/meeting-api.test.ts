import { describe, expect, it, vi } from 'vitest';

import {
  createDemoWorkbenchData,
  loadMeetingDetail,
  loadMeetingWorkbenchData,
  normalizeWorkbenchPayload,
} from './meeting-api';
import type { MeetingRecord } from './meeting-workbench';
import type { MeetingShellServices } from './shell-services';

function createServices(get: ReturnType<typeof vi.fn>): MeetingShellServices {
  return {
    http: { get } as unknown as MeetingShellServices['http'],
    auth: {
      getToken: () => 'redacted-token',
      ready: () => Promise.resolve({ ok: true }),
      getEpoch: () => 1,
    },
  };
}

const canonicalMeeting = {
  id: '2e5e58c6-1ac8-4d94-a493-48ae85d7207a',
  title: 'Canonical toplantı',
  description: 'Gerçek toplantı açıklaması',
  status: 'COMPLETED',
  scheduledStart: '2026-07-11T08:00:00Z',
  scheduledEnd: '2026-07-11T08:30:00Z',
  organizerSubject: 'user-1',
  createdAt: '2026-07-11T07:00:00Z',
};

describe('meeting canonical API boundary', () => {
  it('uses demo records only when demo mode is explicitly requested', async () => {
    const data = await loadMeetingWorkbenchData({ endpoint: null });

    expect(data.source.mode).toBe('demo');
    expect(data.records).toEqual(createDemoWorkbenchData(data.source.checkedAt).records);
  });

  it('normalizes the canonical meeting-service page without fabricating outputs', () => {
    const records = normalizeWorkbenchPayload({
      content: [canonicalMeeting],
      page: 0,
      size: 50,
      totalElements: 1,
      totalPages: 1,
    });

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      id: canonicalMeeting.id,
      status: 'ready',
      durationMinutes: 30,
      summary: {
        text: 'Gerçek toplantı açıklaması',
        kind: 'canonical-description',
        citations: [],
      },
      decisions: [],
      actions: [],
    });
    expect(records[0]?.gates).toContainEqual({
      id: 'grounded-summary',
      label: 'Kaynaklı özet',
      state: 'pending',
    });
  });

  it('waits for auth and reads the canonical list through shell HTTP', async () => {
    const get = vi.fn().mockResolvedValue({ data: { content: [canonicalMeeting] } });
    const services = createServices(get);

    const data = await loadMeetingWorkbenchData({ services });

    expect(get).toHaveBeenCalledWith(
      '/v1/admin/meetings?page=0&size=50',
      expect.objectContaining({ headers: { Accept: 'application/json' } }),
    );
    expect(data.source.mode).toBe('api');
    expect(data.records[0]?.id).toBe(canonicalMeeting.id);
  });

  it('fails closed without demo fallback when canonical list is unavailable', async () => {
    const get = vi.fn().mockRejectedValue(new Error('network'));
    const data = await loadMeetingWorkbenchData({ services: createServices(get) });

    expect(data.source.mode).toBe('api-error');
    expect(data.records).toEqual([]);
    expect(data.source.detail).toMatch(/demo veriye geçilmedi/i);
  });

  it('surfaces unauthorized auth readiness without issuing a request', async () => {
    const get = vi.fn();
    const services = createServices(get);
    services.auth.ready = () => Promise.resolve({ ok: false, reason: 'unauthenticated' });

    const data = await loadMeetingWorkbenchData({ services });

    expect(get).not.toHaveBeenCalled();
    expect(data.source.mode).toBe('unauthorized');
    expect(data.records).toEqual([]);
  });

  it('hydrates only the selected meeting and keeps a failed transcript source visible', async () => {
    const base = normalizeWorkbenchPayload({ content: [canonicalMeeting] })[0] as MeetingRecord;
    const get = vi.fn((url: string) => {
      if (url.endsWith('/sessions')) return Promise.resolve({ data: [{ id: 'session-1' }] });
      if (url.endsWith('/actions')) {
        return Promise.resolve({
          data: [
            {
              id: 'action-1',
              description: 'Müşteri dönüşünü yap',
              assigneeSubject: 'user-2',
              status: 'OPEN',
              dueAt: '2026-07-12T08:00:00Z',
            },
          ],
        });
      }
      if (url.endsWith('/decisions')) {
        return Promise.resolve({
          data: [
            {
              id: 'decision-1',
              title: 'Pilot',
              detail: 'Genel amaçlı kalacak',
              decidedBySubject: 'user-1',
            },
          ],
        });
      }
      return Promise.reject({ response: { status: 403 } });
    });

    const detail = await loadMeetingDetail(base, { services: createServices(get) });

    expect(detail.detail?.state).toBe('partial');
    expect(detail.actions[0]?.label).toBe('Müşteri dönüşünü yap');
    expect(detail.decisions[0]?.label).toBe('Pilot: Genel amaçlı kalacak');
    expect(detail.transcript).toEqual([]);
    expect(detail.gates).toContainEqual({
      id: 'canonical-transcript',
      label: 'Canonical transcript',
      state: 'blocked',
    });
  });

  it('continues transcript pagination instead of silently dropping later segments', async () => {
    const base = normalizeWorkbenchPayload({ content: [canonicalMeeting] })[0] as MeetingRecord;
    const get = vi.fn((url: string) => {
      if (url.endsWith('/sessions') || url.endsWith('/actions') || url.endsWith('/decisions')) {
        return Promise.resolve({ data: [] });
      }
      if (url.includes('page=0')) {
        return Promise.resolve({
          data: {
            content: [
              {
                id: 'segment-1',
                startTime: 1.5,
                textDraft: 'Birinci segment',
                status: 'DRAFT',
              },
            ],
            totalElements: 201,
            page: 0,
            size: 200,
          },
        });
      }
      return Promise.resolve({
        data: {
          content: [
            {
              id: 'segment-201',
              startTime: 601.25,
              textFinal: 'Son segment',
              status: 'FINALIZED',
            },
          ],
          totalElements: 201,
          page: 1,
          size: 200,
        },
      });
    });

    const detail = await loadMeetingDetail(base, { services: createServices(get) });

    expect(get).toHaveBeenCalledWith(expect.stringContaining('page=1&size=200'));
    expect(detail.transcript.map((segment) => segment.text)).toEqual([
      'Birinci segment',
      'Son segment',
    ]);
    expect(detail.transcript[0]?.startedAtMs).toBe(1500);
    expect(detail.detail?.state).toBe('ready');
  });
});
