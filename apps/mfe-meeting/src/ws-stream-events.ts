import type { TranscriptSegment } from './meeting-workbench';

export type WsStreamEventType = 'loading' | 'ready' | 'partial' | 'final' | 'error' | 'debug';

export interface WsStreamLoadingEvent {
  type: 'loading';
  stage: 'live_model' | 'final_model';
}

export interface WsStreamReadyEvent {
  type: 'ready';
  sample_rate: number;
  live_model: string;
  final_model: string;
}

export interface WsStreamPartialEvent {
  type: 'partial';
  seq: number;
  confirmed: string;
  tentative: string;
  elapsed_ms: number;
  rms: number;
  source: string;
}

export interface WsStreamFinalEvent {
  type: 'final';
  seq: number;
  text: string;
  reason: string;
  elapsed_ms: number;
  rms: number;
}

export interface WsStreamErrorEvent {
  type: 'error';
  msg: string;
}

export interface WsStreamDebugEvent {
  type: 'debug';
  event: string;
  [key: string]: unknown;
}

export type WsStreamEvent =
  | WsStreamLoadingEvent
  | WsStreamReadyEvent
  | WsStreamPartialEvent
  | WsStreamFinalEvent
  | WsStreamErrorEvent
  | WsStreamDebugEvent;

export type WsStreamParseFailureReason =
  | 'invalid-json'
  | 'invalid-object'
  | 'unknown-type'
  | 'invalid-shape';

export type WsStreamParseResult =
  | { ok: true; event: WsStreamEvent }
  | { ok: false; reason: WsStreamParseFailureReason; eventType?: string };

type UnknownRecord = Record<string, unknown>;

const strictEventKeys: Record<Exclude<WsStreamEventType, 'debug'>, string[]> = {
  loading: ['stage', 'type'],
  ready: ['final_model', 'live_model', 'sample_rate', 'type'],
  partial: ['confirmed', 'elapsed_ms', 'rms', 'seq', 'source', 'tentative', 'type'],
  final: ['elapsed_ms', 'reason', 'rms', 'seq', 'text', 'type'],
  error: ['msg', 'type'],
};

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isIntegerAtLeast(value: unknown, minimum: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= minimum;
}

function isNumberAtLeast(value: unknown, minimum: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= minimum;
}

function hasOnlyKeys(record: UnknownRecord, keys: string[]): boolean {
  const allowed = new Set(keys);
  return Object.keys(record).every((key) => allowed.has(key));
}

function hasStrictShape(type: Exclude<WsStreamEventType, 'debug'>, record: UnknownRecord): boolean {
  return hasOnlyKeys(record, strictEventKeys[type]);
}

function parseKnownEvent(record: UnknownRecord, eventType: WsStreamEventType): WsStreamParseResult {
  switch (eventType) {
    case 'loading':
      if (
        hasStrictShape('loading', record) &&
        (record.stage === 'live_model' || record.stage === 'final_model')
      ) {
        return { ok: true, event: { type: 'loading', stage: record.stage } };
      }
      return { ok: false, reason: 'invalid-shape', eventType };

    case 'ready':
      if (
        hasStrictShape('ready', record) &&
        isIntegerAtLeast(record.sample_rate, 8000) &&
        isString(record.live_model) &&
        isString(record.final_model)
      ) {
        return {
          ok: true,
          event: {
            type: 'ready',
            sample_rate: record.sample_rate,
            live_model: record.live_model,
            final_model: record.final_model,
          },
        };
      }
      return { ok: false, reason: 'invalid-shape', eventType };

    case 'partial':
      if (
        hasStrictShape('partial', record) &&
        isIntegerAtLeast(record.seq, 0) &&
        isString(record.confirmed) &&
        isString(record.tentative) &&
        isIntegerAtLeast(record.elapsed_ms, 0) &&
        isNumberAtLeast(record.rms, 0) &&
        isString(record.source)
      ) {
        return {
          ok: true,
          event: {
            type: 'partial',
            seq: record.seq,
            confirmed: record.confirmed,
            tentative: record.tentative,
            elapsed_ms: record.elapsed_ms,
            rms: record.rms,
            source: record.source,
          },
        };
      }
      return { ok: false, reason: 'invalid-shape', eventType };

    case 'final':
      if (
        hasStrictShape('final', record) &&
        isIntegerAtLeast(record.seq, 0) &&
        isString(record.text) &&
        isString(record.reason) &&
        isIntegerAtLeast(record.elapsed_ms, 0) &&
        isNumberAtLeast(record.rms, 0)
      ) {
        return {
          ok: true,
          event: {
            type: 'final',
            seq: record.seq,
            text: record.text,
            reason: record.reason,
            elapsed_ms: record.elapsed_ms,
            rms: record.rms,
          },
        };
      }
      return { ok: false, reason: 'invalid-shape', eventType };

    case 'error':
      if (hasStrictShape('error', record) && isString(record.msg)) {
        return { ok: true, event: { type: 'error', msg: record.msg } };
      }
      return { ok: false, reason: 'invalid-shape', eventType };

    case 'debug':
      if (isString(record.event)) {
        return { ok: true, event: { ...record, type: 'debug', event: record.event } };
      }
      return { ok: false, reason: 'invalid-shape', eventType };
  }
}

export function parseWsStreamEvent(payload: unknown): WsStreamParseResult {
  if (!isRecord(payload)) {
    return { ok: false, reason: 'invalid-object' };
  }

  const eventType = payload.type;
  if (!isString(eventType)) {
    return { ok: false, reason: 'unknown-type' };
  }

  if (
    eventType !== 'loading' &&
    eventType !== 'ready' &&
    eventType !== 'partial' &&
    eventType !== 'final' &&
    eventType !== 'error' &&
    eventType !== 'debug'
  ) {
    return { ok: false, reason: 'unknown-type', eventType };
  }

  return parseKnownEvent(payload, eventType);
}

export function parseWsStreamEventMessage(message: string): WsStreamParseResult {
  try {
    return parseWsStreamEvent(JSON.parse(message));
  } catch {
    return { ok: false, reason: 'invalid-json' };
  }
}

export function wsStreamEventToTranscriptSegment(
  event: WsStreamEvent,
  speaker = 'Canlı STT',
): TranscriptSegment | null {
  if (event.type === 'partial') {
    const text = [event.confirmed, event.tentative].filter(Boolean).join(' ').trim();
    return {
      id: `ws-partial-${event.seq}`,
      speaker: event.source || speaker,
      startedAtMs: event.elapsed_ms,
      status: event.tentative ? 'draft' : 'stabilizing',
      text,
    };
  }

  if (event.type === 'final') {
    return {
      id: `ws-final-${event.seq}`,
      speaker,
      startedAtMs: event.elapsed_ms,
      status: 'final',
      text: event.text,
    };
  }

  return null;
}
