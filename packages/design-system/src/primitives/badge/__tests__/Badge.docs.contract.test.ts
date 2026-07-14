import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = process.cwd().endsWith(`${path.sep}packages${path.sep}design-system`)
  ? path.resolve(process.cwd(), '../..')
  : process.cwd();
const primitivesDocsPath = path.resolve(
  repoRoot,
  'packages/design-system-docs/src/content/docs/components/primitives.mdx',
);

describe('Badge documentation contract', () => {
  it('does not publish a dot-only example that relies on color alone', () => {
    const source = readFileSync(primitivesDocsPath, 'utf8');
    const dotExamples = source.match(/<Badge\b[^>]*\bdot\b[^>]*>/g) ?? [];
    const inaccessibleExamples = dotExamples.filter((example) => {
      const decorative = /aria-hidden=(?:"true"|'true'|\{true\})/.test(example);
      const semanticImage = /role=(?:"img"|'img')/.test(example);
      const accessibleName = /aria-label(?:ledby)?=/.test(example);
      return !decorative && !(semanticImage && accessibleName);
    });

    expect(dotExamples.length).toBeGreaterThan(0);
    expect(inaccessibleExamples).toEqual([]);
  });
});
