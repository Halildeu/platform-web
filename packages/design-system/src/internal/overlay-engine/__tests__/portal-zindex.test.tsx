// @vitest-environment jsdom
//
// Codex 019ddf17 iter-47c — Portal-root z-index alignment contract.
//
// Locks the rule that `usePortal({ layerId })` mirrors the layer-stack
// entry's z-index onto the portal container's inline style. The hook
// must NOT register a new layer; the consumer-side `registerLayer`
// call is the single source of truth for z-index assignment.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { useEffect } from 'react';
import { registerLayer, resetLayerStack, unregisterLayer } from '../layer-stack';
import { usePortal } from '../usePortal';

function PortalConsumer({
  layerId,
  registeredLayer = 'modal' as const,
  enabled = true,
}: {
  layerId?: string;
  registeredLayer?: 'modal' | 'dropdown' | 'popover' | 'toast';
  enabled?: boolean;
}) {
  // Consumer registers the layer first (single source of truth).
  useEffect(() => {
    if (!layerId) return;
    registerLayer(layerId, registeredLayer);
    return () => unregisterLayer(layerId);
  }, [layerId, registeredLayer]);

  const { Portal } = usePortal({ layerId, enabled });
  return (
    <Portal>
      <div data-testid="content">content</div>
    </Portal>
  );
}

describe('usePortal layerId / z-index alignment (iter-47c)', () => {
  beforeEach(() => {
    resetLayerStack();
  });

  afterEach(() => {
    resetLayerStack();
    // Cleanup any orphan portal divs left in document.body
    Array.from(document.querySelectorAll('div[data-portal="true"]')).forEach((n) => n.remove());
  });

  it('1. layerId omitted → no inline z-index on portal root', () => {
    render(<PortalConsumer />);
    const portalRoot = document.querySelector<HTMLElement>('div[data-portal="true"]');
    expect(portalRoot).toBeTruthy();
    // No layer registered → no zIndex projection (legacy behavior)
    expect(portalRoot!.style.zIndex).toBe('');
  });

  it('2. layerId provided + modal registered → portal root z-index matches', () => {
    render(<PortalConsumer layerId="layer-modal-1" registeredLayer="modal" />);
    const portalRoot = document.querySelector<HTMLElement>('div[data-portal="true"]');
    // Modal band base = 300; counter += 1 → zIndex = 301
    expect(portalRoot!.style.zIndex).toBe('301');
  });

  it('3. layerId provided + dropdown → portal root z-index reflects dropdown band', () => {
    render(<PortalConsumer layerId="layer-drop-1" registeredLayer="dropdown" />);
    const portalRoot = document.querySelector<HTMLElement>('div[data-portal="true"]');
    expect(portalRoot!.style.zIndex).toBe('201');
  });

  it('4. enabled=false → no portal root rendered (zIndex projection skipped)', () => {
    render(<PortalConsumer layerId="layer-x" enabled={false} />);
    // No portal container created when disabled
    const portalRoot = document.querySelector<HTMLElement>('div[data-portal="true"]');
    expect(portalRoot).toBeNull();
  });

  it('5. usePortal does NOT register a new layer (single-source-of-truth)', () => {
    const { rerender } = render(<PortalConsumer layerId="single-source" registeredLayer="modal" />);
    // Force a re-render — usePortal effect runs again but should not
    // create an additional registry entry.
    rerender(<PortalConsumer layerId="single-source" registeredLayer="modal" />);
    // We can't import getLayerStack here without leaking internal API,
    // but the consumer's registerLayer/unregisterLayer pair is the only
    // mutation; usePortal's effect only reads via getLayerStack and
    // assigns inline style. Visual proof: zIndex is exactly the modal
    // base + 1 (no additional counter increment from usePortal).
    const portalRoot = document.querySelector<HTMLElement>('div[data-portal="true"]');
    expect(portalRoot!.style.zIndex).toBe('301');
  });
});
