import type { Meta, StoryObj } from '@storybook/react';
import { MatrixCanvas } from './MatrixCanvas';

const meta: Meta<typeof MatrixCanvas> = {
  title: 'Visual/Invariants/FocusMatrix',
  component: MatrixCanvas,
  parameters: {
    layout: 'fullscreen',
  },
};

export default meta;

type Story = StoryObj<typeof MatrixCanvas>;

/**
 * Focus matrix asserts that the focus ring token resolves consistently
 * across light and dark modes. The first interactive element is auto-
 * focused so the snapshot captures the focus-visible cascade.
 */
export const Light: Story = {
  args: { mode: 'light', density: 'comfortable', dir: 'ltr', focusFirst: true },
};

export const Dark: Story = {
  args: { mode: 'dark', density: 'comfortable', dir: 'ltr', focusFirst: true },
};
