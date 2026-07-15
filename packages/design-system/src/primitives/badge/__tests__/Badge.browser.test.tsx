import axeCore from 'axe-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { commands } from 'vitest/browser';
import { cleanup, render } from 'vitest-browser-react';
import { Badge } from '../Badge';
import type { BadgeSize, BadgeVariant } from '../Badge';

type EmulatedMediaOptions = {
  colorScheme: 'dark' | 'light' | 'no-preference' | null;
  forcedColors: 'active' | 'none' | null;
};

declare module 'vitest/browser' {
  interface BrowserCommands {
    emulateBadgeMedia: (options: EmulatedMediaOptions) => Promise<void>;
  }
}

type Rgba = readonly [red: number, green: number, blue: number, alpha: number];
type Surface = 'default' | 'raised' | 'muted' | 'panel';
type ThemeScope = 'root' | 'scoped';

type ThemeMode = {
  id: 'light' | 'dark' | 'high-contrast' | 'high-contrast-system' | 'compact' | 'system-dark';
  theme: 'serban-light' | 'serban-dark' | 'serban-hc' | 'serban-compact';
  dataMode: 'light' | 'dark' | 'system';
  colorScheme: 'light' | 'dark';
};

type AcceptanceCase = ThemeMode & {
  label: string;
  scope: ThemeScope;
};

const VARIANTS: readonly BadgeVariant[] = [
  'default',
  'primary',
  'success',
  'warning',
  'error',
  'danger',
  'info',
  'muted',
];

const SIZES: ReadonlyArray<{ size: BadgeSize; expectedPixels: 10 | 12 }> = [
  { size: 'sm', expectedPixels: 10 },
  { size: 'md', expectedPixels: 12 },
  { size: 'lg', expectedPixels: 12 },
];

const SURFACES: readonly Surface[] = ['default', 'raised', 'muted', 'panel'];

const THEME_MODES: readonly ThemeMode[] = [
  {
    id: 'light',
    theme: 'serban-light',
    dataMode: 'light',
    colorScheme: 'light',
  },
  {
    id: 'dark',
    theme: 'serban-dark',
    dataMode: 'dark',
    colorScheme: 'dark',
  },
  {
    id: 'high-contrast',
    theme: 'serban-hc',
    dataMode: 'dark',
    colorScheme: 'dark',
  },
  {
    id: 'high-contrast-system',
    theme: 'serban-hc',
    dataMode: 'system',
    colorScheme: 'dark',
  },
  {
    id: 'compact',
    theme: 'serban-compact',
    dataMode: 'light',
    colorScheme: 'light',
  },
  {
    id: 'system-dark',
    theme: 'serban-light',
    dataMode: 'system',
    colorScheme: 'dark',
  },
];

const ACCEPTANCE_CASES: readonly AcceptanceCase[] = THEME_MODES.flatMap((mode) =>
  (['root', 'scoped'] as const).map((scope) => ({
    ...mode,
    label: `${mode.id}/${scope}`,
    scope,
  })),
);

const OPAQUE_WHITE: Rgba = [255, 255, 255, 1];
let colorCanvas: HTMLCanvasElement | undefined;
let colorContext: CanvasRenderingContext2D | undefined;

function getColorContext(): CanvasRenderingContext2D {
  colorCanvas ??= Object.assign(document.createElement('canvas'), { width: 1, height: 1 });
  colorContext ??= colorCanvas.getContext('2d', { willReadFrequently: true }) ?? undefined;

  if (!colorContext) {
    throw new Error('Chromium Canvas 2D context is required for contrast acceptance');
  }

  return colorContext;
}

/** Resolve any Chromium-supported CSS Color value (including OKLCH) to sRGB. */
function resolveCssColor(value: string): Rgba {
  const context = getColorContext();
  context.clearRect(0, 0, 1, 1);
  context.fillStyle = 'rgba(0, 0, 0, 0)';
  context.fillStyle = value;
  context.fillRect(0, 0, 1, 1);
  const [red, green, blue, alpha] = context.getImageData(0, 0, 1, 1).data;
  return [red, green, blue, alpha / 255];
}

