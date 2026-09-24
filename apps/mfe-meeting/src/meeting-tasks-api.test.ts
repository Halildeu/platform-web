/** Faz 24 Görevler dilim-1/2 — tasks API defensive mapping (gitops#3494). */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { configureShellServices, type MeetingShellServices } from './shell-services';
import { listMeetingTasks, listMyTasks, searchAssignees } from './meeting-tasks-api';

function installHttp(get: ReturnType<typeof vi.fn>, post: ReturnType<typeof vi.fn> = vi.fn()): void {
  configureShellServices({
    http: { get, post } as unknown as MeetingShellServices['http'],
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

  it('listMeetingTasks carries the assignee name when the server sends one (gitops#3834)', async () => {
    const get = vi.fn().mockResolvedValue({
      data: [{ ...TASK, assigneeDisplayName: 'Ali Veli' }, { ...TASK, id: 't2' }],
    });
    installHttp(get);
    const rows = await listMeetingTasks('m1');
    expect(rows.map((r) => r.assigneeDisplayName)).toEqual(['Ali Veli', null]);
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

  it('searchAssignees asks the meeting-scoped picker with a POST body, never the admin user grid', async () => {
    // gitops#3834: GET /v1/users needs USER_READ and 403s for every non-admin.
    const get = vi.fn();
    const post = vi.fn().mockResolvedValue({
      data: {
        items: [
          { userId: 30, name: 'Ali Veli', email: 'ali@acik.com' },
          { userId: 31, email: 'zey@acik.com' },
          { id: 32, name: 'eski şekil, sayısal userId yok' },
          'noise',
        ],
      },
    });
    installHttp(get, post);
    const rows = await searchAssignees('m 1', 'ali');
    expect(post).toHaveBeenCalledWith('/v1/admin/meetings/m%201/assignee-candidates/search', {
      query: 'ali',
      limit: 10,
    });
    expect(get).not.toHaveBeenCalled();
    expect(rows).toEqual([
      { userId: 30, label: 'Ali Veli (ali@acik.com)' },
      { userId: 31, label: 'zey@acik.com' },
    ]);
  });

  it('searchAssignees lets a failed search reach the caller instead of returning "no match"', async () => {
    const post = vi.fn().mockRejectedValue({ response: { status: 403 } });
    installHttp(vi.fn(), post);
    await expect(searchAssignees('m1', 'ali')).rejects.toEqual({ response: { status: 403 } });
  });
});
