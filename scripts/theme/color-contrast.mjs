/**
 * #1021 — the single colour-math module for theme contrast.
 *
 * The theme ownership remediation gate and the shell's state-danger contrast
 * test both measure through this file; two implementations drift apart over
 * time. Colours are converted to gamma-encoded sRGB first, a translucent layer
 * is composited in that same space (as browsers do), and only then is WCAG
 * relative luminance computed. Compositing in linear light over-states the
 * contrast of a translucent tint.
 */

/** Allowed difference between a recorded ratio and the recomputed one. */
export const RATIO_TOLERANCE = 0.01;

const HEX = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const OKLCH =
  /^oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)(?:deg)?\s*(?:\/\s*([\d.]+)(%?)\s*)?\)$/i;

const clamp01 = (value) => Math.min(1, Math.max(0, value));

const encodeGamma = (linear) => {
  const magnitude = Math.abs(linear);
  const encoded =
    magnitude <= 0.0031308 ? 12.92 * magnitude : 1.055 * magnitude ** (1 / 2.4) - 0.055;
  return Math.sign(linear) * encoded;
};

const decodeGamma = (channel) =>
  channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;

const oklchToSrgb = (lightness, chroma, hueDegrees) => {
  const hue = (hueDegrees * Math.PI) / 180;
  const a = chroma * Math.cos(hue);
  const b = chroma * Math.sin(hue);
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const linear = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  // Out-of-gamut channels are clipped after encoding, as Chromium renders them.
  return linear.map((channel) => clamp01(encodeGamma(channel)));
};

/**
 * Parse `oklch(...)` or a hex colour into gamma-encoded sRGB channels (0..1)
 * and an alpha (0..1). Anything else is rejected rather than guessed.
 */
export function parseCssColor(raw) {
  const value = String(raw ?? '').trim();
  const hex = value.match(HEX);
  if (hex) {
    let digits = hex[1];
    if (digits.length <= 4) digits = [...digits].map((digit) => digit + digit).join('');
    const channels = digits.match(/../g).map((pair) => Number.parseInt(pair, 16) / 255);
    return Object.freeze({
      rgb: Object.freeze(channels.slice(0, 3)),
      alpha: channels.length === 4 ? channels[3] : 1,
    });
  }
  const oklch = value.match(OKLCH);
  if (oklch) {
    const lightness = Number.parseFloat(oklch[1]) / (oklch[2] ? 100 : 1);
    const alphaRaw =
      oklch[5] === undefined ? 1 : Number.parseFloat(oklch[5]) / (oklch[6] ? 100 : 1);
    return Object.freeze({
      rgb: Object.freeze(
        oklchToSrgb(lightness, Number.parseFloat(oklch[3]), Number.parseFloat(oklch[4])),
      ),
      alpha: clamp01(alphaRaw),
    });
  }
  throw new Error(`Unsupported colour for contrast measurement: ${JSON.stringify(value)}`);
}

/** Composite `top` over an opaque `bottom` in gamma-encoded sRGB. */
export function compositeOver(top, bottom) {
  if (bottom.alpha !== 1) {
    throw new Error('compositeOver needs an opaque bottom layer');
  }
  if (top.alpha >= 1) return top;
  return Object.freeze({
    rgb: Object.freeze(
      top.rgb.map((channel, index) => channel * top.alpha + bottom.rgb[index] * (1 - top.alpha)),
    ),
    alpha: 1,
  });
}

/** WCAG 2.x relative luminance of an opaque gamma-encoded sRGB colour. */
export function relativeLuminance(color) {
  const [r, g, b] = color.rgb.map(decodeGamma);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio; a translucent foreground is composited over the background first. */
export function contrastRatio(foreground, background) {
  if (background.alpha !== 1) {
    throw new Error('contrastRatio needs an opaque background; composite it first');
  }
  const text = compositeOver(foreground, background);
  const [lighter, darker] = [relativeLuminance(text), relativeLuminance(background)].sort(
    (first, second) => second - first,
  );
  return (lighter + 0.05) / (darker + 0.05);
}
