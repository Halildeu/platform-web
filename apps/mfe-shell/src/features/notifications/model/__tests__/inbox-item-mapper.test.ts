// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  INBOX_ITEM_ID_PREFIX,
  extractInboxRowId,
  inboxItemToSurfaceItem,
} from '../inbox-item-mapper';
import type { InboxItemDto } from '../../api/notify-inbox.types';

const baseRow: InboxItemDto = {
  id: 42,
  intentId: 'intent-001',
  subject: 'Aylık satış raporu hazır',
  bodyText: 'Lütfen kontrol edin',
  bodyHtml: null,
  locale: 'tr-TR',
  topicKey: 'report.export.ready',
  severity: 'info',
  state: 'UNREAD',
  readAt: null,
  archivedAt: null,
  createdAt: '2026-05-07T08:00:00Z',
  expiresAt: null,
};

describe('inboxItemToSurfaceItem', () => {
  it('maps subject as message + bodyText as description', () => {
    const surface = inboxItemToSurfaceItem(baseRow);
    expect(surface.id).toBe(`${INBOX_ITEM_ID_PREFIX}42`);
    expect(surface.message).toBe('Aylık satış raporu hazır');
    expect(surface.description).toBe('Lütfen kontrol edin');
    expect(surface.read).toBe(false);
    expect(surface.createdAt).toBe(Date.parse('2026-05-07T08:00:00Z'));
  });

  it('maps severity → type + priority + pinned', () => {
    expect(inboxItemToSurfaceItem(baseRow).type).toBe('info');
    expect(inboxItemToSurfaceItem(baseRow).priority).toBe('low');
    expect(inboxItemToSurfaceItem(baseRow).pinned).toBe(false);

    const warn = inboxItemToSurfaceItem({ ...baseRow, severity: 'warning' });
    expect(warn.type).toBe('warning');
    expect(warn.priority).toBe('medium');
    expect(warn.pinned).toBe(false);

    const crit = inboxItemToSurfaceItem({ ...baseRow, severity: 'critical' });
    expect(crit.type).toBe('error');
    expect(crit.priority).toBe('high');
    expect(crit.pinned).toBe(true); // critical pins to top by default
  });

  it('marks state READ → read true', () => {
    const surface = inboxItemToSurfaceItem({ ...baseRow, state: 'READ' });
    expect(surface.read).toBe(true);
  });

  it('falls back to bodyText excerpt when subject is missing', () => {
    const surface = inboxItemToSurfaceItem({
      ...baseRow,
      subject: null,
      bodyText: 'A'.repeat(140),
    });
    expect(surface.message.length).toBeLessThanOrEqual(120);
    expect(surface.message.endsWith('…')).toBe(true);
    // description hidden because we used the same field for the message
    expect(surface.description).toBeUndefined();
  });

  it('falls back to topicKey when both subject and body are missing', () => {
    const surface = inboxItemToSurfaceItem({
      ...baseRow,
      subject: null,
      bodyText: null,
    });
    expect(surface.message).toBe('report.export.ready');
    expect(surface.description).toBeUndefined();
  });

  it('packs backend metadata into meta.source / backendId / topicKey', () => {
    const surface = inboxItemToSurfaceItem({
      ...baseRow,
      readAt: '2026-05-07T09:00:00Z',
    });
    expect(surface.meta).toMatchObject({
      source: 'inbox',
      backendId: 42,
      intentId: 'intent-001',
      topicKey: 'report.export.ready',
      severity: 'info',
      locale: 'tr-TR',
      readAt: '2026-05-07T09:00:00Z',
    });
  });
});

describe('extractInboxRowId', () => {
  it('reverses the prefix back to the numeric id', () => {
    expect(extractInboxRowId('inbox-42')).toBe(42);
    expect(extractInboxRowId('inbox-1204')).toBe(1204);
  });

  it('returns null for non-prefixed (local UI) ids', () => {
    expect(extractInboxRowId('local-toast-abc')).toBeNull();
    expect(extractInboxRowId('audit-7890')).toBeNull();
  });

  it('returns null when the suffix is not a finite integer', () => {
    expect(extractInboxRowId('inbox-')).toBeNull();
    expect(extractInboxRowId('inbox-abc')).toBeNull();
  });
});
