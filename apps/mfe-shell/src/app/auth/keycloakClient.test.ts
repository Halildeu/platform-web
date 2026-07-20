import { describe, expect, it } from 'vitest';
import { buildKeycloakLoginOptions, hasEthicsManagerTokenContract } from './keycloakClient';

const token = (claims: Record<string, unknown>) =>
  `header.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.signature`;

describe('buildKeycloakLoginOptions', () => {
  it('Etik Speak manager dönüşünde audience ve yönetim scope talep eder', () => {
    expect(buildKeycloakLoginOptions('https://testai.acik.com/ethic')).toEqual({
      redirectUri: 'https://testai.acik.com/ethic',
      scope: 'openid ethics-manager-audience ethics:case:manage',
    });
    expect(buildKeycloakLoginOptions('https://testai.acik.com/ethic/case/123')).toEqual({
      redirectUri: 'https://testai.acik.com/ethic/case/123',
      scope: 'openid ethics-manager-audience ethics:case:manage',
    });
  });

  it('suite içindeki diğer modüllere Etik Speak yetkisi taşımaz', () => {
    expect(buildKeycloakLoginOptions('https://testai.acik.com/meeting')).toEqual({
      redirectUri: 'https://testai.acik.com/meeting',
    });
    expect(buildKeycloakLoginOptions('not a valid redirect')).toEqual({
      redirectUri: 'not a valid redirect',
    });
  });

  it('benzer isimli bir yolu Etik Speak rotası saymaz', () => {
    expect(buildKeycloakLoginOptions('https://testai.acik.com/ethical-decoy')).toEqual({
      redirectUri: 'https://testai.acik.com/ethical-decoy',
    });
  });

  it('mevcut suite tokenında exact Etik staff kontratını fail-closed doğrular', () => {
    expect(
      hasEthicsManagerTokenContract(
        token({
          aud: ['frontend', 'ethics-manager'],
          scope: 'openid profile ethics:case:manage',
          realm_access: { roles: ['ethics-manager'] },
        }),
      ),
    ).toBe(true);
    expect(
      hasEthicsManagerTokenContract(
        token({
          aud: ['frontend'],
          scope: 'openid profile',
          realm_access: { roles: ['ethics-manager'] },
        }),
      ),
    ).toBe(false);
    expect(hasEthicsManagerTokenContract('not-a-jwt')).toBe(false);
  });
});
