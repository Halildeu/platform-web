// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';

/**
 * Web Test Gate 2026-09-11 (platform-web#1162 run 34571036236): "Unhandled Rejection —
 * ReferenceError: window is not defined" from VariantIntegration's variants fetch. The
 * fetch resolved after the test file's jsdom was torn down and the component's
 * `finally { setLoading(false) }` ran on an unmounted tree. The component must stop
 * touching React state once it is unmounted or its gridId has moved on.
 */
const fetchGridVariants = vi.fn();
vi.mock('../../lib/grid-variants', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/grid-variants')>()),
  fetchGridVariants: (...args: unknown[]) => fetchGridVariants(...args),
}));

import { VariantIntegration } from '../data-grid/VariantIntegration';

describe('VariantIntegration — late variants fetch after unmount', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    fetchGridVariants.mockReset();
  });

  it('does not set state after unmount when the fetch resolves late (torn-down window)', async () => {
    let resolve!: (value: unknown[]) => void;
    fetchGridVariants.mockReturnValue(new Promise<unknown[]>((r) => { resolve = r; }));
    const rejections: unknown[] = [];
    const onRejection = (reason: unknown) => rejections.push(reason);
    process.on('unhandledRejection', onRejection);
    try {
      const { unmount } = render(<VariantIntegration gridId="unmount-probe" />);
      expect(fetchGridVariants).toHaveBeenCalledWith('unmount-probe');
      unmount();

      // What the CI run hit: the environment is gone by the time the fetch settles.
      const realWindow = globalThis.window;
      vi.stubGlobal('window', undefined);
      try {
        resolve([]);
        await new Promise((r) => setTimeout(r, 0));
        await new Promise((r) => setTimeout(r, 0));
      } finally {
        vi.stubGlobal('window', realWindow);
      }
    } finally {
      // Always detach: a listener left behind would mute Vitest's own unhandled-error
      // reporting for the rest of this worker.
      process.off('unhandledRejection', onRejection);
    }
    expect(rejections).toEqual([]);
  });

  it('ignores the result of a superseded gridId fetch', async () => {
    const first: { resolve?: (value: unknown[]) => void } = {};
    fetchGridVariants
      .mockReturnValueOnce(new Promise<unknown[]>((r) => { first.resolve = r; }))
      .mockResolvedValueOnce([]);
    const { rerender, container } = render(<VariantIntegration gridId="grid-a" />);
    rerender(<VariantIntegration gridId="grid-b" />);
    await new Promise((r) => setTimeout(r, 0));
    // The stale grid-a answer arrives with a variant; it must not surface in grid-b's list.
    first.resolve!([{ id: 'stale', name: 'STALE_VARIANT', gridId: 'grid-a', isCompatible: true }]);
    await new Promise((r) => setTimeout(r, 0));
    expect(container.textContent).not.toContain('STALE_VARIANT');
  });
});
