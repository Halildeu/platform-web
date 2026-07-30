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

  it('grants the ethics manager scope on the in-shell /admin/ethics route', () => {
    expect(resolveKeycloakRouteScope('https://testai.acik.com/admin/ethics')).toBe(
      'openid ethics-manager-audience ethics:case:manage',
    );
    expect(resolveKeycloakRouteScope('https://testai.acik.com/admin/ethics/cases')).toBe(
      'openid ethics-manager-audience ethics:case:manage',
    );
  });

  it('does not leak the ethics scope onto neighbouring admin routes', () => {
    expect(resolveKeycloakRouteScope('https://testai.acik.com/admin/ethicsish')).toBeUndefined();
    expect(resolveKeycloakRouteScope('https://testai.acik.com/admin')).toBeUndefined();
  });
});
