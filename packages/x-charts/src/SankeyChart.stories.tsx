/**
 * Storybook stories — SankeyChart
 *
 * Per-component story file (sibling to SankeyChart.tsx) for the M4
 * Quality Sprint storyCompleteness gate.
 */
import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { SankeyChart } from './SankeyChart';

const sampleNodes = [
  { name: 'Kaynak A' },
  { name: 'Kaynak B' },
  { name: 'Hedef X' },
  { name: 'Hedef Y' },
];

const sampleLinks = [
  { source: 'Kaynak A', target: 'Hedef X', value: 30 },
  { source: 'Kaynak A', target: 'Hedef Y', value: 20 },
  { source: 'Kaynak B', target: 'Hedef X', value: 10 },
  { source: 'Kaynak B', target: 'Hedef Y', value: 40 },
];

const meta: Meta<typeof SankeyChart> = {
  title: 'x-charts/SankeyChart',
  component: SankeyChart,
  parameters: { layout: 'padded' },
  argTypes: {
    size: { control: 'select', options: ['sm', 'md', 'lg'] },
    theme: { control: 'select', options: ['auto', 'light', 'dark', 'high-contrast', 'print'] },
    orient: { control: 'inline-radio', options: ['horizontal', 'vertical'] },
    lineStyle: { control: 'inline-radio', options: ['gradient', 'source', 'target'] },
    animate: { control: 'boolean' },
    draggable: { control: 'boolean' },
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
type Story = StoryObj<typeof SankeyChart>;

export const Default: Story = {
  args: {
    nodes: sampleNodes,
    links: sampleLinks,
    title: 'Akış Diyagramı',
    size: 'lg',
  },
  play: async ({ canvasElement }) => {
    const root = canvasElement.querySelector('canvas, svg, [role="img"]');
    if (root) root.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
  },
};

export const Vertical: Story = {
  args: {
    nodes: sampleNodes,
    links: sampleLinks,
    title: 'Dikey Yerleşim',
    orient: 'vertical',
    size: 'lg',
  },
};

export const SourceColored: Story = {
  args: {
    nodes: sampleNodes,
    links: sampleLinks,
    title: 'Kaynak Renkli Bağlantılar',
    lineStyle: 'source',
    size: 'lg',
  },
};

export const SingleLink: Story = {
  args: {
    nodes: [{ name: 'Kaynak' }, { name: 'Hedef' }],
    links: [{ source: 'Kaynak', target: 'Hedef', value: 100 }],
    title: 'Tek Bağlantı',
    size: 'md',
  },
};

export const EdgeCase: Story = {
  name: 'Edge Case · Empty Graph',
  args: {
    nodes: [],
    links: [],
    title: 'Veri yok durumu',
    size: 'md',
  },
};
