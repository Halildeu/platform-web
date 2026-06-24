/**
 * #508 Endpoint Display Policy view tests (Faz 22.5). Mirrors the AG-036
 * OutdatedSoftwareView approach: vi.mock the generated RTK hooks and drive each
 * branch via their return values. The hooks only exist if the builder.query/
 * mutation URLs in endpointAdminApi.ts are correct, so a route typo fails the
 * TypeScript build before this runs.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { DisplayPolicyView } from '../DisplayPolicyView';

vi.mock('../../../../../app/services/endpointAdminApi', () => ({
  useGetDisplayPolicyQuery: vi.fn(),
  useSetDisplayPolicyMutation: vi.fn(),
  useClearDisplayPolicyMutation: vi.fn(),
}));
vi.mock('../../../../../i18n', () => ({
  useEndpointAdminI18n: () => ({ t: (key: string) => key }),
}));

import {
  useGetDisplayPolicyQuery,
  useSetDisplayPolicyMutation,
  useClearDisplayPolicyMutation,
} from '../../../../../app/services/endpointAdminApi';
import type { DisplayPolicyResponse } from '../../../../../entities/endpoint-display-policy/types';

const DEVICE = 'dev-1';

function mockMutations({
  setResponse = {},
  clearResponse = {},
}: {
  setResponse?: Partial<DisplayPolicyResponse>;
  clearResponse?: Partial<DisplayPolicyResponse>;
} = {}) {
  const setTrigger = vi.fn(() => ({
    unwrap: vi.fn().mockResolvedValue(setResponse),
  }));
  const clearTrigger = vi.fn(() => ({
    unwrap: vi.fn().mockResolvedValue(clearResponse),
  }));
  vi.mocked(useSetDisplayPolicyMutation).mockReturnValue([
    setTrigger,
    { isLoading: false },
  ] as unknown as ReturnType<typeof useSetDisplayPolicyMutation>);
  vi.mocked(useClearDisplayPolicyMutation).mockReturnValue([
    clearTrigger,
    { isLoading: false },
  ] as unknown as ReturnType<typeof useClearDisplayPolicyMutation>);
  return { setTrigger, clearTrigger };
}

function mockQuery(value: Record<string, unknown>) {
  const refetch = vi.fn();
  vi.mocked(useGetDisplayPolicyQuery).mockReturnValue({
    refetch,
    ...value,
  } as unknown as ReturnType<typeof useGetDisplayPolicyQuery>);
  return { refetch };
}

describe('DisplayPolicyView', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders the feature-disabled notice on 503 (dark-ship flag off)', () => {
    mockMutations();
    mockQuery({ error: { status: 503 } });
    render(<DisplayPolicyView deviceId={DEVICE} active />);
    expect(screen.getByTestId('display-policy-feature-disabled')).toBeInTheDocument();
  });

  it('renders the current ENFORCE state + a pending open proposal', () => {
    mockMutations();
    mockQuery({
      data: {
        deviceId: DEVICE,
        operation: 'ENFORCE',
        screensaver: {
          enabled: true,
          timeoutSeconds: 600,
          scrPath: 'C:\\Windows\\System32\\scrnsave.scr',
        },
        wallpaper: { enabled: true, style: 'FILL' },
        lastEnforcementStatus: 'SUCCEEDED',
        openProposal: {
          operation: 'CLEAR',
          approvalStatus: 'PENDING',
          commandStatus: 'QUEUED',
          revisionId: 'r',
          commandId: 'c',
        },
      },
    });
    render(<DisplayPolicyView deviceId={DEVICE} active />);
    expect(screen.getByTestId('display-policy-operation')).toHaveTextContent('ENFORCE');
    expect(screen.getByTestId('display-policy-open-proposal')).toHaveTextContent('PENDING');
  });

  it('renders a generic error (NOT "no policy") on a non-404/503 GET error', () => {
    mockMutations();
    mockQuery({ error: { status: 500 } });
    render(<DisplayPolicyView deviceId={DEVICE} active />);
    expect(screen.getByTestId('display-policy-error')).toBeInTheDocument();
    expect(screen.queryByTestId('display-policy-none')).not.toBeInTheDocument();
  });

  it('blocks an ENFORCE with an out-of-range screensaver timeout', () => {
    const { setTrigger } = mockMutations();
    mockQuery({ data: { deviceId: DEVICE, operation: null, openProposal: null } });
    render(<DisplayPolicyView deviceId={DEVICE} active />);
    fireEvent.change(screen.getByTestId('dp-reason'), { target: { value: 'kiosk' } });
    fireEvent.change(screen.getByTestId('dp-ss-timeout'), { target: { value: '10' } }); // < 60
    fireEvent.click(screen.getByTestId('display-policy-propose'));
    expect(screen.getByTestId('display-policy-form-error')).toBeInTheDocument();
    expect(setTrigger).not.toHaveBeenCalled();
  });

  it('shows "no policy" on 404 and blocks a propose without a reason', () => {
    const { setTrigger } = mockMutations();
    mockQuery({ error: { status: 404 } });
    render(<DisplayPolicyView deviceId={DEVICE} active />);
    expect(screen.getByTestId('display-policy-none')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('display-policy-propose'));
    expect(screen.getByTestId('display-policy-form-error')).toBeInTheDocument();
    expect(setTrigger).not.toHaveBeenCalled();
  });

  it('proposes ENFORCE with the form body when a reason is given', async () => {
    const { setTrigger } = mockMutations();
    mockQuery({ data: { deviceId: DEVICE, operation: null, openProposal: null } });
    render(<DisplayPolicyView deviceId={DEVICE} active />);
    fireEvent.change(screen.getByTestId('dp-reason'), { target: { value: 'kiosk lockdown' } });
    fireEvent.click(screen.getByTestId('display-policy-propose'));
    await waitFor(() => expect(setTrigger).toHaveBeenCalledTimes(1));
    expect(setTrigger).toHaveBeenCalledWith(
      expect.objectContaining({
        deviceId: DEVICE,
        body: expect.objectContaining({ operation: 'ENFORCE', reason: 'kiosk lockdown' }),
      }),
    );
  });

  it('renders the pending proposal from a successful ENFORCE response before the refetch returns', async () => {
    const { refetch } = mockQuery({
      data: { deviceId: DEVICE, operation: null, openProposal: null },
    });
    const { setTrigger } = mockMutations({
      setResponse: {
        deviceId: DEVICE,
        operation: null,
        openProposal: {
          operation: 'ENFORCE',
          approvalStatus: 'PENDING',
          commandStatus: 'QUEUED',
          revisionId: 'revision-after-put',
          commandId: 'command-after-put',
        },
      },
    });

    render(<DisplayPolicyView deviceId={DEVICE} active />);
    fireEvent.change(screen.getByTestId('dp-reason'), { target: { value: 'kiosk lockdown' } });
    fireEvent.click(screen.getByTestId('display-policy-propose'));

    await waitFor(() => expect(setTrigger).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByTestId('display-policy-open-proposal')).toHaveTextContent('PENDING'),
    );
    expect(screen.queryByTestId('display-policy-none')).not.toBeInTheDocument();
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('does not show proposal overlay when the mutation fails', async () => {
    const setTrigger = vi.fn(() => ({
      unwrap: vi.fn().mockRejectedValue(new Error('server error')),
    }));
    vi.mocked(useSetDisplayPolicyMutation).mockReturnValue([
      setTrigger,
      { isLoading: false },
    ] as unknown as ReturnType<typeof useSetDisplayPolicyMutation>);
    mockQuery({ data: { deviceId: DEVICE, operation: null, openProposal: null } });
    render(<DisplayPolicyView deviceId={DEVICE} active />);
    fireEvent.change(screen.getByTestId('dp-reason'), { target: { value: 'kiosk' } });
    fireEvent.click(screen.getByTestId('display-policy-propose'));
    await waitFor(() => expect(setTrigger).toHaveBeenCalledTimes(1));
    // Proposal overlay must not appear when the mutation failed
    expect(screen.queryByTestId('display-policy-open-proposal')).not.toBeInTheDocument();
    expect(screen.getByTestId('display-policy-form-error')).toBeInTheDocument();
  });

  it('does not render the propose button when the feature is disabled (503)', () => {
    mockMutations();
    mockQuery({ error: { status: 503 } });
    render(<DisplayPolicyView deviceId={DEVICE} active />);
    expect(screen.queryByTestId('display-policy-propose')).not.toBeInTheDocument();
  });

  it('clears the policy with a reason', async () => {
    const { clearTrigger } = mockMutations();
    mockQuery({ data: { deviceId: DEVICE, operation: 'ENFORCE', openProposal: null } });
    render(<DisplayPolicyView deviceId={DEVICE} active />);
    fireEvent.change(screen.getByTestId('dp-reason'), { target: { value: 'undo' } });
    fireEvent.click(screen.getByTestId('display-policy-clear'));
    await waitFor(() => expect(clearTrigger).toHaveBeenCalledTimes(1));
    expect(clearTrigger).toHaveBeenCalledWith({ deviceId: DEVICE, reason: 'undo' });
  });
});
