import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  api,
  clearAccessTokenProvider,
  clearAuthorizationFailureHandler,
  registerAccessTokenProvider,
  registerAuthorizationFailureHandler,
} from './standalone-http';

describe('Etik Speak manager HTTP boundary', () => {
  afterEach(() => {
    clearAccessTokenProvider();
    clearAuthorizationFailureHandler();
    vi.unstubAllGlobals();
  });

  it('forces the refreshed provider token on every request', async () => {
    const tokenProvider = vi.fn().mockResolvedValue('fresh-token');
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    registerAccessTokenProvider(tokenProvider);
    vi.stubGlobal('fetch', fetchMock);

    await api.get('/v1/ethics/cases', { headers: { 'X-Request-ID': 'safe' } });

    expect(tokenProvider).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/ethics/cases',
      expect.objectContaining({
        credentials: 'omit',
        headers: expect.objectContaining({
          Authorization: 'Bearer fresh-token',
          'X-Request-ID': 'safe',
        }),
      }),
    );
  });

  it.each(['Authorization', 'authorization', 'Cookie', 'cOoKiE'])(
    'rejects caller control of protected header %s',
    async (name) => {
      registerAccessTokenProvider(vi.fn().mockResolvedValue('fresh-token'));
      vi.stubGlobal('fetch', vi.fn());
      await expect(
        api.get('/v1/ethics/cases', { headers: { [name]: 'attacker' } }),
      ).rejects.toThrow('Korunan HTTP başlığı');
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it('fails closed after the provider is cleared', async () => {
    registerAccessTokenProvider(vi.fn().mockResolvedValue('fresh-token'));
    clearAccessTokenProvider();
    await expect(api.get('/v1/ethics/cases')).rejects.toThrow('oturumu henüz hazır değil');
  });

  it.each([401, 403])('invalidates the protected tree on session-level HTTP %s', async (status) => {
    const invalidate = vi.fn();
    registerAuthorizationFailureHandler(invalidate);
    registerAccessTokenProvider(vi.fn().mockResolvedValue('fresh-token'));
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ code: 'AUTHORIZATION_LOST' }), {
          status,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );

    await expect(api.get('/v1/ethics/cases')).rejects.toMatchObject({ response: { status } });
    expect(invalidate).toHaveBeenCalledOnce();
    await expect(api.get('/v1/ethics/cases')).rejects.toThrow('oturumu henüz hazır değil');
  });

  it('does not turn object-level 404 into a global session invalidation', async () => {
    const invalidate = vi.fn();
    registerAuthorizationFailureHandler(invalidate);
    registerAccessTokenProvider(vi.fn().mockResolvedValue('fresh-token'));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 404 })));

    await expect(api.get('/v1/ethics/cases/masked')).rejects.toMatchObject({
      response: { status: 404 },
    });
    expect(invalidate).not.toHaveBeenCalled();
  });
});
