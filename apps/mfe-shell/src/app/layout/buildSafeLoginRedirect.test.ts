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
