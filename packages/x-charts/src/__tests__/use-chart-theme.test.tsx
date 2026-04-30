// @vitest-environment jsdom
/**
 * Faz 21.5-B PR-B3b — useChartTheme + themeReactiveStore contract.
 *
 * Codex iter-3 AGREE matrix:
 *   - Priority: explicit prop > data-appearance > data-theme > data-mode >
 *               prefers-contrast: more > prefers-color-scheme: dark > default
 *   - Aliases:
 *       data-appearance: 'hc' → 'high-contrast' (canonical 'high-contrast')
 *       data-theme: 'serban-*' / '*-hc' / '*-dark' / '*-light' / 'serban-compact'
 *   - data-mode: only 'light' | 'dark' kabul (other values ignored)
 *   - Reactive: MutationObserver + matchMedia listeners drive re-renders
 *   - Decal 'auto': enabled iff resolved is 'high-contrast' or 'print'
 *   - 'print' theme NEVER auto-detected — only via explicit prop
 *   - SSR: getServerThemeSnapshot returns 'light' / source 'server'
 */
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, renderHook, act } from '@testing-library/react';

import { useChartTheme } from '../theme/useChartTheme';
import {
  __resetThemeStoreForTests,
  __getThemeSubscriberCountForTests,
  getThemeSnapshot,
  getServerThemeSnapshot,
  subscribeThemeStore,
} from '../theme/themeReactiveStore';

/* ---------------------------------------------------------------- */
/*  matchMedia mock                                                  */
/* ---------------------------------------------------------------- */

type MQEntry = {
  matches: boolean;
  listeners: Set<() => void>;
};

const mqRegistry = new Map<string, MQEntry>();

const installMatchMediaMock = () => {
  window.matchMedia = vi.fn().mockImplementation((query: string) => {
    if (!mqRegistry.has(query)) {
      mqRegistry.set(query, { matches: false, listeners: new Set() });
    }
    const entry = mqRegistry.get(query)!;
    return {
      get matches() {
        return entry.matches;
      },
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn((_event: string, cb: () => void) => entry.listeners.add(cb)),
      removeEventListener: vi.fn((_event: string, cb: () => void) => entry.listeners.delete(cb)),
      dispatchEvent: vi.fn(),
    } as unknown as MediaQueryList;
  }) as unknown as typeof window.matchMedia;
};

const setMatchMedia = (query: string, matches: boolean) => {
  if (!mqRegistry.has(query)) {
    mqRegistry.set(query, { matches, listeners: new Set() });
  }
  const entry = mqRegistry.get(query)!;
  entry.matches = matches;
  entry.listeners.forEach((cb) => cb());
};

const originalMatchMedia = window.matchMedia;

beforeEach(() => {
  document.documentElement.removeAttribute('data-appearance');
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.removeAttribute('data-mode');
  mqRegistry.clear();
  installMatchMediaMock();
  __resetThemeStoreForTests();
});

afterEach(() => {
  document.documentElement.removeAttribute('data-appearance');
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.removeAttribute('data-mode');
  mqRegistry.clear();
  __resetThemeStoreForTests();
  window.matchMedia = originalMatchMedia;
});

/* ---------------------------------------------------------------- */
/*  Snapshot priority chain                                          */
/* ---------------------------------------------------------------- */

