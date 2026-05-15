/**
 * Enterprise Deprecation Guard — Phase 4.5
 *
 * `enterprise/index.ts` is a DEPRECATED compat surface. Phase 2/3/4 moved its
 * components to canonical homes (blocks/, components/, patterns/, utils/); this
 * barrel keeps `@mfe/design-system/enterprise` working during the Phase 5
 * deprecation window.
 *
 * Every moved symbol MUST use the "deprecated local alias" pattern:
 *
 *   import { X as XCanonical } from '<canonical>';
 *   // @deprecated ...
 *   export const X = XCanonical;
 *
 * This is the ONLY form that propagates the @deprecated tag to use-sites — a
 * plain `export { X } from '<canonical>'` re-export does NOT (verified against
 * TS 5.9.3 Language Service: `getQuickInfoAtPosition().tags` came back empty
 * for the re-export form, populated for the local-alias form).
 *
 * This guard fails if a re-export regresses to the silent `export { X } from`
 * form, or if a deprecated alias loses its @deprecated JSDoc tag.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
// This test intentionally exercises the deprecated compat surface.
import { RiskMatrix, formatValue } from '../index';

const SOURCE = readFileSync(join(__dirname, '..', 'index.ts'), 'utf-8');
const sf = ts.createSourceFile('enterprise/index.ts', SOURCE, ts.ScriptTarget.Latest, true);

/**
 * Re-export-from (`export … from '<spec>'`) statements may ONLY target these
 * genuine enterprise residents — components that were NOT moved and are not
 * deprecated. Any other module specifier means a moved symbol regressed to the
 * silent `export { X } from` (Pattern A) form.
 */
const ALLOWED_REEXPORT_FROM = new Set(['./FlowBuilder', './domain/turkey-isg/FineKinney']);

function hasDeprecatedTag(node: ts.Node): boolean {
  return ts.getJSDocTags(node).some((t) => t.tagName.escapedText === 'deprecated');
}

describe('enterprise/index.ts deprecation surface (Phase 4.5)', () => {
  it('every exported `const` is a @deprecated alias', () => {
    const offenders: string[] = [];
    let count = 0;
    sf.forEachChild((node) => {
      if (
        ts.isVariableStatement(node) &&
        node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
      ) {
        count += 1;
        if (!hasDeprecatedTag(node)) {
          offenders.push(node.declarationList.declarations[0]?.name.getText(sf) ?? '<unknown>');
        }
      }
    });
    expect(offenders, `exported const without @deprecated: ${offenders.join(', ')}`).toEqual([]);
    // 28 moved components + 4 format-helper functions.
    expect(count).toBeGreaterThanOrEqual(32);
  });

  it('every exported `type` alias is @deprecated', () => {
    const offenders: string[] = [];
    let count = 0;
    sf.forEachChild((node) => {
      if (
        ts.isTypeAliasDeclaration(node) &&
        node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
      ) {
        count += 1;
        if (!hasDeprecatedTag(node)) offenders.push(node.name.getText(sf));
      }
    });
    expect(offenders, `exported type without @deprecated: ${offenders.join(', ')}`).toEqual([]);
    expect(count).toBeGreaterThanOrEqual(29);
  });

  it('re-export-from statements only target genuine enterprise residents (no silent Pattern A)', () => {
    const badSpecs: string[] = [];
    sf.forEachChild((node) => {
      if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
        const spec = (node.moduleSpecifier as ts.StringLiteral).text;
        if (!ALLOWED_REEXPORT_FROM.has(spec)) badSpecs.push(spec);
      }
    });
    expect(
      badSpecs,
      `moved symbols must use the deprecated-alias pattern, not \`export { X } from\`: ${badSpecs.join(', ')}`,
    ).toEqual([]);
  });

  it('deprecated aliases preserve the runtime component/function reference', () => {
    expect(typeof RiskMatrix).toBe('function');
    expect(typeof formatValue).toBe('function');
  });
});
