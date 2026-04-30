// @vitest-environment jsdom
//
// Codex 019dde4e iter-47a — sibling isolation contract tests.
//
// Locks the WeakMap ref-count + root-level containing-subtree
// exclusion + originallyInert preservation contracts. Each case
// targets a specific failure mode the design has to defend against:
//   1. Single overlay: open inerts siblings, close cleans up
//   2. Two nested overlays: B opens after A; B closes; A still
//      isolated (count > 0 keeps inert)
//   3. Two sibling overlays open simultaneously: each owns its own
//      siblings record
//   4. Portaled overlay: panel deep inside a host element under body;
//      host is NOT inert (root-level containing subtree exclusion)
//   5. Pre-existing inert preserved: an element that was inert
//      BEFORE acquire stays inert after release (originallyInert)
//   6. Out-of-order release: A acquires, B acquires, A releases
//      first → ref-count keeps inert; B releases → finally cleared
//   7. Idempotent acquire/release: same layerId acquire+release
//      twice doesn't double-count
//   8. Allowlist: `data-isolation-allowlist` element NOT inerted
//
// We assert via `hasAttribute('inert')` because jsdom's
// HTMLElement.inert property semantics aren't reliable.

import React, { useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { act, cleanup, render } from '@testing-library/react';
import {
  acquireSiblingIsolation,
  releaseSiblingIsolation,
  useSiblingIsolation,
} from '../overlay-engine/sibling-isolation';

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  // jsdom shares document.body across tests — clear leftover children
  // so each case starts from a clean slate. afterEach cleanup handles
  // mounted React nodes, but raw DOM appended in tests is on us.
  document.body.innerHTML = '';
});

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function makeChild(tag: string, id: string, parent: HTMLElement = document.body): HTMLElement {
  const el = document.createElement(tag);
  el.setAttribute('data-testid', id);
  parent.appendChild(el);
  return el;
}

/* ------------------------------------------------------------------ */
/*  Engine helper — direct API tests                                   */
/* ------------------------------------------------------------------ */