describe('themeReactiveStore — priority chain', () => {
  it('default (no DOM signal, no media match) → light/default', () => {
    const snap = getThemeSnapshot();
    expect(snap.resolvedTheme).toBe('light');
    expect(snap.source).toBe('default');
  });

  it('data-appearance="high-contrast" wins (canonical)', () => {
    document.documentElement.setAttribute('data-appearance', 'high-contrast');
    __resetThemeStoreForTests();
    const snap = getThemeSnapshot();
    expect(snap.resolvedTheme).toBe('high-contrast');
    expect(snap.source).toBe('data-appearance');
  });

  it('data-appearance="hc" alias → high-contrast', () => {
    document.documentElement.setAttribute('data-appearance', 'hc');
    __resetThemeStoreForTests();
    expect(getThemeSnapshot().resolvedTheme).toBe('high-contrast');
  });

  it('data-appearance="dark" → dark', () => {
    document.documentElement.setAttribute('data-appearance', 'dark');
    __resetThemeStoreForTests();
    expect(getThemeSnapshot().resolvedTheme).toBe('dark');
  });

  it('data-appearance="light" → light', () => {
    document.documentElement.setAttribute('data-appearance', 'light');
    __resetThemeStoreForTests();
    const snap = getThemeSnapshot();
    expect(snap.resolvedTheme).toBe('light');
    expect(snap.source).toBe('data-appearance');
  });

  it('invalid data-appearance falls through to data-theme', () => {
    document.documentElement.setAttribute('data-appearance', 'turquoise');
    document.documentElement.setAttribute('data-theme', 'serban-dark');
    __resetThemeStoreForTests();
    const snap = getThemeSnapshot();
    expect(snap.resolvedTheme).toBe('dark');
    expect(snap.source).toBe('data-theme');
  });

  it('data-theme="serban-hc" → high-contrast', () => {
    document.documentElement.setAttribute('data-theme', 'serban-hc');
    __resetThemeStoreForTests();
    expect(getThemeSnapshot().resolvedTheme).toBe('high-contrast');
  });

  it('data-theme="serban-dark" → dark', () => {
    document.documentElement.setAttribute('data-theme', 'serban-dark');
    __resetThemeStoreForTests();
    expect(getThemeSnapshot().resolvedTheme).toBe('dark');
  });

  it('data-theme="serban-light" → light', () => {
    document.documentElement.setAttribute('data-theme', 'serban-light');
    __resetThemeStoreForTests();
    expect(getThemeSnapshot().resolvedTheme).toBe('light');
  });

  it('data-theme="serban-compact" → light', () => {
    document.documentElement.setAttribute('data-theme', 'serban-compact');
    __resetThemeStoreForTests();
    expect(getThemeSnapshot().resolvedTheme).toBe('light');
  });

  it('data-theme="custom-dark" suffix alias → dark', () => {
    document.documentElement.setAttribute('data-theme', 'tenant-x-dark');
    __resetThemeStoreForTests();
    expect(getThemeSnapshot().resolvedTheme).toBe('dark');
  });

  it('data-mode="dark" only → dark with source "data-mode"', () => {
    document.documentElement.setAttribute('data-mode', 'dark');
    __resetThemeStoreForTests();
    const snap = getThemeSnapshot();
    expect(snap.resolvedTheme).toBe('dark');
    expect(snap.source).toBe('data-mode');
  });

  it('data-mode="light" → light', () => {
    document.documentElement.setAttribute('data-mode', 'light');
    __resetThemeStoreForTests();
    expect(getThemeSnapshot().resolvedTheme).toBe('light');
  });

  it('data-mode="bogus" ignored — falls through to default', () => {
    document.documentElement.setAttribute('data-mode', 'bogus');
    __resetThemeStoreForTests();
    const snap = getThemeSnapshot();
    expect(snap.resolvedTheme).toBe('light');
    expect(snap.source).toBe('default');
  });

  it('prefers-contrast: more → high-contrast', () => {
    setMatchMedia('(prefers-contrast: more)', true);
    __resetThemeStoreForTests();
    const snap = getThemeSnapshot();
    expect(snap.resolvedTheme).toBe('high-contrast');
    expect(snap.source).toBe('prefers-contrast');
  });

  it('prefers-color-scheme: dark → dark (when no contrast preference)', () => {
    setMatchMedia('(prefers-contrast: more)', false);
    setMatchMedia('(prefers-color-scheme: dark)', true);
    __resetThemeStoreForTests();
    const snap = getThemeSnapshot();
    expect(snap.resolvedTheme).toBe('dark');
    expect(snap.source).toBe('prefers-color-scheme');
  });

  it('data-appearance overrides matching media query (priority order)', () => {
    setMatchMedia('(prefers-contrast: more)', true);
    setMatchMedia('(prefers-color-scheme: dark)', true);
    document.documentElement.setAttribute('data-appearance', 'light');
    __resetThemeStoreForTests();
    expect(getThemeSnapshot().resolvedTheme).toBe('light');
  });

  it('SSR snapshot returns light/server', () => {
    const ssr = getServerThemeSnapshot();
    expect(ssr.resolvedTheme).toBe('light');
    expect(ssr.source).toBe('server');
  });
});

