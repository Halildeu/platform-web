/** Faz 24 (gitops#3834) — the "Göreve ata" picker must tell a failed search apart from "no match". */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TasksPanel } from './TasksPanel';
import * as api from './meeting-tasks-api';

vi.mock('./meeting-tasks-api', async (importOriginal) => {
  // Partial mock: keep the domain constants (status labels, AI subject) real.
  const actual = await importOriginal<typeof import('./meeting-tasks-api')>();
  return {
    ...actual,
    listMeetingTasks: vi.fn(),
    searchAssignees: vi.fn(),
    updateMeetingTask: vi.fn(),
    createMeetingTask: vi.fn(),
  };
});

const TASK: api.MeetingTask = {
  id: 't1',
  meetingId: 'm1',
  description: 'Bütçe tablosunu kontrol et',
  assigneeSubject: null,
  assigneeDisplayName: null,
  status: 'OPEN',
  dueAt: null,
  createdBySubject: 'system:meeting-ai',
  createdAt: '2026-09-23T10:00:00Z',
  lastUpdatedBySubject: 'system:meeting-ai',
  updatedAt: '2026-09-23T10:00:00Z',
  version: 0,
};

async function openPickerAndType(text: string): Promise<void> {
  render(<TasksPanel meetingId="m1" />);
  fireEvent.click(await screen.findByRole('button', { name: 'Ata' }));
  fireEvent.change(screen.getByLabelText('Sorumlu ara'), { target: { value: text } });
}

describe('TasksPanel assignee picker', () => {
  beforeEach(() => {
    vi.mocked(api.listMeetingTasks).mockResolvedValue([TASK]);
  });

  it('searches through the meeting it belongs to and lists the people found', async () => {
    vi.mocked(api.searchAssignees).mockResolvedValue([{ userId: 7, label: 'Sevil Kaya (sevil.kaya@acik.com)' }]);
    await openPickerAndType('sevil');
    expect(await screen.findByRole('button', { name: 'Sevil Kaya (sevil.kaya@acik.com)' })).toBeInTheDocument();
    expect(api.searchAssignees).toHaveBeenCalledWith('m1', 'sevil');
  });

  it('shows a failed search as an error, not as "sonuç yok"', async () => {
    vi.mocked(api.searchAssignees).mockRejectedValue({ response: { status: 403 } });
    await openPickerAndType('sevil');
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Kişi araması yapılamadı: Bu işlem için yetkiniz yok.');
    await waitFor(() => expect(screen.queryByText('sonuç yok')).not.toBeInTheDocument());
  });

  it('shows who a task is assigned to by name, never as a raw account id', async () => {
    vi.mocked(api.listMeetingTasks).mockResolvedValue([
      { ...TASK, id: 't2', assigneeSubject: 'kc-7', assigneeDisplayName: 'Sevil Kaya' },
      { ...TASK, id: 't3', assigneeSubject: 'kc-gone', assigneeDisplayName: null },
    ]);
    render(<TasksPanel meetingId="m1" />);
    expect(await screen.findByRole('button', { name: 'Sevil Kaya' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Atanmış kişi' })).toBeInTheDocument();
    expect(screen.queryByText('kc-7')).not.toBeInTheDocument();
    expect(screen.queryByText('kc-gone')).not.toBeInTheDocument();
  });
});
