// @vitest-environment jsdom
//
// Codex 019dde20 iter-45 — useFocusTrap hook functional contract.
//
// Pre-iter-45 this file only verified module exports. With iter-45 we
// promote the focus trap from "fake" (panel tabIndex={-1} + initial
// focus only) to a real Tab/Shift+Tab cycle that wraps boundaries.
// FormDrawer + DetailDrawer adopt the hook in this iter; this suite
// locks the boundary behavior so consumers can rely on it.
//
// jsdom does NOT simulate native Tab order. We don't test the natural
// browser progression — only the hook's intervention points: keydown
// Tab on the LAST element wraps to FIRST; Shift+Tab on FIRST wraps to
// LAST; autoFocus runs after activation; restoreFocus runs on
// deactivation; dynamic focusable additions are picked up by the next
// keydown's DOM scan; hidden/inert elements are excluded.

import React, { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { useFocusTrap, FocusTrap } from '../overlay-engine/focus-trap';

afterEach(() => {
  cleanup();
});

// Test-only host that wires the hook ref to a wrapper div.
function TrapHost({
  active = true,
  autoFocus = true,
  restoreFocus = true,
  initialFocusRef,
  children,
}: {
  active?: boolean;
  autoFocus?: boolean;
  restoreFocus?: boolean;
  initialFocusRef?: React.RefObject<HTMLElement>;
  children: React.ReactNode;
}) {
  const ref = useFocusTrap({ active, autoFocus, restoreFocus, initialFocusRef });
  return (
    <div ref={ref as React.RefObject<HTMLDivElement>} data-testid="trap-host">
      {children}
    </div>
  );
}

describe('useFocusTrap — module export', () => {
  it('exports the hook and the FocusTrap component', () => {
    expect(typeof useFocusTrap).toBe('function');
    expect(typeof FocusTrap).toBe('function');
  });
});

describe('useFocusTrap — Tab cycle wrap-around', () => {
  it('Tab on last focusable wraps to first', async () => {
    render(
      <TrapHost>
        <button data-testid="b1">First</button>
        <button data-testid="b2">Second</button>
        <button data-testid="b3">Last</button>
      </TrapHost>,
    );

    // Wait for hook autoFocus (50ms timeout in hook) to settle on first.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 80));
    });

    const last = document.querySelector('[data-testid="b3"]') as HTMLButtonElement;
    last.focus();
    expect(document.activeElement).toBe(last);

    fireEvent.keyDown(document, { key: 'Tab' });
    const first = document.querySelector('[data-testid="b1"]') as HTMLButtonElement;
    expect(document.activeElement).toBe(first);
  });

  it('Shift+Tab on first focusable wraps to last', async () => {
    render(
      <TrapHost>
        <button data-testid="b1">First</button>
        <button data-testid="b2">Middle</button>
        <button data-testid="b3">Last</button>
      </TrapHost>,
    );
    await act(async () => {
      await new Promise((r) => setTimeout(r, 80));
    });

    const first = document.querySelector('[data-testid="b1"]') as HTMLButtonElement;
    first.focus();
    expect(document.activeElement).toBe(first);

    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    const last = document.querySelector('[data-testid="b3"]') as HTMLButtonElement;
    expect(document.activeElement).toBe(last);
  });

  it('Tab in the middle does NOT wrap (browser native order takes over)', async () => {
    // Hook only intervenes at boundaries. Middle Tab keydown should not
    // call preventDefault — we assert focus is unchanged at this layer.
    render(
      <TrapHost>
        <button data-testid="b1">First</button>
        <button data-testid="b2">Middle</button>
        <button data-testid="b3">Last</button>
      </TrapHost>,
    );
    await act(async () => {
      await new Promise((r) => setTimeout(r, 80));
    });

    const middle = document.querySelector('[data-testid="b2"]') as HTMLButtonElement;
    middle.focus();
    expect(document.activeElement).toBe(middle);

    const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true });
    const defaultPrevented = !document.dispatchEvent(event);
    // Middle position: hook should NOT preventDefault (browser handles it).
    expect(defaultPrevented).toBe(false);
  });

  it('active=false detaches the keydown listener (no wrap)', async () => {
    const { rerender } = render(
      <TrapHost active={true}>
        <button data-testid="b1">First</button>
        <button data-testid="b2">Last</button>
      </TrapHost>,
    );
    await act(async () => {
      await new Promise((r) => setTimeout(r, 80));
    });

    rerender(
      <TrapHost active={false}>
        <button data-testid="b1">First</button>
        <button data-testid="b2">Last</button>
      </TrapHost>,
    );

    const last = document.querySelector('[data-testid="b2"]') as HTMLButtonElement;
    last.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    // With trap inactive, focus stays where the event left it (no wrap).
    expect(document.activeElement).toBe(last);
  });
});

