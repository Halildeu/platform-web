import { describe, expect, it } from 'vitest';
import {
  arrayBufferToBase64Url,
  base64UrlToUint8Array,
  detectBrowserPushSupport,
} from '../notify-push.helpers';

describe('notify-push.helpers', () => {
  describe('base64UrlToUint8Array', () => {
    it('decodes valid base64url input', () => {
      // 'Hello' → SGVsbG8 (base64url, no padding)
      const result = base64UrlToUint8Array('SGVsbG8');
      const expected = new Uint8Array([72, 101, 108, 108, 111]);
      expect(Array.from(result)).toEqual(Array.from(expected));
    });

    it('handles base64url with - and _ chars', () => {
      // base64 with + and / replaced by - and _
      const base64Url = 'YWJjLT9fLT0';
      const result = base64UrlToUint8Array(base64Url);
      expect(result).toBeInstanceOf(Uint8Array);
    });
  });

  describe('arrayBufferToBase64Url', () => {
    it('encodes ArrayBuffer to base64url', () => {
      const bytes = new Uint8Array([72, 101, 108, 108, 111]);
      const result = arrayBufferToBase64Url(bytes.buffer);
      expect(result).toBe('SGVsbG8');  // base64url without padding
    });

    it('returns empty string for null', () => {
      expect(arrayBufferToBase64Url(null)).toBe('');
    });
  });

  describe('detectBrowserPushSupport', () => {
    it('reports support unavailable when global window missing (SSR)', () => {
      // vitest jsdom default sets window; simulate SSR by clearing globalThis
      const origWindow = (globalThis as { window?: Window }).window;
      const origNavigator = (globalThis as { navigator?: Navigator }).navigator;
      (globalThis as { window?: Window }).window = undefined;
      (globalThis as { navigator?: Navigator }).navigator = undefined;

      try {
        const support = detectBrowserPushSupport();
        expect(support.supported).toBe(false);
      } finally {
        (globalThis as { window?: Window }).window = origWindow;
        (globalThis as { navigator?: Navigator }).navigator = origNavigator;
      }
    });
  });
});
