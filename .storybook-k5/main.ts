import type { StorybookConfig } from '@storybook/react-vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mergeConfig } from 'vite';

/**
 * K5 visual baseline — minimal Storybook config.
 *
 * Full .storybook/main.ts (5 addons + 229 story files + autodocs +
 * react-docgen-typescript) hangs in Vite production build (Building
 * preview phase) on both Mac and Linux runners. K5 needs only the
 * x-charts AllChartTypes story rendered, so this dedicated config
 * scopes everything down to the minimum:
 *
 *   - one story file (AllChartTypes)
 *   - zero addons
 *   - autodocs: false
 *   - reactDocgen: false (skip TS prop-table generation)
 *   - viteFinal alias for @mfe/design-system (peer dep, used for cn/Spinner/Text)
 *
 * Full Storybook hang RCA tracked separately (#52 thread); K5 should
 * not block on it.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const monorepoRoot = path.resolve(__dirname, '..');

const config: StorybookConfig = {
  stories: ['../packages/x-charts/src/__stories__/AllChartTypes.stories.tsx'],
  addons: [],
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
  viteFinal: async (viteConfig) => {
    return mergeConfig(viteConfig, {
      resolve: {
        alias: {
          // x-charts declares @mfe/design-system as a peerDependency for
          // cn, Spinner, Text. Resolve directly to the design-system
          // source entry so Vite/Rolldown bundle the tree-shaken slice.
          '@mfe/design-system': path.resolve(monorepoRoot, 'packages/design-system/src/index.ts'),
        },
      },
    });
  },
};

export default config;
