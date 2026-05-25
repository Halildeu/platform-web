import React from 'react';
import type { ReactReduxContextValue } from 'react-redux';
import { createDispatchHook, createSelectorHook, createStoreHook } from 'react-redux';

/**
 * Explicit Redux context for this MFE.
 *
 * Why: under Module Federation, the eager AG Grid setup chain pulled in
 * by `@mfe/design-system/advanced/data-grid` resolves `react-redux` and
 * `@reduxjs/toolkit` before the host's loadShare singletons are
 * registered, giving the AG Grid chunk its own bundled `react-redux`
 * instance with its own internal `ReactReduxContext` identity. The
 * `<Provider>` we mount lives under that AG-Grid-bound context, while
 * the generated RTK Query hooks (`useListEndpointDevicesQuery`, ...)
 * resolve their `useContext(ReactReduxContext)` against a different
 * bundle's context — never seeing our Provider's store. Live testai
 * smoke (2026-05-25) showed the inner store at
 * `status: 'fulfilled'` while the hook stayed in `status: 'pending'`,
 * which is the visible symptom of that identity mismatch.
 *
 * Fix: pin both the Provider and every hook in this MFE to a single
 * locally-owned `React.createContext` instance. The default
 * `ReactReduxContext` is no longer in the path, so cross-bundle
 * `react-redux` instance proliferation cannot strand the hooks.
 *
 * This file is imported by:
 *   - `endpointAdminApi.ts` — wires RTK Query's `reactHooksModule`
 *     hooks to use this context;
 *   - `EndpointAdminApp.ui.tsx` — passes `context={endpointAdminReduxContext}`
 *     to the `<ReduxProvider>`.
 *
 * The two consumers MUST share a single import of this module — the
 * `react-redux` shared singleton guarantee at the federation share
 * scope still applies, but we no longer depend on its
 * `ReactReduxContext` for identity routing.
 */
export const endpointAdminReduxContext =
  // `ReactReduxContextValue` is the canonical shape react-redux uses
  // (`{ store, subscription, ... }`). Default `null` matches the
  // unprovided / no-Provider state.
  React.createContext<ReactReduxContextValue | null>(null);

/** `useDispatch` bound to {@link endpointAdminReduxContext}. */
export const useEndpointAdminDispatch = createDispatchHook(endpointAdminReduxContext);

/** `useSelector` bound to {@link endpointAdminReduxContext}. */
export const useEndpointAdminSelector = createSelectorHook(endpointAdminReduxContext);

/** `useStore` bound to {@link endpointAdminReduxContext}. */
export const useEndpointAdminStore = createStoreHook(endpointAdminReduxContext);
