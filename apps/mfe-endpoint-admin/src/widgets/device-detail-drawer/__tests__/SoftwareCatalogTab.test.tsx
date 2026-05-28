// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { SoftwareCatalogTab } from '../tabs/SoftwareCatalogTab';
import type {
  AdminCatalogItemSummary,
  SpringPage,
} from '../../../entities/endpoint-software-catalog/types';
import type { EndpointDevice } from '../../../entities/endpoint-device/types';
import type { EndpointInstallAuditDto } from '../../../entities/endpoint-install/types';
import type { InstallPreflightModalProps } from '../components/InstallPreflightModal';

/* ------------------------------------------------------------------ */
/*  WEB-014D — SoftwareCatalogTab unit tests (Faz 22.5).               */
/*                                                                     */
/*  Strategy: mock both RTK hooks AND the nested                       */
/*  InstallPreflightModal — the modal has dedicated tests of its own,  */
/*  so here we only assert the tab opens it with the right props and  */
/*  reacts to its onInstalled callback.                                */
/* ------------------------------------------------------------------ */

const useListCatalogItemsQueryMock = vi.fn();
const useListInstallAuditsQueryMock = vi.fn();

vi.mock('../../../app/services/endpointAdminApi', () => ({
  useListCatalogItemsQuery: (...args: unknown[]) => useListCatalogItemsQueryMock(...args),
  useListInstallAuditsQuery: (...args: unknown[]) => useListInstallAuditsQueryMock(...args),
}));

let capturedModalProps: InstallPreflightModalProps | null = null;
vi.mock('../components/InstallPreflightModal', () => ({
  InstallPreflightModal: (props: InstallPreflightModalProps) => {
    capturedModalProps = props;
    return (
      <div data-testid="mock-install-modal">
        <span data-testid="mock-install-modal-catalogId">{props.catalogItemId}</span>
        <span data-testid="mock-install-modal-displayName">{props.catalogDisplayName}</span>
        <button
          type="button"
          data-testid="mock-install-modal-fire-installed"
          onClick={() =>
            props.onInstalled({
              id: 'cmd-success-1',
              tenantId: 't-1',
              deviceId: props.deviceId,
              type: 'INSTALL_SOFTWARE',
              idempotencyKey: 'admin-install:...',
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
            })
          }
        >
          fire installed
        </button>
        <button
          type="button"
          data-testid="mock-install-modal-close"
          onClick={() => props.onClose()}
        >
          close
        </button>
      </div>
    );
  },
}));

function buildDevice(overrides: Partial<EndpointDevice> = {}): EndpointDevice {
  return {
    id: 'd-1',
    tenantId: 't-1',
    hostname: 'SRB-AIDENETIMPC',
    displayName: null,
    osType: 'WINDOWS',
    osVersion: '11 23H2',
    agentVersion: '1.4.0',
    machineFingerprint: null,
    domainName: null,
    status: 'ONLINE',
    lastSeenAt: '2026-05-28T09:00:00Z',
    enrolledAt: '2026-05-24T00:00:00Z',
    createdAt: '2026-05-24T00:00:00Z',
    updatedAt: '2026-05-28T09:00:00Z',
    ...overrides,
  };
}

function buildCatalog(overrides: Partial<AdminCatalogItemSummary> = {}): AdminCatalogItemSummary {
  return {
    id: 'cat-1',
    catalogItemId: '7zip.7zip',
    status: 'APPROVED',
    provider: 'WINGET',
    packageId: '7zip.7zip',
    displayName: '7-Zip',
    publisher: 'Igor Pavlov',
    riskTier: 'LOW',
    enabled: true,
    lastUpdatedAt: '2026-05-28T10:00:00Z',
    ...overrides,
  };
}

