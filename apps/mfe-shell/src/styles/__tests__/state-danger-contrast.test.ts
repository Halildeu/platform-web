import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  compositeOver,
  contrastRatio,
  parseCssColor,
  type ParsedColor,
} from '../../../../../scripts/theme/color-contrast.mjs';

/**
 * #1021 — tehlike/hata yüzeyinde metin WCAG AA'yı geçmeli.
 *
 * <p>Ölçülen kusur: `--state-danger-text`, `--state-danger-bg` üzerinde 3.42 (açık temalar),
 * 1.90 (serban-dark) ve 4.00 (koyu uzantı) — eşik 4.5. Açık temalarda bu renk DÜZ yüzeyde de
 * eşiğin altında (3.76). `--state-danger-bg` yarı saydam olduğu için gerçek zemin, tint'in
 * yüzey üzerine kompozit edilmiş hâlidir; `getComputedStyle` tek başına yanıltıcıdır.
 *
 * <p>Renk matematiği tema sahiplik kapısıyla ortaktır (`scripts/theme/color-contrast.mjs`):
 * kompozit tarayıcı gibi gama kodlu sRGB'de yapılır, sonra göreli parlaklık hesaplanır.
 *
 * <p>Token değerini değiştirmek bu depoda ayrı bir kapıya çarpıyor: tema göç kaydı
 * (`design-tokens/migrations/theme-ownership-decisions.v1.json`) birleşik temayı tarihsel
 * temele kilitliyor ve sapmaları yalnız o göçte alınmış üç karar için tanımlıyor. Bu yüzden
 * çözüm, deponun kendi emsaliyle aynı: tehlike zemininde metin `--text-primary` kullanır
 * (ats#221'de aynı düzeltme tek öğe için yapılmıştı, 3.19 → 15.07).
 *
 * <p>Buradaki iki test o kuralı kalıcı kılar: (1) desen bütün temalarda ölçülür, (2) hiçbir
 * ekran tehlike zemininde `text-state-danger-text` kullanmaz.
 */
const THEME_FILES: ReadonlyArray<{ label: string; relative: string }> = [
  { label: 'theme.css', relative: '../theme.css' },
  { label: 'theme.extensions.css', relative: '../theme.extensions.css' },
];
const MIN_RATIO = 4.5;

/** Tema değeri ölçülemeyen bir biçimdeyse (ör. `var(...)`) blok atlanır. */
const parseColor = (raw: string): ParsedColor | null => {
  try {
    return parseCssColor(raw);
  } catch {
    return null;
  }
};

type ThemeBlock = {
  file: string;
  selector: string;
  text: ParsedColor;
  danger: ParsedColor;
  surface: ParsedColor;
};

const collectBlocks = (): ThemeBlock[] => {
  const blocks: ThemeBlock[] = [];
  for (const { label, relative } of THEME_FILES) {
    const file = fileURLToPath(new URL(relative, import.meta.url));
    const css = readFileSync(file, 'utf8');
    for (const [, selectorRaw, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const read = (name: string) => {
        const match = body.match(new RegExp(`--${name}\\s*:\\s*([^;]+);`));
        return match ? match[1] : null;
      };
      const textRaw = read('text-primary');
      const dangerRaw = read('state-danger-bg');
      const surfaceRaw = read('surface-default-bg');
      if (!textRaw || !dangerRaw || !surfaceRaw) continue;
      const text = parseColor(textRaw);
      const danger = parseColor(dangerRaw);
      const surface = parseColor(surfaceRaw);
      if (!text || !danger || !surface) continue;
      blocks.push({
        file: label,
        selector: selectorRaw.trim().replace(/\s+/g, ' ').slice(0, 60),
        text,
        danger,
        surface,
      });
    }
  }
  return blocks;
};

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const SHELL_SOURCE = path.resolve(TEST_DIR, '..', '..');

const collectTsxFiles = (directory: string): string[] => {
  const found: string[] = [];
  for (const entry of readdirSync(directory)) {
    const full = path.join(directory, entry);
    if (statSync(full).isDirectory()) {
      found.push(...collectTsxFiles(full));
    } else if (full.endsWith('.tsx')) {
      found.push(full);
    }
  }
  return found;
};

describe('state-danger contrast (#1021)', () => {
  const blocks = collectBlocks();

  it('measures every theme that defines the danger surface', () => {
    // Tema dosyası yeniden düzenlenip blok bulunamazsa test sessizce "geçmiş" görünmesin.
    expect(blocks.length).toBeGreaterThanOrEqual(5);
  });

  it.each(blocks.map((block) => [`${block.file} ${block.selector}`, block] as const))(
    'keeps the standard danger-surface text readable: %s',
    (_label, block) => {
      const tint = compositeOver(block.danger, block.surface);

      expect(contrastRatio(block.text, tint)).toBeGreaterThanOrEqual(MIN_RATIO);
    },
  );

  it('never pairs the danger text colour with the danger background', () => {
    // Ölçülen kusur burada: o çift hiçbir temada 4.5'i geçmiyor (en iyi hâli 3.42).
    // Kural satır düzeyinde: iki sınıf aynı `className` içinde yan yana yazılıyor.
    const offenders = collectTsxFiles(SHELL_SOURCE)
      .flatMap((file) =>
        readFileSync(file, 'utf8')
          .split('\n')
          .map((line, index) => ({ file, line, number: index + 1 }))
          .filter(
            ({ line }) =>
              line.includes('bg-state-danger-bg') && line.includes('text-state-danger-text'),
          ),
      )
      .map(({ file, number }) => `${path.relative(SHELL_SOURCE, file)}:${number}`);

    expect(offenders).toEqual([]);
  });
});