function composite(foreground: Rgba, background: Rgba): Rgba {
  const alpha = foreground[3] + background[3] * (1 - foreground[3]);
  if (alpha === 0) return [0, 0, 0, 0];

  return [
    (foreground[0] * foreground[3] + background[0] * background[3] * (1 - foreground[3])) / alpha,
    (foreground[1] * foreground[3] + background[1] * background[3] * (1 - foreground[3])) / alpha,
    (foreground[2] * foreground[3] + background[2] * background[3] * (1 - foreground[3])) / alpha,
    alpha,
  ];
}

function renderedBackground(element: HTMLElement, includeElement: boolean): Rgba {
  const layers: Rgba[] = [];
  let current: HTMLElement | null = includeElement ? element : element.parentElement;

  while (current) {
    layers.push(resolveCssColor(getComputedStyle(current).backgroundColor));
    current = current.parentElement;
  }

  return layers.reverse().reduce((background, layer) => composite(layer, background), OPAQUE_WHITE);
}

function relativeLuminance(color: Rgba): number {
  const [red, green, blue] = color.slice(0, 3).map((channel) => {
    const srgb = channel / 255;
    return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  });

  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(first: Rgba, second: Rgba): number {
  const firstLuminance = relativeLuminance(first);
  const secondLuminance = relativeLuminance(second);
  const lighter = Math.max(firstLuminance, secondLuminance);
  const darker = Math.min(firstLuminance, secondLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

function textContrast(element: HTMLElement): number {
  const background = renderedBackground(element, true);
  const foreground = composite(resolveCssColor(getComputedStyle(element).color), background);
  return contrastRatio(foreground, background);
}

function dotContrast(element: HTMLElement): number {
  const background = renderedBackground(element, false);
  const dot = composite(resolveCssColor(getComputedStyle(element).backgroundColor), background);
  return contrastRatio(dot, background);
}

function resetDocumentTheme(): void {
  const root = document.documentElement;
  for (const attribute of ['data-theme', 'data-mode', 'data-theme-scope']) {
    root.removeAttribute(attribute);
  }
}

function applyRootTheme(mode: ThemeMode, scope: ThemeScope): void {
  const root = document.documentElement;
  if (scope === 'root') {
    root.setAttribute('data-theme', mode.theme);
    root.setAttribute('data-mode', mode.dataMode);
    return;
  }

  // A light root makes the nested selector boundary observable for dark and
  // high-contrast cases instead of accidentally inheriting a matching root.
  root.setAttribute('data-theme', 'serban-light');
  root.setAttribute('data-mode', 'light');
}

function Matrix({ mode, scope }: { mode: ThemeMode; scope: ThemeScope }) {
  const scopedAttributes =
    scope === 'scoped'
      ? {
          'data-theme-scope': '',
          'data-theme': mode.theme,
          'data-mode': mode.dataMode,
        }
      : {};

  return (
    <main data-testid="badge-acceptance-root" {...scopedAttributes}>
      {SURFACES.map((surface) => (
        <section
          key={surface}
          data-surface={surface}
          style={{
            backgroundColor: `var(--surface-${surface}-bg)`,
            display: 'grid',
            gap: 8,
            padding: 16,
          }}
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {VARIANTS.flatMap((variant) =>
              SIZES.map(({ size }) => (
                <Badge
                  key={`${variant}-${size}`}
                  data-kind="text"
                  data-size={size}
                  data-surface={surface}
                  data-variant={variant}
                  size={size}
                  variant={variant}
                >
                  {variant} {size}
                </Badge>
              )),
            )}
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            {VARIANTS.map((variant) => (
              <Badge
                key={variant}
                aria-label={`${variant} status`}
                data-kind="dot"
                data-surface={surface}
                data-variant={variant}
                dot
                role="img"
                variant={variant}
              />
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}

function describeAxeFailures(results: axeCore.AxeResults): string {
  return [...results.violations, ...results.incomplete]
    .filter((result) => result.id === 'color-contrast')
    .flatMap((result) =>
      result.nodes.map(
        (node) =>
          `${result.impact ?? 'unknown'}: ${node.target.join(' ')} — ${node.failureSummary ?? ''}`,
      ),
    )
    .join('\n');
}

beforeEach(async () => {
  await cleanup();
  resetDocumentTheme();
  await commands.emulateBadgeMedia({ colorScheme: 'light', forcedColors: 'none' });
});

afterEach(async () => {
  await cleanup();
  resetDocumentTheme();
  await commands.emulateBadgeMedia({ colorScheme: null, forcedColors: null });
});

describe('Badge real-Chromium contrast acceptance', () => {
  it.each(ACCEPTANCE_CASES)(
    '$label satisfies WCAG AA across semantic variants, sizes, and surfaces',
    async (acceptanceCase) => {
      await commands.emulateBadgeMedia({
        colorScheme: acceptanceCase.colorScheme,
        forcedColors: 'none',
      });
      applyRootTheme(acceptanceCase, acceptanceCase.scope);

      const screen = await render(<Matrix mode={acceptanceCase} scope={acceptanceCase.scope} />);
      const root = screen.getByTestId('badge-acceptance-root').element() as HTMLElement;

      if (acceptanceCase.id === 'system-dark') {
        expect(window.matchMedia('(prefers-color-scheme: dark)').matches).toBe(true);
        const scopedSurface = getComputedStyle(root)
          .getPropertyValue('--surface-default-bg')
          .trim();
        expect(scopedSurface).not.toBe('');
        if (acceptanceCase.scope === 'scoped') {
          const lightRootSurface = getComputedStyle(document.documentElement)
            .getPropertyValue('--surface-default-bg')
            .trim();
          expect(scopedSurface).not.toBe(lightRootSurface);
        }
      }

      if (acceptanceCase.id === 'high-contrast-system') {
        const explicitHighContrast = document.createElement('div');
        explicitHighContrast.setAttribute('data-theme-scope', '');
        explicitHighContrast.setAttribute('data-theme', 'serban-hc');
        explicitHighContrast.setAttribute('data-mode', 'dark');
        document.body.appendChild(explicitHighContrast);

        const systemStyle = getComputedStyle(root);
        const explicitStyle = getComputedStyle(explicitHighContrast);
        for (const tokenName of [
          '--surface-default-bg',
          '--state-success-bg',
          '--component-badge-foreground-default',
          '--component-badge-dot-success',
        ]) {
          const systemValue = systemStyle.getPropertyValue(tokenName).trim();
          const explicitValue = explicitStyle.getPropertyValue(tokenName).trim();
          expect(systemValue, `${acceptanceCase.label}/${tokenName} resolves`).not.toBe('');
          expect(systemValue, `${acceptanceCase.label}/${tokenName} preserves HC precedence`).toBe(
            explicitValue,
          );
        }

        explicitHighContrast.remove();
      }

      const textBadges = Array.from(root.querySelectorAll<HTMLElement>('[data-kind="text"]'));
      const dotBadges = Array.from(root.querySelectorAll<HTMLElement>('[data-kind="dot"]'));

      expect(textBadges).toHaveLength(SURFACES.length * VARIANTS.length * SIZES.length);
      expect(dotBadges).toHaveLength(SURFACES.length * VARIANTS.length);

      for (const badge of textBadges) {
        const size = badge.dataset.size as BadgeSize;
        const expectedPixels = SIZES.find((candidate) => candidate.size === size)?.expectedPixels;
        const label = `${acceptanceCase.label}/${badge.dataset.surface}/${badge.dataset.variant}/${size}`;
        const computedStyle = getComputedStyle(badge);
        expect(Number.parseFloat(getComputedStyle(badge).fontSize), `${label} font size`).toBe(
          expectedPixels,
        );
        expect(
          textContrast(badge),
          [
            `${label} text contrast`,
            `prefers-dark=${window.matchMedia('(prefers-color-scheme: dark)').matches}`,
            `token=${computedStyle.getPropertyValue('--component-badge-foreground-default').trim()}`,
            `surface-muted=${computedStyle.getPropertyValue('--surface-muted-bg').trim()}`,
            `tailwind-surface-muted=${computedStyle.getPropertyValue('--color-surface-muted').trim()}`,
            `color=${computedStyle.color}`,
            `background=${computedStyle.backgroundColor}`,
          ].join('; '),
        ).toBeGreaterThanOrEqual(4.5);
      }

      for (const badge of dotBadges) {
        const label = `${acceptanceCase.label}/${badge.dataset.surface}/${badge.dataset.variant}`;
        expect(dotContrast(badge), `${label} dot contrast`).toBeGreaterThanOrEqual(3);
      }

      for (const surface of SURFACES) {
        for (const { size } of SIZES) {
          const error = root.querySelector<HTMLElement>(
            `[data-kind="text"][data-surface="${surface}"][data-size="${size}"][data-variant="error"]`,
          );
          const danger = root.querySelector<HTMLElement>(
            `[data-kind="text"][data-surface="${surface}"][data-size="${size}"][data-variant="danger"]`,
          );
          expect(error).not.toBeNull();
          expect(danger).not.toBeNull();
          expect(getComputedStyle(error!).color).not.toBe('');
          expect(getComputedStyle(error!).backgroundColor).not.toBe('');
          expect(getComputedStyle(error!).color).toBe(getComputedStyle(danger!).color);
          expect(getComputedStyle(error!).backgroundColor).toBe(
            getComputedStyle(danger!).backgroundColor,
          );
        }

        const errorDot = root.querySelector<HTMLElement>(
          `[data-kind="dot"][data-surface="${surface}"][data-variant="error"]`,
        );
        const dangerDot = root.querySelector<HTMLElement>(
          `[data-kind="dot"][data-surface="${surface}"][data-variant="danger"]`,
        );
        expect(errorDot).not.toBeNull();
        expect(dangerDot).not.toBeNull();
        expect(getComputedStyle(errorDot!).backgroundColor).not.toBe('');
        expect(getComputedStyle(errorDot!).backgroundColor).toBe(
          getComputedStyle(dangerDot!).backgroundColor,
        );
      }

      const axeResults = await axeCore.run(root, {
        runOnly: { type: 'rule', values: ['color-contrast'] },
      });
      const contrastViolations = axeResults.violations.filter(
        (result) => result.id === 'color-contrast',
      );
      const contrastIncomplete = axeResults.incomplete.filter(
        (result) => result.id === 'color-contrast',
      );
      const contrastPasses = axeResults.passes.find((result) => result.id === 'color-contrast');
      const failureDetails = describeAxeFailures(axeResults);

      expect(contrastViolations, failureDetails).toHaveLength(0);
      expect(contrastIncomplete, failureDetails).toHaveLength(0);
      expect(
        contrastPasses?.nodes.length ?? 0,
        'Axe must evaluate, not suppress, color-contrast',
      ).toBeGreaterThan(0);
    },
    20_000,
  );

  it('keeps every semantic variant renderable under OS forced-colors mode', async () => {
    await commands.emulateBadgeMedia({ colorScheme: 'light', forcedColors: 'active' });
    expect(window.matchMedia('(forced-colors: active)').matches).toBe(true);

    const forcedColorsMode = THEME_MODES[0];
    applyRootTheme(forcedColorsMode, 'root');
    const screen = await render(<Matrix mode={forcedColorsMode} scope="root" />);
    const root = screen.getByTestId('badge-acceptance-root').element() as HTMLElement;

    for (const variant of VARIANTS) {
      const textBadges = Array.from(
        root.querySelectorAll<HTMLElement>(`[data-kind="text"][data-variant="${variant}"]`),
      );
      const dotBadges = Array.from(
        root.querySelectorAll<HTMLElement>(`[data-kind="dot"][data-variant="${variant}"]`),
      );
      expect(textBadges).toHaveLength(SURFACES.length * SIZES.length);
      expect(dotBadges).toHaveLength(SURFACES.length);

      for (const text of textBadges) {
        expect(text.getBoundingClientRect().width).toBeGreaterThan(0);
        expect(text.textContent).toContain(variant);
        expect(textContrast(text), `${variant} forced-colors text contrast`).toBeGreaterThanOrEqual(
          4.5,
        );
      }
      for (const dot of dotBadges) {
        expect(dot.getBoundingClientRect().width).toBeGreaterThan(0);
        expect(dot.getAttribute('role')).toBe('img');
        expect(dot.getAttribute('aria-label')).toBe(`${variant} status`);
        expect(dot.getAttribute('data-component')).toBe('badge');
        expect(dot.getAttribute('data-badge-dot')).toBe('');
        expect(dotContrast(dot), `${variant} forced-colors dot contrast`).toBeGreaterThanOrEqual(3);
      }
    }
  });
});
