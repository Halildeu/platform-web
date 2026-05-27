// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Provider as ReduxProvider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { registerAuthTokenResolver } from '@mfe/shared-http';
import { endpointAdminApi } from '../../../app/services/endpointAdminApi';
import { endpointAdminReduxContext } from '../../../app/services/redux-context';
import { DeviceDetailDrawer } from '../DeviceDetailDrawer';
import type { EndpointDevice } from '../../../entities/endpoint-device/types';
import type { EndpointAuditEvent } from '../../../entities/endpoint-audit-event/types';

/* ------------------------------------------------------------------ */
/*  Why this file exists (regression coverage, no behavior change)     */
/*                                                                     */
/*  PR #664 (commit fbbc6e09) deterministic fix: bind RTK Query hooks  */
/*  and the `<ReduxProvider>` to an MFE-local                          */
/*  `endpointAdminReduxContext` so cross-bundle `ReactReduxContext`    */
/*  identity proliferation under Module Federation cannot strand the   */
/*  hooks. The top-level `EndpointDevicesPage` was covered by          */
/*  `EndpointDevicesPage.test.tsx` and verified live (Chrome MCP smoke */
/*  on testai 2026-05-26).                                             */
/*                                                                     */
/*  User report after #664 deploy: drawer-nested `AuditTab` stuck on   */
/*  loading despite the store cache showing `status='fulfilled'`,      */
/*  `dataLen=3`. The bug DID NOT reproduce on testai LIVE in four      */
/*  scenarios (cold reload → audit; immediate Detay → audit; close +   */
/*  reopen different device → audit; COLLECT_INVENTORY mutation →     */
/*  invalidation refetch). Codex (thread `019e6174`) verdict:          */
/*  architecturally sound, no behavior-change fix; lock the            */
/*  drawer-nested RTK-Query integration with a regression test.        */
/*                                                                     */
/*  This file fills the coverage gap that PR #664 left: the explicit   */
/*  context routing is exercised inside the `<BottomSheetDrawer>` →    */
/*  `<Tabs>` → `<AuditTab>` subtree, with a real RTK store and a       */
/*  fetched audit payload. A future regression that breaks the         */
/*  Provider ↔ hook context bond (e.g. dropping `context={...}` on     */
/*  the Provider, or importing the wrong `redux-context` from a fork)  */
/*  surfaces here as `data` never reaching the rendered timeline.      */
/*                                                                     */
/*  jsdom caveat: the original cross-bundle identity split cannot be   */
/*  reproduced here because vitest loads a single bundle, so this      */
/*  suite is NOT a probe for the original #664 symptom. It is a        */
/*  contract test: drawer + AuditTab + explicit context = data flows. */
/* ------------------------------------------------------------------ */

const DEVICE_ID = '423b6fc3-7497-4083-bd2f-5e2fe543bfe9';
const TENANT_ID = '00000000-0000-0000-0000-000000000001';

const mockDevice = (): EndpointDevice => ({
  id: DEVICE_ID,
  tenantId: TENANT_ID,
  hostname: 'SRB-AIDENETIMPC',
  displayName: null,
  osType: 'WINDOWS',
  osVersion: null,
  agentVersion: '0.1.0-dev',
  machineFingerprint: 'a1dc61a42e62b1fa893e0456be7dc8156bd4ebc7a68b9b695116f45eddfa3523',
  domainName: null,
  status: 'ONLINE',
  lastSeenAt: '2026-05-26T02:19:13Z',
  enrolledAt: '2026-05-25T15:12:43Z',
  createdAt: '2026-05-25T15:12:43Z',
  updatedAt: '2026-05-26T02:19:13Z',
});

