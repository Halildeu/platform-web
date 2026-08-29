/**
 * Faz 24 Görevler dilim-1 (gitops#3487) — meeting-service action (task) API.
 *
 * Talks to the canonical admin surface:
 *   GET/POST  /v1/admin/meetings/{meetingId}/actions
 *   PUT       /v1/admin/meetings/{meetingId}/actions/{actionId}
 * plus the user directory for assignee lookup: GET /v1/users?search=…
 *
 * Deliberately mirrors meeting-api.ts conventions: shell-injected axios
 * instance, defensive response mapping, no react-query.
 */

import { getShellServices } from './shell-services';

export type MeetingTaskStatus = 'OPEN' | 'IN_PROGRESS' | 'DONE' | 'CANCELLED';

export const TASK_STATUS_LABELS: Record<MeetingTaskStatus, string> = {
  OPEN: 'Açık',
  IN_PROGRESS: 'Devam ediyor',
  DONE: 'Tamamlandı',
  CANCELLED: 'İptal',
};

/** AI-produced rows carry this creator subject (backend AI_SUBJECT). */
export const AI_CREATOR_SUBJECT = 'system:meeting-ai';

export interface MeetingTask {
  id: string;
  meetingId: string;
  description: string;
  assigneeSubject: string | null;
  status: MeetingTaskStatus;
  dueAt: string | null;
  createdBySubject: string;
  createdAt: string;
  lastUpdatedBySubject: string;
  updatedAt: string;
  version: number;
}

export interface MeetingTaskUpdate {
  description: string;
  assigneeSubject: string | null;
  status: MeetingTaskStatus;
  dueAt: string | null;
  expectedVersion: number;
}

export interface UserOption {
  subject: string;
  label: string;
}

const ACTIONS_ENDPOINT = (meetingId: string) =>
  `/v1/admin/meetings/${encodeURIComponent(meetingId)}/actions`;

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const str = (record: UnknownRecord, key: string): string | null => {
  const value = record[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
};

const toTask = (raw: unknown): MeetingTask | null => {
  if (!isRecord(raw)) return null;
  const id = str(raw, 'id');
  const meetingId = str(raw, 'meetingId');
  const description = str(raw, 'description');
  const status = str(raw, 'status') as MeetingTaskStatus | null;
  if (!id || !meetingId || !description || !status) return null;
  return {
    id,
    meetingId,
    description,
    assigneeSubject: str(raw, 'assigneeSubject'),
    status,
    dueAt: str(raw, 'dueAt'),
    createdBySubject: str(raw, 'createdBySubject') ?? '',
    createdAt: str(raw, 'createdAt') ?? '',
    lastUpdatedBySubject: str(raw, 'lastUpdatedBySubject') ?? '',
    updatedAt: str(raw, 'updatedAt') ?? '',
    version: typeof raw.version === 'number' ? raw.version : 0,
  };
};

export async function listMeetingTasks(meetingId: string): Promise<MeetingTask[]> {
  const { http } = getShellServices();
  const response = await http.get(ACTIONS_ENDPOINT(meetingId));
  const body: unknown = response.data;
  if (!Array.isArray(body)) return [];
  return body.map(toTask).filter((t): t is MeetingTask => t !== null);
}

export async function createMeetingTask(
  meetingId: string,
  input: { description: string; assigneeSubject?: string | null; dueAt?: string | null },
): Promise<MeetingTask | null> {
  const { http } = getShellServices();
  const response = await http.post(ACTIONS_ENDPOINT(meetingId), {
    description: input.description,
    assigneeSubject: input.assigneeSubject ?? null,
    dueAt: input.dueAt ?? null,
  });
  return toTask(response.data);
}

export async function updateMeetingTask(
  meetingId: string,
  taskId: string,
  body: MeetingTaskUpdate,
): Promise<MeetingTask | null> {
  const { http } = getShellServices();
  const response = await http.put(
    `${ACTIONS_ENDPOINT(meetingId)}/${encodeURIComponent(taskId)}`,
    body,
  );
  return toTask(response.data);
}

/**
 * Assignee lookup against the user directory (same source mfe-access uses).
 * The stored value is the user's canonical subject so the assignee's own
 * "Görevlerim" view (JWT sub match) lights up; label is for humans.
 */
export async function searchAssignees(query: string): Promise<UserOption[]> {
  const { http } = getShellServices();
  const response = await http.get('/v1/users', {
    params: { search: query, pageSize: 10 },
  });
  const body: unknown = response.data;
  const rows: unknown[] = Array.isArray(body)
    ? body
    : isRecord(body) && Array.isArray(body.items)
      ? body.items
      : isRecord(body) && Array.isArray(body.content)
        ? body.content
        : [];
  const options: UserOption[] = [];
  for (const raw of rows) {
    if (!isRecord(raw)) continue;
    const subject =
      str(raw, 'kcSubject') ?? str(raw, 'subject') ?? str(raw, 'keycloakId') ?? str(raw, 'id');
    if (!subject) continue;
    const name = str(raw, 'displayName') ?? str(raw, 'fullName') ?? str(raw, 'name') ?? null;
    const email = str(raw, 'email');
    const label = name && email ? `${name} (${email})` : (name ?? email ?? subject);
    options.push({ subject, label });
  }
  return options;
}

/** Cross-meeting "Görevlerim" row (gitops#3494) — MeetingTask + owning title. */
export interface MyTask extends MeetingTask {
  meetingTitle: string;
}

const toMyTask = (raw: unknown): MyTask | null => {
  const base = toTask(raw);
  if (!base || !isRecord(raw)) return null;
  return { ...base, meetingTitle: str(raw, 'meetingTitle') ?? '' };
};

/**
 * Caller's own tasks across meetings. No filter → backend's ACTIVE set
 * (OPEN+IN_PROGRESS); pass statuses to widen (e.g. ['DONE']).
 */
export async function listMyTasks(statuses?: MeetingTaskStatus[]): Promise<MyTask[]> {
  const { http } = getShellServices();
  const params = new URLSearchParams();
  for (const s of statuses ?? []) params.append('status', s);
  const qs = params.toString();
  const response = await http.get(`/v1/admin/my/actions${qs ? `?${qs}` : ''}`);
  const body: unknown = response.data;
  if (!Array.isArray(body)) return [];
  return body.map(toMyTask).filter((t): t is MyTask => t !== null);
}
