import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, clearAccessTokenProvider, registerAccessTokenProvider } from './standalone-http';

describe('Etik Speak manager HTTP boundary', () => {
  afterEach(() => {
    clearAccessTokenProvider();
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
});
