import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Faz 35 (#885 UX) — the contract that was missing when the product moved into
 * the shell: the remote must register the shell's live token getter on ITS OWN
 * shared-http instance.
 *
 * The live symptom this pins: the case list requested /api/v1/ethics/cases with
 * no Authorization header and ethics-service answered 401, while the account's
 * whole authority chain and the token itself were correct. Measured in the
 * browser: attaching the shell's token by hand returned the case list 200.
 */
const registerAuthTokenResolver = vi.fn();
vi.mock('@mfe/shared-http', () => ({
  api: { get: vi.fn() },
  registerAuthTokenResolver: (fn: () => string | null) => registerAuthTokenResolver(fn),
  logExpected: () => undefined,
}));

import { configureShellServices, getShellServices } from './shell-services';

describe('Etik Speak kabuk servisleri', () => {
  beforeEach(() => registerAuthTokenResolver.mockClear());

  it('kabuk yapılandırınca token çözücüsünü kendi shared-http örneğine kaydeder', () => {
    configureShellServices({ auth: { getToken: () => 'kabuk-tokeni', getUser: () => null } });

    expect(registerAuthTokenResolver).toHaveBeenCalledTimes(1);
    const resolver = registerAuthTokenResolver.mock.calls[0][0] as () => string | null;
    expect(resolver()).toBe('kabuk-tokeni');
  });

  /**
   * Referansla okunur, kopyalanmaz: kabuk sessiz SSO ile token'ı yenilediğinde
   * remote'un elindeki değer bayatlamamalı — bayatlarsa kullanıcı, oturumu
   * açıkken 401 görür ve sebebi görünmez olur.
   */
  it('token yenilendiğinde bayat kopya tutmaz', () => {
    let live = 'ilk';
    configureShellServices({ auth: { getToken: () => live, getUser: () => null } });
    const resolver = registerAuthTokenResolver.mock.calls[0][0] as () => string | null;

    expect(resolver()).toBe('ilk');
    live = 'yenilenmis';
    expect(resolver()).toBe('yenilenmis');
  });

  /**
   * Kabuk yokken (bağımsız hücre) token uydurulmaz: fail-closed.
   *
   * Modül durumu taşındığı için taze bir modül örneğiyle ölçülür — aynı
   * dosyadaki önceki testler yapılandırma yaptığı için, sırayla koşan bir
   * iddia burada YANLIŞ sebeple geçerdi.
   */
  it('kabuk yapılandırmadıysa token null döner', async () => {
    vi.resetModules();
    const fresh = await import('./shell-services');
    expect(fresh.getShellServices().auth.getToken()).toBeNull();
  });
});
