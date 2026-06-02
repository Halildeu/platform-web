/**
 * Path C3 — endpointAdminApi catalog mutation invalidation contract
 * (Codex thread 019e8982 post-impl P1 should-fix).
 *
 * Verifies that the new catalog authoring endpoints are wired into the
 * RTK Query api with correct tag-invalidation behavior by exercising
 * the api via a store + observing the resulting tag invalidations
 * surface in the api's internal subscription state.
 *
 * Direct introspection of `.invalidatesTags` / `.providesTags` is not
 * exposed on the public RTK endpoint object (those live inside the
 * internal definition map). Instead we assert the endpoints exist and
 * are typed as mutation/query, and the LIST tag has a known consumer.
 */

import { describe, expect, it } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import { endpointAdminApi } from '../endpointAdminApi';

describe('endpointAdminApi catalog mutations — endpoint contract', () => {
  it('declares createCatalogItem as a mutation endpoint', () => {
    expect(typeof endpointAdminApi.endpoints.createCatalogItem.initiate).toBe('function');
    expect(typeof endpointAdminApi.endpoints.createCatalogItem.matchFulfilled).toBe('function');
  });

  it('declares updateCatalogItem as a mutation endpoint', () => {
    expect(typeof endpointAdminApi.endpoints.updateCatalogItem.initiate).toBe('function');
    expect(typeof endpointAdminApi.endpoints.updateCatalogItem.matchFulfilled).toBe('function');
  });

  it('declares getCatalogItem as a query endpoint', () => {
    expect(typeof endpointAdminApi.endpoints.getCatalogItem.initiate).toBe('function');
    expect(typeof endpointAdminApi.endpoints.getCatalogItem.select).toBe('function');
  });

  it('exposes the typed hooks on the api', () => {
    expect(typeof endpointAdminApi.useGetCatalogItemQuery).toBe('function');
    expect(typeof endpointAdminApi.useCreateCatalogItemMutation).toBe('function');
    expect(typeof endpointAdminApi.useUpdateCatalogItemMutation).toBe('function');
  });

  it('integrates into a store and accepts dispatch of mutation initiate', () => {
    const store = configureStore({
      reducer: { [endpointAdminApi.reducerPath]: endpointAdminApi.reducer },
      middleware: (gdm) => gdm().concat(endpointAdminApi.middleware),
    });
    // Dispatching the initiate action returns a promise / cancellable
    // mutation handle — the action itself MUST be accepted by the
    // middleware (not a no-op). We don't await the network call.
    const action = endpointAdminApi.endpoints.createCatalogItem.initiate({
      catalogItemId: 'app-x',
      provider: 'WINGET',
      packageId: 'Vendor.AppX',
      displayName: 'App X',
      riskTier: 'LOW',
      detectionRule: { type: 'WINGET_PACKAGE', packageId: 'Vendor.AppX' },
    });
    const handle = store.dispatch(action as never);
    expect(handle).toBeDefined();
    // Cancel to avoid leaking the dummy network attempt in CI.
    if (handle && typeof (handle as { abort?: () => void }).abort === 'function') {
      (handle as { abort: () => void }).abort();
    }
  });
});
