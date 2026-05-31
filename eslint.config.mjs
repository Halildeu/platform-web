import js from '@eslint/js';
import css from '@eslint/css';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import { rules as semanticThemeRules } from './scripts/lint/eslint-plugin-semantic-theme.mjs';
import { rules as cssVarFallbackRules } from './scripts/lint/eslint-plugin-css-var-fallback.mjs';
import { rules as noAntImportRules } from './scripts/lint/eslint-plugin-no-ant-import.mjs';

/**
 * Downgrade all "error"-level rules from recommended configs to "warn" so
 * pre-existing violations are captured by --max-warnings instead of causing
 * an immediate exit-code 1.  Explicit overrides below can still promote
 * individual rules back to "error" (e.g. no-ant-import).
 */
function downgradeErrorsToWarn(...configs) {
  const map = {};
  for (const cfg of configs) {
    const items = Array.isArray(cfg) ? cfg : [cfg];
    for (const item of items) {
      if (!item.rules) continue;
      for (const [rule, level] of Object.entries(item.rules)) {
        const severity = Array.isArray(level) ? level[0] : level;
        if (severity === 'error' || severity === 2) {
          map[rule] = Array.isArray(level) ? ['warn', ...level.slice(1)] : 'warn';
        }
      }
    }
  }
  return map;
}

const recommendedWarnOverrides = downgradeErrorsToWarn(
  js.configs.recommended,
  ...tseslint.configs.recommended,
);