function buildAudit(overrides: Partial<EndpointInstallAuditDto> = {}): EndpointInstallAuditDto {
  return {
    auditId: 'audit-1',
    tenantId: 't-1',
    deviceId: 'd-1',
    commandId: 'cmd-1',
    catalogItemId: '7zip.7zip',
    catalogItemUuid: 'cat-uuid-1',
    catalogPackageId: '7zip.7zip',
    catalogRowVersion: 3,
    preflightDecision: 'PASS',
    preflightDecisionAt: '2026-05-28T09:30:00Z',
    preflightWarnCodes: [],
    actorSubject: 'admin@example.com',
    approvalSubject: null,
    resultStatus: 'SUCCEEDED',
    exitCode: 0,
    reportedAt: '2026-05-28T09:32:00Z',
    startedAt: '2026-05-28T09:31:00Z',
    finishedAt: '2026-05-28T09:32:00Z',
    postVerification: 'SATISFIED',
    detectedPackageId: '7zip.7zip',
    detectedVersion: '23.01',
    postVerificationEvidence: null,
    redactedPayload: null,
    rowVersion: 1,
    createdAt: '2026-05-28T09:32:00Z',
    ...overrides,
  };
}

function mockCatalog(
  items: AdminCatalogItemSummary[],
  opts: Partial<{ isLoading: boolean; error: { status: number } }> = {},
) {
  if (opts.error) {
    useListCatalogItemsQueryMock.mockReturnValue({
      data: undefined,
      error: opts.error,
      isLoading: false,
    });
    return;
  }
  const page: SpringPage<AdminCatalogItemSummary> = {
    content: items,
    number: 0,
    size: 200,
    totalElements: items.length,
    totalPages: 1,
    first: true,
    last: true,
    empty: items.length === 0,
  };
  useListCatalogItemsQueryMock.mockReturnValue({
    data: page,
    error: undefined,
    isLoading: opts.isLoading ?? false,
  });
}

function mockAudits(rows: EndpointInstallAuditDto[], isLoading = false) {
  const page: SpringPage<EndpointInstallAuditDto> = {
    content: rows,
    number: 0,
    size: 10,
    totalElements: rows.length,
    totalPages: 1,
    first: true,
    last: true,
    empty: rows.length === 0,
  };
  useListInstallAuditsQueryMock.mockReturnValue({
    data: page,
    error: undefined,
    isLoading,
  });
}

beforeEach(() => {
  capturedModalProps = null;
  useListCatalogItemsQueryMock.mockReset();
  useListInstallAuditsQueryMock.mockReset();
});

afterEach(() => {
  cleanup();
});

describe('SoftwareCatalogTab — skip + lifecycle states', () => {
  it('active=false iken null doner ve hicbir hook subscribe etmez (skip:true)', () => {
    mockCatalog([]);
    mockAudits([]);
    const { container } = render(<SoftwareCatalogTab device={buildDevice()} active={false} />);
    expect(container.firstChild).toBeNull();
    expect(useListCatalogItemsQueryMock.mock.calls.at(-1)?.[1]).toMatchObject({
      skip: true,
    });
    expect(useListInstallAuditsQueryMock.mock.calls.at(-1)?.[1]).toMatchObject({
      skip: true,
    });
  });

  it('isLoading iken loading placeholder', () => {
    mockCatalog([], { isLoading: true });
    mockAudits([]);
    render(<SoftwareCatalogTab device={buildDevice()} active />);
    expect(screen.getByTestId('software-catalog-loading')).toBeInTheDocument();
  });

  it('403 iken forbidden message', () => {
    mockCatalog([], { error: { status: 403 } });
    mockAudits([]);
    render(<SoftwareCatalogTab device={buildDevice()} active />);
    expect(screen.getByTestId('software-catalog-forbidden')).toBeInTheDocument();
  });

  it('500 iken error message', () => {
    mockCatalog([], { error: { status: 500 } });
    mockAudits([]);
    render(<SoftwareCatalogTab device={buildDevice()} active />);
    expect(screen.getByTestId('software-catalog-error')).toBeInTheDocument();
  });

  it('empty list iken empty message', () => {
    mockCatalog([]);
    mockAudits([]);
    render(<SoftwareCatalogTab device={buildDevice()} active />);
    expect(screen.getByTestId('software-catalog-empty')).toBeInTheDocument();
  });
});

