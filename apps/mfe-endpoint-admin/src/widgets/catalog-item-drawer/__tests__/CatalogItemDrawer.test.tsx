/**
 * Path C3 — CatalogItemDrawer integration tests (Codex thread 019e8982
 * iter-2 absorb): New/Edit flow, RBAC disabled state, unknown rule
 * fail-closed, 422 error surface, RTK invalidation contract.
 */

import React from 'react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';

import { endpointAdminApi } from '../../../app/services/endpointAdminApi';
import { CatalogItemDrawer } from '../CatalogItemDrawer';

// We mock the API surface via baseQuery fetchBaseQuery interception is
// non-trivial; here we mock the hooks directly which is what the
// component depends on (Codex iter-2 §5: tests focus on the request
// shape contract + render branches).

vi.mock('../../../app/services/endpointAdminApi', async () => {
  const actual = await vi.importActual<typeof import('../../../app/services/endpointAdminApi')>(
    '../../../app/services/endpointAdminApi',
  );
  return {
    ...actual,
    useGetCatalogItemQuery: vi.fn(),
    useCreateCatalogItemMutation: vi.fn(),
    useUpdateCatalogItemMutation: vi.fn(),
  };
});

const i18nMock = {
  t: (k: string) => k,
};

vi.mock('../../../i18n', () => ({
  useEndpointAdminI18n: () => i18nMock,
}));

vi.mock('../../../app/services/shell-services', () => ({
  getShellServices: () => ({ auth: { isSuperAdmin: () => true } }),
}));

const { useGetCatalogItemQuery, useCreateCatalogItemMutation, useUpdateCatalogItemMutation } =
  await import('../../../app/services/endpointAdminApi');

function makeStore() {
  return configureStore({
    reducer: { [endpointAdminApi.reducerPath]: endpointAdminApi.reducer },
    middleware: (gdm) => gdm().concat(endpointAdminApi.middleware),
  });
}

function renderDrawer(
  props: React.ComponentProps<typeof CatalogItemDrawer>,
): ReturnType<typeof render> {
  const store = makeStore();
  return render(
    <Provider store={store}>
      <CatalogItemDrawer {...props} />
    </Provider>,
  );
}

const createMutationDefault = [vi.fn(), { isLoading: false }] as const;
const updateMutationDefault = [vi.fn(), { isLoading: false }] as const;

