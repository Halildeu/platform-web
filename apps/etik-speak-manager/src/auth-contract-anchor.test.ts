import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Faz 35 — the auth contract review anchor (gitops #3078).
 *
 * <p><b>This test does not protect the auth behaviour.</b> That is done, properly, by
 * `AuthGate.test.tsx` and `auth-lifecycle.test.ts`: PKCE, silent `check-sso`, the exact
 * scope and audience, the bounded `prompt=login` upgrade, fail-closed on lost claims, and
 * immediate unmount on invalidation are all asserted behaviourally. Nothing here replaces
 * any of that, and a green hash is not evidence that the contract still holds.
 *
 * <p>What this catches is a governance failure instead. ADR-0046 anchors the manager auth
 * contract to a reviewed source commit and asserted that this directory had not changed
 * since. The gitops contract test "verified" that claim by checking that the ADR text
 * *contained* the commit hash — so when the auth path did change (scope handling and
 * `prompt: 'login'`, twelve files, 480 lines) the claim silently became false and the
 * test stayed green. Evidence about a fact was mistaken for the fact.
 *
 * <p>The check lives here, not in gitops, because this is the repository that holds the
 * files. gitops CI has no platform-web checkout, so any assertion it makes about this
 * directory is unfalsifiable there by construction. Fail-closed belongs next to the thing
 * it guards.
 */

const AUTH_SURFACE = ['AuthGate.tsx', 'auth.ts'] as const;

/**
 * The reviewed state of the auth surface.
 *
 * <p>Updating this is meant to cost a moment's thought: it means someone changed how a
 * whistleblowing manager proves who it is talking to. Re-read ADR-0046 §1, confirm the
 * behavioural tests above still describe what you intended, then move the date and hash
 * together and record the review in the ADR. A hash bumped without that reading buys
 * nothing — which is exactly why the substance is guarded behaviourally and this is only
 * the tripwire that asks you to look.
 */
const REVIEWED = {
  sha256: '1a3de9db7d91ec402f5b1ca1dde66069130c7eb4e0e5ad076f3f4af2d54141de',
  at: '2026-07-28',
};

function authSurfaceDigest(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const digest = createHash('sha256');
  for (const name of AUTH_SURFACE) {
    // Length-prefixed and name-bound, so renaming a file or moving bytes between two of
    // them cannot leave the combined digest unchanged.
    const bytes = readFileSync(join(here, name));
    digest.update(name);
    digest.update('\0');
    digest.update(String(bytes.length));
    digest.update('\0');
    digest.update(bytes);
  }
  return digest.digest('hex');
}

describe('Etik Speak manager auth contract anchor', () => {
  it('is still the surface that was reviewed', () => {
    expect(
      authSurfaceDigest(),
      [
        'Etik Speak yönetici auth yüzeyi değişti.',
        `İncelenmiş sürüm: ${REVIEWED.sha256} (${REVIEWED.at}).`,
        '',
        'Bu test davranışı korumuyor — onu AuthGate.test.tsx ve auth-lifecycle.test.ts yapıyor.',
        'Bu satırın işi, değişikliğin gözden kaçmadan incelenmesini istemek.',
        '',
        'Yapılacaklar:',
        '  1. ADR-0046 §1 auth sözleşmesini yeniden oku; değişiklik onunla tutarlı mı?',
        '  2. Davranış testleri hâlâ istediğin şeyi tarif ediyor mu?',
        '  3. Tutarlıysa REVIEWED.sha256 ve REVIEWED.at birlikte güncellenir,',
        '     ADR-0046 içindeki tarihli inceleme kaydına yeni satır eklenir.',
      ].join('\n'),
    ).toBe(REVIEWED.sha256);
  });

  // The anchor is worthless if it silently covers nothing — a typo'd filename would make
  // the digest stable and the guard permanently green.
  it('actually reads every file it claims to anchor', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    for (const name of AUTH_SURFACE) {
      expect(readFileSync(join(here, name)).length, `${name} boş ya da okunamıyor`).toBeGreaterThan(
        0,
      );
    }
  });
});
