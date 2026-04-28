/**
 * Storybook hang RCA — Phase 2 test config.
 *
 * Phase 1 result (autodocs + reactDocgen disabled, addons kept):
 *   → 36+ minutes hang at "Building preview" — react-docgen NOT cause.
 *
 * Phase 2 hypothesis: addons cause the hang.
 *   → All addons disabled. Stories full (229). autodocs/docgen still off.
 *
 * If Phase 2 builds successfully → addons cause hang (next: bisect)
 * If Phase 2 still hangs → 229 story import graph itself is the cause
 *                          (rolldown/Vite production build does not
 *                          handle this monorepo size; alternatives:
 *                          - story graph reduction
 *                          - Storybook v9 fallback
 *                          - Vite plugin tuning)
 *
 * NOT for production use. Bisect tool only.
 */
import type { StorybookConfig } from '@storybook/react-vite';

const config: StorybookConfig = {
  stories: [
    '../packages/design-system/src/**/*.stories.@(ts|tsx)',
    '../packages/x-*/src/**/*.stories.@(ts|tsx)',
  ],
  addons: [], // ALL addons disabled for Phase 2
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
  docs: {
    autodocs: false,
  },
  typescript: {
    reactDocgen: false,
  },
  tags: [],
};
export default config;
