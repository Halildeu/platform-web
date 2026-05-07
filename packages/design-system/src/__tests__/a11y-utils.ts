import axeCore from 'axe-core';
import { expect } from 'vitest';

export interface A11yOptions {
  /**
   * Extra axe rule IDs to disable for this assertion only. Useful when
   * a pattern composes children that emit heading levels out of order
   * for the test fixture but render correctly inside a real page
   * (e.g. DetailSummary's PageHeader → EntitySummaryBlock cascade).
   * The defaults `color-contrast` + `region` always remain disabled
   * because they don't fire usefully in jsdom.
   */
  disableRules?: ReadonlyArray<string>;
}

/**
 * Runs axe-core accessibility audit on a container element.
 * Reports violations as test failures with helpful descriptions.
 *
 * @example
 * ```tsx
 * it('has no a11y violations', async () => {
 *   const { container } = render(<Button>Click</Button>);
 *   await expectNoA11yViolations(container);
 * });
 * ```
 */
export async function expectNoA11yViolations(
  container: HTMLElement,
  options: A11yOptions = {},
): Promise<void> {
  const baseRules: Record<string, { enabled: boolean }> = {
    // Relax rules that are too strict for unit test context
    'color-contrast': { enabled: false }, // CSS variables not resolved in jsdom
    region: { enabled: false }, // No landmark regions in unit tests
  };
  for (const ruleId of options.disableRules ?? []) {
    baseRules[ruleId] = { enabled: false };
  }
  const results = await axeCore.run(container, { rules: baseRules });

  if (results.violations.length > 0) {
    const violationMessages = results.violations
      .map((violation) => {
        const nodes = violation.nodes
          .map((node) => `  - ${node.html}\n    ${node.failureSummary}`)
          .join('\n');
        return `[${violation.impact}] ${violation.id}: ${violation.description}\n${nodes}`;
      })
      .join('\n\n');

    expect.fail(
      `axe-core found ${results.violations.length} accessibility violation(s):\n\n${violationMessages}`,
    );
  }
}
