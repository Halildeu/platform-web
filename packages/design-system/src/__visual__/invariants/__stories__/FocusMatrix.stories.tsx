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
 * across light and dark modes.
 *
 * Note: focus is driven by the visual.test.ts via a real Tab keystroke
 * AFTER the page loads, not by a story-level prop. Programmatic
 * `element.focus()` does not reliably trigger `:focus-visible` in
 * Chromium. See Codex thread 019df8eb iter-3 (HIGH 2).
 */
export const Light: Story = {
  args: { mode: 'light', density: 'comfortable', dir: 'ltr' },
};

export const Dark: Story = {
  args: { mode: 'dark', density: 'comfortable', dir: 'ltr' },
};
