import type { Meta, StoryObj } from '@storybook/react';
import { MatrixCanvas } from './MatrixCanvas';

const meta: Meta<typeof MatrixCanvas> = {
  title: 'Visual/Invariants/RTLMatrix',
  component: MatrixCanvas,
  parameters: {
    layout: 'fullscreen',
  },
};

export default meta;

type Story = StoryObj<typeof MatrixCanvas>;

export const LTR: Story = {
  args: { mode: 'light', density: 'comfortable', dir: 'ltr' },
};

export const RTL: Story = {
  args: { mode: 'light', density: 'comfortable', dir: 'rtl' },
};
