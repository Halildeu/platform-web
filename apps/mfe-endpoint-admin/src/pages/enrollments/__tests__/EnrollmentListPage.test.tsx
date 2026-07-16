/**
 * WEB-017 — EnrollmentListPage slice tests.
 *
 * Pattern mirrors WEB-013 HardwareInventoryView tests: vi.mock the RTK
 * Query slice + i18n + useManageGate; drive each branch via the
 * generated hooks' return values.
 *
 * Codex 019e711f iter-1 must-fix #7 covered: list happy/empty/error/403,
 * create flow, token modal reveal-once, MANAGE gate, install snippet
 * single-quote escape, and snippet path uses /endpoint-admin/...
 * (covered indirectly by the slice mock — the URL is set in
 * endpointAdminApi.ts and the test asserts the canonical hook).
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import EnrollmentListPage from '../EnrollmentListPage';
import type {
  CreateEndpointEnrollmentResponse,
  EndpointEnrollment,
} from '../../../entities/endpoint-enrollment/types';

const mockCreate = vi.fn();
const mockResetCreate = vi.fn();

vi.mock('../../../app/services/endpointAdminApi', () => ({
  endpointAdminApi: {
    useListEndpointEnrollmentsQuery: vi.fn(),
    useCreateEndpointEnrollmentMutation: vi.fn(),
  },
}));

vi.mock('../../../i18n', () => ({
  useEndpointAdminI18n: () => ({ t: (key: string) => key }),
}));

let canManageMock = true;
vi.mock('../../compliance-policies/useManageGate', () => ({
  useManageGate: () => canManageMock,
}));

import { endpointAdminApi } from '../../../app/services/endpointAdminApi';

const mockedList = endpointAdminApi.useListEndpointEnrollmentsQuery as ReturnType<typeof vi.fn>;
const mockedCreateHook = endpointAdminApi.useCreateEndpointEnrollmentMutation as ReturnType<
  typeof vi.fn
>;

/** 64-hex stand-in for endpoint_agent_zip_sha256 in the discovery manifest. */
const ONE_CMD_SHA = 'a1b2c3d4'.repeat(8);

function manifestResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body } as unknown as Response;
}

/**
 * Default discovery-fetch stub: the REAL /current/ release-manifest.json shape
 * (live testai: `release_tag`, NO `version` field — only the zip hash is
 * required; verified live 2026-06-10).
 */
function stubValidManifest(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      manifestResponse({
        schema_version: 1,
        release_tag: 'v0.2.3',
        signing_tier: 'trusted-internal-ca',
        endpoint_agent_zip: 'EndpointAgent.zip',
        endpoint_agent_zip_sha256: ONE_CMD_SHA,
      }),
    ),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  canManageMock = true;
  mockedCreateHook.mockReturnValue([mockCreate, { isLoading: false, reset: mockResetCreate }]);
  stubValidManifest();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function row(overrides: Partial<EndpointEnrollment> = {}): EndpointEnrollment {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    tenantId: '22222222-2222-2222-2222-222222222222',
    status: 'PENDING',
    requestedBySubject: 'admin@example.com',
    note: 'HALILKOOLUB735 lab',
    deviceId: null,
    expiresAt: '2026-05-29T12:00:00Z',
    consumedAt: null,
    createdAt: '2026-05-29T11:00:00Z',
    ...overrides,
  };
}

