import type { StorybookConfig } from '@storybook/react-vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mergeConfig } from 'vite';

/**
 * L4 invariant visual matrix — minimal Storybook config (PR-3).
 *
 * Mirrors the K5 pattern (.storybook-k5) for the same reasons that drove
 * the x-charts visual gate to bypass full Storybook: an isolated config
 * with explicit story list, zero addons, and no autodocs/reactDocgen
 * keeps the build deterministic and fast on CI runners.
 *
 * Even with the full Storybook hang RCA reportedly fixed (storybook-design-token
 * addon removal, see .storybook/main.ts), L4 is a hard gate; bringing in
 * 5 addons + 229 story files would create unnecessary build risk for the
 * 9 invariant snapshots this config produces.
 *
 * Story scope: the 4 matrix files under
 *   packages/design-system/src/__visual__/invariants/__stories__/
 * That directory contains exactly 4 stories files (Theme, Focus, Density,
 * RTL); each contributes 2-3 named stories that resolve to invariant
 * snapshots in __snapshots__/invariants/.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const monorepoRoot = path.resolve(__dirname, '..');

const config: StorybookConfig = {
  stories: ['../packages/design-system/src/__visual__/invariants/__stories__/*.stories.tsx'],
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
          '@mfe/design-system': path.resolve(monorepoRoot, 'packages/design-system/src/index.ts'),
        },
      },
    });
  },
};

export default config;
