import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * #1021 — tehlike/hata yüzeyinde metin WCAG AA'yı geçmeli.
 *
 * <p>Ölçülen kusur: `--state-danger-text`, `--state-danger-bg` üzerinde 3.42 (açık temalar),
 * 1.90 (serban-dark) ve 4.00 (koyu uzantı) — eşik 4.5. Açık temalarda bu renk DÜZ yüzeyde de
 * eşiğin altında (3.76). `--state-danger-bg` yarı saydam olduğu için gerçek zemin, tint'in
 * yüzey üzerine kompozit edilmiş hâlidir; `getComputedStyle` tek başına yanıltıcıdır.
 *
 * <p>Token değerini değiştirmek bu depoda ayrı bir kapıya çarpıyor: tema göç kaydı
 * (`design-tokens/migrations/theme-ownership-decisions.v1.json`) birleşik temayı tarihsel
 * temele kilitliyor ve sapmaları yalnız o göçte alınmış üç karar için tanımlıyor. Bu yüzden
 * çözüm, deponun kendi emsaliyle aynı: tehlike zemininde metin `--text-primary` kullanır
 * (ats#221'de aynı düzeltme tek öğe için yapılmıştı, 3.19 → 15.07).
 *
 * <p>Buradaki iki test o kuralı kalıcı kılar: (1) desen bütün temalarda ölçülür, (2) hiçbir
 * ekran tehlike zemininde `text-state-danger-text` kullanmaz.
 *
 * <p>Bilinen sınırlar (#1189 incelemesi): (2) SATIR bazlıdır; birden çok satıra bölünmüş
 * `className`/`cn(...)` ya da üst öğede tehlike zemini + alt öğede tehlike metni gibi iç içe
 * kullanımı yakalamaz. Bunu kapatacak olan, hata durumu görünürken koşan axe kontrolüdür.
 * (1) yarı saydam zemini doğrusal ışıkta karıştırır; tarayıcılar gama kodlu sRGB'de karıştırdığı
 * için oranlar tarayıcı ölçümünden biraz sapabilir. `--text-primary` için pay büyük (≥ 9,47),
 * testin kararı değişmez.
 */
const THEME_FILES: ReadonlyArray<{ label: string; relative: string }> = [
  { label: 'theme.css', relative: '../theme.css' },
  { label: 'theme.extensions.css', relative: '../theme.extensions.css' },
];
const MIN_RATIO = 4.5;

type Color = { L: number; C: number; h: number; alpha: number };

const parseOklch = (raw: string): Color | null => {
  const match = raw
    .trim()
    .match(/^oklch\(\s*([\d.]+)%?\s+([\d.]+)\s+([\d.]+)(?:deg)?\s*(?:\/\s*([\d.]+)%?)?\s*\)$/i);
  if (!match) return null;
  const rawL = Number.parseFloat(match[1]);
  const rawAlpha = match[4] === undefined ? null : Number.parseFloat(match[4]);
  return {
    L: rawL > 1 ? rawL / 100 : rawL,
    C: Number.parseFloat(match[2]),
    h: Number.parseFloat(match[3]),
    alpha: rawAlpha === null ? 1 : rawAlpha > 1 ? rawAlpha / 100 : rawAlpha,
  };
};

/** OKLab → lineer sRGB (kanallar kırpılmaz; parlaklık hesabı kırpmaya duyarsız). */
const toLinearRgb = ({ L, C, h }: Color): [number, number, number] => {
  const hRad = (h * Math.PI) / 180;
  const a = C * Math.cos(hRad);
  const b = C * Math.sin(hRad);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
};

const over = (color: Color, base: [number, number, number]): [number, number, number] => {
  const lin = toLinearRgb(color);
  if (color.alpha >= 1) return lin;
  return lin.map((channel, index) => channel * color.alpha + base[index] * (1 - color.alpha)) as [
    number,
    number,
    number,
  ];
};

const luminance = ([r, g, b]: [number, number, number]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

const contrastRatio = (fg: [number, number, number], bg: [number, number, number]) => {
  const [lighter, darker] = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
};

type ThemeBlock = { file: string; selector: string; text: Color; danger: Color; surface: Color };

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
      const text = parseOklch(textRaw);
      const danger = parseOklch(dangerRaw);
      const surface = parseOklch(surfaceRaw);
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
      const surface = toLinearRgb(block.surface);
      const tint = over(block.danger, surface);

      expect(contrastRatio(toLinearRgb(block.text), tint)).toBeGreaterThanOrEqual(MIN_RATIO);
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
