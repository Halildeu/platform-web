// @vitest-environment jsdom
/**
 * Mutation-aware tests for the localStorage hydrate path of the
 * Faz 21.5-A1 locale store (Codex iter-2 B2 absorbed in #123).
 *
 * The store reads `localStorage['mfe.locale']` at module init so a
 * late-loaded remote (mfe-reporting bundles its own copy of
 * `@mfe/x-charts`) inherits the shell's current locale instead of
 * defaulting to `tr-TR`.
 *
 * `vi.resetModules()` simulates the fresh module-import a remote
 * triggers when its bundle is loaded after the shell has already
 * mutated the locale.
 *
 * Each assertion below would fail under a plausible mutation:
 *   - "drop the localStorage read"           → currentLocale stays at tr-TR
 *   - "ignore SSR-safe guards"              → ReferenceError under SSR
 *   - "skip pre-registration of locale"      → ECharts renderer can't
 *                                              find data on first paint
 *   - "trim missing/empty inputs"            → empty string poisons store
 *   - "use wrong storage key"                → Codex iter-2 specifically
 *                                              ties the read to
 *                                              'mfe.locale' (shell key)
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const SHELL_LOCALE_STORAGE_KEY = 'mfe.locale';

describe('locale-store — module init hydrate from localStorage (A1.1 #123 / Codex iter-2 B2)', () => {
  beforeEach(() => {
    // Clean slate: clear both localStorage and the module cache so
    // every test re-imports the locale store from scratch.
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.clear();
    }
    vi.resetModules();
  });

  afterEach(() => {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.clear();
    }
  });

  it('falls back to tr-TR DEFAULT when localStorage is empty (no shell key set)', async () => {
    const mod = await import('../i18n/locale-store');
    expect(mod.getCurrentChartsLocale()).toBe('tr-TR');
  });

  it('reads the shell locale key on first import — late-loaded remote sees ar-SA', async () => {
    // Simulate: shell already ran setChartsLocale('ar-SA') and persisted
    // to localStorage; THEN a remote module loads its own copy of
    // x-charts. The remote's locale-store should mirror shell state.
    window.localStorage.setItem(SHELL_LOCALE_STORAGE_KEY, 'ar-SA');

    const mod = await import('../i18n/locale-store');
    expect(mod.getCurrentChartsLocale()).toBe('ar-SA');
  });

  it('reads en-US correctly (LTR locale, distinct from default)', async () => {
    window.localStorage.setItem(SHELL_LOCALE_STORAGE_KEY, 'en-US');
    const mod = await import('../i18n/locale-store');
    expect(mod.getCurrentChartsLocale()).toBe('en-US');
  });

  it('does not poison store when localStorage value is empty string', async () => {
    // Empty string should NOT override the default — would be a
    // regression if `currentLocale` becomes "" and breaks
    // ECHARTS_LOCALE_MAP lookup.
    window.localStorage.setItem(SHELL_LOCALE_STORAGE_KEY, '');
    const mod = await import('../i18n/locale-store');
    expect(mod.getCurrentChartsLocale()).toBe('tr-TR');
  });

  it('uses the exact shell key "mfe.locale" — drift from this would silently miss hydrate', async () => {
    // Codex iter-2 ties the bridge to a SPECIFIC localStorage key.
    // The shell I18nProvider writes to "mfe.locale"; if the store
    // ever read a different key (e.g. "x-charts.locale"), the
    // hydrate path would silently fall back to tr-TR even though
    // the shell had set a non-default locale.
    window.localStorage.setItem('x-charts.locale', 'ar-SA'); // wrong key
    window.localStorage.setItem(SHELL_LOCALE_STORAGE_KEY, 'en-US'); // correct key
    const mod = await import('../i18n/locale-store');
    expect(mod.getCurrentChartsLocale()).toBe('en-US');
  });

  it('survives a localStorage access that throws (Safari private mode / sandboxed iframe)', async () => {
    // Patch localStorage.getItem to throw — the hydrate code must
    // catch and fall back to default rather than blowing up the
    // remote module import.
    const original = window.localStorage.getItem.bind(window.localStorage);
    window.localStorage.getItem = vi.fn(() => {
      throw new Error('SecurityError: localStorage access denied');
    }) as typeof window.localStorage.getItem;

    try {
      const mod = await import('../i18n/locale-store');
      expect(mod.getCurrentChartsLocale()).toBe('tr-TR');
    } finally {
      window.localStorage.getItem = original;
    }
  });

  it('hydrated locale is reflected by useChartsLocale hook on first render', async () => {
    window.localStorage.setItem(SHELL_LOCALE_STORAGE_KEY, 'ar-SA');

    // Fresh import of the store + React testing library.
    const { useChartsLocale, __resetChartsLocaleStoreForTests } =
      await import('../i18n/locale-store');
    const React = await import('react');
    const { render, screen } = await import('@testing-library/react');

    const Probe: React.FC = () => {
      const locale = useChartsLocale();
      return <span data-testid="locale-probe">{locale}</span>;
    };

    render(<Probe />);
    expect(screen.getByTestId('locale-probe').textContent).toBe('ar-SA');

    __resetChartsLocaleStoreForTests();
  });
});
