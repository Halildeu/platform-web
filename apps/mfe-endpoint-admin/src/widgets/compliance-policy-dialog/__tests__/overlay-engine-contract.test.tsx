// @vitest-environment jsdom
/**
 * WEB-014C overlay-engine contract guard.
 *
 * Codex 019e6e10 iter-2 RED absorb regression test. The initial dialog
 * implementations called the overlay-engine primitives with the WRONG
 * signatures:
 *   - `registerLayer({ name: 'X' })`  instead of `registerLayer(id, 'modal')`
 *   - `useFocusTrap(ref, open)`        instead of object-param + returned ref
 *   - `useSiblingIsolation(ref, open)` instead of `{ active, layerId, panelRef }`
 *   - `useEscapeKey(open, onClose)`    instead of `useEscapeKey(open, onClose, { layerId })`
 *
 * This contract test mocks `@mfe/design-system/internal/overlay-engine`
 * and asserts each dialog invokes the primitives with the canonical
 * shape. If a future change reverts to the legacy 2-arg pattern, this
 * test fails fast in CI — before TypeScript or runtime errors surface.
 *
 * Codex 019e6fc1 iter-3 AGREE non-blocking hardening absorbed:
 *   1. useScrollLock(open) is asserted called with `true` — the dialogs
 *      always call useScrollLock(open) but the mock was previously never
 *      checked. A regression dropping the call (or passing the wrong arg)
 *      would silently allow background scroll when a modal is open.
 *   2. panelRef.current is asserted to be the actual dialog HTMLDivElement
 *      instead of `typeof === 'object'`. The previous check passed for
 *      `null` (since `typeof null === 'object'`), so a refactor that
 *      detached the ref from the dialog div would slip through. The
 *      useFocusTrap mock now returns a real React.useRef so React's ref
 *      flow populates `.current` on commit; the assertion compares that
 *      ref to `getByRole('dialog')` to verify the wiring.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

const registerLayerMock = vi.fn(() => 301);
const unregisterLayerMock = vi.fn();
const useFocusTrapMock = vi.fn();
const useSiblingIsolationMock = vi.fn();
const useEscapeKeyMock = vi.fn();
const useScrollLockMock = vi.fn();

vi.mock('@mfe/design-system/internal/overlay-engine', () => ({
  registerLayer: (...args: unknown[]) => registerLayerMock(...args),
  unregisterLayer: (...args: unknown[]) => unregisterLayerMock(...args),
  // Codex 019e6fc1 iter-3 hardening: return a real React.useRef so that
  // when the dialog assigns it via `ref={panelRef}` on its <div role="dialog">,
  // React's ref-callback flow populates `.current` with the actual
  // HTMLDivElement after commit. This lets us assert
  // `panelRef.current instanceof HTMLDivElement` and detect a regression
  // where the ref is never attached. React.useRef inside the mock is
  // safe — `useFocusTrap` is called from the dialog's render context,
  // so the hook is invoked under React's reconciliation. Identity is
  // preserved across re-renders of the same dialog instance.
  useFocusTrap: (...args: unknown[]) => {
    useFocusTrapMock(...args);
    return React.useRef<HTMLDivElement | null>(null);
  },
  useSiblingIsolation: (...args: unknown[]) => useSiblingIsolationMock(...args),
  useEscapeKey: (...args: unknown[]) => useEscapeKeyMock(...args),
  useScrollLock: (...args: unknown[]) => useScrollLockMock(...args),
}));

vi.mock('../../../app/services/endpointAdminApi', () => ({
  useListCatalogItemsQuery: () => ({
    data: {
      content: [],
      number: 0,
      size: 200,
      totalElements: 0,
      totalPages: 0,
      first: true,
      last: true,
      empty: true,
    },
    isLoading: false,
  }),
  useCreateCompliancePolicyItemMutation: () => [
    vi.fn(() => ({ unwrap: () => Promise.resolve({}) })),
    { isLoading: false },
  ],
  useUpdateCompliancePolicyItemMutation: () => [
    vi.fn(() => ({ unwrap: () => Promise.resolve({}) })),
    { isLoading: false },
  ],
}));

import { CreatePolicyDialog } from '../CreatePolicyDialog';
import { EditPolicyDialog } from '../EditPolicyDialog';
import { DeletePolicyConfirm } from '../DeletePolicyConfirm';
import type { CompliancePolicyItem } from '../../../entities/endpoint-device-compliance/types';

function buildPolicy(): CompliancePolicyItem {
  return {
    id: 'policy-1',
    tenantId: 'tenant-1',
    catalogItemId: 'catalog-uuid-1',
    catalogItemKey: '7zip.7zip',
    catalogDisplayName: '7-Zip',
    enforcementMode: 'REQUIRED',
    enabled: true,
    createdBySubject: null,
    createdAt: '2026-05-28T10:00:00Z',
    lastUpdatedBySubject: null,
    lastUpdatedAt: '2026-05-28T10:00:00Z',
    version: 1,
  };
}

function resetMocks() {
  registerLayerMock.mockClear();
  unregisterLayerMock.mockClear();
  useFocusTrapMock.mockClear();
  useSiblingIsolationMock.mockClear();
  useEscapeKeyMock.mockClear();
  useScrollLockMock.mockClear();
}

/**
 * Assert all dialogs share the same canonical overlay-engine contract.
 *
 * The assertions are deliberately strict on SHAPES, not on internal
 * implementation details: registerLayer's second arg must be the
 * string literal 'modal' (not a number, not 'dropdown', not options
 * object); useFocusTrap / useSiblingIsolation must receive object
 * params; useEscapeKey must receive the layerId option so nested
 * modal Escape LIFO is preserved.
 */
