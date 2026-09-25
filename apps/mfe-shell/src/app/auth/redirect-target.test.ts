import { describe, expect, it } from 'vitest';
import { hasOidcCallbackFragment, stripUrlFragment } from './redirect-target';

describe('stripUrlFragment', () => {
  it('drops the fragment and keeps path + query', () => {
    expect(stripUrlFragment('/admin/reports/x?tab=1#state=s1&code=c1')).toBe(
      '/admin/reports/x?tab=1',
    );
  });

  it('is a no-op without a fragment', () => {
    expect(stripUrlFragment('/admin/reports/x?tab=1')).toBe('/admin/reports/x?tab=1');
  });

  it('keeps only the part before the FIRST hash when several are glued together', () => {
    // The live #1200 shape: an old callback with a new one appended by Keycloak.
    expect(stripUrlFragment('/x#state=old&code=c0#state=new&code=c1')).toBe('/x');
  });

  it('returns empty for a bare fragment', () => {
    expect(stripUrlFragment('#state=s1&code=c1')).toBe('');
  });
});

describe('hasOidcCallbackFragment', () => {
  it('recognises a Keycloak authorization-code callback', () => {
    expect(
      hasOidcCallbackFragment('#state=5668b163&session_state=jnqL&iss=https%3A%2F%2Fx&code=dd81'),
    ).toBe(true);
  });

  it('requires both code and state so an unrelated hash is not mistaken for one', () => {
    expect(hasOidcCallbackFragment('#stage=demo')).toBe(false);
    expect(hasOidcCallbackFragment('#code=only')).toBe(false);
    expect(hasOidcCallbackFragment('#state=only')).toBe(false);
  });

  it('is false for empty, null and undefined', () => {
    expect(hasOidcCallbackFragment('')).toBe(false);
    expect(hasOidcCallbackFragment(null)).toBe(false);
    expect(hasOidcCallbackFragment(undefined)).toBe(false);
  });
});