/* ---------------------------------------------------------------- */
/*  Reactive subscription                                            */
/* ---------------------------------------------------------------- */

describe('themeReactiveStore — reactive subscription', () => {
  it('attribute change triggers subscriber notification', async () => {
    const notify = vi.fn();
    const unsub = subscribeThemeStore(notify);

    document.documentElement.setAttribute('data-appearance', 'high-contrast');

    // MutationObserver delivers asynchronously; await one microtask flush.
    await new Promise((r) => setTimeout(r, 0));

    expect(notify).toHaveBeenCalled();
    const snap = getThemeSnapshot();
    expect(snap.resolvedTheme).toBe('high-contrast');

    unsub();
  });

  it('matchMedia change event triggers re-broadcast', async () => {
    const notify = vi.fn();
    const unsub = subscribeThemeStore(notify);

    setMatchMedia('(prefers-contrast: more)', true);
    await new Promise((r) => setTimeout(r, 0));

    expect(notify).toHaveBeenCalled();
    expect(getThemeSnapshot().resolvedTheme).toBe('high-contrast');

    unsub();
  });

  it('subscriber count drops to 0 after unsubscribe (cleanup)', () => {
    expect(__getThemeSubscriberCountForTests()).toBe(0);
    const unsub1 = subscribeThemeStore(() => {});
    const unsub2 = subscribeThemeStore(() => {});
    expect(__getThemeSubscriberCountForTests()).toBe(2);
    unsub1();
    expect(__getThemeSubscriberCountForTests()).toBe(1);
    unsub2();
    expect(__getThemeSubscriberCountForTests()).toBe(0);
  });

  it('multiple subscribers share singleton (no throw on cycles)', () => {
    const sub1 = subscribeThemeStore(() => {});
    const sub2 = subscribeThemeStore(() => {});
    const sub3 = subscribeThemeStore(() => {});
    sub2();
    sub1();
    sub3();
    expect(__getThemeSubscriberCountForTests()).toBe(0);
  });
});

/* ---------------------------------------------------------------- */
/*  useChartTheme hook                                               */
/* ---------------------------------------------------------------- */