describe('SoftwareCatalogTab — query args (Codex must-fix #B)', () => {
  it('catalog query status=APPROVED + enabled=true + size=200 ile cagirilir', () => {
    mockCatalog([]);
    mockAudits([]);
    render(<SoftwareCatalogTab device={buildDevice()} active />);
    expect(useListCatalogItemsQueryMock.mock.calls.at(-1)?.[0]).toMatchObject({
      status: 'APPROVED',
      enabled: true,
      page: 0,
      size: 200,
    });
  });

  it('install audit query deviceId scoped + page=0 + size=10', () => {
    mockCatalog([]);
    mockAudits([]);
    render(<SoftwareCatalogTab device={buildDevice({ id: 'device-XYZ' })} active />);
    expect(useListInstallAuditsQueryMock.mock.calls.at(-1)?.[0]).toMatchObject({
      deviceId: 'device-XYZ',
      page: 0,
      size: 10,
    });
  });
});

describe('SoftwareCatalogTab — catalog list rendering', () => {
  it('katalog item satirlari + Kur button render eder', () => {
    mockCatalog([
      buildCatalog({
        id: 'cat-1',
        catalogItemId: '7zip.7zip',
        displayName: '7-Zip',
      }),
      buildCatalog({
        id: 'cat-2',
        catalogItemId: 'notepad.notepad',
        displayName: 'Notepad++',
      }),
    ]);
    mockAudits([]);
    render(<SoftwareCatalogTab device={buildDevice()} active />);
    expect(screen.getByTestId('catalog-row-7zip.7zip')).toBeInTheDocument();
    expect(screen.getByTestId('catalog-row-notepad.notepad')).toBeInTheDocument();
    expect(screen.getByTestId('kur-button-7zip.7zip')).toBeInTheDocument();
    expect(screen.getByTestId('kur-button-notepad.notepad')).toBeInTheDocument();
  });

  it('OFFLINE durumda Kur button enabled kalir ama offlineHint tooltipi tasir', () => {
    mockCatalog([buildCatalog()]);
    mockAudits([]);
    render(<SoftwareCatalogTab device={buildDevice({ status: 'OFFLINE' })} active />);
    const button = screen.getByTestId('kur-button-7zip.7zip');
    // Button stays clickable (backend will queue command and decide
    // delivery semantics). Tooltip carries the hint.
    expect(button).not.toBeDisabled();
    expect(button.getAttribute('title')).toMatch(/çevrim dışı|offline/i);
  });

  it('ONLINE durumda Kur button tooltip yok', () => {
    mockCatalog([buildCatalog()]);
    mockAudits([]);
    render(<SoftwareCatalogTab device={buildDevice()} active />);
    const button = screen.getByTestId('kur-button-7zip.7zip');
    expect(button.getAttribute('title')).toBeNull();
  });

  it('Kur button click InstallPreflightModal acar (catalogItemId + displayName props)', () => {
    mockCatalog([
      buildCatalog({
        id: 'cat-1',
        catalogItemId: '7zip.7zip',
        displayName: '7-Zip',
      }),
    ]);
    mockAudits([]);
    render(<SoftwareCatalogTab device={buildDevice()} active />);
    fireEvent.click(screen.getByTestId('kur-button-7zip.7zip'));
    expect(screen.getByTestId('mock-install-modal')).toBeInTheDocument();
    expect(screen.getByTestId('mock-install-modal-catalogId').textContent).toBe('7zip.7zip');
    expect(screen.getByTestId('mock-install-modal-displayName').textContent).toBe('7-Zip');
    expect(capturedModalProps?.deviceId).toBe('d-1');
  });

  it('modal onClose modal kapanmasini saglar', () => {
    mockCatalog([buildCatalog()]);
    mockAudits([]);
    render(<SoftwareCatalogTab device={buildDevice()} active />);
    fireEvent.click(screen.getByTestId('kur-button-7zip.7zip'));
    fireEvent.click(screen.getByTestId('mock-install-modal-close'));
    expect(screen.queryByTestId('mock-install-modal')).toBeNull();
  });

  it('modal onInstalled callback success toast goruntuler ve modal kapatir', () => {
    mockCatalog([buildCatalog()]);
    mockAudits([]);
    render(<SoftwareCatalogTab device={buildDevice()} active />);
    fireEvent.click(screen.getByTestId('kur-button-7zip.7zip'));
    fireEvent.click(screen.getByTestId('mock-install-modal-fire-installed'));
    expect(screen.queryByTestId('mock-install-modal')).toBeNull();
    const toast = screen.getByTestId('software-catalog-toast');
    expect(toast.textContent).toContain('cmd-success-1');
    expect(toast.textContent).toMatch(/sıraya alındı|queued/i);
  });
});

