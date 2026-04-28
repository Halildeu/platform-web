import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { expect, within, userEvent } from 'storybook/test';
import { FullscreenToggle } from './FullscreenToggle';

const meta: Meta<typeof FullscreenToggle> = {
  title: 'Primitives/FullscreenToggle',
  component: FullscreenToggle,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  argTypes: {
    size: {
      control: 'inline-radio',
      options: ['sm', 'md', 'lg'],
      description: 'Button size',
    },
    variant: {
      control: 'inline-radio',
      options: ['ghost', 'outline'],
      description: 'Visual style',
    },
    showLabel: { control: 'boolean', description: 'Render label next to icon' },
    expandLabel: { control: 'text', description: 'Label shown when not in fullscreen' },
    collapseLabel: { control: 'text', description: 'Label shown when in fullscreen' },
  },
  decorators: [
    (Story) => (
      <div style={{ padding: 24 }}>
        <Story />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof FullscreenToggle>;

export const Default: Story = {
  args: {},
};

export const OutlineVariant: Story = {
  args: {
    variant: 'outline',
    size: 'lg',
  },
};

export const IconOnly: Story = {
  args: {
    showLabel: false,
    size: 'sm',
  },
};

export const SmallGhost: Story = {
  args: {
    size: 'sm',
    variant: 'ghost',
  },
};

export const CustomLabels: Story = {
  args: {
    expandLabel: 'Tam ekran',
    collapseLabel: 'Çık',
    variant: 'outline',
  },
};

export const Interactive: Story = {
  args: {},
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // Stub Fullscreen API: jsdom doesn't implement requestFullscreen.
    // FullscreenToggle calls document.documentElement.requestFullscreen() and
    // listens for `fullscreenchange` to flip its internal state. We stub:
    //   1) document.fullscreenElement (read by component on event)
    //   2) requestFullscreen on the documentElement (no-op + event dispatch)
    let fsElement: Element | null = null;
    // Save existing descriptors so we can restore them after the test runs;
    // otherwise a leaking getter on document.fullscreenElement persists into
    // other stories and breaks isolation.
    const originalFsDescriptor = Object.getOwnPropertyDescriptor(document, 'fullscreenElement');
    const originalRequest = (HTMLElement.prototype as { requestFullscreen?: () => Promise<void> })
      .requestFullscreen;

    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      get: () => fsElement,
    });
    (
      HTMLElement.prototype as unknown as { requestFullscreen: () => Promise<void> }
    ).requestFullscreen = function () {
      fsElement = this as Element;
      document.dispatchEvent(new Event('fullscreenchange'));
      return Promise.resolve();
    };

    try {
      const btn = canvas.getByRole('button', { name: /Fullscreen/i });
      await expect(btn).toBeInTheDocument();
      // Initial state: data-fullscreen="false"
      await expect(btn).toHaveAttribute('data-fullscreen', 'false');
      // Click → requestFullscreen stub runs → fullscreenchange fires → state flips
      await userEvent.click(btn);
      // After re-render, button now shows "Exit Fullscreen" label.
      const exitBtn = await canvas.findByRole('button', { name: /Exit Fullscreen/i });
      await expect(exitBtn).toHaveAttribute('data-fullscreen', 'true');
    } finally {
      // Restore document.fullscreenElement descriptor.
      if (originalFsDescriptor) {
        Object.defineProperty(document, 'fullscreenElement', originalFsDescriptor);
      } else {
        delete (document as { fullscreenElement?: Element | null }).fullscreenElement;
      }
      // Restore HTMLElement.prototype.requestFullscreen.
      if (originalRequest) {
        (
          HTMLElement.prototype as unknown as { requestFullscreen: typeof originalRequest }
        ).requestFullscreen = originalRequest;
      } else {
        delete (HTMLElement.prototype as { requestFullscreen?: unknown }).requestFullscreen;
      }
    }
  },
};
