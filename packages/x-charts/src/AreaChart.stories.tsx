/**
 * Storybook stories — AreaChart
 *
 * Per-component story file (sibling to AreaChart.tsx) for the M4 Quality
 * Sprint storyCompleteness gate.
 */
import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { AreaChart } from './AreaChart';

const categories = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran'];
const values1 = [320, 332, 301, 334, 390, 330];
const values2 = [220, 182, 191, 234, 290, 330];

const meta: Meta<typeof AreaChart> = {
  title: 'x-charts/AreaChart',
  component: AreaChart,
  parameters: { layout: 'padded' },
  argTypes: {
    size: { control: 'select', options: ['sm', 'md', 'lg'] },
    theme: { control: 'select', options: ['auto', 'light', 'dark', 'high-contrast', 'print'] },
    animate: { control: 'boolean' },
    stacked: { control: 'boolean' },
    showDots: { control: 'boolean' },
    showLegend: { control: 'boolean' },
    gradient: { control: 'boolean' },
    curved: { control: 'boolean' },
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
type Story = StoryObj<typeof AreaChart>;

export const Default: Story = {
  args: {
    series: [
      { name: 'Gelir', data: values1 },
      { name: 'Gider', data: values2 },
    ],
    labels: categories,
    title: 'Kümülatif Gösterim',
    stacked: true,
    showLegend: true,
    size: 'lg',
  },
  play: async ({ canvasElement }) => {
    const root = canvasElement.querySelector('canvas, svg, [role="img"]');
    if (root) root.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
  },
};

export const Unstacked: Story = {
  args: {
    series: [
      { name: 'Gelir', data: values1 },
      { name: 'Gider', data: values2 },
    ],
    labels: categories,
    title: 'Yığınlanmamış Alan',
    stacked: false,
    showLegend: true,
    size: 'lg',
  },
};

export const Curved: Story = {
  args: {
    series: [{ name: 'Bezier Alan', data: values1 }],
    labels: categories,
    title: 'Bezier Eğrili Alan',
    curved: true,
    gradient: true,
    size: 'lg',
  },
};

export const SinglePoint: Story = {
  args: {
    series: [{ name: 'Tek Nokta', data: [120] }],
    labels: ['Bugün'],
    title: 'Tek Veri Noktası',
    size: 'md',
  },
};

export const EdgeCase: Story = {
  name: 'Edge Case · Empty Series',
  args: {
    series: [],
    labels: [],
    title: 'Veri yok durumu',
    size: 'md',
  },
};
