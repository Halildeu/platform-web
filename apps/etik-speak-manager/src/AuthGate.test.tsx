import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthGate } from './AuthGate';

let invalidate: (() => void) | undefined;
const initialize = vi.fn();
const resetForRetry = vi.fn();

vi.mock('./auth', () => ({
  initializeManagerSession: () => initialize(),
  resetManagerSessionForRetry: () => resetForRetry(),
  subscribeManagerSessionInvalidation: (listener: () => void) => {
    invalidate = listener;
    return () => {
      invalidate = undefined;
    };
  },
}));

describe('AuthGate sensitive-state boundary', () => {
  beforeEach(() => {
    initialize.mockReset();
    resetForRetry.mockReset();
    invalidate = undefined;
  });

  it('unmounts protected content immediately on session invalidation', async () => {
    initialize.mockResolvedValue('ready');
    render(
      <AuthGate>
        <div>hassas vaka anlatımı</div>
      </AuthGate>,
    );
    expect(await screen.findByText('hassas vaka anlatımı')).toBeInTheDocument();

    act(() => invalidate?.());

    expect(screen.queryByText('hassas vaka anlatımı')).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('oturum güvenli biçimde başlatılamadı');
  });

  it('renders a terminal access denial instead of another redirect', async () => {
    initialize.mockResolvedValue('denied');
    render(<AuthGate>secret</AuthGate>);
    expect(await screen.findByRole('alert')).toHaveTextContent('gerekli yetki, rol ve kapsam');
  });

  // Faz 35 ES: denied ekranı çıkışsızdı — dar kapsamlı suite oturumuyla gelen
  // yetkili kullanıcı yükseltme işaretine takılıp TTL dolana kadar bekliyordu.
  it('lets a denied user retry: clears the upgrade marker and re-runs the gate', async () => {
    initialize.mockResolvedValueOnce('denied').mockResolvedValueOnce('ready');
    render(
      <AuthGate>
        <div>hassas vaka anlatımı</div>
      </AuthGate>,
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('gerekli yetki, rol ve kapsam');
    expect(screen.queryByText('hassas vaka anlatımı')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('manager-session-retry'));

    expect(resetForRetry).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('hassas vaka anlatımı')).toBeInTheDocument();
    expect(initialize).toHaveBeenCalledTimes(2);
  });

  it('offers the same retry path when the session errors out', async () => {
    initialize.mockResolvedValueOnce('ready').mockResolvedValueOnce('ready');
    render(
      <AuthGate>
        <div>hassas vaka anlatımı</div>
      </AuthGate>,
    );
    expect(await screen.findByText('hassas vaka anlatımı')).toBeInTheDocument();

    act(() => invalidate?.());
    expect(screen.getByRole('alert')).toHaveTextContent('oturum güvenli biçimde başlatılamadı');

    fireEvent.click(screen.getByTestId('manager-session-retry'));

    expect(resetForRetry).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('hassas vaka anlatımı')).toBeInTheDocument();
  });
});
