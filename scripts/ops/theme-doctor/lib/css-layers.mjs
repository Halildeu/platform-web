import { readFileSync } from 'node:fs';

export function readCssLayers(paths, readFile = readFileSync) {
  return paths
    .map((path) => {
      try {
        return readFile(path, 'utf8');
      } catch {
        return '';
      }
    })
    .filter(Boolean)
    .join('\n');
}

export function extractThemeInlineBodies(css) {
  return [...css.matchAll(/@theme\s+inline\s*\{([\s\S]*?)\}/g)].map((match) => match[1]);
}

export function extractCssRuleBodies(css, selectorPredicate) {
  const bodies = [];

  for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = match[1].replace(/\/\*[\s\S]*?\*\//g, '').trim();
    if (selectorPredicate(selector)) bodies.push(match[2]);
  }

  return bodies;
}

export function extractRootBodies(css) {
  return extractCssRuleBodies(css, (selector) =>
    selector.split(',').some((part) => part.trim() === ':root'),
  );
}
