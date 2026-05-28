// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { InstallPreflightModal } from '../components/InstallPreflightModal';
import {
  tryReadBlockRecompute,
  type InstallPreflightDecision,
  type InstallPreflightResponse,
} from '../../../entities/endpoint-install/types';
import type { EndpointCommand } from '../../../entities/endpoint-command/types';

/* ------------------------------------------------------------------ */
/*  WEB-014D — InstallPreflightModal unit tests (Faz 22.5).            */
/*                                                                     */
/*  Cross-AI absorb of Codex 019e6fd1 must-fixes:                      */
/*   #3 — refetchOnMountOrArgChange propagation (hook arg assertion)   */
/*   #4 — 409 BLOCK shape guard via tryReadBlockRecompute              */
/*   #5 — local block / reason / idempotency reset on intent change   */
/*   #6 — stable per-intent idempotency key (no regeneration mid-      */
/*       intent, regeneration on reopen)                              */
/*                                                                     */
/*  Pattern: vi.mock of `endpointAdminApi` (no MSW; matches the rest   */
/*  of the repo's endpoint-admin tests — Codex must-fix #8).           */
/* ------------------------------------------------------------------ */

const useGetInstallPreflightQueryMock = vi.fn();
const useCreateInstallMutationMock = vi.fn();

vi.mock('../../../app/services/endpointAdminApi', () => ({
  useGetInstallPreflightQuery: (...args: unknown[]) => useGetInstallPreflightQueryMock(...args),
  useCreateInstallMutation: () => useCreateInstallMutationMock(),
}));

