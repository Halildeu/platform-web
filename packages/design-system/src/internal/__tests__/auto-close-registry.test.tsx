// @vitest-environment jsdom
//
// Codex 019ddf17 iter-47b2 — modal-over-X auto-close registry contract.
//
// Locks the rules that `registerLayer` follows when a modal/spotlight
// stacks above a dropdown/popover layer. Each case targets a specific
// failure mode the registry must defend against. Pure-function tests;
// no React tree mounting required.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getRestoreTarget,
  registerLayer,
  resetLayerStack,
  unregisterLayer,
} from '../overlay-engine/layer-stack';

describe('auto-close registry (iter-47b2)', () => {
  beforeEach(() => {
    resetLayerStack();
  });

  afterEach(() => {
    resetLayerStack();
    vi.restoreAllMocks();
  });

  it('1. modal register → underlying dropdown auto-close çağrılır', () => {
    const dropdownClose = vi.fn();
    registerLayer('drop-1', 'dropdown', { autoCloseOnHigherLayer: dropdownClose });
    registerLayer('modal-1', 'modal');
    expect(dropdownClose).toHaveBeenCalledTimes(1);
  });

  it('2. modal register → underlying popover auto-close çağrılır', () => {
    const popoverClose = vi.fn();
    registerLayer('pop-1', 'popover', { autoCloseOnHigherLayer: popoverClose });
    registerLayer('modal-1', 'modal');
    expect(popoverClose).toHaveBeenCalledTimes(1);
  });

  it('3. modal register → toast auto-close ÇAĞRILMAZ (different layer band)', () => {
    const toastClose = vi.fn();
    registerLayer('toast-1', 'toast', { autoCloseOnHigherLayer: toastClose });
    registerLayer('modal-1', 'modal');
    expect(toastClose).not.toHaveBeenCalled();
  });

  it('4. modal register → underlying modal auto-close ÇAĞRILMAZ (only dropdown/popover targeted)', () => {
    const innerModalClose = vi.fn();
    registerLayer('modal-inner', 'modal', { autoCloseOnHigherLayer: innerModalClose });
    registerLayer('modal-outer', 'modal');
    expect(innerModalClose).not.toHaveBeenCalled();
  });

  it('5. dropdown register → underlying dropdown auto-close ÇAĞRILMAZ (only modal/spotlight triggers)', () => {
    const drop1Close = vi.fn();
    registerLayer('drop-1', 'dropdown', { autoCloseOnHigherLayer: drop1Close });
    registerLayer('drop-2', 'dropdown');
    expect(drop1Close).not.toHaveBeenCalled();
  });

  it('6. spotlight register → underlying dropdown auto-close çağrılır (modal/spotlight parity)', () => {
    const dropClose = vi.fn();
    registerLayer('drop-1', 'dropdown', { autoCloseOnHigherLayer: dropClose });
    registerLayer('spot-1', 'spotlight');
    expect(dropClose).toHaveBeenCalledTimes(1);
  });

  it('7. snapshot iteration: callback unregister çağırırsa diğer callback’ler etkilenmez', () => {
    const drop1Close = vi.fn(() => {
      // Synchronously unregister another underlying entry mid-iteration.
      unregisterLayer('drop-2');
    });
    const drop2Close = vi.fn();
    registerLayer('drop-1', 'dropdown', { autoCloseOnHigherLayer: drop1Close });
    registerLayer('drop-2', 'dropdown', { autoCloseOnHigherLayer: drop2Close });

    registerLayer('modal-1', 'modal');

    // Both callbacks fire — snapshot taken before iteration; drop-2's
    // unregister inside drop-1's callback does not skip drop-2.
    expect(drop1Close).toHaveBeenCalledTimes(1);
    expect(drop2Close).toHaveBeenCalledTimes(1);
  });

  it('8. resilience: callback throw → diğer callback’ler yine çağrılır', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const dropFailing = vi.fn(() => {
      throw new Error('consumer bug');
    });
    const dropOk = vi.fn();
    registerLayer('drop-fail', 'dropdown', { autoCloseOnHigherLayer: dropFailing });
    registerLayer('drop-ok', 'dropdown', { autoCloseOnHigherLayer: dropOk });

    registerLayer('modal-1', 'modal');

    expect(dropFailing).toHaveBeenCalledTimes(1);
    expect(dropOk).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it('9. restore transfer chain: A button → dropdown → modal → modal restore target == A', () => {
    const aButton = document.createElement('button');
    aButton.id = 'a';
    document.body.appendChild(aButton);

    // Dropdown opens with `aButton` as its restore target.
    registerLayer('drop-1', 'dropdown', { restoreTarget: aButton });

    // Modal opens WITHOUT explicit restoreTarget; should inherit drop-1's.
    registerLayer('modal-1', 'modal');

    expect(getRestoreTarget('modal-1')).toBe(aButton);
  });

  it('10. restore transfer idempotent: explicit modal restoreTarget NOT overridden', () => {
    const aButton = document.createElement('button');
    const explicitModalRoot = document.createElement('div');
    document.body.append(aButton, explicitModalRoot);

    registerLayer('drop-1', 'dropdown', { restoreTarget: aButton });
    registerLayer('modal-1', 'modal', { restoreTarget: explicitModalRoot });

    // Modal kept its own target; did NOT inherit drop-1's aButton.
    expect(getRestoreTarget('modal-1')).toBe(explicitModalRoot);
  });

  it('11. same-id re-register: previous entry’s autoCloseOnHigherLayer NOT invoked', () => {
    const oldClose = vi.fn();
    const newClose = vi.fn();
    registerLayer('drop-1', 'dropdown', { autoCloseOnHigherLayer: oldClose });

    // Re-register same id (new callback)
    registerLayer('drop-1', 'dropdown', { autoCloseOnHigherLayer: newClose });

    // Re-register itself MUST NOT invoke the old callback (the entry
    // simply got dropped; close was caller's responsibility).
    expect(oldClose).not.toHaveBeenCalled();

    // Now a modal registers — only the latest callback (newClose) fires.
    registerLayer('modal-1', 'modal');
    expect(newClose).toHaveBeenCalledTimes(1);
    expect(oldClose).not.toHaveBeenCalled();
  });

  it('12. restore transfer: oldest underlying entry wins (deterministic chain)', () => {
    const aButton = document.createElement('button');
    const bButton = document.createElement('button');
    document.body.append(aButton, bButton);

    // Two underlying dropdowns; drop-A registers first → "oldest".
    registerLayer('drop-A', 'dropdown', { restoreTarget: aButton });
    registerLayer('drop-B', 'dropdown', { restoreTarget: bButton });

    registerLayer('modal-1', 'modal');

    // Modal inherits the OLDEST entry's restoreTarget (registration
    // order = stack push order); deterministic semantics for
    // multi-layer opener chains.
    expect(getRestoreTarget('modal-1')).toBe(aButton);
  });

  it('13. unknown layer id → getRestoreTarget returns null', () => {
    expect(getRestoreTarget('does-not-exist')).toBeNull();
  });

  it('14. unregisterLayer removes the layer cleanly (no auto-close fired)', () => {
    const dropClose = vi.fn();
    registerLayer('drop-1', 'dropdown', { autoCloseOnHigherLayer: dropClose });
    unregisterLayer('drop-1');

    // Now register a modal — drop-1 already gone, callback NOT fired.
    registerLayer('modal-1', 'modal');
    expect(dropClose).not.toHaveBeenCalled();
  });
});
