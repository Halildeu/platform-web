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
import { formatTranscriptOffset } from './transcript-time';

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

// meeting-ai cites the canonical transcript (final segments joined with "\n") by
// character offset; source_index is its own sentence number.
function canonicalOffset(sourceIndex: number): number {
  return sourceTexts.slice(0, sourceIndex).reduce((sum, text) => sum + text.length + 1, 0);
}

function citation(claim: string, sourceIndex: number) {
  const sourceText = sourceTexts[sourceIndex] as string;
  const sourceCharStart = canonicalOffset(sourceIndex);
  return {
    claim,
    source_index: sourceIndex,
    source_text: sourceText,
    similarity: 0.94,
    grounded: true,
    status: 'PASSED',
    reason: '',
    start_sec: sourceIndex * 5,
    source_char_start: sourceCharStart,
    source_char_end: sourceCharStart + sourceText.length,
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
      // Live API shape: DRAFT rows carry textDraft only; FINALIZED rows textFinal.
      ...(status === 'DRAFT' ? { textDraft: text, textFinal: '' } : { textFinal: text }),
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
  it('binds reopened timestamps to each exact session without changing citation matching', async () => {
    const origin = Date.parse('2026-09-13T16:00:00Z');
    const rawStart = origin / 1000 + 71;
    const result = canonicalResult();
    result.summary_citations[0].start_sec = rawStart;
    result.citations.forEach((value, index) => {
      value.start_sec = rawStart + (index + 1) * 5;
    });
    const get = vi.fn(async (url: string) => {
      if (url.includes('/intelligence/result')) return { data: result };
      if (url.includes('/sessions?'))
        return {
          data: [
            { id: 'session-1', startedAt: '2026-09-13T16:00:00Z' },
            { id: 'session-2', startedAt: '2026-09-13T17:00:00Z' },
          ],
        };
      const page = transcriptPage();
      if (url.includes('sessionId=session-2'))
        return {
          data: {
            ...page,
            content: [
              {
                ...page.content[0],
                id: 'extra',
                startTime: origin / 1000 + 3605,
              },
            ],
          },
        };
      return {
        data: {
          ...page,
          content: page.content.map((segment, index) => ({
            ...segment,
            startTime: rawStart + index * 5,
          })),
        },
      };
    });
    const detail = await loadMeetingDetail(baseMeeting(), { services: createServices(get) });
    expect(detail.transcript.map(formatTranscriptOffset)).toEqual([
      '01:11',
      '01:16',
      '01:21',
      '00:05',
    ]);
    expect(detail.transcript[0].startedAtMs).toBe(rawStart * 1000);
    expect(detail.summary.citations[0]?.segmentId).toBe('segment-1');
    expect(detail.decisions[0]?.citations[0]?.segmentId).toBe('segment-2');

    const reopened = await loadMeetingDetail(detail, {
      services: createServices(get),
      sessionId: 'session-1',
    });
    expect(reopened.transcript.map(formatTranscriptOffset)).toEqual(['01:11', '01:16', '01:21']);
    expect(reopened.summary.citations).toEqual(detail.summary.citations);
  });

  it('retains canonical content and citations but hides time when the session origin is unavailable', async () => {
    const get = vi.fn(async (url: string) => {
      if (url.includes('/intelligence/result')) return { data: canonicalResult() };
      if (url.includes('/sessions?')) return { data: [{ id: 'session-1' }] };
      return { data: transcriptPage() };
    });
    const detail = await loadMeetingDetail(baseMeeting(), { services: createServices(get) });
    expect(detail.transcript.map(formatTranscriptOffset)).toEqual(['--:--', '--:--', '--:--']);
    expect(detail.summary.citations[0]?.segmentId).toBe('segment-1');
  });

  it.each(['array', 'page'])(
    'selects an exact prior session from a %s response without fetching other session transcripts',
    async (shape) => {
      const get = vi.fn(async (url: string) => {
        if (url.includes('/intelligence/result?'))
          return { data: canonicalResult({ sessionId: 'session-old' }) };
        if (url.includes('/sessions?')) {
          const content = [{ id: 'session-old' }, { id: 'session-new' }];
          return { data: shape === 'array' ? content : { content } };
        }
        return { data: transcriptPage() };
      });
      const detail = await loadMeetingDetail(baseMeeting(), {
        services: createServices(get),
        sessionId: 'session-old',
      });
      expect(detail.detail?.state).toBe('ready');
      expect(detail.detailSessionId).toBe('session-old');
      expect(detail.analysisSessions).toHaveLength(2);
      expect(detail.sessionsIncomplete).toBe(false);
      expect(get.mock.calls.map(([url]) => url)).toEqual([
        `/v1/admin/meetings/${meetingId}/intelligence/result?sessionId=session-old`,
        `/v1/admin/meetings/${meetingId}/sessions?page=0&size=50`,
        '/v1/admin/transcripts?sessionId=session-old&page=0&size=200',
      ]);
    },
  );

  it.each([0, 500, 501])(
    'bounds a complete array of %i sessions without repeating it as pages',
    async (count) => {
      const get = vi.fn(async (url: string) => {
        if (url.includes('/intelligence/result')) return { data: canonicalResult() };
        if (url.includes('/sessions?'))
          return {
            data: Array.from({ length: count }, (_, index) => ({ id: `session-${index}` })),
          };
        return { data: transcriptPage() };
      });
      const detail = await loadMeetingDetail(baseMeeting(), {
        services: createServices(get),
        sessionId: 'session-1',
      });
      expect(detail.analysisSessions).toHaveLength(Math.min(count, 500));
      expect(detail.sessionsIncomplete).toBe(count > 500);
      expect(get.mock.calls.filter(([url]) => url.includes('/sessions?'))).toHaveLength(1);
    },
  );

  it('rejects a latest result returned for a different requested session', async () => {
    const get = vi.fn().mockResolvedValue({ data: canonicalResult() });
    const detail = await loadMeetingDetail(baseMeeting(), {
      services: createServices(get),
      sessionId: 'session-old',
    });
    expect(detail.detail?.state).toBe('failed');
    expect(detail.intelligence?.persisted).toBe(false);
    expect(detail.transcript).toEqual([]);
    expect(detail.summary.kind).toBe('pending');
    expect(get).toHaveBeenCalledTimes(1);
  });

  it.each([' ', 'x'.repeat(65)])(
    'refuses an invalid session selector without fetching',
    async (sessionId) => {
      const get = vi.fn();
      const detail = await loadMeetingDetail(baseMeeting(), {
        services: createServices(get),
        sessionId,
      });
      expect(detail.detail?.state).toBe('failed');
      expect(get).not.toHaveBeenCalled();
    },
  );

  it('keeps choices but clears prior analysis when the selected result is not ready', async () => {
    const get = vi.fn(async (url: string) => {
      if (url.includes('/intelligence/result'))
        throw { response: { status: 404, data: { error: 'ANALYSIS_RESULT_NOT_FOUND' } } };
      return { data: { content: [{ id: 'session-old' }, { id: 'session-new' }] } };
    });
    const previous = {
      ...baseMeeting(),
      summary: {
        text: 'obsolete summary',
        citations: [],
        confidence: 1,
        kind: 'ai-summary' as const,
      },
    };
    const detail = await loadMeetingDetail(previous, {
      services: createServices(get),
      sessionId: 'session-new',
    });
    expect(detail.detail?.state).toBe('pending');
    expect(detail.summary.text).not.toBe('obsolete summary');
    expect(detail.analysisSessions).toHaveLength(2);
    expect(get.mock.calls.some(([url]) => url.endsWith('/intelligence/result'))).toBe(false);
  });

  it('clears result and choices when session enumeration is denied', async () => {
    const get = vi.fn(async (url: string) => {
      if (url.includes('/intelligence/result')) return { data: canonicalResult() };
      throw { response: { status: 403 } };
    });
    const detail = await loadMeetingDetail(baseMeeting(), { services: createServices(get) });
    expect(detail.detail?.state).toBe('denied');
    expect(detail.analysisSessions).toEqual([]);
    expect(detail.transcript).toEqual([]);
    expect(detail.intelligence?.persisted).toBe(false);
  });

  it('preserves durable speaker turns on reopen without attributing redacted content', async () => {
    const attribution = {
      scope: '22222222-2222-4222-8222-222222222222',
      turns: [
        { speaker: 'S1', textStart: 0, textEnd: 5, startMs: 0, endMs: 700 },
        { speaker: 'S2', textStart: 6, textEnd: 11, startMs: 500, endMs: 1000 },
      ],
    };
    const get = vi.fn(async (url: string) => {
      if (url.includes('/intelligence/result')) return { data: canonicalResult() };
      if (url.includes('/sessions?'))
        return { data: { content: [{ id: 'session-1' }], last: true } };
      return {
        data: {
          content: [
            {
              id: 'speaker-segment',
              textDraft: 'hello world',
              status: 'DRAFT',
              startTime: 1,
              speakerAttribution: attribution,
            },
            {
              id: 'redacted-segment',
              textDraft: 'hello world',
              status: 'REDACTED',
              startTime: 2,
              speakerAttribution: attribution,
            },
          ],
          last: true,
        },
      };
    });
    const detail = await loadMeetingDetail(baseMeeting(), {
      services: createServices(get),
      sessionId: 'session-1',
    });
    expect(detail.transcript[0].speakerAttribution).toEqual(attribution);
    expect(detail.transcript[1].speakerAttribution).toBeUndefined();
  });

  it('enumerates additional session pages and deduplicates choices', async () => {
    const get = vi.fn(async (url: string) => {
      if (url.includes('/intelligence/result')) return { data: canonicalResult() };
      if (url.includes('/sessions?page=0'))
        return { data: { content: [{ id: 'session-1' }], last: false } };
      if (url.includes('/sessions?page=1'))
        return { data: { content: [{ id: 'session-1' }, { id: 'session-2' }], last: true } };
      return { data: transcriptPage() };
    });
    const detail = await loadMeetingDetail(baseMeeting(), {
      services: createServices(get),
      sessionId: 'session-1',
    });
    expect(detail.analysisSessions?.map((session) => session.id)).toEqual([
      'session-1',
      'session-2',
    ]);
    expect(detail.sessionsIncomplete).toBe(false);
  });
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
      if (url.includes('/sessions?'))
        return Promise.resolve({ data: { content: [{ id: 'session-1' }] } });
      if (url.includes('/v1/admin/transcripts?'))
        return Promise.resolve({ data: transcriptPage() });
      return Promise.reject(new Error(`unexpected endpoint: ${url}`));
    });

    const detail = await loadMeetingDetail(baseMeeting(), { services: createServices(get) });

    expect(get).toHaveBeenCalledTimes(3);
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

  it('renders every session transcript while keeping citations on the analysis session (gitops#3421)', async () => {
    const secondSessionPage = {
      content: [
        {
          id: 'segment-9',
          speakerId: 'speaker-9',
          startTime: 900,
          textFinal: 'Ana oturumun 27 dakikalık içeriği burada.',
          status: 'FINALIZED',
        },
      ],
      totalElements: 1,
      page: 0,
      size: 200,
    };
    const get = vi.fn((url: string) => {
      if (url.endsWith('/intelligence/result')) return Promise.resolve({ data: canonicalResult() });
      if (url.includes('/sessions?'))
        return Promise.resolve({
          data: { content: [{ id: 'session-1' }, { id: 'session-main' }] },
        });
      if (url.includes('sessionId=session-1')) return Promise.resolve({ data: transcriptPage() });
      if (url.includes('sessionId=session-main'))
        return Promise.resolve({ data: secondSessionPage });
      return Promise.reject(new Error(`unexpected endpoint: ${url}`));
    });

    const detail = await loadMeetingDetail(baseMeeting(), { services: createServices(get) });

    expect(get).toHaveBeenCalledWith(
      '/v1/admin/transcripts?sessionId=session-main&page=0&size=200',
    );
    expect(detail.transcript.map((segment) => segment.id)).toEqual(
      expect.arrayContaining(['segment-1', 'segment-2', 'segment-3', 'segment-9']),
    );
    expect(detail.transcript).toHaveLength(4);
    // Citation indeksleri analiz oturumunda kalır — birleşim kaydırmaz.
    expect(detail.summary.citations[0]?.segmentId).toBe('segment-1');
    expect(detail.transcriptFeed.detail).toMatch(/4 segment okundu/);
  });

  it('keeps the analysis transcript when the session list is unavailable', async () => {
    const get = vi.fn((url: string) => {
      if (url.endsWith('/intelligence/result')) return Promise.resolve({ data: canonicalResult() });
      if (url.includes('/sessions?')) return Promise.reject(new Error('sessions unavailable'));
      if (url.includes('/v1/admin/transcripts?'))
        return Promise.resolve({ data: transcriptPage() });
      return Promise.reject(new Error(`unexpected endpoint: ${url}`));
    });

    const detail = await loadMeetingDetail(baseMeeting(), { services: createServices(get) });

    expect(detail.transcript).toHaveLength(3);
    expect(detail.summary.citations).toHaveLength(1);
  });

  it('resolves a sentence meeting-ai glued out of several STT lines to the segment it starts in (platform-ai#334/#335)', async () => {
    // Live 2026-09-03 (meeting b8ca6dbf): the canonical transcript holds one unpunctuated
    // STT segment per line; meeting-ai cites the merged sentence by canonical offsets.
    const lines = ['Bütçe konuşuldu.', 'En geç', 'Cuma gününe kadar', 'bitirilecek', '.'];
    const decision = 'En geç Cuma gününe kadar bitirilecek.';
    const start = lines[0]!.length + 1;
    const end = lines.join('\n').length;
    const mergedCitation = {
      ...citation(decision, 1),
      source_index: 1,
      source_text: decision,
      start_sec: 5,
      source_char_start: start,
      source_char_end: end,
    };
    const get = vi.fn((url: string) => {
      if (url.endsWith('/intelligence/result')) {
        return Promise.resolve({
          data: canonicalResult({
            decisions: [decision],
            action_items: [],
            citations: [mergedCitation],
          }),
        });
      }
      return Promise.resolve({
        data: {
          content: lines.map((text, index) => ({
            id: `segment-${index + 1}`,
            speakerId: 'speaker-1',
            startTime: index * 5,
            textFinal: text,
            status: 'FINALIZED',
          })),
          totalElements: lines.length,
          page: 0,
          size: 200,
        },
      });
    });

    const detail = await loadMeetingDetail(baseMeeting(), { services: createServices(get) });

    expect(detail.decisions[0]?.citations).toEqual([
      { segmentId: 'segment-2', quote: decision, confidence: 'high' },
    ]);
  });

  it('rejects a citation whose offsets do not reproduce the quoted sentence', async () => {
    const get = vi.fn((url: string) => {
      if (url.endsWith('/intelligence/result')) {
        return Promise.resolve({
          data: canonicalResult({
            citations: [
              { ...citation('Pilot kapsamı genel amaçlı kalacak.', 1), source_char_start: 0 },
              citation('Müşteri takibini yarın yap.', 2),
            ],
          }),
        });
      }
      return Promise.resolve({ data: transcriptPage() });
    });

    const detail = await loadMeetingDetail(baseMeeting(), { services: createServices(get) });

    expect(detail.decisions[0]?.citations).toEqual([]);
    expect(detail.actions[0]?.citations).toEqual([
      { segmentId: 'segment-3', quote: 'Müşteri takibini yarın yap.', confidence: 'high' },
    ]);
  });

  it('grounds citations on DRAFT segments — the snapshot is built from ASR text too (live b8ca6dbf)', async () => {
    // transcript-service never flips segment status on finalization; the canonical
    // snapshot takes textFinal for FINALIZED rows and textDraft for DRAFT rows.
    const get = vi.fn((url: string) => {
      if (url.endsWith('/intelligence/result')) return Promise.resolve({ data: canonicalResult() });
      return Promise.resolve({ data: transcriptPage('DRAFT') });
    });

    const detail = await loadMeetingDetail(baseMeeting(), { services: createServices(get) });

    expect(detail.summary.citations[0]?.segmentId).toBe('segment-1');
    expect(detail.decisions[0]?.citations).toEqual([
      { segmentId: 'segment-2', quote: 'Pilot kapsamı genel amaçlı kalacak.', confidence: 'high' },
    ]);
    expect(detail.gates).toContainEqual({
      id: 'grounded-summary',
      label: 'Kaynaklı çıktılar',
      state: 'pass',
    });
  });

  it('grounds an extractive summary sentence by sentence (live b8ca6dbf: no whole-summary claim)', async () => {
    const first = sourceTexts[0] as string;
    const second = sourceTexts[1] as string;
    const summary = `${first} ${second}`;
    const get = vi.fn((url: string) => {
      if (url.endsWith('/intelligence/result')) {
        return Promise.resolve({
          data: canonicalResult({
            summary,
            summary_citations: [citation(first, 0), citation(second, 1)],
          }),
        });
      }
      return Promise.resolve({ data: transcriptPage() });
    });

    const detail = await loadMeetingDetail(baseMeeting(), { services: createServices(get) });

    expect(detail.summary.text).toBe(summary);
    expect(detail.summary.citations.map((c) => c.segmentId)).toEqual(['segment-1', 'segment-2']);
    expect(detail.gates).toContainEqual({
      id: 'grounded-summary',
      label: 'Kaynaklı çıktılar',
      state: 'pass',
    });
  });

  it('ignores a summary citation whose claim is not a sentence of the summary', async () => {
    const get = vi.fn((url: string) => {
      if (url.endsWith('/intelligence/result')) {
        return Promise.resolve({
          data: canonicalResult({
            summary: sourceTexts[0],
            summary_citations: [citation(sourceTexts[2] as string, 2)],
          }),
        });
      }
      return Promise.resolve({ data: transcriptPage() });
    });

    const detail = await loadMeetingDetail(baseMeeting(), { services: createServices(get) });

    expect(detail.summary.citations).toEqual([]);
  });

  it('never treats redacted or mismatched transcript evidence as grounded', async () => {
    const get = vi.fn((url: string) => {
      if (url.endsWith('/intelligence/result')) return Promise.resolve({ data: canonicalResult() });
      return Promise.resolve({ data: transcriptPage('REDACTED') });
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

  it.each([
    [{ response: { status: 403, data: { error: 'FORBIDDEN' } } }, 'denied'],
    [new Error('network'), 'retryable'],
  ])('does not disguise a transcript read failure as an empty ready result (%s)', async (error, state) => {
    const get = vi.fn(async (url: string) => {
      if (url.endsWith('/intelligence/result')) return { data: canonicalResult() };
      if (url.includes('/sessions?')) {
        return { data: { content: [{ id: 'session-1' }], last: true } };
      }
      throw error;
    });

    const detail = await loadMeetingDetail(baseMeeting(), { services: createServices(get) });

    expect(detail.detail?.state).toBe(state);
    expect(detail.transcript).toEqual([]);
    expect(detail.transcriptFeed?.state).toBe('blocked');
    expect(detail.summary.kind).toBe('pending');
    expect(detail.summary.citations).toEqual([]);
    expect(detail.decisions).toEqual([]);
    expect(detail.actions).toEqual([]);
    expect(get.mock.calls.some(([url]) => url.includes('/transcripts'))).toBe(true);
  });

  it('does not bind citations to meeting-wide transcript when result session provenance is absent', async () => {
    const get = vi.fn((url: string) => {
      if (url.endsWith('/intelligence/result')) {
        return Promise.resolve({ data: canonicalResult({ sessionId: null }) });
      }
      if (url.includes('/sessions?')) {
        return Promise.resolve({ data: { content: [{ id: 'session-prior' }], last: true } });
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
    expect(detail.analysisSessions).toEqual([{ id: 'session-prior', startedAt: '' }]);
    expect(detail.sessionsIncomplete).toBe(false);
    expect(get).toHaveBeenCalledTimes(2);
    expect(get.mock.calls.some(([url]) => url.includes('/transcripts'))).toBe(false);
  });

  it('hides an unbound result when session choices are forbidden', async () => {
    const get = vi.fn(async (url: string) => {
      if (url.endsWith('/intelligence/result')) {
        return { data: canonicalResult({ sessionId: null }) };
      }
      throw { response: { status: 403 } };
    });

    const detail = await loadMeetingDetail(baseMeeting(), { services: createServices(get) });

    expect(detail.detail?.state).toBe('denied');
    expect(detail.analysisSessions).toEqual([]);
    expect(detail.summary.kind).toBe('pending');
    expect(detail.summary.citations).toEqual([]);
    expect(detail.transcript).toEqual([]);
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
          source_char_start: firstText.length + 1,
          source_char_end: firstText.length + 1 + secondText.length,
        },
      ],
      decisions: [],
      action_items: [],
      citations: [],
    });
    const get = vi.fn((url: string) => {
      if (url.endsWith('/intelligence/result')) return Promise.resolve({ data: result });
      if (url.includes('/sessions?'))
        return Promise.resolve({ data: { content: [{ id: 'session-1' }] } });
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
