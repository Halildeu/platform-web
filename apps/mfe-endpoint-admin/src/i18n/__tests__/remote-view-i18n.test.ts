import { describe, expect, it } from 'vitest';
import { createEndpointAdminT } from '../index';

/**
 * Faz 22.6 VIEW_ONLY viewer i18n contract: TR + EN parity for every key the
 * RemoteViewPage renders (each key must resolve to a real, distinct,
 * non-empty label in both locales — never fall through to the literal key).
 */
const KEYS = [
  'endpointAdmin.remoteView.title',
  'endpointAdmin.remoteView.missingParams',
  'endpointAdmin.remoteView.badge.viewOnly',
  'endpointAdmin.remoteView.badge.recordingOff',
  'endpointAdmin.remoteView.badge.attended',
  'endpointAdmin.remoteView.status.connecting',
  'endpointAdmin.remoteView.status.live',
  'endpointAdmin.remoteView.status.closed',
  'endpointAdmin.remoteView.status.error',
  'endpointAdmin.remoteView.status.forbidden',
  'endpointAdmin.remoteView.status.busy',
  'endpointAdmin.remoteView.stop',
  'endpointAdmin.remoteView.alt',
  'endpointAdmin.remoteView.waiting',
  'endpointAdmin.remoteView.frameCount',
  'endpointAdmin.remoteView.lastFrame',
  'endpointAdmin.remoteView.noInputNote',
] as const;

describe('remote-view i18n', () => {
  const tr = createEndpointAdminT('tr');
  const en = createEndpointAdminT('en');

  it.each(KEYS)('resolves %s in both locales (no key fallthrough, non-empty)', (key) => {
    const trValue = tr(key);
    const enValue = en(key);
    expect(trValue).not.toBe(key);
    expect(enValue).not.toBe(key);
    expect(trValue.trim().length).toBeGreaterThan(0);
    expect(enValue.trim().length).toBeGreaterThan(0);
  });

  it('every status enum value has a label key', () => {
    for (const s of ['connecting', 'live', 'closed', 'error', 'forbidden', 'busy']) {
      const key = `endpointAdmin.remoteView.status.${s}`;
      expect(tr(key)).not.toBe(key);
      expect(en(key)).not.toBe(key);
    }
  });
});
