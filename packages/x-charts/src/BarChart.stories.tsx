/**
 * Storybook stories — BarChart
 *
 * Per-component story file (sibling to BarChart.tsx) for the M4 Quality
 * Sprint storyCompleteness gate. The bulk catalog at
 * `__stories__/AllChartTypes.stories.tsx` is preserved untouched; this
 * file adds CSF3 meta + autodocs + variant coverage so the scorecard
 * resolves `BarChart.stories.tsx` adjacent to `BarChart.tsx`.
 */
import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { BarChart } from './BarChart';

const categories = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran'];
const values1 = [320, 332, 301, 334, 390, 330];
const sampleData = categories.map((c, i) => ({ label: c, value: values1[i] }));

const meta: Meta<typeof BarChart> = {
  title: 'x-charts/BarChart',
  component: BarChart,
  parameters: { layout: 'padded' },
  argTypes: {
    size: { control: 'select', options: ['sm', 'md', 'lg'] },
    theme: { control: 'select', options: ['auto', 'light', 'dark', 'high-contrast', 'print'] },
    orientation: { control: 'inline-radio', options: ['vertical', 'horizontal'] },
    animate: { control: 'boolean' },
    showValues: { control: 'boolean' },
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
type Story = StoryObj<typeof BarChart>;

export const Default: Story = {
  args: {
    data: sampleData,
    title: 'Aylık Gelir',
    showValues: true,
    showGrid: true,
    size: 'lg',
  },
  play: async ({ canvasElement }) => {
    const root = canvasElement.querySelector('[data-testid="bar-chart"], canvas, svg');
    if (root) root.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
  },
};

export const Horizontal: Story = {
  args: {
    data: sampleData,
    title: 'Yatay Çubuk Grafik',
    orientation: 'horizontal',
    showValues: true,
    size: 'lg',
  },
};

export const HighContrast: Story = {
  args: {
    data: sampleData,
    title: 'Yüksek Kontrast',
    theme: 'high-contrast',
    showValues: true,
    size: 'lg',
  },
};

export const SinglePoint: Story = {
  args: {
    data: [{ label: 'Toplam', value: 1042 }],
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
