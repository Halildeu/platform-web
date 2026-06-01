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
  // WEB-014D-followup (Codex 019e830b REVISE must_fix #2): RTK Query
  // exposes BOTH `data` (last successful result; can be stale across
  // arg changes) and `currentData` (response for the CURRENT args;
  // undefined during background refetch on arg change). The modal's
  // `effectivePreflight` now uses `currentData` so the submit gate
  // never authorises a PASS computed for a *different* catalog row.
  // The default behaviour here mirrors `data` to keep older test
  // expectations passing (most tests set only `data` and assume both
  // are populated). Stale-arg simulation tests override `currentData`
  // explicitly to `undefined`.
  currentData?: InstallPreflightResponse;
  error?: { status: number };
  isLoading?: boolean;
  isFetching?: boolean;
}
function mockPreflight(stub: PreflightQueryStub) {
  // Resolve currentData: explicit `currentData` key wins; otherwise
  // default to `data` so existing tests stay green.
  const hasExplicitCurrentData = Object.prototype.hasOwnProperty.call(stub, 'currentData');
  const resolvedCurrentData = hasExplicitCurrentData ? stub.currentData : stub.data;
  useGetInstallPreflightQueryMock.mockReturnValue({
    data: undefined,
    error: undefined,
    isLoading: false,
    isFetching: false,
    ...stub,
    currentData: resolvedCurrentData,
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

  it('hook subscribes with skip:false on open; freshness via endpoint keepUnusedDataFor:0 (WEB-014D perf follow-up — refetchOnMountOrArgChange removed)', () => {
    // The endpoint config pins `keepUnusedDataFor: 0` so unmounting
    // the modal evicts the cache entry and every reopen issues a
    // fresh preflight. The hook-level `refetchOnMountOrArgChange:true`
    // duplicated that guarantee and caused double network requests
    // (live testai network log evidence); it has been removed in
    // favor of the endpoint-level setting (Codex 019e707e iter-2
    // PARTIAL absorb — preflight TTL).
    mockPreflight({ data: buildPreflight('PASS') });
    mockInstall(vi.fn());
    render(<InstallPreflightModal {...baseProps} />);
    const lastCall = useGetInstallPreflightQueryMock.mock.calls.at(-1);
    expect(lastCall?.[1]).toMatchObject({ skip: false });
    expect(lastCall?.[1]).not.toHaveProperty('refetchOnMountOrArgChange');
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

describe('InstallPreflightModal — WEB-014D-followup confirm gate (Codex 019e830b REVISE)', () => {
  // Codex 019e830b REVISE supersedes the original 019e6fe4 must-fix #2
  // behaviour. The change: `preflightFetching` is NO LONGER a confirm
  // gate, AND the body keeps rendering the last-known PASS during a
  // background refetch instead of collapsing to a loading placeholder.
  // Anti-stale-PASS safety is delegated to (a) `currentData`-anchored
  // `effectivePreflight` (no PASS from a previous catalog row leaks
  // into the active intent) and (b) the existing backend POST 409
  // BLOCK recompute path that flips the modal to local BLOCK if the
  // decision changes server-side.

  it('isFetching=true + currentData=PASS iken PASS gövdesi RENDER + confirm ENABLED (no UX lock during refetch)', () => {
    // Background refetch should not collapse the body to loading,
    // and should not block the operator. This is the regression the
    // followup explicitly fixes.
    mockPreflight({ data: buildPreflight('PASS'), isFetching: true });
    mockInstall(vi.fn());
    render(<InstallPreflightModal {...baseProps} />);
    expect(screen.queryByTestId('install-modal-loading')).toBeNull();
    expect(screen.getByTestId('install-modal-decision-PASS')).toBeInTheDocument();
    expect(screen.getByTestId('install-modal-confirm')).not.toBeDisabled();
    // The fetching state must still be DISCOVERABLE via DOM so an
    // operator inspecting a regression can see it without console
    // access. Reason stays 'ok' (the button works); a separate data
    // attribute exposes the orthogonal background-refetch signal.
    const confirmBtn = screen.getByTestId('install-modal-confirm');
    expect(confirmBtn.getAttribute('data-confirm-disabled-reason')).toBe('ok');
    expect(confirmBtn.getAttribute('data-preflight-fetching')).toBe('true');
  });

  it('isLoading=true + no data iken loading placeholder + confirm disabled (initial-load only)', () => {
    // First-time load (no last-successful-data) must still show the
    // placeholder. The gate fires under `loading` reason — distinct
    // from `no-data` (data field absent but not currently fetching).
    mockPreflight({ isLoading: true });
    mockInstall(vi.fn());
    render(<InstallPreflightModal {...baseProps} />);
    expect(screen.getByTestId('install-modal-loading')).toBeInTheDocument();
    expect(screen.getByTestId('install-modal-confirm')).toBeDisabled();
    expect(
      screen.getByTestId('install-modal-confirm').getAttribute('data-confirm-disabled-reason'),
    ).toBe('loading');
  });

  it('decision=PASS + installedState=INSTALLED iken confirm ENABLED (not implicitly blocked by installed-state)', () => {
    // Operator-reported regression vector 2026-06-01: catalog row with
    // `installedState=INSTALLED` was perceived as forcing the confirm
    // button into a disabled state. Backend returns PASS for this
    // (re-install allowed); UI must follow.
    mockPreflight({
      data: buildPreflight('PASS', { installedState: 'INSTALLED' }),
    });
    mockInstall(vi.fn());
    render(<InstallPreflightModal {...baseProps} />);
    expect(screen.getByTestId('install-modal-decision-PASS')).toBeInTheDocument();
    expect(screen.getByTestId('install-modal-installed-state-INSTALLED')).toBeInTheDocument();
    expect(screen.getByTestId('install-modal-confirm')).not.toBeDisabled();
    expect(
      screen.getByTestId('install-modal-confirm').getAttribute('data-confirm-disabled-reason'),
    ).toBe('ok');
  });

  it('arg değişiminde stale `data` confirm-enabled etmez (currentData kontrolü)', () => {
    // RTK Query keeps `data` (last successful response) populated
    // when args change, but `currentData` becomes undefined until
    // the new args resolve. The modal must NOT authorise a submit on
    // the stale PASS — it must show the existing data is no longer
    // current. With `currentData` explicitly undefined, the body
    // collapses to "no current data" and the gate fires under the
    // `no-data` reason (not `loading` — because nothing is in flight
    // here per the mock).
    mockPreflight({
      data: buildPreflight('PASS'),
      currentData: undefined,
    });
    mockInstall(vi.fn());
    render(<InstallPreflightModal {...baseProps} />);
    expect(screen.queryByTestId('install-modal-decision-PASS')).toBeNull();
    expect(screen.getByTestId('install-modal-confirm')).toBeDisabled();
    expect(
      screen.getByTestId('install-modal-confirm').getAttribute('data-confirm-disabled-reason'),
    ).toBe('no-data');
  });

  it('BLOCK + confirm disabled + reason=block (DOM-inspectable)', () => {
    mockPreflight({
      data: buildPreflight('BLOCK', {
        blockingReasons: ['catalog_item_draft'],
        reasons: ['catalog_item_draft'],
      }),
    });
    mockInstall(vi.fn());
    render(<InstallPreflightModal {...baseProps} />);
    expect(screen.getByTestId('install-modal-confirm')).toBeDisabled();
    expect(
      screen.getByTestId('install-modal-confirm').getAttribute('data-confirm-disabled-reason'),
    ).toBe('block');
  });

  it('createState.isLoading=true iken in-flight reason + confirm disabled', () => {
    mockPreflight({ data: buildPreflight('PASS') });
    useCreateInstallMutationMock.mockReturnValue([vi.fn(), { isLoading: true }]);
    render(<InstallPreflightModal {...baseProps} />);
    expect(screen.getByTestId('install-modal-confirm')).toBeDisabled();
    expect(
      screen.getByTestId('install-modal-confirm').getAttribute('data-confirm-disabled-reason'),
    ).toBe('in-flight');
  });

  it('idempotencyKey ilk render itibariyle dolu olur (lazy init)', async () => {
    // Lazy `useState(() => generateIdempotencyKey())` initialiser
    // ensures the FIRST render — not just the post-effect render —
    // has a key. Click-as-first-paint produces a valid POST without
    // depending on a re-render to populate the key. This catches the
    // operator-visible "silik" frame regression from 2026-06-01.
    mockPreflight({ data: buildPreflight('PASS') });
    const trigger = vi.fn(() => ({ unwrap: () => Promise.resolve(buildCommand()) }));
    mockInstall(trigger);
    render(<InstallPreflightModal {...baseProps} />);
    // No rerender, no effect race window — click immediately.
    fireEvent.click(screen.getByTestId('install-modal-confirm'));
    await waitFor(() => expect(trigger).toHaveBeenCalled());
    const submittedKey = trigger.mock.calls.at(-1)?.[0].body.idempotencyKey;
    expect(submittedKey).toBeTruthy();
    expect(submittedKey).toMatch(/^00000000-0000-4000-8000-/);
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

  /* ---------------------------------------------------------------- */
  /* Codex 019e6ff0 post-impl must-fix #2 — strict shape guard.       */
  /*                                                                   */
  /* The previous Array.isArray + typeof 'object' checks passed        */
  /* malformed bodies (e.g. requirements: [{}]) through, which crashed */
  /* render at the first .replace() / String() call. New validators    */
  /* must reject EVERY non-conforming sub-shape.                       */
  /* ---------------------------------------------------------------- */

  it('Codex 019e6ff0 #2: requirements eleman tipi string degilse reddedilir', () => {
    const candidate = { ...minimalBlock(), requirements: [{}, null, 42] } as unknown;
    expect(tryReadBlockRecompute(candidate)).toBeNull();
  });

  it('Codex 019e6ff0 #2: reasons eleman tipi string degilse reddedilir', () => {
    const candidate = { ...minimalBlock(), reasons: [{ wrong: 'shape' }] } as unknown;
    expect(tryReadBlockRecompute(candidate)).toBeNull();
  });

  it('Codex 019e6ff0 #2: warnings eleman tipi string degilse reddedilir', () => {
    const candidate = { ...minimalBlock(), warnings: [123, 456] } as unknown;
    expect(tryReadBlockRecompute(candidate)).toBeNull();
  });

  it('Codex 019e6ff0 #2: blockingReasons eleman tipi string degilse reddedilir', () => {
    const candidate = { ...minimalBlock(), blockingReasons: [null] } as unknown;
    expect(tryReadBlockRecompute(candidate)).toBeNull();
  });

  it('Codex 019e6ff0 #2: evidence.inventoryUpdatedAt yanlis tipte (number) ise reddedilir', () => {
    const candidate = {
      ...minimalBlock(),
      evidence: { ...minimalBlock().evidence, inventoryUpdatedAt: 12345 },
    } as unknown;
    expect(tryReadBlockRecompute(candidate)).toBeNull();
  });

  it('Codex 019e6ff0 #2: evidence.inventorySnapshotRowVersion yanlis tipte (string) ise reddedilir', () => {
    const candidate = {
      ...minimalBlock(),
      evidence: { ...minimalBlock().evidence, inventorySnapshotRowVersion: '5' },
    } as unknown;
    expect(tryReadBlockRecompute(candidate)).toBeNull();
  });

  it('Codex 019e6ff0 #2: evidence.catalogRowVersion yanlis tipte (object) ise reddedilir', () => {
    const candidate = {
      ...minimalBlock(),
      evidence: { ...minimalBlock().evidence, catalogRowVersion: { v: 3 } },
    } as unknown;
    expect(tryReadBlockRecompute(candidate)).toBeNull();
  });

  it('Codex 019e6ff0 #2: evidence kismi alan kayipsa (inventorySnapshotId eksik) reddedilir', () => {
    const { inventorySnapshotId: _drop, ...evidenceRest } = minimalBlock().evidence;
    const candidate = { ...minimalBlock(), evidence: evidenceRest } as unknown;
    expect(tryReadBlockRecompute(candidate)).toBeNull();
  });

  it('Codex 019e6ff0 #2: evidence sub-object tum null alanlar PASS eder (canonical empty)', () => {
    const allNullEvidence = {
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
    };
    const candidate = {
      ...minimalBlock(),
      evidence: allNullEvidence,
    } as unknown;
    expect(tryReadBlockRecompute(candidate)).not.toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* Codex 019e6ff0 post-impl must-fix #1 — in-flight POST race guard.  */
/*                                                                     */
/* Before this absorb, ESC / overlay click / cancel button all hit    */
/* onClose directly. If the operator pressed Confirm and then ESC     */
/* during the in-flight POST, the parent would close the modal and    */
/* the eventual resolve would still call `onInstalled` on the now-    */
/* closed modal's promise, leaking commands or replaying toasts on    */
/* the next intent.                                                   */
/*                                                                     */
/* Two defences:                                                       */
/*  - `guardedOnClose` absorbs ESC / overlay / cancel while            */
/*    `createState.isLoading === true`.                                */
/*  - `intentRef` + `mountedRef` drop late resolutions when the active*/
/*    intent has changed (reopen, different catalog, unmount).        */
/* ------------------------------------------------------------------ */

describe('InstallPreflightModal — in-flight POST race guard (Codex 019e6ff0 must-fix #1)', () => {
  function mockInstallLoading(trigger: ReturnType<typeof vi.fn>) {
    useCreateInstallMutationMock.mockReturnValue([trigger, { isLoading: true }]);
  }

  it('createState.isLoading=true iken ESC onClose tetiklemez', () => {
    mockPreflight({ data: buildPreflight('PASS') });
    mockInstallLoading(vi.fn());
    const onClose = vi.fn();
    render(<InstallPreflightModal {...baseProps} onClose={onClose} />);
    // Modal mounted under load; useEscapeKey is registered. Dispatch ESC
    // and assert the guarded close swallows it.
    fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('createState.isLoading=true iken overlay click onClose tetiklemez', () => {
    mockPreflight({ data: buildPreflight('PASS') });
    mockInstallLoading(vi.fn());
    const onClose = vi.fn();
    const { container } = render(<InstallPreflightModal {...baseProps} onClose={onClose} />);
    // The overlay div has aria-hidden + bg-surface-overlay; query by
    // class to avoid coupling to test-ids that don't exist on the
    // overlay element itself.
    const overlay = container.querySelector('[aria-hidden="true"]') as HTMLElement;
    expect(overlay).not.toBeNull();
    fireEvent.click(overlay);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('createState.isLoading=true iken cancel button onClick onClose tetiklemez', () => {
    // Button is already disabled, but the guardedOnClose handler also
    // absorbs the click defensively (defence-in-depth).
    mockPreflight({ data: buildPreflight('PASS') });
    mockInstallLoading(vi.fn());
    const onClose = vi.fn();
    render(<InstallPreflightModal {...baseProps} onClose={onClose} />);
    const cancel = screen.getByTestId('install-modal-cancel') as HTMLButtonElement;
    expect(cancel).toBeDisabled();
    // Even if a test calls click() directly, guardedOnClose absorbs it.
    fireEvent.click(cancel);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('createState.isLoading=false iken ESC onClose tetikler (regression sentinel)', () => {
    // Sanity check that the guard is gated on isLoading and not blanket.
    mockPreflight({ data: buildPreflight('PASS') });
    mockInstall(vi.fn());
    const onClose = vi.fn();
    render(<InstallPreflightModal {...baseProps} onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('Confirm sirasinda modal kapatilirsa late resolve onInstalled tetiklemez', async () => {
    // Simulate: operator clicks Confirm. The mutation enters in-flight.
    // The parent re-renders with open=false (drawer dismissed by some
    // other path), then the POST resolves. The component must NOT call
    // onInstalled because the intent has been invalidated.
    mockPreflight({ data: buildPreflight('PASS') });
    let resolveInstall: (cmd: EndpointCommand) => void = () => undefined;
    const trigger = vi.fn(() => ({
      unwrap: () =>
        new Promise<EndpointCommand>((resolve) => {
          resolveInstall = resolve;
        }),
    }));
    mockInstall(trigger);
    const onInstalled = vi.fn();
    const { rerender } = render(<InstallPreflightModal {...baseProps} onInstalled={onInstalled} />);
    fireEvent.click(screen.getByTestId('install-modal-confirm'));
    await waitFor(() => expect(trigger).toHaveBeenCalled());

    // Parent closes the modal mid-flight (open=false invalidates intent).
    rerender(<InstallPreflightModal {...baseProps} open={false} onInstalled={onInstalled} />);

    // Late resolve arrives — must be dropped by the intent guard.
    await act(async () => {
      resolveInstall(buildCommand());
      await Promise.resolve();
    });

    expect(onInstalled).not.toHaveBeenCalled();
  });

  it('Confirm sirasinda farkli catalog ile reopen olursa eski resolve eski intent ile dusurulur', async () => {
    // Intent changes from (deviceId, catalog A, key 1) to (deviceId,
    // catalog B, key 2) — late resolution of intent 1 must be ignored.
    mockPreflight({ data: buildPreflight('PASS') });
    let resolveInstall: (cmd: EndpointCommand) => void = () => undefined;
    const trigger = vi.fn(() => ({
      unwrap: () =>
        new Promise<EndpointCommand>((resolve) => {
          resolveInstall = resolve;
        }),
    }));
    mockInstall(trigger);
    const onInstalled = vi.fn();
    const { rerender } = render(<InstallPreflightModal {...baseProps} onInstalled={onInstalled} />);
    fireEvent.click(screen.getByTestId('install-modal-confirm'));
    await waitFor(() => expect(trigger).toHaveBeenCalled());

    // Reopen with a different catalog item — per-intent effect generates
    // a fresh idempotency key and overwrites intentRef.
    rerender(
      <InstallPreflightModal {...baseProps} catalogItemId="vlc.vlc" onInstalled={onInstalled} />,
    );

    await act(async () => {
      resolveInstall(buildCommand());
      await Promise.resolve();
    });

    expect(onInstalled).not.toHaveBeenCalled();
  });
});
