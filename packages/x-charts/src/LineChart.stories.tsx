/**
 * Storybook stories — LineChart
 *
 * Per-component story file (sibling to LineChart.tsx) for the M4 Quality
 * Sprint storyCompleteness gate.
 */
import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { LineChart } from './LineChart';

const categories = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran'];
const values1 = [320, 332, 301, 334, 390, 330];
const values2 = [220, 182, 191, 234, 290, 330];

const meta: Meta<typeof LineChart> = {
  title: 'x-charts/LineChart',
  component: LineChart,
  parameters: { layout: 'padded' },
  argTypes: {
    size: { control: 'select', options: ['sm', 'md', 'lg'] },
    theme: { control: 'select', options: ['auto', 'light', 'dark', 'high-contrast', 'print'] },
    animate: { control: 'boolean' },
    showDots: { control: 'boolean' },
    showLegend: { control: 'boolean' },
    showArea: { control: 'boolean' },
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
type Story = StoryObj<typeof LineChart>;

export const Default: Story = {
  args: {
    series: [
      { name: 'Seri A', data: values1 },
      { name: 'Seri B', data: values2 },
    ],
    labels: categories,
    title: 'Trend Analizi',
    showDots: true,
    showLegend: true,
    size: 'lg',
  },
  play: async ({ canvasElement }) => {
    const root = canvasElement.querySelector('canvas, svg, [role="img"]');
    if (root) root.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
  },
};

export const Curved: Story = {
  args: {
    series: [{ name: 'Bezier', data: values1 }],
    labels: categories,
    title: 'Bezier Eğrisi',
    curved: true,
    showDots: true,
    size: 'lg',
  },
};

export const WithArea: Story = {
  args: {
    series: [{ name: 'Doldurulmuş Alan', data: values1 }],
    labels: categories,
    title: 'Alan Doldurmalı Çizgi',
    showArea: true,
    showDots: false,
    size: 'lg',
  },
};

export const SinglePoint: Story = {
  args: {
    series: [{ name: 'Tek Nokta', data: [42] }],
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