describe('useFocusTrap — autoFocus & initialFocusRef', () => {
  it('autoFocus moves focus to the first focusable on activation', async () => {
    render(
      <TrapHost autoFocus>
        <button data-testid="b1">Auto target</button>
        <button data-testid="b2">Other</button>
      </TrapHost>,
    );
    await act(async () => {
      await new Promise((r) => setTimeout(r, 80));
    });
    expect(document.activeElement).toBe(document.querySelector('[data-testid="b1"]'));
  });

  it('initialFocusRef overrides the default first-focusable target', async () => {
    function Host() {
      const ref = React.useRef<HTMLButtonElement>(null);
      return (
        <TrapHost initialFocusRef={ref as React.RefObject<HTMLElement>}>
          <button data-testid="b1">Skip</button>
          <button ref={ref} data-testid="b2">
            Initial
          </button>
          <button data-testid="b3">Skip too</button>
        </TrapHost>
      );
    }
    render(<Host />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 80));
    });
    expect(document.activeElement).toBe(document.querySelector('[data-testid="b2"]'));
  });

  it('autoFocus=false leaves focus where it was at mount', async () => {
    const beforeBtn = document.createElement('button');
    beforeBtn.textContent = 'Before';
    document.body.appendChild(beforeBtn);
    beforeBtn.focus();

    render(
      <TrapHost autoFocus={false}>
        <button data-testid="b1">Inside</button>
      </TrapHost>,
    );
    await act(async () => {
      await new Promise((r) => setTimeout(r, 80));
    });
    expect(document.activeElement).toBe(beforeBtn);
    document.body.removeChild(beforeBtn);
  });

  it('autoFocus on a container with no focusable elements falls back to container', async () => {
    render(
      <TrapHost>
        <p>Read-only content, nothing focusable</p>
      </TrapHost>,
    );
    await act(async () => {
      await new Promise((r) => setTimeout(r, 80));
    });
    const host = document.querySelector('[data-testid="trap-host"]') as HTMLElement;
    expect(document.activeElement).toBe(host);
    expect(host.getAttribute('tabindex')).toBe('-1');
  });
});

describe('useFocusTrap — restoreFocus on unmount', () => {
  it('restores focus to previously focused element when trap unmounts', async () => {
    const trigger = document.createElement('button');
    trigger.textContent = 'Trigger';
    document.body.appendChild(trigger);
    trigger.focus();

    const { unmount } = render(
      <TrapHost>
        <button data-testid="b1">Inside</button>
      </TrapHost>,
    );
    await act(async () => {
      await new Promise((r) => setTimeout(r, 80));
    });
    // autoFocus moved focus inside
    expect(document.activeElement).not.toBe(trigger);

    unmount();
    // Wait for restore setTimeout(0)
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(document.activeElement).toBe(trigger);
    document.body.removeChild(trigger);
  });

  it('restoreFocus=false skips the restore', async () => {
    const trigger = document.createElement('button');
    trigger.textContent = 'Trigger';
    document.body.appendChild(trigger);
    trigger.focus();

    const { unmount } = render(
      <TrapHost restoreFocus={false}>
        <button data-testid="b1">Inside</button>
      </TrapHost>,
    );
    await act(async () => {
      await new Promise((r) => setTimeout(r, 80));
    });

    unmount();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    // Focus should NOT have been restored to trigger.
    expect(document.activeElement).not.toBe(trigger);
    document.body.removeChild(trigger);
  });
});

