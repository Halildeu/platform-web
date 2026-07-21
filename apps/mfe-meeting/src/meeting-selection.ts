const MEETING_SELECTION_PARAM = 'meetingId';
const MAX_MEETING_ID_LENGTH = 128;

function safeSelection(value: string | null): string {
  const selected = value?.trim() ?? '';
  return selected.length > 0 && selected.length <= MAX_MEETING_ID_LENGTH ? selected : '';
}

export function readMeetingSelection(
  search = typeof window === 'undefined' ? '' : window.location.search,
  pathname = typeof window === 'undefined' ? '' : window.location.pathname,
): string {
  const fromQuery = safeSelection(new URLSearchParams(search).get(MEETING_SELECTION_PARAM));
  if (fromQuery) return fromQuery;

  const match = pathname.match(/\/(?:admin\/)?meetings\/([^/?#]+)\/?$/i);
  if (!match?.[1]) return '';
  try {
    return safeSelection(decodeURIComponent(match[1]));
  } catch {
    return '';
  }
}

export function buildMeetingSelectionUrl(
  meetingId: string,
  location: Pick<Location, 'pathname' | 'search' | 'hash'> = window.location,
): string {
  const params = new URLSearchParams(location.search);
  const selected = safeSelection(meetingId);
  if (selected) params.set(MEETING_SELECTION_PARAM, selected);
  else params.delete(MEETING_SELECTION_PARAM);
  const query = params.toString();
  return `${location.pathname}${query ? `?${query}` : ''}${location.hash}`;
}

export function writeMeetingSelection(meetingId: string): void {
  if (typeof window === 'undefined') return;
  const nextUrl = buildMeetingSelectionUrl(meetingId);
  const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (nextUrl !== currentUrl) window.history.pushState(window.history.state, '', nextUrl);
}
