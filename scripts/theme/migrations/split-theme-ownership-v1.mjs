#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import postcss from 'postcss';
import { generatedThemeArtifacts } from '../generate-theme-css.mjs';
import {
  assertNoCuratedShadow,
  normalizeValue,
  parseDeclarationMultiset,
  sha256,
  writeFileAtomicIfChanged,
} from '../theme-css-contract.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..', '..');
const decisionsPath = path.join(
  repoRoot,
  'design-tokens/migrations/theme-ownership-decisions.v1.json',
);
const decisions = JSON.parse(fs.readFileSync(decisionsPath, 'utf8'));

const themePath = path.join(repoRoot, decisions.baseline.themeCss.path);
const themeInlinePath = path.join(repoRoot, decisions.baseline.themeInlineCss.path);
const themeExtensionPath = path.join(repoRoot, 'apps/mfe-shell/src/styles/theme.extensions.css');
const themeInlineExtensionPath = path.join(
  repoRoot,
  'apps/mfe-shell/src/styles/theme-inline.extensions.css',
);

function fail(message) {
  throw new Error(`Theme ownership migration refused: ${message}`);
}

function assertDecisionContract() {
  if (decisions.schemaVersion !== 1 || decisions.kind !== 'theme-ownership-migration-decisions') {
    fail('unsupported decision manifest');
  }
  const decisionIds = decisions.decisions.map(({ id }) => id);
  if (new Set(decisionIds).size !== decisionIds.length) fail('duplicate decision id');
  if (decisions.inventory.valueDriftIdentities !== 39) fail('unexpected value drift inventory');
  if (
    decisions.inventory.themeDeclarationTotal !== 1446 ||
    decisions.inventory.themeCustomPropertyDeclarations !== 1444 ||
    decisions.inventory.themeCustomPropertyIdentities !== 1442 ||
    decisions.inventory.generatedThemeDeclarationTotal !== 713 ||
    decisions.inventory.generatedThemeCustomPropertyIdentities !== 711
  ) {
    fail('unexpected generated theme ownership inventory');
  }
  const resolvedDrifts = decisions.decisions
    .filter(({ action }) => action !== 'remove-redundant-override')
    .reduce((total, decision) => total + decision.candidateIdentityCount, 0);
  if (resolvedDrifts !== decisions.inventory.valueDriftIdentities) {
    fail(`resolved drift count ${resolvedDrifts} does not equal inventory 39`);
  }
}

function assertBaseline(filePath, expectedHash, label) {
  const actualHash = sha256(fs.readFileSync(filePath));
  if (actualHash !== expectedHash) {
    fail(`${label} baseline digest mismatch: expected ${expectedHash}, got ${actualHash}`);
  }
}

function assertDigest(content, expectedHash, label) {
  const actualHash = sha256(content);
  if (actualHash !== expectedHash) {
    fail(`${label} result digest mismatch: expected ${expectedHash}, got ${actualHash}`);
  }
}

function removeEmptyContainers(root) {
  let changed = true;
  while (changed) {
    changed = false;
    root.walk((node) => {
      if (!['rule', 'atrule'].includes(node.type) || !node.nodes) return;
      if (node.nodes.some((child) => child.type !== 'comment')) return;
      node.remove();
      changed = true;
    });
  }
}

function extractCurated({ mixedCss, generatedCss, label, allowedRedundantOverrides = [] }) {
  const mixed = parseDeclarationMultiset(mixedCss, { from: `${label}.mixed.css` });
  const generated = parseDeclarationMultiset(generatedCss, { from: `${label}.generated.css` });
  const removedOrders = new Set();

  for (const [identityKey, expected] of generated) {
    const actual = mixed.get(identityKey);
    if (!actual) fail(`${label}: generated identity absent from mixed runtime: ${identityKey}`);
    const available = [...actual.occurrences];
    for (const occurrence of expected.occurrences) {
      const index = available.findIndex(
        (candidate) =>
          candidate.payloadKey === occurrence.payloadKey && !removedOrders.has(candidate.order),
      );
      if (index < 0)
        fail(`${label}: generated payload differs from reviewed runtime: ${identityKey}`);
      removedOrders.add(available[index].order);
      available.splice(index, 1);
    }
  }

  for (const override of allowedRedundantOverrides) {
    const matches = [...mixed.values()].filter(
      (entry) =>
        entry.property === override.property &&
        override.selector(entry.selector) &&
        override.atRules(entry.atRules),
    );
    if (matches.length !== 1)
      fail(`${label}: redundant override identity count is ${matches.length}`);
    const leftovers = matches[0].occurrences.filter((item) => !removedOrders.has(item.order));
    const removable = leftovers.filter(
      (item) => item.value === normalizeValue(override.value) && item.important === false,
    );
    if (removable.length !== 1 || leftovers.length !== 1) {
      fail(`${label}: redundant override payload is not the reviewed singleton`);
    }
    removedOrders.add(removable[0].order);
  }

  const extensionRoot = postcss.parse(mixedCss, { from: `${label}.mixed.css` });
  let order = 0;
  extensionRoot.walkDecls((declaration) => {
    if (removedOrders.has(order)) declaration.remove();
    order += 1;
  });
  extensionRoot.walkComments((comment) => comment.remove());
  removeEmptyContainers(extensionRoot);
  extensionRoot.prepend(
    postcss.comment({
      text: 'Curated theme extensions. Generator ownership is forbidden in this file.',
    }),
  );
  for (const node of extensionRoot.nodes.slice(1)) {
    if (node.type === 'rule' || node.type === 'atrule') node.raws.before = '\n\n';
  }
  const extensionCss = `${extensionRoot.toString().trim()}\n`;
  assertNoCuratedShadow(generatedCss, extensionCss);
  return extensionCss;
}

