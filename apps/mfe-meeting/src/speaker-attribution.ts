import type { TranscriptSegment } from './meeting-workbench';

export interface SpeakerTurn {
  speaker: string;
  textStart: number;
  textEnd: number;
  startMs: number;
  endMs: number;
}

export interface SpeakerAttribution {
  scope: string;
  turns: SpeakerTurn[];
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const speaker = /^(S[1-9][0-9]{0,2}|SPEAKER_[0-9]{2,3}|UU)$/;
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/** Invalid attribution must not hide the transcript or guess a speaker. */
export function parseSpeakerAttribution(
  value: unknown,
  text: string,
): SpeakerAttribution | undefined {
  if (
    !record(value) ||
    Object.keys(value).length !== 2 ||
    typeof value.scope !== 'string' ||
    !uuid.test(value.scope) ||
    !Array.isArray(value.turns) ||
    value.turns.length === 0 ||
    value.turns.length > 512
  )
    return undefined;
  const turns: SpeakerTurn[] = [];
  let previousEnd = 0;
  for (const turn of value.turns) {
    if (
      !record(turn) ||
      Object.keys(turn).length !== 5 ||
      typeof turn.speaker !== 'string' ||
      !speaker.test(turn.speaker)
    )
      return undefined;
    const numbers = [turn.textStart, turn.textEnd, turn.startMs, turn.endMs];
    if (!numbers.every((n) => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0))
      return undefined;
    const t = turn as unknown as SpeakerTurn;
    if (
      t.textStart < previousEnd ||
      t.textEnd <= t.textStart ||
      t.textEnd > text.length ||
      t.endMs < t.startMs ||
      text.slice(previousEnd, t.textStart).trim() ||
      splitsSurrogate(text, t.textStart) ||
      splitsSurrogate(text, t.textEnd)
    )
      return undefined;
    turns.push({
      speaker: t.speaker,
      textStart: t.textStart,
      textEnd: t.textEnd,
      startMs: t.startMs,
      endMs: t.endMs,
    });
    previousEnd = t.textEnd;
  }
  if (text.slice(previousEnd).trim()) return undefined;
  return { scope: value.scope, turns };
}

function splitsSurrogate(text: string, offset: number): boolean {
  return (
    offset > 0 &&
    offset < text.length &&
    /[\uD800-\uDBFF]/.test(text[offset - 1]) &&
    /[\uDC00-\uDFFF]/.test(text[offset])
  );
}

/** Render-only splitting preserves the canonical citation id on the first turn. */
export function expandSpeakerTurns(segments: readonly TranscriptSegment[]): TranscriptSegment[] {
  const labels = new Map<string, string>();
  return segments.flatMap((segment) => {
    const attribution = parseSpeakerAttribution(segment.speakerAttribution, segment.text);
    if (!attribution) return [segment];
    const rendered: TranscriptSegment[] = [];
    for (const [index, turn] of attribution.turns.entries()) {
      const key = `${attribution.scope}:${turn.speaker}`;
      if (turn.speaker !== 'UU' && !labels.has(key))
        labels.set(key, `Konuşmacı ${labels.size + 1}`);
      const label = turn.speaker === 'UU' ? 'Konuşmacı belirsiz' : labels.get(key)!;
      const text = segment.text.slice(turn.textStart, turn.textEnd);
      const previous = rendered.at(-1);
      if (previous?.speakerKey === key) {
        const priorTurn = attribution.turns[index - 1];
        previous.text += segment.text.slice(priorTurn.textEnd, turn.textStart) + text;
      } else {
        rendered.push({
          ...segment,
          id: index === 0 ? segment.id : `${segment.id}:turn-${index}`,
          speaker: label,
          speakerKey: key,
          speakerAttribution: undefined,
          startedAtMs: segment.startedAtMs + turn.startMs,
          text,
        });
      }
    }
    return rendered;
  });
}