describe('useChartTheme — preference normalization', () => {
  it('default options → light + decal off (default state)', () => {
    const { result } = renderHook(() => useChartTheme());
    expect(result.current.resolvedTheme).toBe('light');
    expect(result.current.decalEnabled).toBe(false);
    expect(result.current.themeSource).toBe('default');
    expect(typeof result.current.themeObject).toBe('object');
    expect(result.current.decalPatterns.length).toBe(8);
  });

  it("theme='light' === theme='default' (alias)", () => {
    const { result: rLight } = renderHook(() => useChartTheme({ theme: 'light' }));
    const { result: rDefault } = renderHook(() => useChartTheme({ theme: 'default' }));
    expect(rLight.current.resolvedTheme).toBe('light');
    expect(rDefault.current.resolvedTheme).toBe('light');
    expect(rLight.current.themeSource).toBe('explicit');
    expect(rDefault.current.themeSource).toBe('explicit');
  });

  it("explicit theme='dark' wins even with data-appearance='light'", () => {
    document.documentElement.setAttribute('data-appearance', 'light');
    __resetThemeStoreForTests();
    const { result } = renderHook(() => useChartTheme({ theme: 'dark' }));
    expect(result.current.resolvedTheme).toBe('dark');
    expect(result.current.themeSource).toBe('explicit');
  });

  it("explicit theme='print' resolves to print + decal auto-on", () => {
    const { result } = renderHook(() => useChartTheme({ theme: 'print' }));
    expect(result.current.resolvedTheme).toBe('print');
    expect(result.current.decalEnabled).toBe(true);
  });

  it("theme='auto' with data-appearance='high-contrast' → high-contrast + decal on", () => {
    document.documentElement.setAttribute('data-appearance', 'high-contrast');
    __resetThemeStoreForTests();
    const { result } = renderHook(() => useChartTheme({ theme: 'auto' }));
    expect(result.current.resolvedTheme).toBe('high-contrast');
    expect(result.current.decalEnabled).toBe(true);
    expect(result.current.themeSource).toBe('data-appearance');
  });

  it('decal=true override forces enabled even on default theme', () => {
    const { result } = renderHook(() => useChartTheme({ theme: 'light', decal: true }));
    expect(result.current.decalEnabled).toBe(true);
  });

  it('decal=false override forces disabled even on print', () => {
    const { result } = renderHook(() => useChartTheme({ theme: 'print', decal: false }));
    expect(result.current.decalEnabled).toBe(false);
  });

  it('decal=auto on dark theme → false', () => {
    const { result } = renderHook(() => useChartTheme({ theme: 'dark' }));
    expect(result.current.resolvedTheme).toBe('dark');
    expect(result.current.decalEnabled).toBe(false);
  });

  it('themeObject reference is stable across re-renders for same resolved theme', () => {
    const { result, rerender } = renderHook(({ theme }) => useChartTheme({ theme }), {
      initialProps: { theme: 'dark' as const },
    });
    const first = result.current.themeObject;
    rerender({ theme: 'dark' });
    expect(result.current.themeObject).toBe(first);
  });

  it('themeObject changes when resolvedTheme changes', () => {
    const { result, rerender } = renderHook(
      ({ theme }: { theme: 'light' | 'dark' }) => useChartTheme({ theme }),
      { initialProps: { theme: 'light' } },
    );
    const lightTheme = result.current.themeObject;
    rerender({ theme: 'dark' });
    expect(result.current.themeObject).not.toBe(lightTheme);
  });
});

/* ---------------------------------------------------------------- */
/*  Reactivity through React component                               */
/* ---------------------------------------------------------------- */

const ThemeProbe: React.FC = () => {
  const t = useChartTheme();
  return (
    <div
      data-testid="probe"
      data-resolved={t.resolvedTheme}
      data-decal={t.decalEnabled ? 'on' : 'off'}
      data-source={t.themeSource}
    />
  );
};

describe('useChartTheme — reactive in component', () => {
  it('reflects data-appearance change without unmount', async () => {
    const { getByTestId } = render(<ThemeProbe />);
    expect(getByTestId('probe').getAttribute('data-resolved')).toBe('light');

    await act(async () => {
      document.documentElement.setAttribute('data-appearance', 'high-contrast');
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(getByTestId('probe').getAttribute('data-resolved')).toBe('high-contrast');
    expect(getByTestId('probe').getAttribute('data-decal')).toBe('on');
    expect(getByTestId('probe').getAttribute('data-source')).toBe('data-appearance');
  });

  it('reflects matchMedia change without unmount', async () => {
    const { getByTestId } = render(<ThemeProbe />);
    expect(getByTestId('probe').getAttribute('data-resolved')).toBe('light');

    await act(async () => {
      setMatchMedia('(prefers-color-scheme: dark)', true);
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(getByTestId('probe').getAttribute('data-resolved')).toBe('dark');
    expect(getByTestId('probe').getAttribute('data-source')).toBe('prefers-color-scheme');
  });
});
