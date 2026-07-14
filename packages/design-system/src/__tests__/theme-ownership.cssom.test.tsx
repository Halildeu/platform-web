import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { commands } from 'vitest/browser';

type EmulatedMediaOptions = {
  colorScheme: 'dark' | 'light' | 'no-preference' | null;
  forcedColors: 'active' | 'none' | null;
};

declare module 'vitest/browser' {
  interface BrowserCommands {
    emulateBadgeMedia: (options: EmulatedMediaOptions) => Promise<void>;
  }
}

type ThemeScope = 'root' | 'scoped';

type ThemeCase = {
  id: 'light' | 'dark' | 'system-dark' | 'high-contrast' | 'compact';
  theme: 'serban-light' | 'serban-dark' | 'serban-hc' | 'serban-compact';
  mode: 'light' | 'dark' | 'system';
  density: 'comfortable' | 'compact';
  colorScheme: 'light' | 'dark';
  expected: {
    actionPrimary: string;
    actionPrimaryText: string;
    successText: string;
    overlay: string;
    focus: string;
    densityRowHeight: string;
  };
};

const THEME_CASES: readonly ThemeCase[] = [
  {
    id: 'light',
    theme: 'serban-light',
    mode: 'light',
    density: 'comfortable',
    colorScheme: 'light',
    expected: {
      actionPrimary: 'oklch(56% 0.2 259.81deg)',
      actionPrimaryText: 'oklch(100% 0 0deg)',
      successText: 'oklch(55% 0.17 152deg)',
      overlay: 'oklch(20.77% 0.0398 265.75deg)',
      focus: 'oklch(54.61% 0.2152 262.88deg)',
      densityRowHeight: '44px',
    },
  },
  {
    id: 'dark',
    theme: 'serban-dark',
    mode: 'dark',
    density: 'comfortable',
    colorScheme: 'dark',
    expected: {
      actionPrimary: 'oklch(56% 0.2 259.81deg)',
      actionPrimaryText: 'oklch(100% 0 0deg)',
      successText: 'oklch(55% 0.17 152deg)',
      overlay: 'oklch(12.88% 0.0406 264.7deg)',
      focus: 'oklch(71.37% 0.1434 254.62deg)',
      densityRowHeight: '44px',
    },
  },
  {
    id: 'system-dark',
    theme: 'serban-light',
    mode: 'system',
    density: 'comfortable',
    colorScheme: 'dark',
    expected: {
      actionPrimary: 'oklch(62% 0.19 260deg)',
      actionPrimaryText: 'oklch(100% 0 0deg)',
      successText: 'oklch(78% 0.17 150deg)',
      overlay: 'oklch(10% 0.04 266deg)',
      focus: 'oklch(68% 0.19 263deg)',
      densityRowHeight: '44px',
    },
  },
  {
    id: 'high-contrast',
    theme: 'serban-hc',
    mode: 'dark',
    density: 'comfortable',
    colorScheme: 'dark',
    expected: {
      actionPrimary: 'oklch(88.68% 0.1822 95.33deg)',
      actionPrimaryText: 'oklch(0% 0 0deg)',
      successText: 'oklch(86.64% 0.2948 142.5deg)',
      overlay: 'oklch(12% 0 0deg)',
      focus: 'oklch(88.68% 0.1822 95.33deg)',
      densityRowHeight: '44px',
    },
  },
  {
    id: 'compact',
    theme: 'serban-compact',
    mode: 'light',
    density: 'compact',
    colorScheme: 'light',
    expected: {
      actionPrimary: 'oklch(56% 0.2 259.81deg)',
      actionPrimaryText: 'oklch(100% 0 0deg)',
      successText: 'oklch(55% 0.17 152deg)',
      overlay: 'oklch(20.77% 0.0398 265.75deg)',
      focus: 'oklch(54.61% 0.2152 262.88deg)',
      densityRowHeight: '36px',
    },
  },
];

const ACCEPTANCE_CASES = THEME_CASES.flatMap((themeCase) =>
  (['root', 'scoped'] as const).map((scope) => ({
    ...themeCase,
    label: `${themeCase.id}/${scope}`,
    scope,
  })),
);

const THEME_ATTRIBUTES = ['data-theme', 'data-mode', 'data-density', 'data-theme-scope'] as const;

function clearThemeAttributes(element: Element): void {
  for (const attribute of THEME_ATTRIBUTES) element.removeAttribute(attribute);
}

function applyThemeAttributes(element: Element, themeCase: ThemeCase): void {
  element.setAttribute('data-theme', themeCase.theme);
  element.setAttribute('data-mode', themeCase.mode);
  element.setAttribute('data-density', themeCase.density);
}

function createThemeContainer(themeCase: ThemeCase, scope: ThemeScope): HTMLElement {
  const root = document.documentElement;

  if (scope === 'root') {
    applyThemeAttributes(root, themeCase);
    return document.body;
  }

  // Keep the document root intentionally light so scoped dark/HC/system
  // assertions prove the [data-theme-scope] selectors rather than inheritance.
  applyThemeAttributes(root, THEME_CASES[0]);
  const container = document.createElement('section');
  container.setAttribute('data-theme-scope', '');
  applyThemeAttributes(container, themeCase);
  document.body.appendChild(container);
  return container;
}

