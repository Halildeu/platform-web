import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthGate } from './AuthGate';

let invalidate: (() => void) | undefined;
const initialize = vi.fn();

vi.mock('./auth', () => ({
  initializeManagerSession: () => initialize(),
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
});
