import { describe, expect, it } from 'vitest';
import { resolveKeycloakRouteScope } from './keycloakRouteScope';

describe('resolveKeycloakRouteScope', () => {
  it('keeps the budget planner scope exact across clean, nested and callback URLs', () => {
    const expected = 'openid budget:read budget:write';

    expect(resolveKeycloakRouteScope('https://testai.acik.com/admin/reports/budget-control')).toBe(
      expected,
    );
    expect(resolveKeycloakRouteScope('https://testai.acik.com/reports/budget-control/detail')).toBe(
      expected,
    );
    expect(
      resolveKeycloakRouteScope(
        'https://testai.acik.com/admin/reports/budget-control#state=safe&code=callback',
      ),
    ).toBe(expected);
    expect(expected).not.toContain('budget:approve');
  });

  it('does not grant budget scopes to similar, unrelated or invalid routes', () => {
    expect(
      resolveKeycloakRouteScope('https://testai.acik.com/admin/reports/budget-controller'),
    ).toBeUndefined();
    expect(resolveKeycloakRouteScope('https://testai.acik.com/home')).toBeUndefined();
    expect(resolveKeycloakRouteScope('not a valid redirect')).toBeUndefined();
  });

  it('preserves the existing exact Etik Speak staff route contract', () => {
    expect(resolveKeycloakRouteScope('https://testai.acik.com/ethic')).toBe(
      'openid ethics-manager-audience ethics:case:manage',
    );
    expect(resolveKeycloakRouteScope('https://testai.acik.com/ethical-decoy')).toBeUndefined();
  });
});
