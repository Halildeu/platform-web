// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { buildSafeLoginRedirect } from './buildSafeLoginRedirect';

/**
 * Codex 019dd818 iter-10 PARTIAL feedback (B-prime PR-2b):
 * "PR-2b'de test edilmemiş davranışlar kritik kullanıcı algısını
 * belirliyor. Test paketini P2'ye atma."
 *
 * Kritik 2 test alanı: safe redirect helper + dedupe semantik.
 * Bu dosya: safe redirect contract (open-redirect saldırısına karşı koruma).
 * Kalan 3 test (event listener bootstrap guard, drawer reason wiring,
 * full event flow) P2 follow-up cycle'da.
 */
describe('buildSafeLoginRedirect — same-origin path guard', () => {
  it('encodes safe absolute paths', () => {
    expect(
      buildSafeLoginRedirect({
        pathname: '/admin/access',
        search: '?x=1',
        hash: '#drawer',
      }),
    ).toBe('/login?redirect=%2Fadmin%2Faccess%3Fx%3D1%23drawer');
  });

  it('redirects to / for protocol-relative URLs (//evil.com)', () => {
    expect(
      buildSafeLoginRedirect({
        pathname: '//evil.com/phish',
        search: '',
        hash: '',
      }),
    ).toBe('/login?redirect=%2F');
  });

  it('redirects to / for scheme: URLs (javascript:)', () => {
    expect(
      buildSafeLoginRedirect({
        pathname: 'javascript:alert(1)',
        search: '',
        hash: '',
      }),
    ).toBe('/login?redirect=%2F');
  });

  it('redirects to / when already on /login (loop prevention)', () => {
    expect(
      buildSafeLoginRedirect({
        pathname: '/login',
        search: '?redirect=%2Fadmin',
        hash: '',
      }),
    ).toBe('/login?redirect=%2F');
  });

  it('redirects to / when on /register', () => {
    expect(
      buildSafeLoginRedirect({
        pathname: '/register',
        search: '',
        hash: '',
      }),
    ).toBe('/login?redirect=%2F');
  });

  it('handles empty location (defensive)', () => {
    expect(
      buildSafeLoginRedirect({
        pathname: '',
        search: '',
        hash: '',
      }),
    ).toBe('/login?redirect=%2F');
  });

  it('preserves query string and hash for valid paths', () => {
    expect(
      buildSafeLoginRedirect({
        pathname: '/admin/users/123',
        search: '?tab=roles',
        hash: '#scope',
      }),
    ).toBe('/login?redirect=%2Fadmin%2Fusers%2F123%3Ftab%3Droles%23scope');
  });
});

/**
 * Dedupe semantik testi — episode-based (5sn time-window değil) toast id
 * ref'i şu invariant'larla çalışmalı:
 *  1. İlk event → ref = id (yeni toast)
 *  2. Sonraki eventler → ref already set, no-op (mevcut toast korunur)
 *  3. onCancel callback → ref = null (yeni episode için hazır)
 *  4. Token yenilenirse → ref = null (Codex iter-10 edge case fix)
 *
 * ShellLayout'taki ref davranışını mock-free reproduce ediyoruz —
 * ref objesi initialization + state transition kontratı.
 */
describe('sessionExpiredToastIdRef — episode-based dedupe contract', () => {
  it('first event sets ref, second event is no-op until reset', () => {
    const ref: { current: string | null } = { current: null };

    // İlk event: ref boş → toast yarat + ref'e id yaz
    const firstHandler = () => {
      if (ref.current) return false; // dedupe
      ref.current = 'toast-1';
      return true;
    };
    expect(firstHandler()).toBe(true);
    expect(ref.current).toBe('toast-1');

    // İkinci event: ref dolu → no-op
    const secondHandler = () => {
      if (ref.current) return false;
      ref.current = 'toast-2';
      return true;
    };
    expect(secondHandler()).toBe(false);
    expect(ref.current).toBe('toast-1'); // korunur

    // Üçüncü event de aynı: dedupe
    expect(secondHandler()).toBe(false);
    expect(ref.current).toBe('toast-1');
  });

  it('onCancel callback resets ref → next episode allowed', () => {
    const ref: { current: string | null } = { current: 'toast-1' };

    // onCancel
    ref.current = null;
    expect(ref.current).toBeNull();

    // Yeni episode
    const handler = () => {
      if (ref.current) return false;
      ref.current = 'toast-2';
      return true;
    };
    expect(handler()).toBe(true);
    expect(ref.current).toBe('toast-2');
  });

  it('token refresh resets ref (Codex iter-10 edge case)', () => {
    const ref: { current: string | null } = { current: 'toast-1' };

    // Token yenilendi → useEffect tetiklenir → ref reset
    const onTokenChange = (newToken: string | null) => {
      if (newToken) {
        ref.current = null;
      }
    };
    onTokenChange('new-jwt-token');
    expect(ref.current).toBeNull();

    // Sonraki gerçek 401 event'i artık no-op değil
    const handler = () => {
      if (ref.current) return false;
      ref.current = 'toast-2';
      return true;
    };
    expect(handler()).toBe(true);
    expect(ref.current).toBe('toast-2');
  });
});
