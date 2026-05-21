import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PushSubscriptionCard from '../PushSubscriptionCard';
import { notifyPushApi } from '../../../features/notifications/api/notify-push.api';

// Mock identity selector + usePushSubscription hook
vi.mock('../../../features/notifications/model/identity.selectors', () => ({
  selectNotifyIdentity: vi.fn(),
}));

vi.mock('../../../features/notifications/model/use-push-subscription.model', () => ({
  usePushSubscription: vi.fn(),
}));

import { selectNotifyIdentity } from '../../../features/notifications/model/identity.selectors';
import { usePushSubscription } from '../../../features/notifications/model/use-push-subscription.model';

const mockSelectIdentity = selectNotifyIdentity as ReturnType<typeof vi.fn>;
const mockUsePush = usePushSubscription as ReturnType<typeof vi.fn>;

function renderWithStore(ui: React.ReactElement) {
  const store = configureStore({
    reducer: {
      [notifyPushApi.reducerPath]: notifyPushApi.reducer,
    },
    middleware: (gdm) => gdm().concat(notifyPushApi.middleware),
  });
  return render(<Provider store={store}>{ui}</Provider>);
}

describe('PushSubscriptionCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Codex 019e4c0e P2 absorb: vi.stubEnv vs direct assignment
    vi.stubEnv('VITE_NOTIFY_VAPID_PUBLIC_KEY', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('shows configuration-missing warning when VITE_NOTIFY_VAPID_PUBLIC_KEY is empty', () => {
    mockSelectIdentity.mockReturnValue({ orgId: 'acme', subscriberId: '1204' });
    mockUsePush.mockReturnValue({
      isSupported: true,
      isSubscribed: false,
      endpoints: [],
      currentBrowserEndpointId: null,
      status: { kind: 'idle' },
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
      isListLoading: false,
    });

    renderWithStore(<PushSubscriptionCard />);

    expect(screen.getByText(/Tarayıcı bildirimleri yapılandırılmamış/i)).toBeInTheDocument();
    expect(screen.getByText(/VITE_NOTIFY_VAPID_PUBLIC_KEY/)).toBeInTheDocument();
  });

  it('renders nothing when identity is null (parent handles loading)', () => {
    vi.stubEnv('VITE_NOTIFY_VAPID_PUBLIC_KEY', 'test-vapid-public-key');
    mockSelectIdentity.mockReturnValue(null);

    const { container } = renderWithStore(<PushSubscriptionCard />);

    expect(container.firstChild).toBeNull();
  });

  it('shows browser-unsupported state when isSupported is false', () => {
    vi.stubEnv('VITE_NOTIFY_VAPID_PUBLIC_KEY', 'test-vapid-public-key');
    mockSelectIdentity.mockReturnValue({ orgId: 'acme', subscriberId: '1204' });
    mockUsePush.mockReturnValue({
      isSupported: false,
      isSubscribed: false,
      endpoints: [],
      currentBrowserEndpointId: null,
      status: { kind: 'unsupported', reason: 'no_push_manager' },
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
      isListLoading: false,
    });

    renderWithStore(<PushSubscriptionCard />);

    expect(screen.getByText(/Tarayıcı bildirimleri desteklenmiyor/i)).toBeInTheDocument();
    expect(screen.getByText(/no_push_manager/)).toBeInTheDocument();
  });

  it('shows Subscribe button when not subscribed and supported', () => {
    vi.stubEnv('VITE_NOTIFY_VAPID_PUBLIC_KEY', 'test-vapid-public-key');
    mockSelectIdentity.mockReturnValue({ orgId: 'acme', subscriberId: '1204' });
    mockUsePush.mockReturnValue({
      isSupported: true,
      isSubscribed: false,
      endpoints: [],
      currentBrowserEndpointId: null,
      status: { kind: 'idle' },
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
      isListLoading: false,
    });

    renderWithStore(<PushSubscriptionCard />);

    const btn = screen.getByTestId('push-subscription-subscribe-button');
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveTextContent(/Aboneliği aç/i);
  });

  it('shows Unsubscribe button when subscribed', () => {
    vi.stubEnv('VITE_NOTIFY_VAPID_PUBLIC_KEY', 'test-vapid-public-key');
    mockSelectIdentity.mockReturnValue({ orgId: 'acme', subscriberId: '1204' });
    mockUsePush.mockReturnValue({
      isSupported: true,
      isSubscribed: true,
      endpoints: [
        {
          endpointId: '11111111-2222-3333-4444-555555555555',
          userAgent: 'Mozilla/5.0 Chrome',
          platformHint: 'Chrome',
          createdAt: '2026-05-21T10:00:00Z',
          lastSeenAt: '2026-05-21T12:30:00Z',
        },
      ],
      currentBrowserEndpointId: '11111111-2222-3333-4444-555555555555',
      status: { kind: 'subscribed' },
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
      isListLoading: false,
    });

    renderWithStore(<PushSubscriptionCard />);

    expect(screen.getByTestId('push-subscription-unsubscribe-button')).toBeInTheDocument();
    expect(screen.getByText(/bu tarayıcıda bildirimler etkin/i)).toBeInTheDocument();
  });

  it('shows permission-denied warning', () => {
    vi.stubEnv('VITE_NOTIFY_VAPID_PUBLIC_KEY', 'test-vapid-public-key');
    mockSelectIdentity.mockReturnValue({ orgId: 'acme', subscriberId: '1204' });
    mockUsePush.mockReturnValue({
      isSupported: true,
      isSubscribed: false,
      endpoints: [],
      currentBrowserEndpointId: null,
      status: { kind: 'permission-denied' },
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
      isListLoading: false,
    });

    renderWithStore(<PushSubscriptionCard />);

    expect(screen.getByText(/Bildirim izni reddedildi/i)).toBeInTheDocument();
  });

  // Codex 019e4c0e P2 absorb: click action assertions added
  it('calls subscribe handler when subscribe button clicked', () => {
    vi.stubEnv('VITE_NOTIFY_VAPID_PUBLIC_KEY', 'test-vapid-public-key');
    mockSelectIdentity.mockReturnValue({ orgId: 'acme', subscriberId: '1204' });
    const subscribeMock = vi.fn();
    mockUsePush.mockReturnValue({
      isSupported: true,
      isSubscribed: false,
      endpoints: [],
      currentBrowserEndpointId: null,
      status: { kind: 'idle' },
      subscribe: subscribeMock,
      unsubscribe: vi.fn(),
      isListLoading: false,
    });

    renderWithStore(<PushSubscriptionCard />);

    fireEvent.click(screen.getByTestId('push-subscription-subscribe-button'));
    expect(subscribeMock).toHaveBeenCalledTimes(1);
  });

  it('calls unsubscribe handler when unsubscribe button clicked', () => {
    vi.stubEnv('VITE_NOTIFY_VAPID_PUBLIC_KEY', 'test-vapid-public-key');
    mockSelectIdentity.mockReturnValue({ orgId: 'acme', subscriberId: '1204' });
    const unsubscribeMock = vi.fn();
    mockUsePush.mockReturnValue({
      isSupported: true,
      isSubscribed: true,
      endpoints: [
        {
          endpointId: '11111111-2222-3333-4444-555555555555',
          userAgent: 'Mozilla/5.0 Chrome',
          platformHint: 'Chrome',
          createdAt: '2026-05-21T10:00:00Z',
          lastSeenAt: '2026-05-21T12:30:00Z',
        },
      ],
      currentBrowserEndpointId: '11111111-2222-3333-4444-555555555555',
      status: { kind: 'subscribed' },
      subscribe: vi.fn(),
      unsubscribe: unsubscribeMock,
      isListLoading: false,
    });

    renderWithStore(<PushSubscriptionCard />);

    fireEvent.click(screen.getByTestId('push-subscription-unsubscribe-button'));
    expect(unsubscribeMock).toHaveBeenCalledTimes(1);
  });

  it('disables button when status is loading', () => {
    vi.stubEnv('VITE_NOTIFY_VAPID_PUBLIC_KEY', 'test-vapid-public-key');
    mockSelectIdentity.mockReturnValue({ orgId: 'acme', subscriberId: '1204' });
    mockUsePush.mockReturnValue({
      isSupported: true,
      isSubscribed: false,
      endpoints: [],
      currentBrowserEndpointId: null,
      status: { kind: 'loading' },
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
      isListLoading: false,
    });

    renderWithStore(<PushSubscriptionCard />);

    const btn = screen.getByTestId('push-subscription-subscribe-button');
    expect(btn).toBeDisabled();
  });

  it('shows error feedback when status is error', () => {
    vi.stubEnv('VITE_NOTIFY_VAPID_PUBLIC_KEY', 'test-vapid-public-key');
    mockSelectIdentity.mockReturnValue({ orgId: 'acme', subscriberId: '1204' });
    mockUsePush.mockReturnValue({
      isSupported: true,
      isSubscribed: false,
      endpoints: [],
      currentBrowserEndpointId: null,
      status: { kind: 'error', message: 'network unreachable' },
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
      isListLoading: false,
    });

    renderWithStore(<PushSubscriptionCard />);

    expect(screen.getByText(/network unreachable/i)).toBeInTheDocument();
    expect(screen.getByText(/Hata:/i)).toBeInTheDocument();
  });
});
