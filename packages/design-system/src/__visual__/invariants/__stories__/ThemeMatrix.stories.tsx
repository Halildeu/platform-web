import type { Meta, StoryObj } from '@storybook/react';
import { MatrixCanvas } from './MatrixCanvas';

const meta: Meta<typeof MatrixCanvas> = {
  title: 'Visual/Invariants/ThemeMatrix',
  component: MatrixCanvas,
  parameters: {
    layout: 'fullscreen',
  },
};

export default meta;

type Story = StoryObj<typeof MatrixCanvas>;

export const Light: Story = {
  args: { mode: 'light', density: 'comfortable', dir: 'ltr' },
};

export const Dark: Story = {
  args: { mode: 'dark', density: 'comfortable', dir: 'ltr' },
};
