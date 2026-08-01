import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Faz 35 — the type scale is a measured contract, not a mood.
 *
 * Two real defects motivated this file, both reproduced in a live browser on
 * 2026-08-01: the closed-channel heading cropped mid-word ("...almıyor."
 * rendered as "aımıyor.") because an 8vw/0.98 hero font outgrew its container,
 * and at 1280x720 the primary actions sat below the fold because heading plus
 * hero padding spent the whole first screen. jsdom cannot measure layout, so
 * these invariants pin the *scale itself* in the stylesheet; the live browser
 * pass measures the rendered result after deploy.
 */
describe('typographic scale invariants', () => {
  const css = readFileSync(join(__dirname, 'styles.css'), 'utf8');
  const declarations = css.replace(/\/\*[\s\S]*?\*\//g, '');

  it('no font size may exceed the two-line heading ceiling (3.5rem)', () => {
    // Every rem literal inside a font/font-size declaration, including inside
    // clamp(): the clamp maximum is exactly what the defect rode in on.
    const fontDeclarations = declarations.match(/font(?:-size)?\s*:[^;]+;/g) ?? [];
    const offenders = fontDeclarations.filter((declaration) => {
      const rems = [...declaration.matchAll(/([\d.]+)rem/g)].map((m) => Number(m[1]));
      return rems.some((value) => value > 3.5);
    });
    expect(offenders).toEqual([]);
  });

  it('viewport-relative font sizes appear only inside clamp()', () => {
    const fontDeclarations = declarations.match(/font(?:-size)?\s*:[^;]+;/g) ?? [];
    const unbounded = fontDeclarations.filter(
      (declaration) => /[\d.]+vw/.test(declaration) && !declaration.includes('clamp('),
    );
    expect(unbounded).toEqual([]);
  });

  it('multi-line headings never drop line-height below 1.1', () => {
    // The 0.98 line-height clipped descenders and jammed wrapped Turkish lines
    // together. Font shorthand carries it as "/<value>".
    const shorthandLineHeights = [...declarations.matchAll(/font\s*:[^;]*\/\s*([\d.]+)/g)].map(
      (m) => Number(m[1]),
    );
    for (const value of shorthandLineHeights) {
      expect(value).toBeGreaterThanOrEqual(1.1);
    }
  });

  it('the hero heading declares its own overflow defence', () => {
    const heroHeading = declarations.match(/\.hero h1 \{[^}]+\}/)?.[0] ?? '';
    expect(heroHeading).toContain('overflow-wrap');
    expect(heroHeading).toContain('text-wrap: balance');
  });

  it('the page keeps its sideways-scroll guard', () => {
    expect(declarations).toMatch(/overflow-x:\s*clip/);
  });
});
