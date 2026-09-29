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
  useUploadDisplayPolicyAssetMutation: vi.fn(),
}));
vi.mock('../../../../../i18n', () => ({
  useEndpointAdminI18n: () => ({ t: (key: string) => key }),
}));

import {
  useGetDisplayPolicyQuery,
  useSetDisplayPolicyMutation,
  useClearDisplayPolicyMutation,
  useUploadDisplayPolicyAssetMutation,
} from '../../../../../app/services/endpointAdminApi';
import type {
  DisplayPolicyAssetResponse,
  DisplayPolicyResponse,
} from '../../../../../entities/endpoint-display-policy/types';

const DEVICE = 'dev-1';
const SHA = 'ab'.repeat(32);
const UPLOADED: DisplayPolicyAssetResponse = {
  assetRef: `asset:sha256:${SHA}`,
  assetSha256: SHA,
  contentType: 'image/png',
  sizeBytes: 2 * 1024 * 1024,
  created: true,
  createdAt: '2026-09-29T10:00:00Z',
};

function mockMutations({
  setResponse = {},
  clearResponse = {},
  upload = () => Promise.resolve(UPLOADED),
}: {
  setResponse?: Partial<DisplayPolicyResponse>;
  clearResponse?: Partial<DisplayPolicyResponse>;
  upload?: () => Promise<DisplayPolicyAssetResponse>;
} = {}) {
  const setTrigger = vi.fn(() => ({
    unwrap: vi.fn().mockResolvedValue(setResponse),
  }));
  const clearTrigger = vi.fn(() => ({
    unwrap: vi.fn().mockResolvedValue(clearResponse),
  }));
  const uploadTrigger = vi.fn(() => ({ unwrap: upload }));
  vi.mocked(useSetDisplayPolicyMutation).mockReturnValue([
    setTrigger,
    { isLoading: false },
  ] as unknown as ReturnType<typeof useSetDisplayPolicyMutation>);
  vi.mocked(useClearDisplayPolicyMutation).mockReturnValue([
    clearTrigger,
    { isLoading: false },
  ] as unknown as ReturnType<typeof useClearDisplayPolicyMutation>);
  vi.mocked(useUploadDisplayPolicyAssetMutation).mockReturnValue([
    uploadTrigger,
    { isLoading: false },
  ] as unknown as ReturnType<typeof useUploadDisplayPolicyAssetMutation>);
  return { setTrigger, clearTrigger, uploadTrigger };
}

function pickFile(file: File) {
  fireEvent.change(screen.getByTestId('dp-wp-file'), { target: { files: [file] } });
}

