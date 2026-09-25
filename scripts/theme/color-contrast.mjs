/** #1021 — scaffold only: the shared colour math is not implemented yet. */
export const RATIO_TOLERANCE = undefined;

const missing = () => {
  throw new Error('color-contrast: not implemented yet');
};

export const parseCssColor = missing;
export const compositeOver = missing;
export const relativeLuminance = missing;
export const contrastRatio = missing;
