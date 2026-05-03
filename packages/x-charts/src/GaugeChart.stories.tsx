/**
 * Storybook stories — GaugeChart
 *
 * Per-component story file (sibling to GaugeChart.tsx) for the M4 Quality
 * Sprint storyCompleteness gate.
 */
import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { GaugeChart } from './GaugeChart';

const meta: Meta<typeof GaugeChart> = {
  title: 'x-charts/GaugeChart',
  component: GaugeChart,
  parameters: { layout: 'padded' },
  argTypes: {
    size: { control: 'select', options: ['sm', 'md', 'lg'] },
    theme: { control: 'select', options: ['auto', 'light', 'dark', 'high-contrast', 'print'] },
    animate: { control: 'boolean' },
    showProgress: { control: 'boolean' },
    showAxisLabel: { control: 'boolean' },
    value: { control: { type: 'range', min: 0, max: 100, step: 1 } },
  },
  decorators: [
    (Story) => (
      <div style={{ width: 640, height: 360, background: '#ffffff' }}>
        <Story />
      </div>
    ),
  ],
  tags: ['autodocs'],
};
export default meta;
type Story = StoryObj<typeof GaugeChart>;

export const Default: Story = {
  args: {
    value: 72,
    min: 0,
    max: 100,
    title: 'Performans',
    thresholds: [
      { value: 30, color: '#ef4444' },
      { value: 70, color: '#f59e0b' },
      { value: 100, color: '#22c55e' },
    ],
    size: 'lg',
  },
  play: async ({ canvasElement }) => {
    const root = canvasElement.querySelector('canvas, svg, [role="img"]');
    if (root) root.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
  },
};

export const WithProgress: Story = {
  args: {
    value: 45,
    min: 0,
    max: 100,
    title: 'İlerleme Arkı',
    showProgress: true,
    size: 'lg',
  },
};

export const HighContrast: Story = {
  args: {
    value: 80,
    min: 0,
    max: 100,
    title: 'Yüksek Kontrast',
    theme: 'high-contrast',
    size: 'lg',
  },
};

export const ZeroValue: Story = {
  args: {
    value: 0,
    min: 0,
    max: 100,
    title: 'Minimum Değer',
    size: 'md',
  },
};

export const EdgeCase: Story = {
  name: 'Edge Case · Max Value',
  args: {
    value: 100,
    min: 0,
    max: 100,
    title: 'Maksimum Değer',
    size: 'md',
  },
};
