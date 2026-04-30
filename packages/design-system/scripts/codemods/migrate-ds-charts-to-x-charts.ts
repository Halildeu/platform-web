/**
 * Codemod — `migrate-ds-charts-to-x-charts`
 *
 * Faz 21.6 PR-C1: rewrite consumer chart imports from
 * `@mfe/design-system` to the canonical `@mfe/x-charts`.
 *
 * Scope (named imports only — see Codex iter-3 review):
 *   - BarChart, LineChart, AreaChart, PieChart
 *
 * Behaviors:
 *   - `import { BarChart } from "@mfe/design-system"`
 *       -> `import { BarChart } from "@mfe/x-charts"`
 *   - `import { Card, BarChart } from "@mfe/design-system"`
 *       -> two import declarations: Card stays in @mfe/design-system,
 *          BarChart moves to @mfe/x-charts
 *   - `import { LineChart, PieChart } from "@mfe/design-system"`
 *       -> single combined import from @mfe/x-charts
 *   - `import { BarChart as DSBarChart, Card } from "@mfe/design-system"`
 *       -> Card stays, aliased BarChart moves with the alias preserved
 *   - `import type { CardProps } from "@mfe/design-system"` left alone
 *   - non-chart imports left alone
 *
 * Usage:
 *   pnpm dlx jscodeshift \
 *     -t packages/design-system/scripts/codemods/migrate-ds-charts-to-x-charts.ts \
 *     --extensions=ts,tsx,js,jsx \
 *     apps/mfe-shell/src/pages/home/widgets/
 */

import type { API, FileInfo, ImportDeclaration, ImportSpecifier, Options } from 'jscodeshift';

const DS_SOURCE = '@mfe/design-system';
const X_CHARTS_SOURCE = '@mfe/x-charts';
const CHART_NAMES = new Set(['BarChart', 'LineChart', 'AreaChart', 'PieChart']);

function isChartSpecifier(spec: ImportDeclaration['specifiers'][number]): spec is ImportSpecifier {
  return (
    spec.type === 'ImportSpecifier' &&
    spec.imported.type === 'Identifier' &&
    CHART_NAMES.has(spec.imported.name)
  );
}

const transform = (file: FileInfo, api: API, _options: Options): string | null => {
  const j = api.jscodeshift;
  const root = j(file.source);
  let mutated = false;

  root
    .find(j.ImportDeclaration, {
      source: { value: DS_SOURCE },
    })
    .forEach((path) => {
      const node = path.node;
      // Skip pure type-only imports (`import type { X } from "..."`)
      if (node.importKind === 'type') return;
      const specifiers = node.specifiers ?? [];
      const chartSpecs = specifiers.filter(isChartSpecifier);
      if (chartSpecs.length === 0) return;

      const otherSpecs = specifiers.filter((s) => !chartSpecs.includes(s));

      if (otherSpecs.length === 0) {
        // All specifiers are chart specifiers — just rewrite the source
        node.source = j.literal(X_CHARTS_SOURCE);
      } else {
        // Split: keep non-chart specifiers in DS import, add new x-charts import
        node.specifiers = otherSpecs;
        const newImport = j.importDeclaration(chartSpecs, j.literal(X_CHARTS_SOURCE));
        path.insertAfter(newImport);
      }
      mutated = true;
    });

  return mutated ? root.toSource({ quote: 'single' }) : null;
};

export default transform;
export const parser = 'tsx';
