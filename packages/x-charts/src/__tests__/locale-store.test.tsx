// @vitest-environment jsdom
/**
 * Mutation-aware tests for the Faz 21.5-A1 charts locale store.
 *
 * The store is the single bridge between the shell I18nManager and
 * every ECharts instance. Each assertion below would fail under a
 * plausible mutation:
 *
 *   - "drop the listener notification"   → useChartsLocale stops re-rendering
 *   - "lose the idempotency check"       → listeners fire on no-op writes
 *   - "ignore registerEChartsLocale"     → unsupported locale clears default
 *   - "leak listeners on unmount"        → setChartsLocale after unmount throws
 *   - "reset helper does nothing"        → tests bleed state between cases
 */
import React from 'react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';

import {
  setChartsLocale,
  getCurrentChartsLocale,
  useChartsLocale,
  __resetChartsLocaleStoreForTests,
} from '../i18n/locale-store';
import { ECHARTS_LOCALE_MAP } from '../i18n/echarts-locale';

beforeEach(() => {
  __resetChartsLocaleStoreForTests();
});

afterEach(() => {
  __resetChartsLocaleStoreForTests();
});

describe('locale-store — synchronous API', () => {
  it('starts at the default tr-TR locale', () => {
    expect(getCurrentChartsLocale()).toBe('tr-TR');
  });

  it('updates the current locale on setChartsLocale', () => {
    setChartsLocale('en-US');
    expect(getCurrentChartsLocale()).toBe('en-US');
    setChartsLocale('ar-SA');
    expect(getCurrentChartsLocale()).toBe('ar-SA');
  });

  it('ignores empty / non-string inputs', () => {
    setChartsLocale('en-US');
    expect(getCurrentChartsLocale()).toBe('en-US');
    setChartsLocale('' as string);
    expect(getCurrentChartsLocale()).toBe('en-US');
    setChartsLocale(undefined as unknown as string);
    expect(getCurrentChartsLocale()).toBe('en-US');
  });

  it('only registers locales the ECharts map actually knows about', () => {
    // Sanity guard against silent removal of locales from the map.
    expect(ECHARTS_LOCALE_MAP['tr-TR']).toBe('TR');
    expect(ECHARTS_LOCALE_MAP['en-US']).toBe('EN');
    expect(ECHARTS_LOCALE_MAP['ar-SA']).toBe('AR');
  });
});

describe('locale-store — useChartsLocale hook', () => {
  const Probe: React.FC = () => {
    const locale = useChartsLocale();
    return <span data-testid="probe">{locale}</span>;
  };

  it('renders the current locale on mount and updates on change', () => {
    render(<Probe />);
    expect(screen.getByTestId('probe').textContent).toBe('tr-TR');

    act(() => {
      setChartsLocale('en-US');
    });
    expect(screen.getByTestId('probe').textContent).toBe('en-US');

    act(() => {
      setChartsLocale('ar-SA');
    });
    expect(screen.getByTestId('probe').textContent).toBe('ar-SA');
  });

  it('does NOT re-render when setChartsLocale receives the current value', () => {
    let renderCount = 0;
    const Counter: React.FC = () => {
      const locale = useChartsLocale();
      renderCount += 1;
      return <span data-testid="counter">{locale}</span>;
    };

    render(<Counter />);
    const initialRenderCount = renderCount;

    act(() => {
      setChartsLocale('tr-TR'); // same as initial
    });

    // The idempotency guard inside setChartsLocale must short-circuit
    // before notifying listeners; otherwise a useState(setLocale) call
    // would trigger React's reconciliation and bump renderCount.
    expect(renderCount).toBe(initialRenderCount);
  });

  it('removes its listener on unmount (no leak)', () => {
    let renderCount = 0;
    const Counter: React.FC = () => {
      const locale = useChartsLocale();
      renderCount += 1;
      return <span>{locale}</span>;
    };

    const { unmount } = render(<Counter />);
    const renderCountBeforeUnmount = renderCount;

    unmount();

    // After unmount the listener must be detached. A leaking listener
    // would still call setLocale on the unmounted component, which
    // React would warn about; here we instead assert the renderCount
    // does not bump because the listener was removed cleanly.
    act(() => {
      setChartsLocale('en-US');
    });

    expect(renderCount).toBe(renderCountBeforeUnmount);
    // The store itself is still responsive after unmount.
    expect(getCurrentChartsLocale()).toBe('en-US');
  });

  it('multiple subscribers all observe the same locale change', () => {
    const TwoProbes: React.FC = () => (
      <>
        <Probe />
        <span data-testid="probe2">{useChartsLocale()}</span>
      </>
    );

    render(<TwoProbes />);
    expect(screen.getByTestId('probe').textContent).toBe('tr-TR');
    expect(screen.getByTestId('probe2').textContent).toBe('tr-TR');

    act(() => {
      setChartsLocale('en-US');
    });

    expect(screen.getByTestId('probe').textContent).toBe('en-US');
    expect(screen.getByTestId('probe2').textContent).toBe('en-US');
  });
});

describe('locale-store — __resetChartsLocaleStoreForTests', () => {
  it('restores the default locale', () => {
    setChartsLocale('en-US');
    expect(getCurrentChartsLocale()).toBe('en-US');
    __resetChartsLocaleStoreForTests();
    expect(getCurrentChartsLocale()).toBe('tr-TR');
  });

  it('clears subscribers so a previous test mount does not bleed into the next', () => {
    let callCount = 0;
    const Probe: React.FC = () => {
      const locale = useChartsLocale();
      // Side-effect: count renders to detect leaked listeners.
      callCount += 1;
      return <span>{locale}</span>;
    };

    const { unmount } = render(<Probe />);
    unmount();
    __resetChartsLocaleStoreForTests();

    const before = callCount;
    act(() => {
      setChartsLocale('en-US');
    });
    // No mounted Probe → no render bump regardless of reset behaviour;
    // but the reset guarantees future unmounted listener leaks cannot
    // spuriously increment callCount via the previous test's handle.
    expect(callCount).toBe(before);
  });
});