// dataLen=3 matches the user-reported store snapshot (commit message
// `listEndpointAuditEvents({"deviceId":"423b...","limit":50}): dataLen=3`).
const mockAuditEvents = (): EndpointAuditEvent[] => [
  {
    id: 'evt-3520324b-3035-4510-8fca-a8a18dbd1da2',
    tenantId: TENANT_ID,
    deviceId: DEVICE_ID,
    commandId: '5f4f4af7-1234-5678-9abc-def012345678',
    eventType: 'ENDPOINT_COMMAND_CREATED',
    action: 'CREATE_COMMAND',
    performedBySubject: 'user:admin',
    correlationId: null,
    metadata: null,
    beforeState: null,
    afterState: null,
    occurredAt: '2026-05-26T00:03:08Z',
  },
  {
    id: 'evt-87b1d2c8-aeed-40af-8742-de8431efeee2',
    tenantId: TENANT_ID,
    deviceId: DEVICE_ID,
    commandId: 'f7446e3c-1234-5678-9abc-def012345678',
    eventType: 'ENDPOINT_COMMAND_CREATED',
    action: 'CREATE_COMMAND',
    performedBySubject: 'user:admin',
    correlationId: null,
    metadata: null,
    beforeState: null,
    afterState: null,
    occurredAt: '2026-05-25T15:15:48Z',
  },
  {
    id: 'evt-consumption-1234',
    tenantId: TENANT_ID,
    deviceId: DEVICE_ID,
    commandId: null,
    eventType: 'ENDPOINT_ENROLLMENT_CONSUMED',
    action: 'CONSUME_ENROLLMENT',
    performedBySubject: 'agent:SRB-AIDENETIMPC',
    correlationId: null,
    metadata: null,
    beforeState: null,
    afterState: null,
    occurredAt: '2026-05-25T15:12:43Z',
  },
];

const buildStore = () =>
  configureStore({
    reducer: { [endpointAdminApi.reducerPath]: endpointAdminApi.reducer },
    middleware: (getDefault) => getDefault().concat(endpointAdminApi.middleware),
  });

type Store = ReturnType<typeof buildStore>;

/**
 * Render the drawer in an isolated Provider that mirrors the production
 * shape (`<ReduxProvider context={endpointAdminReduxContext}>`). Returns
 * the live store so individual specs can introspect cache entries.
 */
const renderDrawer = (device: EndpointDevice = mockDevice()) => {
  const store: Store = buildStore();
  const onClose = vi.fn();
  const utils = render(
    <ReduxProvider store={store} context={endpointAdminReduxContext}>
      <DeviceDetailDrawer open device={device} onClose={onClose} />
    </ReduxProvider>,
  );
  return { ...utils, store, onClose };
};

/**
 * Inspect the live RTK Query slice for an audit-events cache entry that
 * matches the args we expect. Used to assert the cache key serialization
 * the hook subscribes to is identical to the one the fetch dispatches
 * to — the single most reproducible signature of the original cross-
 * bundle hook-stranding symptom.
 */
const findAuditCacheEntry = (store: Store, deviceId: string, limit: number) => {
  const state = store.getState() as Record<string, unknown>;
  const slice = state[endpointAdminApi.reducerPath] as
    | { queries?: Record<string, unknown> }
    | undefined;
  const queries = slice?.queries ?? {};
  // Default `serializeQueryArgs` sorts keys alphabetically; `deviceId`
  // < `limit` so the canonical form is `{"deviceId":"...","limit":N}`.
  const expectedKey = `listEndpointAuditEvents({"deviceId":"${deviceId}","limit":${limit}})`;
  return { key: expectedKey, entry: queries[expectedKey] };
};

