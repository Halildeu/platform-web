import type { Meta, StoryObj } from '@storybook/react';
import { MatrixCanvas } from './MatrixCanvas';

const meta: Meta<typeof MatrixCanvas> = {
  title: 'Visual/Invariants/DensityMatrix',
  component: MatrixCanvas,
  parameters: {
    layout: 'fullscreen',
  },
};

export default meta;

type Story = StoryObj<typeof MatrixCanvas>;

export const Compact: Story = {
  args: { mode: 'light', density: 'compact', dir: 'ltr' },
};

export const Comfortable: Story = {
  args: { mode: 'light', density: 'comfortable', dir: 'ltr' },
};

export const Spacious: Story = {
  args: { mode: 'light', density: 'spacious', dir: 'ltr' },
};
