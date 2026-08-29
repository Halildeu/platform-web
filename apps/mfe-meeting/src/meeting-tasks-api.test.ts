/** Faz 24 Görevler dilim-1/2 — tasks API defensive mapping (gitops#3494). */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { configureShellServices, type MeetingShellServices } from './shell-services';
import { listMeetingTasks, listMyTasks, searchAssignees } from './meeting-tasks-api';

function installHttp(get: ReturnType<typeof vi.fn>): void {
  configureShellServices({
    http: { get } as unknown as MeetingShellServices['http'],
  } as MeetingShellServices);
}

const TASK = {
  id: 't1',
  meetingId: 'm1',
  description: 'Raporu gönder',
  assigneeSubject: 'ali',
  status: 'OPEN',
  dueAt: '2026-08-30T12:00:00Z',
  createdBySubject: 'system:meeting-ai',
  createdAt: '2026-08-29T10:00:00Z',
  lastUpdatedBySubject: 'system:meeting-ai',
  updatedAt: '2026-08-29T10:00:00Z',
  version: 0,
};

describe('meeting-tasks-api', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('listMeetingTasks maps rows and drops malformed entries', async () => {
    const get = vi.fn().mockResolvedValue({
      data: [TASK, { id: 'broken' }, 'noise', null],
    });
    installHttp(get);
    const rows = await listMeetingTasks('m1');
    expect(get).toHaveBeenCalledWith('/v1/admin/meetings/m1/actions');
    expect(rows).toHaveLength(1);
    expect(rows[0].description).toBe('Raporu gönder');
  });

  it('listMyTasks carries meetingTitle and forwards repeatable status params', async () => {
    const get = vi.fn().mockResolvedValue({
      data: [{ ...TASK, meetingTitle: 'Bütçe toplantısı' }],
    });
    installHttp(get);
    const rows = await listMyTasks(['DONE', 'CANCELLED']);
    expect(get).toHaveBeenCalledWith('/v1/admin/my/actions?status=DONE&status=CANCELLED');
    expect(rows[0].meetingTitle).toBe('Bütçe toplantısı');
  });

  it('listMyTasks without filter hits the bare active endpoint', async () => {
    const get = vi.fn().mockResolvedValue({ data: [] });
    installHttp(get);
    await listMyTasks();
    expect(get).toHaveBeenCalledWith('/v1/admin/my/actions');
  });

  it('searchAssignees reads items/content shapes and prefers subject-ish ids', async () => {
    const get = vi.fn().mockResolvedValue({
      data: {
        items: [
          { kcSubject: 'kc-1', displayName: 'Ali Veli', email: 'ali@acik.com' },
          { id: 'fallback-id', email: 'zey@acik.com' },
          'noise',
        ],
      },
    });
    installHttp(get);
    const rows = await searchAssignees('ali');
    expect(rows).toEqual([
      { subject: 'kc-1', label: 'Ali Veli (ali@acik.com)' },
      { subject: 'fallback-id', label: 'zey@acik.com' },
    ]);
  });
});