function assertCanonicalContract() {
  expect(registerLayerMock).toHaveBeenCalledTimes(1);
  const registerArgs = registerLayerMock.mock.calls[0];
  expect(typeof registerArgs[0]).toBe('string');
  expect((registerArgs[0] as string).length).toBeGreaterThan(0);
  expect(registerArgs[1]).toBe('modal');
  const layerId = registerArgs[0] as string;

  expect(useFocusTrapMock).toHaveBeenCalled();
  const trapArg = useFocusTrapMock.mock.calls[0][0] as Record<string, unknown>;
  expect(trapArg).toMatchObject({
    active: true,
    autoFocus: true,
    restoreFocus: true,
    layerId,
  });

  expect(useSiblingIsolationMock).toHaveBeenCalled();
  const isoArg = useSiblingIsolationMock.mock.calls[0][0] as Record<string, unknown>;
  expect(isoArg).toMatchObject({ active: true, layerId });
  expect(isoArg.panelRef).toBeTruthy();
  // Codex 019e6fc1 iter-3 hardening: `typeof null === 'object'` would
  // pass a ref that was never attached. Assert the ref is wired to the
  // actual dialog HTMLDivElement and that `getByRole('dialog')` returns
  // the same node — this catches a regression where someone moves
  // `ref={panelRef}` off the dialog's panel div.
  const panelRef = isoArg.panelRef as React.RefObject<HTMLDivElement>;
  expect(panelRef.current).toBeInstanceOf(HTMLDivElement);
  expect(screen.getByRole('dialog')).toBe(panelRef.current);

  expect(useEscapeKeyMock).toHaveBeenCalled();
  const escapeCall = useEscapeKeyMock.mock.calls[0];
  expect(escapeCall[0]).toBe(true);
  expect(typeof escapeCall[1]).toBe('function');
  expect(escapeCall[2]).toEqual({ layerId });

  // Codex 019e6fc1 iter-3 hardening: useScrollLock(open) was mocked but
  // never asserted. A regression that drops the call (or flips the arg)
  // would silently allow background scroll when a modal is open.
  expect(useScrollLockMock).toHaveBeenCalledWith(true);
}

describe('compliance-policy-dialog overlay-engine contract', () => {
  beforeEach(() => {
    resetMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('CreatePolicyDialog invokes the canonical overlay-engine API', () => {
    render(<CreatePolicyDialog open onClose={() => undefined} canManage />);
    assertCanonicalContract();
  });

  it('EditPolicyDialog invokes the canonical overlay-engine API', () => {
    render(<EditPolicyDialog open item={buildPolicy()} onClose={() => undefined} canManage />);
    assertCanonicalContract();
  });

  it('DeletePolicyConfirm invokes the canonical overlay-engine API', () => {
    render(
      <DeletePolicyConfirm
        open
        item={buildPolicy()}
        onClose={() => undefined}
        onConfirm={() => undefined}
        isLoading={false}
        error={undefined}
      />,
    );
    assertCanonicalContract();
  });

  it('unregisterLayer is called with the same string id on close', () => {
    const { rerender } = render(<CreatePolicyDialog open onClose={() => undefined} canManage />);
    const registeredId = registerLayerMock.mock.calls[0][0] as string;
    rerender(<CreatePolicyDialog open={false} onClose={() => undefined} canManage />);
    expect(unregisterLayerMock).toHaveBeenCalledWith(registeredId);
  });
});
