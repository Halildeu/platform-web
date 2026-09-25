/**
 * #1021 — scaffold only: the v2 remediation gate enforces nothing yet. This
 * commit carries the tests, the strict schema and the empty v2 ledger.
 */
export const REMEDIATION_PATHS = Object.freeze({
  v1: 'design-tokens/migrations/theme-ownership-decisions.v1.json',
  v2: 'design-tokens/migrations/theme-ownership-decisions.v2.json',
  schema: 'design-tokens/migrations/theme-ownership-decisions.v2.schema.json',
  tokens: 'design-tokens/figma.tokens.json',
  generatedTheme: 'apps/mfe-shell/src/styles/theme.css',
  themeExtension: 'apps/mfe-shell/src/styles/theme.extensions.css',
  generatedThemeInline: 'apps/mfe-shell/src/styles/generated-theme-inline.css',
  themeInlineExtension: 'apps/mfe-shell/src/styles/theme-inline.extensions.css',
});

export function validateAgainstSchema() {
  return true;
}

export function assertThemeOwnershipRemediationContract() {
  return true;
}