describe('EnrollmentListPage', () => {
  it('renders empty state when list returns []', () => {
    mockedList.mockReturnValue({ data: [], error: undefined, isLoading: false, isFetching: false });
    render(<EnrollmentListPage apiUrlOverride="https://example/api" />);
    expect(screen.getByTestId('enrollment-list-empty')).toBeInTheDocument();
  });

  it('renders rows when list returns data', () => {
    mockedList.mockReturnValue({
      data: [row(), row({ id: '33333333-3333-3333-3333-333333333333', status: 'CONSUMED' })],
      error: undefined,
      isLoading: false,
      isFetching: false,
    });
    render(<EnrollmentListPage apiUrlOverride="https://example/api" />);
    expect(screen.getByTestId('enrollment-list-table')).toBeInTheDocument();
    expect(
      screen.getByTestId('enrollment-row-11111111-1111-1111-1111-111111111111'),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('enrollment-row-status-33333333-3333-3333-3333-333333333333'),
    ).toHaveTextContent('CONSUMED');
  });

  it('shows forbidden capability state on 403', () => {
    mockedList.mockReturnValue({
      data: undefined,
      error: { status: 403 },
      isLoading: false,
      isFetching: false,
    });
    render(<EnrollmentListPage apiUrlOverride="https://example/api" />);
    const state = screen.getByTestId('enrollment-list-state');
    expect(state.getAttribute('data-capability-kind')).toBe('forbidden');
  });

  it('shows generic error capability state on non-403 failures', () => {
    mockedList.mockReturnValue({
      data: undefined,
      error: { status: 500 },
      isLoading: false,
      isFetching: false,
    });
    render(<EnrollmentListPage apiUrlOverride="https://example/api" />);
    const state = screen.getByTestId('enrollment-list-state');
    expect(state.getAttribute('data-capability-kind')).toBe('error');
  });

  it('disables create button when canManage is false', () => {
    canManageMock = false;
    mockedList.mockReturnValue({ data: [], error: undefined, isLoading: false, isFetching: false });
    render(<EnrollmentListPage apiUrlOverride="https://example/api" />);
    const btn = screen.getByTestId('enrollment-list-page-create');
    expect(btn).toBeDisabled();
  });

  // S4b — shared accessible manage-hint wiring (Codex 019f67ba a11y spec).
  it('renders the manage-hint + wires create button aria-describedby/title when canManage=false', () => {
    canManageMock = false;
    mockedList.mockReturnValue({ data: [], error: undefined, isLoading: false, isFetching: false });
    render(<EnrollmentListPage apiUrlOverride="https://example/api" />);
    const hint = screen.getByTestId('enrollment-list-manage-hint');
    expect(hint.id).toBeTruthy();
    const createBtn = screen.getByTestId('enrollment-list-page-create');
    expect(createBtn.getAttribute('aria-describedby')).toBe(hint.id);
    expect(createBtn.getAttribute('title')).toBeTruthy();
  });

  it('omits the manage-hint and create button aria-describedby when canManage=true', () => {
    mockedList.mockReturnValue({ data: [], error: undefined, isLoading: false, isFetching: false });
    render(<EnrollmentListPage apiUrlOverride="https://example/api" />);
    expect(screen.queryByTestId('enrollment-list-manage-hint')).toBeNull();
    expect(
      screen.getByTestId('enrollment-list-page-create').getAttribute('aria-describedby'),
    ).toBeNull();
  });

  it('opens create dialog and shows token modal on submit success', async () => {
    const response: CreateEndpointEnrollmentResponse = {
      enrollmentId: '44444444-4444-4444-4444-444444444444',
      token: "raw-token-with-'-single-quote",
      expiresAt: '2026-05-29T13:00:00Z',
    };
    mockedList.mockReturnValue({ data: [], error: undefined, isLoading: false, isFetching: false });
    mockCreate.mockReturnValue({ unwrap: () => Promise.resolve(response) });

    render(<EnrollmentListPage apiUrlOverride="https://example/api" />);
    fireEvent.click(screen.getByTestId('enrollment-list-page-create'));
    expect(screen.getByTestId('create-enrollment-dialog')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('create-enrollment-dialog-submit'));
    // Allow microtasks to flush
    await Promise.resolve();
    await Promise.resolve();

    expect(screen.queryByTestId('create-enrollment-dialog')).not.toBeInTheDocument();
    expect(screen.getByTestId('enrollment-token-modal')).toBeInTheDocument();
    expect(screen.getByTestId('enrollment-token-modal-raw')).toHaveTextContent(
      "raw-token-with-'-single-quote",
    );
    // PowerShell single-quote escape in snippet (Codex must-fix #5)
    const snippet = screen.getByTestId('enrollment-token-modal-snippet').textContent ?? '';
    expect(snippet).toContain("'raw-token-with-''-single-quote'");
    expect(snippet).toContain("'https://example/api'");
  });

  it('closes token modal and drops the raw token from the DOM', async () => {
    const response: CreateEndpointEnrollmentResponse = {
      enrollmentId: '55555555-5555-5555-5555-555555555555',
      token: 'reveal-once-token',
      expiresAt: '2026-05-29T13:00:00Z',
    };
    mockedList.mockReturnValue({ data: [], error: undefined, isLoading: false, isFetching: false });
    mockCreate.mockReturnValue({ unwrap: () => Promise.resolve(response) });

    render(<EnrollmentListPage apiUrlOverride="https://example/api" />);
    fireEvent.click(screen.getByTestId('enrollment-list-page-create'));
    fireEvent.click(screen.getByTestId('create-enrollment-dialog-submit'));
    await Promise.resolve();
    await Promise.resolve();

    expect(screen.getByText('reveal-once-token')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('enrollment-token-modal-close'));
    expect(screen.queryByText('reveal-once-token')).not.toBeInTheDocument();
    expect(screen.queryByTestId('enrollment-token-modal')).not.toBeInTheDocument();
  });

  it('rejects invalid expiresInMinutes (0) with validation error', async () => {
    // Codex 019e713c iter-1 un-skip: directly submit the form so the
    // controlled-input batched re-render and the form handler share a
    // single microtask flush. waitFor pulls until the error node
    // appears (max 1s by default; the real time-to-render here is
    // < 16ms).
    mockedList.mockReturnValue({ data: [], error: undefined, isLoading: false, isFetching: false });
    render(<EnrollmentListPage apiUrlOverride="https://example/api/v1/endpoint-agent" />);
    fireEvent.click(screen.getByTestId('enrollment-list-page-create'));
    const input = screen.getByTestId('create-enrollment-dialog-expires-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '0' } });
    const form = input.closest('form');
    expect(form).not.toBeNull();
    fireEvent.submit(form!);
    await waitFor(() => {
      expect(screen.getByTestId('create-enrollment-dialog-error')).toBeInTheDocument();
    });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('shows not-enabled (not-deployed) capability state on 404 (Codex iter-1 P1)', () => {
    // Codex 019e713c iter-1 must-fix #2: 404 was silently swallowed. Under the
    // FLEET_CAPABILITY_POLICY a fleet-capability 404 classifies as `notEnabled`
    // ("capability not deployed"), not a generic error.
    mockedList.mockReturnValue({
      data: undefined,
      error: { status: 404 },
      isLoading: false,
      isFetching: false,
    });
    render(<EnrollmentListPage apiUrlOverride="https://example/api/v1/endpoint-agent" />);
    const state = screen.getByTestId('enrollment-list-state');
    expect(state.getAttribute('data-capability-kind')).toBe('notEnabled');
    expect(screen.queryByTestId('enrollment-list-empty')).not.toBeInTheDocument();
  });

  it('ignores any window env knob and always derives /endpoint-agent (Codex iter-2 P0)', async () => {
    // Codex 019e713c iter-2 hardening: env-override branch removed.
    // Even if a future deploy sets the admin-scoped env key, the
    // snippet must NOT pick it up. We render WITHOUT apiUrlOverride
    // so the production path runs (resolveApiUrl reads window.location
    // only). jsdom sets window.location.origin to http://localhost
    // by default; the assertion proves the resolver derives from
    // origin + /api/v1/endpoint-agent and ignores the admin env knob.
    const fakeEnv = {
      __env__: { VITE_ENDPOINT_ADMIN_API_URL: 'https://testai.acik.com/api/v1/endpoint-admin' },
    };
    Object.assign(window, fakeEnv);
    try {
      const response: CreateEndpointEnrollmentResponse = {
        enrollmentId: '88888888-8888-8888-8888-888888888888',
        token: 'env-not-honored-token',
        expiresAt: '2026-05-29T13:00:00Z',
      };
      mockedList.mockReturnValue({
        data: [],
        error: undefined,
        isLoading: false,
        isFetching: false,
      });
      mockCreate.mockReturnValue({ unwrap: () => Promise.resolve(response) });

      render(<EnrollmentListPage />);
      fireEvent.click(screen.getByTestId('enrollment-list-page-create'));
      fireEvent.click(screen.getByTestId('create-enrollment-dialog-submit'));
      await Promise.resolve();
      await Promise.resolve();
      const snippet = screen.getByTestId('enrollment-token-modal-snippet').textContent ?? '';
      expect(snippet).toContain('/api/v1/endpoint-agent');
      expect(snippet).not.toContain('/endpoint-admin');
    } finally {
      delete (window as unknown as { __env__?: unknown }).__env__;
    }
  });

  it('install snippet uses /endpoint-agent canonical path (Codex iter-1 P0)', async () => {
    // Codex 019e713c iter-1 must-fix #1: install snippet -ApiUrl must
    // point at HMAC agent base /api/v1/endpoint-agent, not admin base.
    const response: CreateEndpointEnrollmentResponse = {
      enrollmentId: '66666666-6666-6666-6666-666666666666',
      token: 'canonical-path-token',
      expiresAt: '2026-05-29T13:00:00Z',
    };
    mockedList.mockReturnValue({ data: [], error: undefined, isLoading: false, isFetching: false });
    mockCreate.mockReturnValue({ unwrap: () => Promise.resolve(response) });

    render(<EnrollmentListPage apiUrlOverride="https://testai.acik.com/api/v1/endpoint-agent" />);
    fireEvent.click(screen.getByTestId('enrollment-list-page-create'));
    fireEvent.click(screen.getByTestId('create-enrollment-dialog-submit'));
    await Promise.resolve();
    await Promise.resolve();
    const snippet = screen.getByTestId('enrollment-token-modal-snippet').textContent ?? '';
    expect(snippet).toContain('/api/v1/endpoint-agent');
    expect(snippet).not.toContain('/endpoint-admin');
  });

  // ── Faz 22.5 one-command install (gitops#1434, Codex 019eb26e hardened-A) ──

  function openModalWith(token: string): void {
    const response: CreateEndpointEnrollmentResponse = {
      enrollmentId: '99999999-9999-9999-9999-999999999999',
      token,
      expiresAt: '2026-05-29T13:00:00Z',
    };
    mockedList.mockReturnValue({ data: [], error: undefined, isLoading: false, isFetching: false });
    mockCreate.mockReturnValue({ unwrap: () => Promise.resolve(response) });
    render(<EnrollmentListPage apiUrlOverride="https://testai.acik.com/api/v1/endpoint-agent" />);
    fireEvent.click(screen.getByTestId('enrollment-list-page-create'));
    fireEvent.click(screen.getByTestId('create-enrollment-dialog-submit'));
  }

  it('builds the trusted one-command from the live /current/ manifest hash', async () => {
    openModalWith("tok-with-'-quote");

    const pre = await screen.findByTestId('enrollment-token-modal-onecommand');
    const cmd = pre.textContent ?? '';
    // bootstrap fetched from the stable /current/ alias
    expect(cmd).toContain('$s = (Invoke-WebRequest -UseBasicParsing ');
    expect(cmd).toContain('/artifacts/endpoint-agent/current/bootstrap-package.ps1');
    // byte[] GUARD (VM-verified): PS 5.1 returns .Content as byte[] for the
    // octet-stream .ps1 — must UTF8-decode before [scriptblock]::Create or it
    // ParseExceptions on every default Windows admin shell.
    expect(cmd).toContain(
      'if ($s -is [byte[]]) { $s = [System.Text.Encoding]::UTF8.GetString($s) }',
    );
    expect(cmd).toContain('& ([scriptblock]::Create($s))');
    expect(cmd).toContain('-PackageUrl');
    expect(cmd).toContain('/artifacts/endpoint-agent/current/EndpointAgent.zip');
    // pinned hash from the manifest (loud-fail on stale paste)
    expect(cmd).toContain(`-ExpectedZipSha256 '${ONE_CMD_SHA}'`);
    // canonical agent base + single-quote escape on the token
    expect(cmd).toContain("-ApiUrl 'https://testai.acik.com/api/v1/endpoint-agent'");
    expect(cmd).toContain("-EnrollmentToken 'tok-with-''-quote'");
    expect(cmd).toContain('-Start');
    // discovery fetch was SAME-ORIGIN /current/ manifest, no-store
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/artifacts/endpoint-agent/current/release-manifest.json'),
      expect.objectContaining({ cache: 'no-store' }),
    );
  });

  it('renders error + retry and NO one-command when the manifest fetch fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => manifestResponse({}, false, 503)),
    );
    openModalWith('fetch-fail-token');

    await screen.findByTestId('enrollment-token-modal-onecommand-error');
    expect(screen.queryByTestId('enrollment-token-modal-onecommand')).not.toBeInTheDocument();
    expect(screen.getByTestId('enrollment-token-modal-onecommand-retry')).toBeInTheDocument();
    // the manual (advanced) fallback is still available
    expect(screen.getByTestId('enrollment-token-modal-snippet')).toBeInTheDocument();
  });

  it('treats an off-schema manifest (short/missing hash) as error (no command)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        manifestResponse({ release_tag: 'v0.2.3', endpoint_agent_zip_sha256: 'tooshort' }),
      ),
    );
    openModalWith('bad-schema-token');

    await screen.findByTestId('enrollment-token-modal-onecommand-error');
    expect(screen.queryByTestId('enrollment-token-modal-onecommand')).not.toBeInTheDocument();
  });

  it('retry re-fetches and renders the one-command after recovery', async () => {
    let call = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        call += 1;
        return call === 1
          ? manifestResponse({}, false, 500)
          : manifestResponse({ release_tag: 'v0.2.3', endpoint_agent_zip_sha256: ONE_CMD_SHA });
      }),
    );
    openModalWith('retry-token');

    fireEvent.click(await screen.findByTestId('enrollment-token-modal-onecommand-retry'));
    const pre = await screen.findByTestId('enrollment-token-modal-onecommand');
    expect(pre.textContent ?? '').toContain(`-ExpectedZipSha256 '${ONE_CMD_SHA}'`);
  });
});