function assertExtensionContract(themeExtension, themeInlineExtension) {
  assertDigest(
    generatedThemeArtifacts.themeCss.content,
    decisions.result.generatedThemeCssSha256,
    'generated theme.css',
  );
  assertDigest(themeExtension, decisions.result.themeExtensionCssSha256, 'theme extension CSS');
  assertDigest(
    generatedThemeArtifacts.themeInlineCss.content,
    decisions.result.generatedThemeInlineCssSha256,
    'generated theme-inline CSS',
  );
  assertDigest(
    themeInlineExtension,
    decisions.result.themeInlineExtensionCssSha256,
    'theme-inline extension CSS',
  );
  assertNoCuratedShadow(generatedThemeArtifacts.themeCss.content, themeExtension);
  assertNoCuratedShadow(generatedThemeArtifacts.themeInlineCss.content, themeInlineExtension);

  const themeExtensionCount = [...parseDeclarationMultiset(themeExtension).values()].reduce(
    (total, entry) => total + entry.occurrences.length,
    0,
  );
  const themeInlineExtensionCount = [
    ...parseDeclarationMultiset(themeInlineExtension).values(),
  ].reduce((total, entry) => total + entry.occurrences.length, 0);
  if (themeExtensionCount !== decisions.inventory.curatedThemeCustomPropertyIdentities) {
    fail(`theme extension declaration count ${themeExtensionCount} is not 731`);
  }
  if (themeInlineExtensionCount !== decisions.inventory.curatedThemeInlineDeclarations) {
    fail(`theme inline extension declaration count ${themeInlineExtensionCount} is not 40`);
  }
}

function run() {
  assertDecisionContract();
  const currentThemeHash = sha256(fs.readFileSync(themePath));
  const currentThemeInlineHash = sha256(fs.readFileSync(themeInlinePath));
  const alreadyMigrated =
    currentThemeHash === decisions.result.generatedThemeCssSha256 &&
    currentThemeInlineHash === decisions.result.generatedThemeInlineCssSha256;

  if (alreadyMigrated) {
    const themeExtension = fs.readFileSync(themeExtensionPath, 'utf8');
    const themeInlineExtension = fs.readFileSync(themeInlineExtensionPath, 'utf8');
    assertExtensionContract(themeExtension, themeInlineExtension);
    console.log('verified already-migrated theme ownership result (content-addressed)');
    return;
  }

  assertBaseline(themePath, decisions.baseline.themeCss.sha256, 'theme.css');
  assertBaseline(
    themeInlinePath,
    decisions.baseline.themeInlineCss.sha256,
    'generated-theme-inline.css',
  );

  const themeCss = fs.readFileSync(themePath, 'utf8');
  const themeInlineCss = fs.readFileSync(themeInlinePath, 'utf8');
  const ringOverrideValue = 'oklch(68% 0.19 263deg)';
  const themeExtension = extractCurated({
    mixedCss: themeCss,
    generatedCss: generatedThemeArtifacts.themeCss.content,
    label: 'theme',
    allowedRedundantOverrides: [
      {
        property: '--ring-color',
        value: ringOverrideValue,
        selector: (selector) => selector === '[data-mode="dark"]',
        atRules: (atRules) => atRules.length === 0,
      },
      {
        property: '--ring-color',
        value: ringOverrideValue,
        selector: (selector) =>
          selector.includes(':root[data-mode="system"]') &&
          selector.includes('[data-theme-scope][data-mode="system"]'),
        atRules: (atRules) =>
          atRules.length === 1 &&
          atRules[0].name === 'media' &&
          atRules[0].params === '(prefers-color-scheme:dark)',
      },
    ],
  });
  const themeInlineExtension = extractCurated({
    mixedCss: themeInlineCss,
    generatedCss: generatedThemeArtifacts.themeInlineCss.content,
    label: 'theme-inline',
  });
  assertExtensionContract(themeExtension, themeInlineExtension);

  for (const [filePath, content] of [
    [themeExtensionPath, themeExtension],
    [themeInlineExtensionPath, themeInlineExtension],
  ]) {
    const result = writeFileAtomicIfChanged(filePath, content);
    console.log(
      `${result.changed ? 'wrote' : 'unchanged'} ${path.relative(repoRoot, filePath)} sha256:${result.hash}`,
    );
  }
}

run();
