#!/usr/bin/env node
/**
 * a11y-gate.mjs — Accessibility CI gate
 *
 * Ensures minimum a11y test coverage across the design system.
 * Checks that a minimum percentage of components have axe-core tests.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(__dirname, '../../src');

const THRESHOLD = 0.7; // 70% of components must have a11y tests
const CI_MODE = process.argv.includes('--ci');

// 1. Find all component files (same discovery as scorecard)
function findComponents() {
  const components = [];
  const DIRS = ['primitives', 'components', 'enterprise', 'patterns', 'advanced', 'form', 'internal', 'providers', 'motion', 'performance'];

  for (const dir of DIRS) {
    const fullDir = path.join(SRC, dir);
    if (!fs.existsSync(fullDir)) continue;
    walkDir(fullDir, dir, components);
  }
  return components;
}

// SKIP patterns aligned with scorecard / generate-depth-tests discovery
// (K1-M2a, 2026-04-28). Excludes: .figma.tsx (Figma references), .stories.tsx,
// .test.tsx, .visual.tsx, .browser.tsx, .d.ts, index.tsx (barrel), types.tsx.
const FILE_SKIP_PATTERNS = [
  /\.figma\.tsx$/,
  /\.stories\.tsx?$/,
  /\.test\.tsx?$/,
  /\.visual\.tsx?$/,
  /\.browser\.tsx?$/,
  /\.d\.tsx?$/,
];
const FILE_SKIP_NAMES = new Set(['index.tsx', 'types.tsx']);
const DIR_SKIP_NAMES = new Set(['__tests__', '__visual__', 'node_modules']);

function isComponentFile(name) {
  if (!name.endsWith('.tsx')) return false;
  if (FILE_SKIP_NAMES.has(name)) return false;
  if (FILE_SKIP_PATTERNS.some((p) => p.test(name))) return false;
  return true;
}

function walkDir(d, topDir, results) {
  for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
    if (entry.isDirectory() && !DIR_SKIP_NAMES.has(entry.name)) {
      walkDir(path.join(d, entry.name), topDir, results);
    } else if (entry.isFile() && isComponentFile(entry.name)) {
      results.push({ name: entry.name.replace('.tsx', ''), dir: topDir, path: path.relative(SRC, path.join(d, entry.name)) });
    }
  }
}

// 2. Find all test files with a11y assertions
function findA11yTestCoverage(components) {
  const covered = new Set();

  // Search all test files
  function searchDir(d) {
    if (!fs.existsSync(d)) return;
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        searchDir(path.join(d, entry.name));
      } else if (entry.name.endsWith('.test.tsx') || entry.name.endsWith('.test.ts')) {
        const content = fs.readFileSync(path.join(d, entry.name), 'utf-8');
        if (content.includes('expectNoA11yViolations') || content.includes('toHaveNoViolations')) {
          // Find which components this test covers
          for (const comp of components) {
            const importPattern = new RegExp(`from\\s+['"][^'"]*[/]${comp.name}['"]`);
            if (content.includes(`<${comp.name}`) || importPattern.test(content)) {
              covered.add(comp.name);
            }
          }
        }
      }
    }
  }

  searchDir(SRC);
  return covered;
}

// 3. Report
const components = findComponents();
const covered = findA11yTestCoverage(components);
const coverage = covered.size / components.length;

console.log(`\n🔍 Accessibility Test Coverage\n`);
console.log(`  Components: ${components.length}`);
console.log(`  With a11y tests: ${covered.size}`);
console.log(`  Coverage: ${(coverage * 100).toFixed(1)}%`);
console.log(`  Threshold: ${(THRESHOLD * 100).toFixed(0)}%\n`);

// Find uncovered
const uncovered = components.filter(c => !covered.has(c.name));
if (uncovered.length > 0 && uncovered.length <= 20) {
  console.log('  Uncovered:');
  for (const c of uncovered) {
    console.log(`    ❌ ${c.path}`);
  }
} else if (uncovered.length > 20) {
  console.log(`  ${uncovered.length} components without a11y tests`);
  console.log('  Top 10:');
  for (const c of uncovered.slice(0, 10)) {
    console.log(`    ❌ ${c.path}`);
  }
}

if (CI_MODE && coverage < THRESHOLD) {
  console.log(`\n❌ A11Y GATE FAILED: ${(coverage * 100).toFixed(1)}% < ${(THRESHOLD * 100).toFixed(0)}% threshold\n`);
  process.exit(1);
} else {
  console.log(`\n✅ A11Y GATE PASSED: ${(coverage * 100).toFixed(1)}% coverage\n`);
}
