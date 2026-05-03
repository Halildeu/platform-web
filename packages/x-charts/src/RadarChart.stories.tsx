/**
 * Storybook stories — RadarChart
 *
 * Per-component story file (sibling to RadarChart.tsx) for the M4 Quality
 * Sprint storyCompleteness gate.
 */
import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { RadarChart } from './RadarChart';

const indicators = [
  { name: 'Satış', max: 100 },
  { name: 'Pazarlama', max: 100 },
  { name: 'Teknoloji', max: 100 },
  { name: 'Destek', max: 100 },
  { name: 'Geliştirme', max: 100 },
];

const meta: Meta<typeof RadarChart> = {
  title: 'x-charts/RadarChart',
  component: RadarChart,
  parameters: { layout: 'padded' },
  argTypes: {
    size: { control: 'select', options: ['sm', 'md', 'lg'] },
    theme: { control: 'select', options: ['auto', 'light', 'dark', 'high-contrast', 'print'] },
    shape: { control: 'inline-radio', options: ['polygon', 'circle'] },
    animate: { control: 'boolean' },
    showArea: { control: 'boolean' },
    showLegend: { control: 'boolean' },
    showLabels: { control: 'boolean' },
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
type Story = StoryObj<typeof RadarChart>;

export const Default: Story = {
  args: {
    indicators,
    series: [
      { name: 'Ekip A', data: [85, 70, 95, 60, 80] },
      { name: 'Ekip B', data: [65, 90, 70, 85, 55] },
    ],
    title: 'Performans Profili',
    showLegend: true,
    size: 'lg',
  },
  play: async ({ canvasElement }) => {
    const root = canvasElement.querySelector('canvas, svg, [role="img"]');
    if (root) root.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
  },
};

export const CircleShape: Story = {
  args: {
    indicators,
    series: [{ name: 'Ekip A', data: [85, 70, 95, 60, 80] }],
    title: 'Dairesel Şekil',
    shape: 'circle',
    size: 'lg',
  },
};

export const FilledArea: Story = {
  args: {
    indicators,
    series: [{ name: 'Doldurulmuş', data: [70, 80, 85, 75, 90] }],
    title: 'Alan Doldurma',
    showArea: true,
    size: 'lg',
  },
};

export const SingleSeries: Story = {
  args: {
    indicators,
    series: [{ name: 'Tek Seri', data: [50, 60, 70, 80, 90] }],
    title: 'Tek Seri',
    size: 'md',
  },
};

export const EdgeCase: Story = {
  name: 'Edge Case · Empty Series',
  args: {
    indicators,
    series: [],
    title: 'Veri yok durumu',
    size: 'md',
  },
};