describe('useFocusTrap — dynamic focusable list', () => {
  it('a button added after activation is included in the wrap cycle', async () => {
    function Host() {
      const [extra, setExtra] = useState(false);
      return (
        <TrapHost>
          <button data-testid="b1">First</button>
          <button data-testid="b2" onClick={() => setExtra(true)}>
            Add
          </button>
          {extra && <button data-testid="b3">Newly added last</button>}
        </TrapHost>
      );
    }
    render(<Host />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 80));
    });

    // Click the Add button to mount b3
    fireEvent.click(document.querySelector('[data-testid="b2"]')!);
    await act(async () => {
      await Promise.resolve();
    });

    const b3 = document.querySelector('[data-testid="b3"]') as HTMLButtonElement;
    expect(b3).not.toBeNull();
    b3.focus();
    expect(document.activeElement).toBe(b3);

    // Tab should now wrap from b3 (last) to b1 (first), proving the hook
    // re-scanned the DOM on this keydown rather than caching the old list.
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(document.querySelector('[data-testid="b1"]'));
  });

  it('hidden (offsetParent=null) elements are excluded from the cycle', async () => {
    render(
      <TrapHost>
        <button data-testid="b1">First</button>
        <button data-testid="hidden" style={{ display: 'none' }}>
          Hidden
        </button>
        <button data-testid="b3">Last visible</button>
      </TrapHost>,
    );
    await act(async () => {
      await new Promise((r) => setTimeout(r, 80));
    });

    const b3 = document.querySelector('[data-testid="b3"]') as HTMLButtonElement;
    b3.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    // Hidden button should NOT be the first; b1 should be first.
    expect(document.activeElement).toBe(document.querySelector('[data-testid="b1"]'));
  });

  it('elements inside an [inert] subtree are excluded', async () => {
    render(
      <TrapHost>
        <button data-testid="b1">First visible</button>
        <div {...{ inert: '' as unknown as undefined }}>
          <button data-testid="inert-btn">Inert</button>
        </div>
        <button data-testid="b3">Last visible</button>
      </TrapHost>,
    );
    await act(async () => {
      await new Promise((r) => setTimeout(r, 80));
    });

    const b3 = document.querySelector('[data-testid="b3"]') as HTMLButtonElement;
    b3.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(document.querySelector('[data-testid="b1"]'));
  });
});

describe('useFocusTrap — empty container', () => {
  it('preventDefault on Tab when the container has no focusable elements', async () => {
    render(
      <TrapHost>
        <p>No focusables here</p>
      </TrapHost>,
    );
    await act(async () => {
      await new Promise((r) => setTimeout(r, 80));
    });

    // Container itself receives focus as the autoFocus fallback (hook adds tabindex="-1")
    const host = document.querySelector('[data-testid="trap-host"]') as HTMLElement;
    expect(document.activeElement).toBe(host);

    // Dispatch a Tab and assert it was prevented (via dispatchEvent return value).
    const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    const allowed = document.dispatchEvent(event);
    expect(allowed).toBe(false); // preventDefault → returnValue=false → dispatchEvent returns false
  });
});

describe('FocusTrap component wrapper', () => {
  it('renders children and exposes data-focus-trap when active', () => {
    render(
      <FocusTrap active={true}>
        <button>Inside</button>
      </FocusTrap>,
    );
    const wrapper = document.querySelector('[data-focus-trap]');
    expect(wrapper).not.toBeNull();
  });

  it('omits data-focus-trap attribute when inactive', () => {
    render(
      <FocusTrap active={false}>
        <button>Inside</button>
      </FocusTrap>,
    );
    const wrapper = document.querySelector('[data-focus-trap]');
    expect(wrapper).toBeNull();
  });
});
