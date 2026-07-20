import { describe, expect, it } from 'vitest';
import { hasEthicsManagerContract } from './auth';

describe('Etik Speak manager token contract', () => {
  it('requires audience, scope and realm role together', () => {
    expect(
      hasEthicsManagerContract({
        aud: ['ethics-manager'],
        scope: 'openid ethics:case:manage',
        realm_access: { roles: ['ethics-manager'] },
      }),
    ).toBe(true);
    expect(
      hasEthicsManagerContract({
        aud: ['ethics-manager'],
        scope: 'openid ethics:case:manage',
        realm_access: { roles: [] },
      }),
    ).toBe(false);
  });
});
