/**
 * Storybook stories — WaterfallChart
 *
 * Per-component story file (sibling to WaterfallChart.tsx) for the M4
 * Quality Sprint storyCompleteness gate.
 */
import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { WaterfallChart } from './WaterfallChart';

const flowData = [
  { label: 'Başlangıç', value: 1000 },
  { label: 'Gelir', value: 300 },
  { label: 'Hizmet', value: 200 },
  { label: 'Gider', value: -150 },
  { label: 'Vergi', value: -100 },
  { label: 'Sonuç', value: 1250 },
];

const meta: Meta<typeof WaterfallChart> = {
  title: 'x-charts/WaterfallChart',
  component: WaterfallChart,
  parameters: { layout: 'padded' },
  argTypes: {
    size: { control: 'select', options: ['sm', 'md', 'lg'] },
    theme: { control: 'select', options: ['auto', 'light', 'dark', 'high-contrast', 'print'] },
    orientation: { control: 'inline-radio', options: ['vertical', 'horizontal'] },
    animate: { control: 'boolean' },
    showValues: { control: 'boolean' },
    showConnector: { control: 'boolean' },
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
type Story = StoryObj<typeof WaterfallChart>;

export const Default: Story = {
  args: {
    data: flowData,
    title: 'Gelir Akışı',
    showValues: true,
    size: 'lg',
  },
  play: async ({ canvasElement }) => {
    const root = canvasElement.querySelector('canvas, svg, [role="img"]');
    if (root) root.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
  },
};

export const Horizontal: Story = {
  args: {
    data: flowData,
    title: 'Yatay Akış',
    orientation: 'horizontal',
    showValues: true,
    size: 'lg',
  },
};

export const HighContrast: Story = {
  args: {
    data: flowData,
    title: 'Yüksek Kontrast',
    theme: 'high-contrast',
    showValues: true,
    size: 'lg',
  },
};

export const SinglePoint: Story = {
  args: {
    data: [{ label: 'Tek Adım', value: 500 }],
    title: 'Tek Veri Noktası',
    showValues: true,
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