describe('acquireSiblingIsolation / releaseSiblingIsolation', () => {
  it('1. single overlay: open inerts siblings, release cleans up', () => {
    const sibling1 = makeChild('div', 'sibling1');
    const sibling2 = makeChild('div', 'sibling2');
    const host = makeChild('div', 'overlay-host');
    const panel = document.createElement('div');
    panel.setAttribute('data-testid', 'panel');
    host.appendChild(panel);

    expect(sibling1.hasAttribute('inert')).toBe(false);
    expect(sibling2.hasAttribute('inert')).toBe(false);

    const record = acquireSiblingIsolation({
      layerId: 'layer-1',
      panelElement: panel,
      root: document.body,
    });

    expect(sibling1.hasAttribute('inert')).toBe(true);
    expect(sibling2.hasAttribute('inert')).toBe(true);

    releaseSiblingIsolation(record);
    expect(sibling1.hasAttribute('inert')).toBe(false);
    expect(sibling2.hasAttribute('inert')).toBe(false);
  });

  it('2. two nested overlays: B closes, A keeps siblings inert', () => {
    const sibling = makeChild('div', 'sibling');
    const hostA = makeChild('div', 'host-a');
    const panelA = document.createElement('div');
    hostA.appendChild(panelA);

    const recordA = acquireSiblingIsolation({
      layerId: 'A',
      panelElement: panelA,
      root: document.body,
    });
    expect(sibling.hasAttribute('inert')).toBe(true);

    // B opens nested — it also acquires from body, sibling already inert
    // and stays inert (count = 2 now).
    const hostB = makeChild('div', 'host-b');
    const panelB = document.createElement('div');
    hostB.appendChild(panelB);

    const recordB = acquireSiblingIsolation({
      layerId: 'B',
      panelElement: panelB,
      root: document.body,
    });
    // After B acquire, sibling still inert (count = 2)
    expect(sibling.hasAttribute('inert')).toBe(true);

    // B closes first
    releaseSiblingIsolation(recordB);
    // Sibling should still be inert because A still holds the ref
    expect(sibling.hasAttribute('inert')).toBe(true);

    // A closes
    releaseSiblingIsolation(recordA);
    expect(sibling.hasAttribute('inert')).toBe(false);
  });

  it('3. two sibling overlays open simultaneously: independent records', () => {
    const outsider = makeChild('div', 'outsider');
    const hostA = makeChild('div', 'host-a');
    const hostB = makeChild('div', 'host-b');
    const panelA = document.createElement('div');
    const panelB = document.createElement('div');
    hostA.appendChild(panelA);
    hostB.appendChild(panelB);

    const recordA = acquireSiblingIsolation({
      layerId: 'A',
      panelElement: panelA,
      root: document.body,
    });
    // A's siblings: outsider, host-b (host-a is excluded as panel container)
    expect(outsider.hasAttribute('inert')).toBe(true);
    expect(hostB.hasAttribute('inert')).toBe(true);
    expect(hostA.hasAttribute('inert')).toBe(false);

    const recordB = acquireSiblingIsolation({
      layerId: 'B',
      panelElement: panelB,
      root: document.body,
    });
    // B's siblings: outsider, host-a (host-b is excluded)
    expect(hostA.hasAttribute('inert')).toBe(true);
    // host-b is still NOT inert from B's POV
    expect(hostB.hasAttribute('inert')).toBe(true); // still from A
    expect(outsider.hasAttribute('inert')).toBe(true);

    releaseSiblingIsolation(recordA);
    // After A release: outsider count drops 2→1 (B still holds), still inert
    expect(outsider.hasAttribute('inert')).toBe(true);
    // host-b: A held it, count drops 1→0 (B doesn't isolate its own host),
    // so should now be free
    expect(hostB.hasAttribute('inert')).toBe(false);
    // host-a: only B holds, still inert
    expect(hostA.hasAttribute('inert')).toBe(true);

    releaseSiblingIsolation(recordB);
    expect(outsider.hasAttribute('inert')).toBe(false);
    expect(hostA.hasAttribute('inert')).toBe(false);
  });

  it('4. portaled overlay: panel inside host, host is NOT inerted', () => {
    const sibling = makeChild('div', 'sibling');
    const overlayHost = makeChild('div', 'overlay-host');
    const wrapper = document.createElement('div');
    overlayHost.appendChild(wrapper);
    const panel = document.createElement('div');
    wrapper.appendChild(panel);

    const record = acquireSiblingIsolation({
      layerId: 'L',
      panelElement: panel,
      root: document.body,
    });

    expect(sibling.hasAttribute('inert')).toBe(true);
    // Host contains the panel deep inside; it must NOT be inert.
    expect(overlayHost.hasAttribute('inert')).toBe(false);

    releaseSiblingIsolation(record);
    expect(sibling.hasAttribute('inert')).toBe(false);
  });

  it('5. pre-existing inert is preserved across acquire+release', () => {
    const wasInert = makeChild('div', 'was-inert');
    wasInert.setAttribute('inert', '');
    const host = makeChild('div', 'host');
    const panel = document.createElement('div');
    host.appendChild(panel);

    const record = acquireSiblingIsolation({
      layerId: 'L',
      panelElement: panel,
      root: document.body,
    });
    // wasInert remains inert (count=1, originallyInert=true)
    expect(wasInert.hasAttribute('inert')).toBe(true);

    releaseSiblingIsolation(record);
    // Critical: stays inert because it was inert BEFORE acquire
    expect(wasInert.hasAttribute('inert')).toBe(true);
  });

  it('6. out-of-order release: A acquire → B acquire → A release → still inert', () => {
    const sibling = makeChild('div', 'sibling');
    const hostA = makeChild('div', 'host-a');
    const hostB = makeChild('div', 'host-b');
    const panelA = document.createElement('div');
    const panelB = document.createElement('div');
    hostA.appendChild(panelA);
    hostB.appendChild(panelB);

    const recordA = acquireSiblingIsolation({
      layerId: 'A',
      panelElement: panelA,
      root: document.body,
    });
    // sibling: A holds, count=1 → inert
    expect(sibling.hasAttribute('inert')).toBe(true);

    const recordB = acquireSiblingIsolation({
      layerId: 'B',
      panelElement: panelB,
      root: document.body,
    });
    // sibling: B also holds, count=2 → still inert, originallyInert=false
    expect(sibling.hasAttribute('inert')).toBe(true);

    // A releases first (out of order — B should still keep inert)
    releaseSiblingIsolation(recordA);
    expect(sibling.hasAttribute('inert')).toBe(true);

    // Now B releases — count → 0, originallyInert=false → cleared
    releaseSiblingIsolation(recordB);
    expect(sibling.hasAttribute('inert')).toBe(false);
  });

  it('7. idempotent: same layerId acquire+release twice does not double-count', () => {
    const sibling = makeChild('div', 'sibling');
    const host = makeChild('div', 'host');
    const panel = document.createElement('div');
    host.appendChild(panel);

    const recordOnce = acquireSiblingIsolation({
      layerId: 'L',
      panelElement: panel,
      root: document.body,
    });
    const recordTwice = acquireSiblingIsolation({
      layerId: 'L',
      panelElement: panel,
      root: document.body,
    });
    expect(sibling.hasAttribute('inert')).toBe(true);

    // Single release should fully clear because layerId was idempotent
    releaseSiblingIsolation(recordOnce);
    expect(sibling.hasAttribute('inert')).toBe(false);

    // Second release is a no-op (layer already removed from owners)
    releaseSiblingIsolation(recordTwice);
    expect(sibling.hasAttribute('inert')).toBe(false);
  });

  it('8. data-isolation-allowlist element is NOT inerted', () => {
    const liveRegion = makeChild('div', 'live-region');
    liveRegion.setAttribute('data-isolation-allowlist', '');
    liveRegion.setAttribute('role', 'status');
    const sibling = makeChild('div', 'sibling');
    const host = makeChild('div', 'host');
    const panel = document.createElement('div');
    host.appendChild(panel);

    const record = acquireSiblingIsolation({
      layerId: 'L',
      panelElement: panel,
      root: document.body,
    });

    // Sibling inerted
    expect(sibling.hasAttribute('inert')).toBe(true);
    // Allowlisted live-region NOT inerted
    expect(liveRegion.hasAttribute('inert')).toBe(false);

    releaseSiblingIsolation(record);
  });

  it('9. SCRIPT/STYLE/META/LINK elements are skipped', () => {
    const script = makeChild('script', 'inline-script');
    const style = makeChild('style', 'inline-style');
    const meta = makeChild('meta', 'meta-tag');
    const link = makeChild('link', 'link-tag');
    const sibling = makeChild('div', 'sibling');
    const host = makeChild('div', 'host');
    const panel = document.createElement('div');
    host.appendChild(panel);

    const record = acquireSiblingIsolation({
      layerId: 'L',
      panelElement: panel,
      root: document.body,
    });

    expect(script.hasAttribute('inert')).toBe(false);
    expect(style.hasAttribute('inert')).toBe(false);
    expect(meta.hasAttribute('inert')).toBe(false);
    expect(link.hasAttribute('inert')).toBe(false);
    expect(sibling.hasAttribute('inert')).toBe(true);

    releaseSiblingIsolation(record);
  });
});

/* ------------------------------------------------------------------ */
/*  React hook wrapper                                                 */
/* ------------------------------------------------------------------ */

describe('useSiblingIsolation hook', () => {
  function HookHost({ active }: { active: boolean }) {
    const ref = useRef<HTMLDivElement>(null);
    useSiblingIsolation({
      active,
      layerId: 'hook-layer',
      panelRef: ref,
    });
    return (
      <div ref={ref} data-testid="hook-panel">
        Panel
      </div>
    );
  }

  it('hook activates on active=true and releases on unmount', async () => {
    const sibling = makeChild('div', 'sibling-hook');
    expect(sibling.hasAttribute('inert')).toBe(false);

    const { unmount } = render(<HookHost active={true} />);
    // Wait for useEffect to flush
    await act(async () => {});

    expect(sibling.hasAttribute('inert')).toBe(true);

    unmount();
    expect(sibling.hasAttribute('inert')).toBe(false);
  });

  it('hook is no-op when active=false', async () => {
    const sibling = makeChild('div', 'sibling-noactive');
    render(<HookHost active={false} />);
    await act(async () => {});
    expect(sibling.hasAttribute('inert')).toBe(false);
  });
});
