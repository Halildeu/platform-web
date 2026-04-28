import type { StorybookConfig } from '@storybook/react-vite';

const config: StorybookConfig = {
  stories: [
    '../packages/design-system/src/**/*.stories.@(ts|tsx)',
    '../packages/x-*/src/**/*.stories.@(ts|tsx)',
  ],
  // storybook-design-token removed — RCA confirmed it as the cause of the
  // Vite production-build hang (Phase 1: full config 36+ min hang;
  // Phase 2: zero addons builds successfully; Phase 3.1: design-token
  // alone hangs at 26 min, 0% CPU). See PR #60 thread for the full
  // bisect evidence. The addon is unmaintained for Storybook 10 +
  // builder-vite 8 + rolldown — its Vite plugin appears to deadlock at
  // the production build phase. Tokens are still rendered through the
  // design-system runtime; only the Storybook docs panel is lost.
  addons: [
    '@storybook/addon-docs',
    '@storybook/addon-a11y',
    '@storybook/addon-themes',
    '@storybook/addon-onboarding',
  ],
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
  docs: {
    autodocs: 'tag',
  },
  typescript: {
    reactDocgen: 'react-docgen-typescript',
  },
  tags: ['autodocs'],
};
export default config;
