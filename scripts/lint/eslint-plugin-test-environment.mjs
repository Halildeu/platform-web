/**
 * ESLint rule: test-environment/no-cssom-in-jsdom-tests
 *
 * Enforces the L1 boundary contract from ADR-test-environment-strategy.
 *
 * Files matching `*.unit.test.{ts,tsx}`, `*.contract.test.{ts,tsx}`, or
 * legacy `*.test.{ts,tsx}` (without a more specific suffix) run in jsdom
 * and may not assert against resolved CSS. Resolved-style assertions in
 * jsdom either pass on empty strings or rely on mocks that produce false
 * confidence.
 *
 * Banned in jsdom unit tests:
 *   - `getComputedStyle(...)` / `window.getComputedStyle(...)`
 *   - `vi.spyOn(window, 'getComputedStyle')` / `jest.spyOn(...)`
 *   - `expect(...).toHaveStyle(...)`
 *   - imports from `cssom-harness`
 *
 * Forwarding rule for `*.cssom.test.{ts,tsx}`:
 *   - jsdom-only stubs (`HTMLCanvasElement.prototype.getContext` mocks,
 *     fake `matchMedia`, `Path2D` shims) are flagged because the Chromium
 *     browser provider supplies the real implementations.
 *
 * Severity is `warn` during PR-1 adoption (see ADR §"Migration policy").
 * Quarterly review may flip to `error`.
 */

const isJsdomUnitFile = (filename) => {
  if (!filename) return false;
  if (/\.cssom\.test\.[jt]sx?$/.test(filename)) return false;
  if (/\.visual\.test\.[jt]sx?$/.test(filename)) return false;
  if (/\.e2e\.test\.[jt]sx?$/.test(filename)) return false;
  return /\.(unit|contract)\.test\.[jt]sx?$/.test(filename) ||
         /\.test\.[jt]sx?$/.test(filename);
};

const isCssomFile = (filename) => {
  if (!filename) return false;
  return /\.cssom\.test\.[jt]sx?$/.test(filename);
};

const JSDOM_BANNED_IDENTIFIERS = new Set([
  'getComputedStyle',
]);

const JSDOM_BANNED_MEMBER_PROPS = new Set([
  'toHaveStyle',
]);

const JSDOM_BANNED_IMPORT_SOURCES = [
  /cssom-harness$/,
  /__tests__\/cssom-harness/,
];

const CSSOM_BANNED_MOCK_TARGETS = [
  // String literals in spyOn / mock arguments that signal jsdom-only stubs.
  'HTMLCanvasElement',
  'matchMedia',
  'Path2D',
];

const noCssomInJsdomTests = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Resolved-CSS assertions and CSSOM harness imports are not allowed in jsdom unit tests.',
    },
    messages: {
      noGetComputedStyle:
        'getComputedStyle() returns empty strings in jsdom. Move this assertion to a *.cssom.test file (Chromium browser provider).',
      noToHaveStyle:
        'toHaveStyle() relies on resolved style which jsdom does not compute. Move this assertion to a *.cssom.test file.',
      noCssomHarnessImport:
        'cssom-harness must only be imported from *.cssom.test files. This file runs in jsdom.',
      noResolvedStyleSpy:
        'Mocking getComputedStyle produces false confidence. Move the assertion to a *.cssom.test file and assert real resolved values.',
    },
    schema: [],
  },
  create(context) {
    const filename = context.getFilename ? context.getFilename() : context.filename;
    if (!isJsdomUnitFile(filename)) return {};

    return {
      Identifier(node) {
        if (!JSDOM_BANNED_IDENTIFIERS.has(node.name)) return;
        // Allow type-only references (TS type annotations).
        const parentType = node.parent && node.parent.type;
        if (parentType === 'TSTypeReference' || parentType === 'TSQualifiedName') return;
        context.report({ node, messageId: 'noGetComputedStyle' });
      },
      MemberExpression(node) {
        if (
          node.property &&
          node.property.type === 'Identifier' &&
          JSDOM_BANNED_MEMBER_PROPS.has(node.property.name)
        ) {
          context.report({ node: node.property, messageId: 'noToHaveStyle' });
        }
      },
      ImportDeclaration(node) {
        const src = node.source && node.source.value;
        if (typeof src !== 'string') return;
        for (const pattern of JSDOM_BANNED_IMPORT_SOURCES) {
          if (pattern.test(src)) {
            context.report({ node, messageId: 'noCssomHarnessImport' });
            return;
          }
        }
      },
      CallExpression(node) {
        // vi.spyOn(window, 'getComputedStyle') / jest.spyOn(...)
        const callee = node.callee;
        if (
          callee &&
          callee.type === 'MemberExpression' &&
          callee.property &&
          callee.property.type === 'Identifier' &&
          callee.property.name === 'spyOn' &&
          node.arguments.length >= 2
        ) {
          const second = node.arguments[1];
          if (
            second &&
            second.type === 'Literal' &&
            typeof second.value === 'string' &&
            second.value === 'getComputedStyle'
          ) {
            context.report({ node, messageId: 'noResolvedStyleSpy' });
          }
        }
      },
    };
  },
};

const noJsdomStubsInCssomTests = {
  meta: {
    type: 'problem',
    docs: {
      description: 'jsdom-only stubs are not allowed in *.cssom.test files; the Chromium browser provider supplies real implementations.',
    },
    messages: {
      noJsdomStub:
        'jsdom-only stub `{{name}}` is unnecessary in a *.cssom.test file. Chromium provides the real implementation.',
    },
    schema: [],
  },
  create(context) {
    const filename = context.getFilename ? context.getFilename() : context.filename;
    if (!isCssomFile(filename)) return {};

    const reportIfStub = (node, name) => {
      if (CSSOM_BANNED_MOCK_TARGETS.includes(name)) {
        context.report({ node, messageId: 'noJsdomStub', data: { name } });
      }
    };

    return {
      // Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', ...)
      // Object.defineProperty(window, 'matchMedia', ...)
      CallExpression(node) {
        if (
          node.callee &&
          node.callee.type === 'MemberExpression' &&
          node.callee.object &&
          node.callee.object.name === 'Object' &&
          node.callee.property &&
          node.callee.property.name === 'defineProperty' &&
          node.arguments.length >= 1
        ) {
          const first = node.arguments[0];
          if (first && first.type === 'MemberExpression' && first.object && first.object.name) {
            reportIfStub(node, first.object.name);
          }
          if (first && first.type === 'Identifier') {
            reportIfStub(node, first.name);
          }
        }
      },
    };
  },
};

export const rules = {
  'no-cssom-in-jsdom-tests': noCssomInJsdomTests,
  'no-jsdom-stubs-in-cssom-tests': noJsdomStubsInCssomTests,
};

export default { rules };