export default tseslint.config(
  {
    ignores: [
      'dist',
      'apps/**/dist/**',
      'apps/**/dist-quality/**',
      'packages/**/dist/**',
      'archive/**',
      'storybook-static',
      '.storybook/**',
      'reports',
      'coverage',
      'security-reports',
      'tests/smoke/**/*.mjs',
      'node_modules',
      '**/node_modules/**',
      '**/node_modules_old/**',
      'node_modules_failed_pnpm/**',
      'node_modules_failed_pnpm_hoisted/**',
      '**/webpack.*.js',
      '**/webpack.*.ts',
      '**/tailwind.config.*',
      '**/.stylelintrc.*',
      '**/jest.config.*',
      '**/babel.config.*',
      '**/postcss.config.*',
      'storybook.config.mjs',
      '**/*.stories.{ts,tsx}',
      '**/*.figma.{ts,tsx}',
      'scripts/ops/**',
      // Packages with eslint-disable comments referencing unloaded plugins (react-hooks, jsx-a11y)
      'packages/x-kanban/**',
      'packages/x-editor/**',
      '.__mf__temp/**',
      '**/.__mf__temp/**',
      '.mf/**',
      'scripts/theme/**',
    ],
  },
  /* ---- Linter options ---- */
  {
    linterOptions: {
      reportUnusedDisableDirectives: 'warn',
    },
  },
  /* ---- JS/TS rules — scoped to non-CSS files only ---- */
  {
    files: ['**/*.{ts,tsx,js,jsx,mjs}'],
    ...js.configs.recommended,
  },
  ...tseslint.configs.recommended.map((cfg) => ({
    ...cfg,
    files: cfg.files ?? ['**/*.{ts,tsx,js,jsx,mjs}'],
  })),
  {
    files: ['**/*.{ts,tsx,js,jsx,mjs}'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.es2025,
      },
    },
    plugins: {
      'semantic-theme': { rules: semanticThemeRules },
      'css-var-fallback': { rules: cssVarFallbackRules },
      'no-ant-import': { rules: noAntImportRules },
    },
    rules: {
      // Bulk-downgrade all recommended error-level rules to warn so
      // --max-warnings governs the exit code instead of any single error.
      ...recommendedWarnOverrides,
      // Custom plugin rules
      'semantic-theme/no-inline-color-literals': 'warn',
      // Disabled: conflicts with check_no_hardcoded_theme_styles (fallback hex = violation).
      // Token system is reliable — var(--token) without fallback is the correct pattern.
      'css-var-fallback/no-css-var-without-fallback': 'off',
      'no-ant-import/no-new-ant-import': 'error',
      // Targeted overrides (options or off)
      // TS handles unused vars — disable vanilla rule to avoid double-counting
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
        destructuredArrayIgnorePattern: '^_',
        ignoreRestSiblings: true,
      }],
      'no-undef': 'off', // Too many false positives with TS global types
      'no-unused-private-class-members': 'warn',
    },
  },
  /* ---- @eslint/css — native CSS linting (ESLint 9+) ---- */
  {
    files: ['**/*.css'],
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/coverage/**',
      /* Auto-generated files — read-only */
      '**/tokens/build/**',
      '**/styles/theme.css',
      '**/styles/generated-theme-inline.css',
      'apps/mfe-shell/src/index.css',
    ],
    plugins: { css },
    language: 'css/css',
    rules: {
      'css/no-invalid-at-rules': 'off', // False positives on Tailwind v4 @theme, @apply, etc.
      'css/no-invalid-properties': 'off', // False positives on CSS custom properties (--var)
      'css/no-duplicate-imports': 'error',
    },
  },
  {
    files: [
      '**/__tests__/**/*.{ts,tsx,js,jsx}',
      '**/*.{spec,test}.{ts,tsx,js,jsx}',
      'tests/**/*.{ts,tsx,js,jsx}',
      'docs/tests/**/*.{ts,tsx,js,jsx}',
    ],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  /* ----------------------------------------------------------------- */
  /*  Phase 2 PR-HTTP-3 — remote MFEs MUST consume the shell-injected   */
  /*  http client via getShellServices().http instead of importing the  */
  /*  raw api directly. The shell wires auth.ready() awareness on top   */
  /*  of the axios instance via registerAuthReadyResolver(); pulling    */
  /*  api directly bypasses that gate and re-introduces the pre-cookie  */
  /*  401-storm surface that PR-Auth-1 and PR-Reporting-2 closed.       */
  /*                                                                    */
  /*  Scope: apps/mfe-{access,audit,users,reporting,endpoint_admin}     */
  /*  except their `app/services/shell-services.ts` adapter (which is   */
  /*  the legitimate place to receive the shell's http instance and     */
  /*  its only allowed @mfe/shared-http import surface). The shell      */
  /*  itself (apps/mfe-shell/**) is NOT subject to the rule because it  */
  /*  owns the registration call.                                       */
  /* ----------------------------------------------------------------- */
  {
    files: [
      'apps/mfe-access/**/*.{ts,tsx}',
      'apps/mfe-audit/**/*.{ts,tsx}',
      'apps/mfe-users/**/*.{ts,tsx}',
      'apps/mfe-reporting/**/*.{ts,tsx}',
      'apps/mfe-endpoint_admin/**/*.{ts,tsx}',
      'apps/mfe-endpoint-admin/**/*.{ts,tsx}',
    ],
    ignores: [
      'apps/*/src/app/services/shell-services.{ts,tsx}',
      '**/__tests__/**',
      '**/*.{spec,test}.{ts,tsx}',
    ],
    rules: {
      'no-restricted-imports': [
        'warn',
        {
          paths: [
            {
              name: '@mfe/shared-http',
              importNames: ['api', 'ApiInstance'],
              message:
                'Remote MFEs MUST consume the shell-injected http client via getShellServices().http (defined in src/app/services/shell-services.ts). Importing `api` directly bypasses the shell\'s auth.ready() gate registered via registerAuthReadyResolver() (PR-HTTP-3), which can re-introduce the pre-cookie 401-storm surface.',
            },
          ],
          patterns: [
            {
              group: ['axios'],
              message:
                'Remote MFEs MUST NOT import axios directly. Use getShellServices().http (which returns the shell-owned, auth-ready-gated axios instance) for protected calls.',
            },
          ],
        },
      ],
    },
  },
  /* ----------------------------------------------------------------- */
  /*  Grid contract enforcement — all data grids MUST go through the    */
  /*  design-system `EntityGridTemplate` + `ColumnMeta` column-system   */
  /*  (`packages/design-system/src/advanced/data-grid/`). Direct        */
  /*  `ag-grid-react` / `AgGridReact` imports bypass the contract       */
  /*  (no toolbar / variant / responsive column system / a11y          */
  /*  baseline) and let grid behaviour drift per-app.                   */
  /*                                                                    */
  /*  IMPLEMENTATION NOTE — why `no-restricted-syntax`, not             */
  /*  `no-restricted-imports`: the PR-HTTP-3 block above already owns   */
  /*  the `no-restricted-imports` rule key for the remote-MFE file set. */
  /*  In ESLint flat config, two configs targeting the SAME rule key    */
  /*  do NOT merge their options — the last matching config wins        */
  /*  outright. Re-declaring `no-restricted-imports` here would silently */
  /*  DROP the shell-http restriction for every remote-MFE file. The    */
  /*  ag-grid ban is therefore expressed as a `no-restricted-syntax`    */
  /*  selector (`ImportDeclaration[source.value='ag-grid-react']`),     */
  /*  a different rule key, so the two restrictions coexist.            */
  /*                                                                    */
  /*  This rule blocks the import everywhere; the override block right  */
  /*  below exempts ONLY the contract's stable internals:               */
  /*   - the contract's own internals (GridShell wraps AgGridReact);     */
  /*   - `packages/x-data-grid/**` (the enterprise grid kit).            */
  /*  Apps under `apps/**` MUST go through `GridShell`; no app-level     */
  /*  exceptions are accepted. The previous CompensationDashboard       */
  /*  permanent exception was retired by PR-A grid-contract migration    */
  /*  (2026-05-31, Codex thread 019e7f8f) when the mini-table moved to   */
  /*  the canonical `GridShell` + `buildColDefs` path.                   */
  /* ----------------------------------------------------------------- */
  {
    files: ['**/*.{ts,tsx,js,jsx}'],
    ignores: [
      '**/__tests__/**',
      '**/*.{spec,test}.{ts,tsx,js,jsx}',
      'tests/**',
      '**/*.stories.{ts,tsx}',
      '**/*.figma.{ts,tsx}',
      // Build / bundle config reference `ag-grid-react` as a Module-
      // Federation shared-singleton string, not as a real import — but
      // these are excluded for clarity (the rule only targets imports).
      '**/vite.config.{ts,js}',
      '**/tsup.config.{ts,js}',
    ],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "ImportDeclaration[source.value='ag-grid-react']",
          message:
            'Data grids MUST use the design-system contract: `EntityGridTemplate` + `ColumnMeta` from @mfe/design-system (packages/design-system/src/advanced/data-grid). Direct AgGridReact use bypasses the toolbar / variant / responsive column system. A direct AgGridReact import requires a documented exception — see the grid-contract section in CONTRIBUTING.md.',
        },
      ],
    },
  },
  /* ----------------------------------------------------------------- */
  /*  Grid contract — allowed-path exemption. These locations are the   */
  /*  legitimate homes of a direct `ag-grid-react` import; the          */
  /*  `no-restricted-syntax` ag-grid ban above is switched OFF here.    */
  /*  Because the ban uses its own rule key (NOT                         */
  /*  `no-restricted-imports`), turning it off here cannot disturb the  */
  /*  PR-HTTP-3 `@mfe/shared-http` restriction — that restriction stays */
  /*  fully intact even though this block disables `no-restricted-      */
  /*  syntax`. After AuditEventFeed + GridTabPanel + CompensationDashboard */
  /*  were migrated to the contract (the last app-level exemption was   */
  /*  retired by PR-A grid-contract migration, 2026-05-31), no app file */
  /*  legitimately imports `ag-grid-react` directly anymore.            */
  /* ----------------------------------------------------------------- */
  {
    files: [
      // The contract's own internals — GridShell legitimately wraps
      // AgGridReact here; this IS the single allowed wrapper.
      'packages/design-system/src/advanced/data-grid/**/*.{ts,tsx}',
      // The enterprise grid kit (pivot / tree / master-detail / etc.).
      'packages/x-data-grid/**/*.{ts,tsx}',
    ],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },
);