function createModeOnlyDarkContainer(scope: ThemeScope): HTMLElement {
  const root = document.documentElement;
  if (scope === 'root') {
    root.setAttribute('data-mode', 'dark');
    root.setAttribute('data-density', 'comfortable');
    return document.body;
  }

  applyThemeAttributes(root, THEME_CASES[0]);
  const container = document.createElement('section');
  container.setAttribute('data-theme-scope', '');
  container.setAttribute('data-mode', 'dark');
  container.setAttribute('data-density', 'comfortable');
  document.body.appendChild(container);
  return container;
}

function resolveColor(container: HTMLElement, value: string): string {
  const probe = document.createElement('span');
  probe.style.color = value;
  container.appendChild(probe);
  try {
    return getComputedStyle(probe).color;
  } finally {
    probe.remove();
  }
}

function resolveBackground(container: HTMLElement, value: string, className?: string): string {
  const probe = document.createElement('span');
  probe.className = className ?? '';
  if (value) probe.style.backgroundColor = value;
  container.appendChild(probe);
  try {
    return getComputedStyle(probe).backgroundColor;
  } finally {
    probe.remove();
  }
}

function readCustomProperty(container: HTMLElement, property: string): string {
  return getComputedStyle(container).getPropertyValue(property).trim();
}

beforeEach(async () => {
  clearThemeAttributes(document.documentElement);
  await commands.emulateBadgeMedia({ colorScheme: 'light', forcedColors: 'none' });
});

afterEach(async () => {
  for (const element of document.querySelectorAll('[data-theme-scope]')) element.remove();
  clearThemeAttributes(document.documentElement);
  await commands.emulateBadgeMedia({ colorScheme: null, forcedColors: null });
});

describe('generated + curated theme ownership CSSOM contract', () => {
  it.each(ACCEPTANCE_CASES)(
    '$label preserves reviewed tokens and composes both ownership layers',
    async (acceptanceCase) => {
      await commands.emulateBadgeMedia({
        colorScheme: acceptanceCase.colorScheme,
        forcedColors: 'none',
      });
      const container = createThemeContainer(acceptanceCase, acceptanceCase.scope);

      expect(
        resolveColor(container, 'var(--action-primary-bg)'),
        `${acceptanceCase.label}/--action-primary-bg`,
      ).toBe(resolveColor(container, acceptanceCase.expected.actionPrimary));
      expect(
        resolveColor(container, 'var(--action-primary-text)'),
        `${acceptanceCase.label}/--action-primary-text`,
      ).toBe(resolveColor(container, acceptanceCase.expected.actionPrimaryText));
      expect(
        resolveColor(container, 'var(--state-success-text)'),
        `${acceptanceCase.label}/--state-success-text`,
      ).toBe(resolveColor(container, acceptanceCase.expected.successText));
      expect(
        resolveColor(container, 'var(--surface-overlay-bg)'),
        `${acceptanceCase.label}/--surface-overlay-bg`,
      ).toBe(resolveColor(container, acceptanceCase.expected.overlay));

      const focus = resolveColor(container, 'var(--focus-outline)');
      const ring = resolveColor(container, 'var(--ring-color)');
      expect(focus, `${acceptanceCase.label}/--focus-outline`).toBe(
        resolveColor(container, acceptanceCase.expected.focus),
      );
      expect(ring, `${acceptanceCase.label}/--ring-color resolves to --focus-outline`).toBe(focus);

      expect(
        readCustomProperty(container, '--density-row-height'),
        `${acceptanceCase.label}/density selector`,
      ).toBe(acceptanceCase.expected.densityRowHeight);

      const generatedVariable = resolveBackground(container, 'var(--surface-default-bg)');
      const generatedUtility = resolveBackground(container, '', 'bg-surface-default');
      expect(generatedVariable, `${acceptanceCase.label}/generated theme variable`).not.toBe(
        'rgba(0, 0, 0, 0)',
      );
      expect(generatedUtility, `${acceptanceCase.label}/generated @theme inline utility`).toBe(
        generatedVariable,
      );

      const curatedVariable = resolveBackground(container, 'var(--surface-card)');
      const curatedUtility = resolveBackground(container, '', 'bg-surface-card');
      expect(curatedVariable, `${acceptanceCase.label}/curated theme variable`).not.toBe(
        'rgba(0, 0, 0, 0)',
      );
      expect(curatedUtility, `${acceptanceCase.label}/curated @theme inline utility`).toBe(
        curatedVariable,
      );
    },
    20_000,
  );

  it.each(['root', 'scoped'] as const)(
    'mode-only dark/%s keeps the generated ring alias bound to the curated focus value',
    async (scope) => {
      await commands.emulateBadgeMedia({ colorScheme: 'dark', forcedColors: 'none' });
      const container = createModeOnlyDarkContainer(scope);
      const focus = resolveColor(container, 'var(--focus-outline)');
      const ring = resolveColor(container, 'var(--ring-color)');

      expect(focus, `mode-only-dark/${scope}/--focus-outline`).toBe(
        resolveColor(container, 'oklch(68% 0.19 263deg)'),
      );
      expect(ring, `mode-only-dark/${scope}/--ring-color resolves to --focus-outline`).toBe(focus);
    },
  );
});