describe('SoftwareCatalogTab — recent installs panel', () => {
  it('audit isLoading iken loading placeholder', () => {
    mockCatalog([]);
    mockAudits([], true);
    render(<SoftwareCatalogTab device={buildDevice()} active />);
    expect(screen.getByTestId('install-audit-loading')).toBeInTheDocument();
  });

  it('audit empty iken empty message', () => {
    mockCatalog([]);
    mockAudits([]);
    render(<SoftwareCatalogTab device={buildDevice()} active />);
    expect(screen.getByTestId('install-audit-empty')).toBeInTheDocument();
  });

  it('audit rows render eder (catalogItemId slug + decision + result)', () => {
    mockCatalog([]);
    mockAudits([
      buildAudit({ auditId: 'a-1', preflightDecision: 'PASS', resultStatus: 'SUCCEEDED' }),
      buildAudit({
        auditId: 'a-2',
        preflightDecision: 'WARN',
        resultStatus: 'FAILED',
        catalogItemId: 'notepad.notepad',
      }),
    ]);
    render(<SoftwareCatalogTab device={buildDevice()} active />);
    expect(screen.getByTestId('install-audit-row-a-1')).toBeInTheDocument();
    expect(screen.getByTestId('install-audit-row-a-2').textContent).toContain('notepad.notepad');
  });

  it('audit row catalogItemId null ise catalogItemUuid fallback render eder', () => {
    mockCatalog([]);
    mockAudits([
      buildAudit({
        auditId: 'a-1',
        catalogItemId: null,
        catalogItemUuid: 'cat-uuid-FALLBACK',
      }),
    ]);
    render(<SoftwareCatalogTab device={buildDevice()} active />);
    expect(screen.getByTestId('install-audit-row-a-1').textContent).toContain('cat-uuid-FALLBACK');
  });

  it('audit row resultStatus null iken pending dash render eder', () => {
    mockCatalog([]);
    mockAudits([buildAudit({ auditId: 'a-1', resultStatus: null })]);
    render(<SoftwareCatalogTab device={buildDevice()} active />);
    expect(screen.getByTestId('install-audit-row-a-1').textContent).toContain('—');
  });
});

describe('SoftwareCatalogTab — intent reset on device change', () => {
  it('device.id degisince toast ve modal sifirlanir', () => {
    mockCatalog([buildCatalog()]);
    mockAudits([]);
    const { rerender } = render(
      <SoftwareCatalogTab device={buildDevice({ id: 'device-A' })} active />,
    );
    // Open modal + trigger success toast.
    fireEvent.click(screen.getByTestId('kur-button-7zip.7zip'));
    fireEvent.click(screen.getByTestId('mock-install-modal-fire-installed'));
    expect(screen.getByTestId('software-catalog-toast')).toBeInTheDocument();

    rerender(<SoftwareCatalogTab device={buildDevice({ id: 'device-B' })} active />);
    expect(screen.queryByTestId('software-catalog-toast')).toBeNull();
    expect(screen.queryByTestId('mock-install-modal')).toBeNull();
  });
});
