import { beforeEach, describe, expect, it } from 'vitest';
import { claimUpgradeAttempt, hasEthicsManagerContract, managerRedirectUri } from './auth';

describe('Etik Speak manager auth contract', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.history.replaceState({}, '', '/ethic/cases/demo?tab=messages#latest');
  });

  it('requires audience, scope and realm role together', () => {
    const valid = {
      aud: ['ethics-manager'],
      scope: 'openid ethics:case:manage',
      realm_access: { roles: ['ethics-manager'] },
    };
    expect(hasEthicsManagerContract(valid)).toBe(true);
    expect(hasEthicsManagerContract({ ...valid, aud: ['account'] })).toBe(false);
    expect(hasEthicsManagerContract({ ...valid, scope: 'openid' })).toBe(false);
    expect(hasEthicsManagerContract({ ...valid, realm_access: { roles: [] } })).toBe(false);
  });

  it('preserves only same-origin ethic deep links', () => {
    expect(managerRedirectUri()).toBe('http://localhost:3000/ethic/cases/demo?tab=messages');
    window.history.replaceState({}, '', '/unrelated?case=secret');
    expect(managerRedirectUri()).toBe('http://localhost:3000/ethic/');
  });

  it('allows only one bounded authorization upgrade attempt', () => {
    expect(claimUpgradeAttempt()).toBe(true);
    expect(claimUpgradeAttempt()).toBe(false);
  });
});
