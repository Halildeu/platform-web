/**
 * Storybook stories — HeatmapChart
 *
 * Per-component story file (sibling to HeatmapChart.tsx) for the M4
 * Quality Sprint storyCompleteness gate.
 */
import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { HeatmapChart } from './HeatmapChart';

const tupleData: [number, number, number][] = [
  [0, 0, 10],
  [0, 1, 22],
  [0, 2, 28],
  [1, 0, 35],
  [1, 1, 42],
  [1, 2, 18],
  [2, 0, 15],
  [2, 1, 30],
  [2, 2, 45],
  [3, 0, 50],
  [3, 1, 12],
  [3, 2, 33],
  [4, 0, 25],
  [4, 1, 38],
  [4, 2, 20],
];

const meta: Meta<typeof HeatmapChart> = {
  title: 'x-charts/HeatmapChart',
  component: HeatmapChart,
  parameters: { layout: 'padded' },
  argTypes: {
    size: { control: 'select', options: ['sm', 'md', 'lg'] },
    theme: { control: 'select', options: ['auto', 'light', 'dark', 'high-contrast', 'print'] },
    animate: { control: 'boolean' },
    showValues: { control: 'boolean' },
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
type Story = StoryObj<typeof HeatmapChart>;

export const Default: Story = {
  args: {
    data: tupleData,
    xLabels: ['Pzt', 'Sal', 'Çar', 'Per', 'Cum'],
    yLabels: ['Sabah', 'Öğle', 'Akşam'],
    title: 'Yoğunluk Matrisi',
    showValues: true,
    size: 'lg',
  },
  play: async ({ canvasElement }) => {
    const root = canvasElement.querySelector('canvas, svg, [role="img"]');
    if (root) root.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
  },
};

export const ObjectShape: Story = {
  args: {
    data: [
      { x: 'Pzt', y: 'Sabah', value: 12 },
      { x: 'Pzt', y: 'Öğle', value: 30 },
      { x: 'Sal', y: 'Sabah', value: 22 },
      { x: 'Sal', y: 'Öğle', value: 18 },
    ],
    xLabels: ['Pzt', 'Sal'],
    yLabels: ['Sabah', 'Öğle'],
    title: 'Nesne Şekli Veri',
    showValues: true,
    size: 'lg',
  },
};

export const HighContrast: Story = {
  args: {
    data: tupleData,
    xLabels: ['Pzt', 'Sal', 'Çar', 'Per', 'Cum'],
    yLabels: ['Sabah', 'Öğle', 'Akşam'],
    title: 'Yüksek Kontrast',
    theme: 'high-contrast',
    showValues: true,
    size: 'lg',
  },
};

export const SingleCell: Story = {
  args: {
    data: [[0, 0, 42]] as [number, number, number][],
    xLabels: ['Pzt'],
    yLabels: ['Sabah'],
    title: 'Tek Hücre',
    showValues: true,
    size: 'md',
  },
};

export const EdgeCase: Story = {
  name: 'Edge Case · Empty Data',
  args: {
    data: [],
    xLabels: [],
    yLabels: [],
    title: 'Veri yok durumu',
    size: 'md',
  },
};
