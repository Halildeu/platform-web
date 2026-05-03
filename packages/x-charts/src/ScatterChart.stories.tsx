/**
 * Storybook stories — ScatterChart
 *
 * Per-component story file (sibling to ScatterChart.tsx) for the M4 Quality
 * Sprint storyCompleteness gate.
 */
import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { ScatterChart } from './ScatterChart';

const categories = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran'];
const values1 = [320, 332, 301, 334, 390, 330];
const values2 = [220, 182, 191, 234, 290, 330];
const sampleData = values1.map((v, i) => ({ x: v, y: values2[i], label: categories[i] }));

const meta: Meta<typeof ScatterChart> = {
  title: 'x-charts/ScatterChart',
  component: ScatterChart,
  parameters: { layout: 'padded' },
  argTypes: {
    size: { control: 'select', options: ['sm', 'md', 'lg'] },
    theme: { control: 'select', options: ['auto', 'light', 'dark', 'high-contrast', 'print'] },
    animate: { control: 'boolean' },
    bubble: { control: 'boolean' },
    showGrid: { control: 'boolean' },
    showLegend: { control: 'boolean' },
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
type Story = StoryObj<typeof ScatterChart>;

export const Default: Story = {
  args: {
    data: sampleData,
    title: 'Korelasyon',
    xLabel: 'Seri A',
    yLabel: 'Seri B',
    size: 'lg',
  },
  play: async ({ canvasElement }) => {
    const root = canvasElement.querySelector('canvas, svg, [role="img"]');
    if (root) root.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
  },
};

export const Bubble: Story = {
  args: {
    data: values1.map((v, i) => ({
      x: v,
      y: values2[i],
      size: 10 + (i % 4) * 6,
      label: categories[i],
    })),
    title: 'Baloncuk Modu',
    bubble: true,
    xLabel: 'Seri A',
    yLabel: 'Seri B',
    size: 'lg',
  },
};

export const HighContrast: Story = {
  args: {
    data: sampleData,
    title: 'Yüksek Kontrast',
    theme: 'high-contrast',
    size: 'lg',
  },
};

export const SinglePoint: Story = {
  args: {
    data: [{ x: 50, y: 75, label: 'Tek Nokta' }],
    title: 'Tek Veri Noktası',
    size: 'md',
  },
};

export const EdgeCase: Story = {
  name: 'Edge Case · Empty Data',
  args: {
    data: [],
    title: 'Veri yok durumu',
    size: 'md',
  },
};
