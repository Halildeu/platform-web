import { describe, expect, it, vi } from 'vitest';

import {
  createDemoWorkbenchData,
  describeMeetingDetailError,
  loadMeetingById,
  loadMeetingDetail,
  loadMeetingWorkbenchData,
  normalizeCanonicalIntelligenceResult,
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

const meetingId = '2e5e58c6-1ac8-4d94-a493-48ae85d7207a';
const analysisRunId = '7b87cc7e-aea4-47ce-b54f-b5d8ac195ef4';
const canonicalMeeting = {
  id: meetingId,
  title: 'Canonical toplantı',
  description: 'Gerçek toplantı açıklaması',
  status: 'COMPLETED',
  scheduledStart: '2026-07-11T08:00:00Z',
  scheduledEnd: '2026-07-11T08:30:00Z',
  organizerSubject: 'user-1',
  createdAt: '2026-07-11T07:00:00Z',
};

const sourceTexts = [
  'Müşteri pilotu onayladı.',
  'Pilot kapsamı genel amaçlı kalacak.',
  'Müşteri takibini yarın yap.',
];

function citation(claim: string, sourceIndex: number) {
  const sourceText = sourceTexts[sourceIndex] as string;
  return {
    claim,
    source_index: sourceIndex,
    source_text: sourceText,
    similarity: 0.94,
    grounded: true,
    status: 'PASSED',
    reason: '',
    start_sec: sourceIndex * 5,
    source_char_start: 0,
    source_char_end: sourceText.length,
    source_hash: 'a'.repeat(64),
    quote_hash: 'b'.repeat(64),
  };
}

function canonicalResult(overrides: Record<string, unknown> = {}) {
  const summary = 'Pilot onayı ve takip planı netleşti.';
  const decision = 'Pilot kapsamı genel amaçlı kalacak.';
  const action = 'Müşteri takibini yarın yap.';
  return {
    analysisRunId,
    meetingId,
    sessionId: 'session-1',
    schema_version: '5-adr0043',
    model: 'qwen2.5:7b',
    backend: 'ollama',
    promptVersion: 'ollama-v1',
    summary,
    summary_grounding_status: 'verified',
    summary_citations: [citation(summary, 0)],
    decisions: [decision],
    action_items: [{ text: action, owner: 'user-2', due_date: '2026-07-12T08:00:00Z' }],
    citations: [citation(decision, 1), citation(action, 2)],
    rejected_claims: [],
    ungrounded_count: 0,
    redacted: false,
    redaction_count: 0,
    generatedAt: '2026-07-11T09:00:00Z',
    persisted: true,
    storageMode: 'canonical',
    ...overrides,
  };
}

function transcriptPage(status = 'FINALIZED') {
  return {
    content: sourceTexts.map((text, index) => ({
      id: `segment-${index + 1}`,
      speakerId: `speaker-${index + 1}`,
      startTime: index * 5,
      textFinal: text,
      status,
    })),
    totalElements: sourceTexts.length,
    page: 0,
    size: 200,
  };
}

function baseMeeting(): MeetingRecord {
  return normalizeWorkbenchPayload({ content: [canonicalMeeting] })[0] as MeetingRecord;
}

describe('meeting canonical API boundary', () => {
  it('uses demo records only when demo mode is explicitly requested', async () => {
    const data = await loadMeetingWorkbenchData({ endpoint: null });

    expect(data.source.mode).toBe('demo');
    expect(data.records).toEqual(createDemoWorkbenchData(data.source.checkedAt).records);
  });

  it('normalizes completed meetings as processing until a canonical result is read', () => {
    const records = normalizeWorkbenchPayload({ content: [canonicalMeeting] });

    expect(records[0]).toMatchObject({
      id: meetingId,
      status: 'processing',
      durationMinutes: 30,
      intelligence: { state: 'pending', persisted: false },
      summary: {
        text: 'Gerçek toplantı açıklaması',
        kind: 'canonical-description',
        citations: [],
      },
      decisions: [],
      actions: [],
    });
  });

  it('waits for auth and reads list and deep-link records through canonical meeting endpoints', async () => {
    const get = vi.fn((url: string) =>
      Promise.resolve({
        data: url.includes('?page=') ? { content: [canonicalMeeting] } : canonicalMeeting,
      }),
    );
    const services = createServices(get);

    const data = await loadMeetingWorkbenchData({ services });
    const direct = await loadMeetingById(meetingId, { services });

    expect(get).toHaveBeenCalledWith(
      '/v1/admin/meetings?page=0&size=50',
      expect.objectContaining({ headers: { Accept: 'application/json' } }),
    );
    expect(get).toHaveBeenCalledWith(
      `/v1/admin/meetings/${meetingId}`,
      expect.objectContaining({ headers: { Accept: 'application/json' } }),
    );
    expect(data.source.mode).toBe('api');
    expect(direct.id).toBe(meetingId);
  });

  it('fails closed without demo fallback when the canonical list is unavailable', async () => {
    const get = vi.fn().mockRejectedValue(new Error('network'));
    const data = await loadMeetingWorkbenchData({ services: createServices(get) });

    expect(data.source.mode).toBe('api-error');
    expect(data.records).toEqual([]);
    expect(data.source.detail).toMatch(/demo veriye geçilmedi/i);
  });

  it('validates exact persisted canonical result provenance', () => {
    expect(normalizeCanonicalIntelligenceResult(canonicalResult(), meetingId)).toMatchObject({
      analysisRunId,
      meetingId,
      schemaVersion: '5-adr0043',
      persisted: true,
      storageMode: 'canonical',
    });
    expect(() =>
      normalizeCanonicalIntelligenceResult(canonicalResult({ persisted: false }), meetingId),
    ).toThrow(/provenance/);
    expect(() =>
      normalizeCanonicalIntelligenceResult(
        canonicalResult({ meetingId: 'foreign-meeting' }),
        meetingId,
      ),
    ).toThrow(/provenance/);
  });

  it('opens summary, decisions and actions from one canonical result with final citations', async () => {
    const get = vi.fn((url: string) => {
      if (url.endsWith('/intelligence/result')) return Promise.resolve({ data: canonicalResult() });
      if (url.includes('/v1/admin/transcripts?'))
        return Promise.resolve({ data: transcriptPage() });
      return Promise.reject(new Error(`unexpected endpoint: ${url}`));
    });

    const detail = await loadMeetingDetail(baseMeeting(), { services: createServices(get) });

    expect(get).toHaveBeenCalledTimes(2);
    expect(get).toHaveBeenCalledWith(
      `/v1/admin/meetings/${meetingId}/intelligence/result`,
      expect.objectContaining({ headers: { Accept: 'application/json' } }),
    );
    expect(get).toHaveBeenCalledWith('/v1/admin/transcripts?sessionId=session-1&page=0&size=200');
    expect(detail.status).toBe('ready');
    expect(detail.detail?.state).toBe('ready');
    expect(detail.intelligence).toMatchObject({
      state: 'ready',
      analysisRunId,
      persisted: true,
      storageMode: 'canonical',
    });
    expect(detail.summary.citations).toHaveLength(1);
    expect(detail.summary.citations[0]?.segmentId).toBe('segment-1');
    expect(detail.decisions[0]).toMatchObject({
      label: 'Pilot kapsamı genel amaçlı kalacak.',
      citations: [{ segmentId: 'segment-2' }],
    });
    expect(detail.actions[0]).toMatchObject({
      label: 'Müşteri takibini yarın yap.',
      owner: 'user-2',
      due: '2026-07-12',
      citations: [{ segmentId: 'segment-3' }],
    });
    expect(detail.gates).toContainEqual({
      id: 'grounded-summary',
      label: 'Kaynaklı çıktılar',
      state: 'pass',
    });
  });

  it('never treats draft or mismatched transcript evidence as grounded', async () => {
    const get = vi.fn((url: string) => {
      if (url.endsWith('/intelligence/result')) return Promise.resolve({ data: canonicalResult() });
      return Promise.resolve({ data: transcriptPage('DRAFT') });
    });

    const detail = await loadMeetingDetail(baseMeeting(), { services: createServices(get) });

    expect(detail.detail?.state).toBe('ready');
    expect(detail.summary.citations).toEqual([]);
    expect(detail.decisions[0]?.citations).toEqual([]);
    expect(detail.actions[0]?.citations).toEqual([]);
    expect(detail.gates).toContainEqual({
      id: 'grounded-summary',
      label: 'Kaynaklı çıktılar',
      state: 'pending',
    });
    expect(detail.detail?.detail).toMatch(/final transcript citation'ı olmadan/i);
  });

  it.each([
    [{ response: { status: 404, data: { error: 'ANALYSIS_RESULT_NOT_FOUND' } } }, 'pending'],
    [{ response: { status: 403, data: { error: 'FORBIDDEN' } } }, 'denied'],
    [{ response: { status: 500, data: { error: 'ANALYSIS_RESULT_INVALID' } } }, 'failed'],
    [{ response: { status: 410, data: { error: 'MEETING_DELETED' } } }, 'deleted'],
    [{ response: { status: 404, data: { error: 'MEETING_REVOKED' } } }, 'revoked'],
    [{ response: { status: 423, data: { error: 'RETENTION_BLOCKED' } } }, 'retention-blocked'],
    [new Error('network'), 'retryable'],
  ])('maps canonical result failure %j to honest state %s', (error, state) => {
    expect(describeMeetingDetailError(error).state).toBe(state);
  });

  it('does not leak independently loaded transcript content after a result deny', async () => {
    const get = vi.fn((url: string) => {
      if (url.endsWith('/intelligence/result')) {
        return Promise.reject({ response: { status: 403, data: { error: 'FORBIDDEN' } } });
      }
      return Promise.resolve({ data: transcriptPage() });
    });

    const detail = await loadMeetingDetail(baseMeeting(), { services: createServices(get) });

    expect(detail.detail?.state).toBe('denied');
    expect(detail.transcript).toEqual([]);
    expect(detail.summary.text).toBe('İçerik gösterilmedi.');
    expect(detail.decisions).toEqual([]);
    expect(detail.actions).toEqual([]);
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('does not bind citations to meeting-wide transcript when result session provenance is absent', async () => {
    const get = vi.fn((url: string) => {
      if (url.endsWith('/intelligence/result')) {
        return Promise.resolve({ data: canonicalResult({ sessionId: null }) });
      }
      return Promise.resolve({ data: transcriptPage() });
    });

    const detail = await loadMeetingDetail(baseMeeting(), { services: createServices(get) });

    expect(detail.detail?.state).toBe('ready');
    expect(detail.transcript).toEqual([]);
    expect(detail.summary.citations).toEqual([]);
    expect(detail.gates).toContainEqual({
      id: 'grounded-summary',
      label: 'Kaynaklı çıktılar',
      state: 'pending',
    });
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('continues transcript pagination before verifying citation indices', async () => {
    const summary = 'İkinci sayfa doğrulandı.';
    const firstText = 'Birinci segment';
    const secondText = 'İkinci sayfa segmenti';
    const result = canonicalResult({
      summary,
      summary_citations: [
        {
          ...citation(summary, 0),
          source_index: 1,
          source_text: secondText,
          start_sec: 601.25,
          source_char_end: secondText.length,
        },
      ],
      decisions: [],
      action_items: [],
      citations: [],
    });
    const get = vi.fn((url: string) => {
      if (url.endsWith('/intelligence/result')) return Promise.resolve({ data: result });
      if (url.includes('page=0')) {
        return Promise.resolve({
          data: {
            content: [
              {
                id: 'segment-1',
                startTime: 1.5,
                textFinal: firstText,
                status: 'FINALIZED',
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
              textFinal: secondText,
              status: 'FINALIZED',
            },
          ],
          totalElements: 201,
          page: 1,
          size: 200,
        },
      });
    });

    const detail = await loadMeetingDetail(baseMeeting(), { services: createServices(get) });

    expect(get).toHaveBeenCalledWith(expect.stringContaining('page=1&size=200'));
    expect(detail.transcript.map((segment) => segment.text)).toEqual([firstText, secondText]);
    expect(detail.summary.citations).toEqual([
      expect.objectContaining({ segmentId: 'segment-201' }),
    ]);
  });
});