describe('DeviceDetailDrawer — AuditTab RTK Query integration (regression for PR #664 scope)', () => {
  let originalFetch: typeof fetch;
  let fetchUrls: string[];

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    fetchUrls = [];
    registerAuthTokenResolver(() => 'fake-token');
  });

  afterEach(() => {
    cleanup();
    globalThis.fetch = originalFetch;
    registerAuthTokenResolver(undefined);
    try {
      window.localStorage.removeItem('token');
    } catch {
      // ignore
    }
    vi.restoreAllMocks();
  });

  it('AuditTab nested in drawer reads the fulfilled audit-events cache (no stuck loading)', async () => {
    globalThis.fetch = vi.fn(async (input) => {
      const url = typeof input === 'string' ? input : (input as Request).url;
      fetchUrls.push(url);
      if (url.includes('/endpoint-admin/endpoint-audit-events')) {
        return new Response(JSON.stringify(mockAuditEvents()), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      // The drawer's parent also polls device commands; let those resolve
      // with an empty list so the test focuses on the audit hook.
      return new Response('[]', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch;

    const { store } = renderDrawer();

    // Drawer mounts on Detay tab. Switch to the audit tab to mount
    // AuditTab — the regression scope. jsdom resolves `navigator.language`
    // to `en-US` so the i18n shim renders the English copy; match both
    // locales for forward-compat.
    const auditTabButton = await screen.findByRole('tab', {
      name: /Audit History|Denetim Geçmişi/i,
    });
    fireEvent.click(auditTabButton);

    // The fulfilled cache must reach the rendered timeline. The user's
    // bug report had `dataLen=3` in the store but the hook still on
    // `isLoading=true` — that exact divergence is what this assertion
    // closes.
    await waitFor(() => {
      expect(screen.getByTestId('audit-tab-timeline')).toBeInTheDocument();
    });

    // All three audit events from the fixture are rendered.
    for (const event of mockAuditEvents()) {
      expect(screen.getByTestId(`audit-event-${event.id}`)).toBeInTheDocument();
    }

    // The hook never falls back to the loading or empty branches once
    // the fetch resolves. Match both locales for the loading copy.
    expect(screen.queryByText(/Loading audit events|Denetim olayları yükleniyor/i)).toBeNull();
    expect(screen.queryByTestId('audit-tab-empty')).toBeNull();

    // The fetch reached the expected gateway path with the limit guard
    // the backend `@RequestParam UUID` contract requires.
    expect(
      fetchUrls.some((u) =>
        u.includes(`/api/v1/endpoint-admin/endpoint-audit-events?deviceId=${DEVICE_ID}&limit=50`),
      ),
    ).toBe(true);

    // The hook subscribed to the canonical cache key (sorted JSON). A
    // regression that introduces a divergent serialization on either
    // side (subscribe vs dispatch) trips this assertion before the UI
    // assertions, narrowing the failure to the cache-key contract.
    const { entry } = findAuditCacheEntry(store, DEVICE_ID, 50);
    expect(entry).toBeDefined();
    expect((entry as { status: string }).status).toBe('fulfilled');
    expect(((entry as { data: unknown[] }).data ?? []).length).toBe(3);
  });

  it('AuditTab hook stays skipped until the audit tab is active (no premature fetch)', async () => {
    globalThis.fetch = vi.fn(async (input) => {
      const url = typeof input === 'string' ? input : (input as Request).url;
      fetchUrls.push(url);
      return new Response('[]', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch;

    renderDrawer();

    // The drawer renders Detay by default. The audit `skip` guard
    // (`!active || !deviceId`) must keep the hook dormant — no audit
    // request before the user opens the tab.
    await waitFor(() => {
      // Wait one async turn so polling/initial fetches settle.
      expect(screen.getByTestId('device-detay-tab')).toBeInTheDocument();
    });

    expect(fetchUrls.some((u) => u.includes('endpoint-audit-events'))).toBe(false);
  });

  it('AuditTab renders the empty-state copy when the backend returns no events', async () => {
    globalThis.fetch = vi.fn(async (input) => {
      const url = typeof input === 'string' ? input : (input as Request).url;
      if (url.includes('/endpoint-admin/endpoint-audit-events')) {
        return new Response('[]', {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response('[]', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch;

    renderDrawer();

    const auditTabButton = await screen.findByRole('tab', {
      name: /Audit History|Denetim Geçmişi/i,
    });
    fireEvent.click(auditTabButton);

    await waitFor(() => {
      expect(screen.getByTestId('audit-tab-empty')).toBeInTheDocument();
    });

    // Empty state is the documented contract — the loading copy must
    // not linger after the fetch resolves with `[]`.
    expect(screen.queryByText(/Loading audit events|Denetim olayları yükleniyor/i)).toBeNull();
  });

  it('AuditTab surfaces the 403 forbidden state from the OpenFGA RequireModule interceptor', async () => {
    globalThis.fetch = vi.fn(async (input) => {
      const url = typeof input === 'string' ? input : (input as Request).url;
      if (url.includes('/endpoint-admin/endpoint-audit-events')) {
        return new Response(JSON.stringify({ error: 'forbidden' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response('[]', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch;

    renderDrawer();

    const auditTabButton = await screen.findByRole('tab', {
      name: /Audit History|Denetim Geçmişi/i,
    });
    fireEvent.click(auditTabButton);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
    // i18n forbidden copy varies by locale; assert by role + that the
    // loading state never sticks.
    expect(screen.queryByText(/Loading audit events|Denetim olayları yükleniyor/i)).toBeNull();
  });
});