beforeEach(() => {
  vi.mocked(useGetCatalogItemQuery).mockReturnValue({
    data: undefined,
    error: undefined,
    isFetching: false,
  } as never);
  vi.mocked(useCreateCatalogItemMutation).mockReturnValue(createMutationDefault as never);
  vi.mocked(useUpdateCatalogItemMutation).mockReturnValue(updateMutationDefault as never);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('CatalogItemDrawer — New mode', () => {
  it('renders title for New and Save button disabled until required fields filled', () => {
    renderDrawer({ mode: { kind: 'new' }, open: true, canManage: true, onClose: vi.fn() });
    expect(screen.getByText('endpointAdmin.catalog.drawer.title.new')).toBeInTheDocument();
    const save = screen.getByTestId('catalog-item-drawer-save') as HTMLButtonElement;
    expect(save.disabled).toBe(true);
  });

  it('enables Save when catalogItemId + packageId + displayName populated', () => {
    renderDrawer({ mode: { kind: 'new' }, open: true, canManage: true, onClose: vi.fn() });
    fireEvent.change(screen.getByTestId('catalog-item-id'), { target: { value: 'app-x' } });
    fireEvent.change(screen.getByTestId('catalog-item-packageId'), {
      target: { value: 'Vendor.AppX' },
    });
    fireEvent.change(screen.getByTestId('catalog-item-displayName'), {
      target: { value: 'App X' },
    });
    // Detection rule default is WINGET_PACKAGE; needs packageId.
    fireEvent.change(screen.getByTestId('detection-rule-winget-packageId'), {
      target: { value: 'Vendor.AppX' },
    });
    const save = screen.getByTestId('catalog-item-drawer-save') as HTMLButtonElement;
    expect(save.disabled).toBe(false);
  });

  it('disables Save when canManage=false (RBAC gate)', () => {
    renderDrawer({ mode: { kind: 'new' }, open: true, canManage: false, onClose: vi.fn() });
    fireEvent.change(screen.getByTestId('catalog-item-id'), { target: { value: 'app-x' } });
    fireEvent.change(screen.getByTestId('catalog-item-packageId'), {
      target: { value: 'Vendor.AppX' },
    });
    fireEvent.change(screen.getByTestId('catalog-item-displayName'), {
      target: { value: 'App X' },
    });
    const save = screen.getByTestId('catalog-item-drawer-save') as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    expect(screen.getByText('endpointAdmin.catalog.permission.required')).toBeInTheDocument();
  });

  it('switches detection rule type via segmented tabs', () => {
    renderDrawer({ mode: { kind: 'new' }, open: true, canManage: true, onClose: vi.fn() });
    fireEvent.click(screen.getByTestId('detection-rule-type-FILE_VERSION'));
    expect(screen.getByTestId('detection-rule-version-absolutePath')).toBeInTheDocument();
    expect(screen.queryByTestId('detection-rule-winget-packageId')).toBeNull();
  });

  it('submits create with discriminated rule body', async () => {
    const unwrap = vi.fn().mockResolvedValue({
      id: 'uuid',
      catalogItemId: 'app-x',
      provider: 'WINGET',
      packageId: 'Vendor.AppX',
      displayName: 'App X',
      publisher: null,
      description: null,
      homepageUrl: null,
      versionPolicyType: null,
      versionPolicyValue: null,
      installerType: null,
      silentArgsPolicy: null,
      sha256: null,
      provenance: null,
      detectionRule: { type: 'WINGET_PACKAGE', packageId: 'Vendor.AppX' },
      riskTier: 'LOW',
      enabled: true,
      lastUpdatedAt: '2026-06-02T18:00:00Z',
    });
    const createFn = vi.fn().mockReturnValue({ unwrap });
    vi.mocked(useCreateCatalogItemMutation).mockReturnValue([
      createFn,
      { isLoading: false },
    ] as never);
    const onClose = vi.fn();
    const onSaved = vi.fn();
    renderDrawer({ mode: { kind: 'new' }, open: true, canManage: true, onClose, onSaved });
    fireEvent.change(screen.getByTestId('catalog-item-id'), { target: { value: 'app-x' } });
    fireEvent.change(screen.getByTestId('catalog-item-packageId'), {
      target: { value: 'Vendor.AppX' },
    });
    fireEvent.change(screen.getByTestId('catalog-item-displayName'), {
      target: { value: 'App X' },
    });
    fireEvent.change(screen.getByTestId('detection-rule-winget-packageId'), {
      target: { value: 'Vendor.AppX' },
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('catalog-item-drawer-save'));
    });
    expect(createFn).toHaveBeenCalledWith({
      catalogItemId: 'app-x',
      provider: 'WINGET',
      packageId: 'Vendor.AppX',
      displayName: 'App X',
      publisher: undefined,
      description: undefined,
      homepageUrl: undefined,
      riskTier: 'LOW',
      detectionRule: { type: 'WINGET_PACKAGE', packageId: 'Vendor.AppX', source: undefined },
    });
    expect(onSaved).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('surfaces 422 server validation error', async () => {
    const unwrap = vi
      .fn()
      .mockRejectedValue({ status: 422, data: { errors: [{ message: 'path allowlist' }] } });
    const createFn = vi.fn().mockReturnValue({ unwrap });
    vi.mocked(useCreateCatalogItemMutation).mockReturnValue([
      createFn,
      { isLoading: false },
    ] as never);
    renderDrawer({ mode: { kind: 'new' }, open: true, canManage: true, onClose: vi.fn() });
    fireEvent.change(screen.getByTestId('catalog-item-id'), { target: { value: 'app-x' } });
    fireEvent.change(screen.getByTestId('catalog-item-packageId'), {
      target: { value: 'Vendor.AppX' },
    });
    fireEvent.change(screen.getByTestId('catalog-item-displayName'), {
      target: { value: 'App X' },
    });
    fireEvent.change(screen.getByTestId('detection-rule-winget-packageId'), {
      target: { value: 'Vendor.AppX' },
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('catalog-item-drawer-save'));
    });
    const err = screen.getByTestId('catalog-item-drawer-error');
    expect(err.textContent).toContain('path allowlist');
  });

  it('surfaces 403 forbidden error', async () => {
    const unwrap = vi.fn().mockRejectedValue({ status: 403 });
    const createFn = vi.fn().mockReturnValue({ unwrap });
    vi.mocked(useCreateCatalogItemMutation).mockReturnValue([
      createFn,
      { isLoading: false },
    ] as never);
    renderDrawer({ mode: { kind: 'new' }, open: true, canManage: true, onClose: vi.fn() });
    fireEvent.change(screen.getByTestId('catalog-item-id'), { target: { value: 'app-x' } });
    fireEvent.change(screen.getByTestId('catalog-item-packageId'), {
      target: { value: 'Vendor.AppX' },
    });
    fireEvent.change(screen.getByTestId('catalog-item-displayName'), {
      target: { value: 'App X' },
    });
    fireEvent.change(screen.getByTestId('detection-rule-winget-packageId'), {
      target: { value: 'Vendor.AppX' },
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('catalog-item-drawer-save'));
    });
    const err = screen.getByTestId('catalog-item-drawer-error');
    expect(err.textContent).toBe('endpointAdmin.catalog.error.forbidden');
  });
});

describe('CatalogItemDrawer — Edit mode', () => {
  it('disables catalogItemId field in edit mode (immutable backend)', () => {
    vi.mocked(useGetCatalogItemQuery).mockReturnValue({
      data: {
        id: 'uuid',
        catalogItemId: 'app-x',
        provider: 'WINGET',
        packageId: 'Vendor.AppX',
        displayName: 'App X',
        publisher: null,
        description: null,
        homepageUrl: null,
        versionPolicyType: null,
        versionPolicyValue: null,
        installerType: null,
        silentArgsPolicy: null,
        sha256: null,
        provenance: null,
        detectionRule: { type: 'WINGET_PACKAGE', packageId: 'Vendor.AppX' },
        riskTier: 'LOW',
        enabled: true,
        lastUpdatedAt: '2026-06-02T18:00:00Z',
      },
      error: undefined,
      isFetching: false,
    } as never);
    renderDrawer({
      mode: { kind: 'edit', catalogItemId: 'app-x' },
      open: true,
      canManage: true,
      onClose: vi.fn(),
    });
    const id = screen.getByTestId('catalog-item-id') as HTMLInputElement;
    expect(id.disabled).toBe(true);
    expect(id.value).toBe('app-x');
  });

  it('shows fail-closed unknown rule notice when normalizer returns unknown', () => {
    vi.mocked(useGetCatalogItemQuery).mockReturnValue({
      data: {
        id: 'uuid',
        catalogItemId: 'legacy',
        provider: 'WINGET',
        packageId: 'pkg',
        displayName: 'Legacy',
        publisher: null,
        description: null,
        homepageUrl: null,
        versionPolicyType: null,
        versionPolicyValue: null,
        installerType: null,
        silentArgsPolicy: null,
        sha256: null,
        provenance: null,
        detectionRule: { type: 'PROCESS_RUNNING', name: 'foo.exe' },
        riskTier: 'LOW',
        enabled: true,
        lastUpdatedAt: '2026-06-02T18:00:00Z',
      },
      error: undefined,
      isFetching: false,
    } as never);
    renderDrawer({
      mode: { kind: 'edit', catalogItemId: 'legacy' },
      open: true,
      canManage: true,
      onClose: vi.fn(),
    });
    expect(screen.getByTestId('catalog-item-drawer-unknown')).toBeInTheDocument();
    expect(screen.getByText('endpointAdmin.catalog.drawer.unknownRule')).toBeInTheDocument();
    // Save button not rendered when unknown rule branch active.
    expect(screen.queryByTestId('catalog-item-drawer-save')).toBeNull();
  });
});