// Codex must-fix #6 verification — stub crypto.randomUUID so we can
// assert idempotency key stability across rerenders.
let uuidCounter = 0;
beforeEach(() => {
  uuidCounter = 0;
  if (typeof crypto !== 'undefined') {
    vi.spyOn(crypto, 'randomUUID').mockImplementation(
      () =>
        `00000000-0000-4000-8000-${String(++uuidCounter).padStart(12, '0')}` as `${string}-${string}-${string}-${string}-${string}`,
    );
  }
  useGetInstallPreflightQueryMock.mockReset();
  useCreateInstallMutationMock.mockReset();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function buildPreflight(
  decision: InstallPreflightDecision,
  overrides: Partial<InstallPreflightResponse> = {},
): InstallPreflightResponse {
  return {
    decision,
    catalogItemId: '7zip.7zip',
    catalogItemUuid: 'cat-uuid-1',
    deviceId: 'd-1',
    evaluatedAt: '2026-05-28T10:00:00Z',
    installedState: 'NOT_INSTALLED',
    evidence: {
      inventorySnapshotId: 'snap-1',
      inventorySnapshotRowVersion: 5,
      inventoryUpdatedAt: '2026-05-28T09:55:00Z',
      summaryCollectedAt: '2026-05-28T09:50:00Z',
      appsCollectedAt: '2026-05-28T09:52:00Z',
      latestSummaryCommandResultId: 'cmd-r-1',
      latestFullCommandResultId: 'cmd-r-2',
      latestWingetEgressCommandResultId: 'cmd-r-3',
      wingetEgressCollectedAt: '2026-05-28T09:53:00Z',
      wingetEgressSchemaVersion: 1,
      catalogRowVersion: 3,
      catalogLastUpdatedAt: '2026-05-27T12:00:00Z',
    },
    reasons: [],
    blockingReasons: [],
    warnings: [],
    requirements: [],
    ...overrides,
  };
}

function buildCommand(): EndpointCommand {
  return {
    id: 'cmd-1',
    tenantId: 't-1',
    deviceId: 'd-1',
    type: 'INSTALL_SOFTWARE',
    idempotencyKey: 'admin-install:d-1:cat-uuid-1:00000000-0000-4000-8000-000000000001',
    status: 'QUEUED',
    approvalStatus: 'NOT_REQUIRED',
    payload: null,
    priority: null,
    attemptCount: 0,
    maxAttempts: 3,
    lockedBy: null,
    lockedUntil: null,
    visibleAfterAt: null,
    expiresAt: null,
    issuedBySubject: 'admin@example.com',
    issuedAt: '2026-05-28T10:00:00Z',
    deliveredAt: null,
    ackedAt: null,
    startedAt: null,
    completedAt: null,
    cancelledAt: null,
    lastError: null,
    createdAt: '2026-05-28T10:00:00Z',
    updatedAt: '2026-05-28T10:00:00Z',
    result: null,
  };
}

interface PreflightQueryStub {
  data?: InstallPreflightResponse;
  error?: { status: number };
  isLoading?: boolean;
  isFetching?: boolean;
}
function mockPreflight(stub: PreflightQueryStub) {
  useGetInstallPreflightQueryMock.mockReturnValue({
    data: undefined,
    error: undefined,
    isLoading: false,
    isFetching: false,
    ...stub,
  });
}

function mockInstall(trigger: ReturnType<typeof vi.fn>) {
  useCreateInstallMutationMock.mockReturnValue([trigger, { isLoading: false }]);
}

const baseProps = {
  open: true,
  deviceId: 'd-1',
  catalogItemId: '7zip.7zip',
  catalogDisplayName: '7-Zip',
  onClose: vi.fn(),
  onInstalled: vi.fn(),
};

describe('InstallPreflightModal — lifecycle / render gates', () => {
  it('open=false iken null doner', () => {
    mockPreflight({});
    mockInstall(vi.fn());
    const { container } = render(<InstallPreflightModal {...baseProps} open={false} />);
    expect(container.firstChild).toBeNull();
  });

  it('loading iken loading placeholder gosterir', () => {
    mockPreflight({ isLoading: true });
    mockInstall(vi.fn());
    render(<InstallPreflightModal {...baseProps} />);
    expect(screen.getByTestId('install-modal-loading')).toBeInTheDocument();
  });

  it('403 iken forbidden message gosterir', () => {
    mockPreflight({ error: { status: 403 } });
    mockInstall(vi.fn());
    render(<InstallPreflightModal {...baseProps} />);
    expect(screen.getByTestId('install-modal-error').textContent).toMatch(/yönetici|admin/i);
  });

  it('404 iken notFound message gosterir', () => {
    mockPreflight({ error: { status: 404 } });
    mockInstall(vi.fn());
    render(<InstallPreflightModal {...baseProps} />);
    expect(screen.getByTestId('install-modal-error').textContent).toMatch(/bulunamadı|not found/i);
  });

  it('hook refetchOnMountOrArgChange:true ile cagirilir (must-fix #3)', () => {
    mockPreflight({ data: buildPreflight('PASS') });
    mockInstall(vi.fn());
    render(<InstallPreflightModal {...baseProps} />);
    const lastCall = useGetInstallPreflightQueryMock.mock.calls.at(-1);
    expect(lastCall?.[1]).toMatchObject({
      skip: false,
      refetchOnMountOrArgChange: true,
    });
  });
});

describe('InstallPreflightModal — decision badges', () => {
  it('PASS decision iken confirm button enabled + PASS badge', () => {
    mockPreflight({ data: buildPreflight('PASS') });
    mockInstall(vi.fn());
    render(<InstallPreflightModal {...baseProps} />);
    expect(screen.getByTestId('install-modal-decision-PASS')).toBeInTheDocument();
    expect(screen.getByTestId('install-modal-confirm')).not.toBeDisabled();
  });

  it('WARN decision iken confirm enabled + warnings goruntulenir', () => {
    mockPreflight({
      data: buildPreflight('WARN', {
        warnings: ['inventory_stale'],
        reasons: ['inventory_stale'],
      }),
    });
    mockInstall(vi.fn());
    render(<InstallPreflightModal {...baseProps} />);
    expect(screen.getByTestId('install-modal-decision-WARN')).toBeInTheDocument();
    expect(screen.getByTestId('install-modal-confirm')).not.toBeDisabled();
    expect(screen.getByTestId('install-modal-warnings-item-inventory_stale')).toBeInTheDocument();
  });

  it('BLOCK decision iken confirm disabled + blockingReasons goruntulenir', () => {
    mockPreflight({
      data: buildPreflight('BLOCK', {
        blockingReasons: ['catalog_item_draft'],
        reasons: ['catalog_item_draft'],
      }),
    });
    mockInstall(vi.fn());
    render(<InstallPreflightModal {...baseProps} />);
    expect(screen.getByTestId('install-modal-decision-BLOCK')).toBeInTheDocument();
    expect(screen.getByTestId('install-modal-confirm')).toBeDisabled();
    expect(
      screen.getByTestId('install-modal-blocking-reasons-item-catalog_item_draft'),
    ).toBeInTheDocument();
  });

  it('installedState INSTALLED badge gorulur', () => {
    mockPreflight({
      data: buildPreflight('PASS', { installedState: 'INSTALLED' }),
    });
    mockInstall(vi.fn());
    render(<InstallPreflightModal {...baseProps} />);
    expect(screen.getByTestId('install-modal-installed-state-INSTALLED')).toBeInTheDocument();
  });
});

describe('InstallPreflightModal — submit flow', () => {
  it('PASS + Confirm tiklayinca createInstall body + idempotencyKey ile cagirilir', async () => {
    mockPreflight({ data: buildPreflight('PASS') });
    const trigger = vi.fn(() => ({ unwrap: () => Promise.resolve(buildCommand()) }));
    mockInstall(trigger);

    const onInstalled = vi.fn();
    render(<InstallPreflightModal {...baseProps} onInstalled={onInstalled} />);

    fireEvent.change(screen.getByTestId('install-modal-reason'), {
      target: { value: 'Manuel rollout testi' },
    });
    fireEvent.click(screen.getByTestId('install-modal-confirm'));

    await waitFor(() => expect(trigger).toHaveBeenCalled());
    expect(trigger.mock.calls.at(-1)?.[0]).toMatchObject({
      deviceId: 'd-1',
      body: {
        catalogItemId: '7zip.7zip',
        reason: 'Manuel rollout testi',
        // Codex must-fix #6: per-intent stable UUID (first mock value).
        idempotencyKey: '00000000-0000-4000-8000-000000000001',
      },
    });
    await waitFor(() => expect(onInstalled).toHaveBeenCalledWith(buildCommand()));
  });

  it('Reason bos ise body.reason undefined ile gonderilir', async () => {
    mockPreflight({ data: buildPreflight('PASS') });
    const trigger = vi.fn(() => ({ unwrap: () => Promise.resolve(buildCommand()) }));
    mockInstall(trigger);
    render(<InstallPreflightModal {...baseProps} />);
    fireEvent.click(screen.getByTestId('install-modal-confirm'));
    await waitFor(() => expect(trigger).toHaveBeenCalled());
    expect(trigger.mock.calls.at(-1)?.[0].body.reason).toBeUndefined();
  });

  it('409 BLOCK recompute donerse modal localBlock ile re-render eder (must-fix #4)', async () => {
    mockPreflight({ data: buildPreflight('PASS') });
    const blockRecompute = buildPreflight('BLOCK', {
      blockingReasons: ['catalog_item_revoked'],
      reasons: ['catalog_item_revoked'],
    });
    const trigger = vi.fn(() => ({
      unwrap: () => Promise.reject({ status: 409, data: blockRecompute }),
    }));
    mockInstall(trigger);
    render(<InstallPreflightModal {...baseProps} />);
    fireEvent.click(screen.getByTestId('install-modal-confirm'));

    await waitFor(() =>
      expect(screen.getByTestId('install-modal-decision-BLOCK')).toBeInTheDocument(),
    );
    expect(
      screen.getByTestId('install-modal-blocking-reasons-item-catalog_item_revoked'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('install-modal-confirm')).toBeDisabled();
    expect(screen.getByTestId('install-modal-toast').textContent).toMatch(
      /Ön kontrol değişti|Preflight changed/i,
    );
  });

  it('409 + non-BLOCK body (idempotency collision) generic error toast verir', async () => {
    mockPreflight({ data: buildPreflight('PASS') });
    const trigger = vi.fn(() => ({
      unwrap: () => Promise.reject({ status: 409, data: { code: 'IDEMPOTENCY_COLLISION' } }),
    }));
    mockInstall(trigger);
    render(<InstallPreflightModal {...baseProps} />);
    fireEvent.click(screen.getByTestId('install-modal-confirm'));
    await waitFor(() =>
      expect(screen.getByTestId('install-modal-toast').textContent).toMatch(
        /başlatılamadı|Failed to start/i,
      ),
    );
    // Original PASS render preserved (no false BLOCK promotion).
    expect(screen.getByTestId('install-modal-decision-PASS')).toBeInTheDocument();
  });

  it('400 VALIDATION_ERROR sonrasi validation toast', async () => {
    mockPreflight({ data: buildPreflight('PASS') });
    const trigger = vi.fn(() => ({
      unwrap: () => Promise.reject({ status: 400, data: { code: 'VALIDATION_ERROR' } }),
    }));
    mockInstall(trigger);
    render(<InstallPreflightModal {...baseProps} />);
    fireEvent.click(screen.getByTestId('install-modal-confirm'));
    await waitFor(() =>
      expect(screen.getByTestId('install-modal-toast').textContent).toMatch(
        /doğrulanamadı|validation failed/i,
      ),
    );
  });

  it('403 sonrasi MANAGE-required toast', async () => {
    mockPreflight({ data: buildPreflight('PASS') });
    const trigger = vi.fn(() => ({
      unwrap: () => Promise.reject({ status: 403 }),
    }));
    mockInstall(trigger);
    render(<InstallPreflightModal {...baseProps} />);
    fireEvent.click(screen.getByTestId('install-modal-confirm'));
    await waitFor(() =>
      expect(screen.getByTestId('install-modal-toast').textContent).toMatch(/yönetici|admin/i),
    );
  });

  it('404 sonrasi notFound toast', async () => {
    mockPreflight({ data: buildPreflight('PASS') });
    const trigger = vi.fn(() => ({
      unwrap: () => Promise.reject({ status: 404 }),
    }));
    mockInstall(trigger);
    render(<InstallPreflightModal {...baseProps} />);
    fireEvent.click(screen.getByTestId('install-modal-confirm'));
    await waitFor(() =>
      expect(screen.getByTestId('install-modal-toast').textContent).toMatch(
        /bulunamadı|not found/i,
      ),
    );
  });
});

describe('InstallPreflightModal — intent reset (must-fix #5/#6)', () => {
  it('open=false sonra true tekrar acilinca yeni idempotencyKey uretilir', async () => {
    mockPreflight({ data: buildPreflight('PASS') });
    const trigger = vi.fn(() => ({ unwrap: () => Promise.resolve(buildCommand()) }));
    mockInstall(trigger);

    const { rerender } = render(<InstallPreflightModal {...baseProps} />);
    fireEvent.click(screen.getByTestId('install-modal-confirm'));
    await waitFor(() => expect(trigger).toHaveBeenCalled());
    const firstKey = trigger.mock.calls.at(-1)?.[0].body.idempotencyKey;

    // Close, then reopen — new intent. State must reset.
    act(() => {
      rerender(<InstallPreflightModal {...baseProps} open={false} />);
    });
    act(() => {
      rerender(<InstallPreflightModal {...baseProps} open />);
    });

    fireEvent.click(screen.getByTestId('install-modal-confirm'));
    await waitFor(() => expect(trigger).toHaveBeenCalledTimes(2));
    const secondKey = trigger.mock.calls.at(-1)?.[0].body.idempotencyKey;

    expect(secondKey).not.toBe(firstKey);
  });

  it('catalogItemId degisince localBlock + reason resetlenir', async () => {
    mockPreflight({
      data: buildPreflight('BLOCK', {
        blockingReasons: ['catalog_item_draft'],
        reasons: ['catalog_item_draft'],
      }),
    });
    mockInstall(vi.fn());
    const { rerender } = render(<InstallPreflightModal {...baseProps} />);
    // Type a reason, observe BLOCK decision.
    fireEvent.change(screen.getByTestId('install-modal-reason'), {
      target: { value: 'some reason' },
    });
    expect(screen.getByTestId('install-modal-decision-BLOCK')).toBeInTheDocument();

    // Switch to a different catalog item; preflight mock now returns PASS.
    mockPreflight({ data: buildPreflight('PASS') });
    rerender(<InstallPreflightModal {...baseProps} catalogItemId="notepad.notepad" />);

    expect(screen.getByTestId('install-modal-decision-PASS')).toBeInTheDocument();
    expect((screen.getByTestId('install-modal-reason') as HTMLTextAreaElement).value).toBe('');
  });
});

describe('InstallPreflightModal — evidence rendering (must-fix #2 null safety)', () => {
  it('null evidence alanlari render edilmez', () => {
    mockPreflight({
      data: buildPreflight('PASS', {
        evidence: {
          inventorySnapshotId: null,
          inventorySnapshotRowVersion: null,
          inventoryUpdatedAt: null,
          summaryCollectedAt: null,
          appsCollectedAt: null,
          latestSummaryCommandResultId: null,
          latestFullCommandResultId: null,
          latestWingetEgressCommandResultId: null,
          wingetEgressCollectedAt: null,
          wingetEgressSchemaVersion: null,
          catalogRowVersion: null,
          catalogLastUpdatedAt: null,
        },
      }),
    });
    mockInstall(vi.fn());
    render(<InstallPreflightModal {...baseProps} />);
    expect(screen.queryByTestId('install-modal-evidence')).toBeNull();
  });

  it('mevcut alanlari render eder, null olanlari atlar', () => {
    mockPreflight({
      data: buildPreflight('PASS', {
        evidence: {
          inventorySnapshotId: 'snap-1',
          inventorySnapshotRowVersion: 5,
          inventoryUpdatedAt: '2026-05-28T09:55:00Z',
          summaryCollectedAt: null,
          appsCollectedAt: null,
          latestSummaryCommandResultId: null,
          latestFullCommandResultId: null,
          latestWingetEgressCommandResultId: null,
          wingetEgressCollectedAt: null,
          wingetEgressSchemaVersion: null,
          catalogRowVersion: 3,
          catalogLastUpdatedAt: '2026-05-27T12:00:00Z',
        },
      }),
    });
    mockInstall(vi.fn());
    render(<InstallPreflightModal {...baseProps} />);
    const evidence = screen.getByTestId('install-modal-evidence');
    expect(evidence.textContent).toMatch(/Envanter güncellendi|Inventory updated/);
    expect(evidence.textContent).toMatch(/Katalog sürümü|Catalog rev/);
    // Summary / apps / winget egress null → should NOT appear.
    expect(evidence.textContent).not.toMatch(/Özet alındı|Summary collected/);
    expect(evidence.textContent).not.toMatch(/WinGet egress/);
  });
});

describe('InstallPreflightModal — cancel + ESC', () => {
  it('Cancel butonu onClose tetikler', () => {
    mockPreflight({ data: buildPreflight('PASS') });
    mockInstall(vi.fn());
    const onClose = vi.fn();
    render(<InstallPreflightModal {...baseProps} onClose={onClose} />);
    fireEvent.click(screen.getByTestId('install-modal-cancel'));
    expect(onClose).toHaveBeenCalled();
  });
});

describe('InstallPreflightModal — isFetching gate (Codex 019e6fe4 must-fix #2)', () => {
  it('isFetching=true iken loading placeholder + confirm disabled', () => {
    // Stale data sits next to a fresh `isFetching: true` while RTK
    // Query recomputes; the modal must NOT show the stale PASS body
    // (loading placeholder takes over) AND Confirm must stay disabled.
    mockPreflight({ data: buildPreflight('PASS'), isFetching: true });
    mockInstall(vi.fn());
    render(<InstallPreflightModal {...baseProps} />);
    expect(screen.getByTestId('install-modal-loading')).toBeInTheDocument();
    expect(screen.queryByTestId('install-modal-decision-PASS')).toBeNull();
    expect(screen.getByTestId('install-modal-confirm')).toBeDisabled();
  });
});

describe('tryReadBlockRecompute — strict shape guard (Codex 019e6fe4 must-fix #1)', () => {
  const minimalBlock = (): InstallPreflightResponse =>
    buildPreflight('BLOCK', {
      blockingReasons: ['catalog_item_revoked'],
      reasons: ['catalog_item_revoked'],
    });

  it('tam BLOCK gövdesi promote edilir', () => {
    expect(tryReadBlockRecompute(minimalBlock())).not.toBeNull();
  });

  it('decision != BLOCK reddedilir', () => {
    const candidate = { ...minimalBlock(), decision: 'PASS' } as unknown;
    expect(tryReadBlockRecompute(candidate)).toBeNull();
  });

  it('catalogItemUuid eksikse reddedilir', () => {
    const { catalogItemUuid: _drop, ...rest } = minimalBlock();
    expect(tryReadBlockRecompute(rest)).toBeNull();
  });

  it('evaluatedAt eksikse reddedilir', () => {
    const { evaluatedAt: _drop, ...rest } = minimalBlock();
    expect(tryReadBlockRecompute(rest)).toBeNull();
  });

  it('installedState gecersiz string ise reddedilir', () => {
    const candidate = { ...minimalBlock(), installedState: 'BOGUS' } as unknown;
    expect(tryReadBlockRecompute(candidate)).toBeNull();
  });

  it('evidence yoksa reddedilir', () => {
    const { evidence: _drop, ...rest } = minimalBlock();
    expect(tryReadBlockRecompute(rest)).toBeNull();
  });

  it('requirements array degilse reddedilir', () => {
    const candidate = { ...minimalBlock(), requirements: 'oops' } as unknown;
    expect(tryReadBlockRecompute(candidate)).toBeNull();
  });

  it('blockingReasons array degilse reddedilir', () => {
    const candidate = { ...minimalBlock(), blockingReasons: null } as unknown;
    expect(tryReadBlockRecompute(candidate)).toBeNull();
  });

  it('non-object input reddedilir', () => {
    expect(tryReadBlockRecompute(null)).toBeNull();
    expect(tryReadBlockRecompute('string')).toBeNull();
    expect(tryReadBlockRecompute(42)).toBeNull();
    expect(tryReadBlockRecompute(undefined)).toBeNull();
  });
});