function png(name = 'corp.png') {
  return new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], name, { type: 'image/png' });
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
          policyHashSha256: null,
          createdBySubject: null,
          createdAt: null,
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

  // ── #1203 managed wallpaper ──────────────────────────────────────────────

  it('uploads an image and proposes a wallpaper-only ENFORCE with the managed ref', async () => {
    const { setTrigger, uploadTrigger } = mockMutations();
    mockQuery({ error: { status: 404 } });
    render(<DisplayPolicyView deviceId={DEVICE} active />);

    fireEvent.click(screen.getByTestId('dp-ss-managed')); // leave the screensaver alone
    fireEvent.click(screen.getByTestId('dp-wp-enabled'));
    const file = png();
    pickFile(file);
    await waitFor(() => expect(screen.getByTestId('dp-wp-uploaded')).toBeInTheDocument());
    expect(uploadTrigger).toHaveBeenCalledWith(file);
    expect(screen.getByTestId('dp-wp-assetref')).toBeDisabled();

    fireEvent.change(screen.getByTestId('dp-reason'), { target: { value: 'kurumsal görsel' } });
    fireEvent.click(screen.getByTestId('display-policy-propose'));
    await waitFor(() => expect(setTrigger).toHaveBeenCalledTimes(1));
    expect(setTrigger).toHaveBeenCalledWith({
      deviceId: DEVICE,
      body: {
        operation: 'ENFORCE',
        reason: 'kurumsal görsel',
        screensaver: null,
        wallpaper: {
          enabled: true,
          style: 'FILL',
          userCannotChange: true,
          assetRef: `asset:sha256:${SHA}`,
          assetSha256: SHA,
          contentType: 'image/png',
        },
      },
    });
  });

  it('refuses a non-image file before uploading it', () => {
    const { uploadTrigger } = mockMutations();
    mockQuery({ error: { status: 404 } });
    render(<DisplayPolicyView deviceId={DEVICE} active />);
    fireEvent.click(screen.getByTestId('dp-wp-enabled'));
    pickFile(new File(['MZ'], 'setup.exe', { type: 'application/x-msdownload' }));
    expect(screen.getByTestId('dp-wp-upload-error').textContent).toBe(
      'endpointAdmin.displayPolicy.upload.typeInvalid',
    );
    expect(uploadTrigger).not.toHaveBeenCalled();
  });

  it('refuses an image over 10 MB before uploading it', () => {
    const { uploadTrigger } = mockMutations();
    mockQuery({ error: { status: 404 } });
    render(<DisplayPolicyView deviceId={DEVICE} active />);
    fireEvent.click(screen.getByTestId('dp-wp-enabled'));
    const big = png('big.png');
    Object.defineProperty(big, 'size', { value: 10 * 1024 * 1024 + 1 });
    pickFile(big);
    expect(screen.getByTestId('dp-wp-upload-error').textContent).toBe(
      'endpointAdmin.displayPolicy.upload.tooLarge',
    );
    expect(uploadTrigger).not.toHaveBeenCalled();
  });

  it('explains a 415 from the server as an unsupported image type', async () => {
    mockMutations({ upload: () => Promise.reject({ status: 415 }) });
    mockQuery({ error: { status: 404 } });
    render(<DisplayPolicyView deviceId={DEVICE} active />);
    fireEvent.click(screen.getByTestId('dp-wp-enabled'));
    pickFile(png());
    await waitFor(() =>
      expect(screen.getByTestId('dp-wp-upload-error').textContent).toBe(
        'endpointAdmin.displayPolicy.upload.typeInvalid',
      ),
    );
    expect(screen.queryByTestId('dp-wp-uploaded')).not.toBeInTheDocument();
  });

  it('requires an image or a device path when the wallpaper is managed', () => {
    const { setTrigger } = mockMutations();
    mockQuery({ error: { status: 404 } });
    render(<DisplayPolicyView deviceId={DEVICE} active />);
    fireEvent.click(screen.getByTestId('dp-wp-enabled'));
    fireEvent.change(screen.getByTestId('dp-reason'), { target: { value: 'x' } });
    fireEvent.click(screen.getByTestId('display-policy-propose'));
    expect(screen.getByTestId('display-policy-form-error').textContent).toBe(
      'endpointAdmin.displayPolicy.wallpaperImageRequired',
    );
    expect(setTrigger).not.toHaveBeenCalled();
  });

  it('refuses a proposal that manages neither the screensaver nor the wallpaper', () => {
    const { setTrigger } = mockMutations();
    mockQuery({ error: { status: 404 } });
    render(<DisplayPolicyView deviceId={DEVICE} active />);
    fireEvent.click(screen.getByTestId('dp-ss-managed'));
    fireEvent.change(screen.getByTestId('dp-reason'), { target: { value: 'x' } });
    fireEvent.click(screen.getByTestId('display-policy-propose'));
    expect(screen.getByTestId('display-policy-form-error').textContent).toBe(
      'endpointAdmin.displayPolicy.nothingToEnforce',
    );
    expect(setTrigger).not.toHaveBeenCalled();
  });

  it('shows an applied uploaded wallpaper as an uploaded, locked image', () => {
    mockMutations();
    mockQuery({
      data: {
        deviceId: DEVICE,
        operation: 'ENFORCE',
        screensaver: null,
        wallpaper: {
          enabled: true,
          style: 'FILL',
          userCannotChange: true,
          assetRef: `asset:sha256:${SHA}`,
        },
        openProposal: null,
      },
    });
    render(<DisplayPolicyView deviceId={DEVICE} active />);
    expect(screen.getByTestId('display-policy-wallpaper').textContent).toBe(
      `✓ · FILL · endpointAdmin.displayPolicy.current.uploadedImage (sha256 ${SHA.slice(0, 12)}…) · endpointAdmin.displayPolicy.current.locked`,
    );
  });
});
