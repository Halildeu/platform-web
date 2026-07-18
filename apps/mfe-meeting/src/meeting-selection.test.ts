import { afterEach, describe, expect, it } from 'vitest';

import {
  buildMeetingSelectionUrl,
  readMeetingSelection,
  writeMeetingSelection,
} from './meeting-selection';

describe('meeting URL selection', () => {
  afterEach(() => window.history.replaceState({}, '', '/'));

  it('prefers the canonical meetingId query selection and preserves other parameters', () => {
    expect(readMeetingSelection('?tab=notes&meetingId=meeting-42', '/admin/meetings')).toBe(
      'meeting-42',
    );
    expect(
      buildMeetingSelectionUrl('meeting-84', {
        pathname: '/admin/meetings',
        search: '?tab=notes&meetingId=meeting-42',
        hash: '#result',
      } as Location),
    ).toBe('/admin/meetings?tab=notes&meetingId=meeting-84#result');
  });

  it('supports a path deep-link without fabricating a fallback selection', () => {
    expect(readMeetingSelection('', '/admin/meetings/meeting-42')).toBe('meeting-42');
    expect(readMeetingSelection('?meetingId=', '/admin/meetings')).toBe('');
    expect(readMeetingSelection('?meetingId=missing', '/admin/meetings')).toBe('missing');
  });

  it('writes the explicit selection to history for reload and back navigation', () => {
    window.history.replaceState({}, '', '/admin/meetings?tab=result');
    writeMeetingSelection('meeting-42');

    expect(window.location.pathname).toBe('/admin/meetings');
    expect(window.location.search).toBe('?tab=result&meetingId=meeting-42');
    expect(readMeetingSelection()).toBe('meeting-42');
  });
});
