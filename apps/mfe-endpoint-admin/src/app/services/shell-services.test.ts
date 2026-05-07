import { describe, it, expect, afterEach } from 'vitest';
import { resolveAuthToken, registerAuthTokenResolver } from '@mfe/shared-http';
import { configureShellServices, getShellServices } from './shell-services';

/**
 * Codex iter-2 PARTIAL absorb (must-fix #1) coverage:
 * shell ↔ remote token bridge boundary testi. Shell tarafı
 * `wireRemoteShellServices()` içinde `configureShellServices({ auth:
 * { getToken } })` çağırıyor; remote `registerAuthTokenResolver(...)`
 * ile **kendi shared-http instance**'ında token resolver kuruyor.
 *
 * Bu test, dev-mode'da `@mfe/shared-http` MF singleton paylaşımı
 * yokken bile injection sözleşmesinin token bridge'ini kurduğunu
 * kanıtlar.
 */
describe('endpoint-admin shell-services bridge', () => {
  afterEach(() => {
    registerAuthTokenResolver(undefined);
  });

  // İlk test sırası: standalone fallback. `configureShellServices`
  // henüz çağrılmadığı için `currentServices` null kalır ve fallback
  // dönmeli. Sonraki testler `currentServices`'ı module-level olarak
  // set eder; reset API'si yok, bu yüzden order-sensitive.
  it('returns the noop fallback in standalone dev (no shell mount)', () => {
    const services = getShellServices();
    expect(services.auth.getToken()).toBeNull();
  });

  it('configureShellServices wires the auth resolver into shared-http', () => {
    expect(resolveAuthToken()).toBeNull();

    configureShellServices({
      auth: {
        getToken: () => 'shell-injected-token',
        getUser: () => ({ id: 'demo' }),
      },
    });

    expect(resolveAuthToken()).toBe('shell-injected-token');
  });

  it('the resolver tracks the most recent configureShellServices call', () => {
    configureShellServices({
      auth: {
        getToken: () => 'first',
        getUser: () => null,
      },
    });
    expect(resolveAuthToken()).toBe('first');

    configureShellServices({
      auth: {
        getToken: () => 'second',
        getUser: () => null,
      },
    });
    expect(resolveAuthToken()).toBe('second');
  });
});
