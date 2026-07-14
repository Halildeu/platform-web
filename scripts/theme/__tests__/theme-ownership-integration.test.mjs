import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { generatedThemeArtifacts } from '../generate-theme-css.mjs';
import {
  assertExpectedImportOrder,
  assertNoCuratedShadow,
  parseDeclarationMultiset,
  sha256,
} from '../theme-css-contract.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const relative = (...segments) => path.join(repoRoot, ...segments);
const read = (filePath) => fs.readFileSync(filePath, 'utf8');
const declarationCount = (css) =>
  [...parseDeclarationMultiset(css).values()].reduce(
    (total, entry) => total + entry.occurrences.length,
    0,
  );

const themeExtensionPath = relative('apps', 'mfe-shell', 'src', 'styles', 'theme.extensions.css');
const themeInlineExtensionPath = relative(
  'apps',
  'mfe-shell',
  'src',
  'styles',
  'theme-inline.extensions.css',
);
const shellEntryPath = relative('apps', 'mfe-shell', 'src', 'index.css');
const cssomHarnessPath = relative(
  'packages',
  'design-system',
  'src',
  '__tests__',
  'cssom-harness.css',
);
const generatorPath = relative('scripts', 'theme', 'generate-theme-css.mjs');
const generatedArtifactPaths = Object.values(generatedThemeArtifacts)
  .filter((candidate) => candidate && typeof candidate === 'object' && 'path' in candidate)
  .map(({ path: artifactPath }) => artifactPath);
const snapshotFiles = (filePaths) =>
  new Map(
    filePaths.map((filePath) => [
      filePath,
      { hash: sha256(fs.readFileSync(filePath)), mtimeMs: fs.statSync(filePath).mtimeMs },
    ]),
  );
const assertSnapshotsEqual = (filePaths, before, operation) => {
  for (const filePath of filePaths) {
    assert.deepEqual(
      { hash: sha256(fs.readFileSync(filePath)), mtimeMs: fs.statSync(filePath).mtimeMs },
      before.get(filePath),
      `${path.relative(repoRoot, filePath)} changed during ${operation}`,
    );
  }
};

test('all five generated artifacts match exact on-disk bytes', () => {
  for (const artifact of Object.values(generatedThemeArtifacts).filter(
    (candidate) => candidate && typeof candidate === 'object' && 'path' in candidate,
  )) {
    assert.equal(read(artifact.path), artifact.content, path.relative(repoRoot, artifact.path));
  }
});

test('generated and curated ownership is disjoint with reviewed inventory counts', () => {
  const themeExtension = read(themeExtensionPath);
  const themeInlineExtension = read(themeInlineExtensionPath);

  assertNoCuratedShadow(generatedThemeArtifacts.themeCss.content, themeExtension);
  assertNoCuratedShadow(generatedThemeArtifacts.componentThemeCss.content, themeExtension);
  assertNoCuratedShadow(generatedThemeArtifacts.themeInlineCss.content, themeInlineExtension);

  assert.deepEqual(
    {
      generatedThemeDeclarations: declarationCount(generatedThemeArtifacts.themeCss.content),
      curatedThemeDeclarations: declarationCount(themeExtension),
      generatedInlineDeclarations: declarationCount(generatedThemeArtifacts.themeInlineCss.content),
      curatedInlineDeclarations: declarationCount(themeInlineExtension),
    },
    {
      generatedThemeDeclarations: 713,
      curatedThemeDeclarations: 731,
      generatedInlineDeclarations: 98,
      curatedInlineDeclarations: 40,
    },
  );
});

test('shell and real-browser harness preserve the same exact cascade order', () => {
  assertExpectedImportOrder(
    read(shellEntryPath),
    [
      'tailwindcss',
      './styles/generated-theme-inline.css',
      './styles/theme-inline.extensions.css',
      './styles/theme.css',
      './styles/theme.extensions.css',
      './styles/component-theme.generated.css',
    ],
    { allowAdditional: false },
  );
  assertExpectedImportOrder(
    read(cssomHarnessPath),
    [
      'tailwindcss',
      '../../../../apps/mfe-shell/src/styles/generated-theme-inline.css',
      '../../../../apps/mfe-shell/src/styles/theme-inline.extensions.css',
      '../../../../apps/mfe-shell/src/styles/theme.css',
      '../../../../apps/mfe-shell/src/styles/theme.extensions.css',
      '../../../../apps/mfe-shell/src/styles/component-theme.generated.css',
    ],
    { allowAdditional: false },
  );
});

test('--check is a read-only exact drift and ownership gate', () => {
  const protectedPaths = [
    ...generatedArtifactPaths,
    themeExtensionPath,
    themeInlineExtensionPath,
    shellEntryPath,
    cssomHarnessPath,
  ];
  const before = snapshotFiles(protectedPaths);

  const output = execFileSync(process.execPath, [generatorPath, '--check'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  assert.match(output, /tokens:build --check OK \(5 files\)/);

  assertSnapshotsEqual(protectedPaths, before, '--check');
});

test('full generation is byte/mtime stable and never writes curated extensions', () => {
  const protectedPaths = [...generatedArtifactPaths, themeExtensionPath, themeInlineExtensionPath];
  const before = snapshotFiles(protectedPaths);

  const output = execFileSync(process.execPath, [generatorPath], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  assert.match(output, /Generated apps\/mfe-shell\/src\/styles\/theme\.css/);

  assertSnapshotsEqual(protectedPaths, before, 'full generation');
});
