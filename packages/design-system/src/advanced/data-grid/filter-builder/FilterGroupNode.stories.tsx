import React, { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { expect, within, userEvent } from 'storybook/test';
import { DndContext } from '@dnd-kit/core';
import { FilterGroupNode } from './FilterGroupNode';
import type { FilterGroup } from './types';
import type { ColDef } from 'ag-grid-community';

const mockColumnDefs: ColDef[] = [
  { field: 'name', headerName: 'Ad', filter: 'agTextColumnFilter' },
  { field: 'amount', headerName: 'Tutar', filter: 'agNumberColumnFilter' },
  { field: 'date', headerName: 'Tarih', filter: 'agDateColumnFilter' },
];

const sampleGroup: FilterGroup = {
  type: 'group',
  id: 'root',
  logic: 'AND',
  children: [
    {
      type: 'condition',
      id: 'c1',
      colId: 'name',
      filterType: 'text',
      operator: 'contains',
      value: 'test',
    },
    { type: 'combinator', id: 'cb1', logic: 'AND' },
    {
      type: 'condition',
      id: 'c2',
      colId: 'amount',
      filterType: 'number',
      operator: 'greaterThan',
      value: 100,
    },
  ],
};

const emptyGroup: FilterGroup = {
  type: 'group',
  id: 'empty-root',
  logic: 'AND',
  children: [],
};

const nestedGroup: FilterGroup = {
  type: 'group',
  id: 'nested-root',
  logic: 'OR',
  children: [
    {
      type: 'condition',
      id: 'n1',
      colId: 'name',
      filterType: 'text',
      operator: 'contains',
      value: 'a',
    },
    { type: 'combinator', id: 'ncb1', logic: 'OR' },
    {
      type: 'group',
      id: 'inner',
      logic: 'AND',
      children: [
        {
          type: 'condition',
          id: 'in1',
          colId: 'amount',
          filterType: 'number',
          operator: 'lessThan',
          value: 50,
        },
      ],
    },
  ],
};

const notGroup: FilterGroup = {
  ...sampleGroup,
  id: 'not-root',
  not: true,
};

const noop = () => {};

const baseArgs = {
  columnDefs: mockColumnDefs,
  depth: 0,
  isRoot: true,
  maxDepthReached: false,
  onAddCondition: noop,
  onAddGroup: noop,
  onRemoveNode: noop,
  onUpdateCondition: noop,
  onSetLogic: noop,
  onMoveNode: noop,
  onCloneNode: noop,
  onToggleLock: noop,
  onToggleNot: noop,
};

const meta: Meta<typeof FilterGroupNode> = {
  title: 'Advanced/DataGrid/FilterBuilder/FilterGroupNode',
  component: FilterGroupNode,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  argTypes: {
    depth: {
      control: { type: 'number', min: 0, max: 3 },
      description: 'Nesting depth (drives color cycle)',
    },
    isRoot: { control: 'boolean', description: 'Whether this is the top-level group' },
    maxDepthReached: {
      control: 'boolean',
      description: 'Disables "Add group" button when nesting cap is hit',
    },
  },
  decorators: [
    (Story) => (
      <DndContext>
        <div style={{ maxWidth: 720 }}>
          <Story />
        </div>
      </DndContext>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof FilterGroupNode>;

export const Default: Story = {
  args: { ...baseArgs, group: sampleGroup },
};

export const EmptyState: Story = {
  args: { ...baseArgs, group: emptyGroup },
};

export const NestedGroup: Story = {
  args: { ...baseArgs, group: nestedGroup },
};

export const NotGroup: Story = {
  args: { ...baseArgs, group: notGroup },
};

export const MaxDepthReached: Story = {
  args: { ...baseArgs, group: sampleGroup, maxDepthReached: true },
};

export const Interactive: Story = {
  render: function InteractiveStory() {
    const [group, setGroup] = useState<FilterGroup>(emptyGroup);
    let nextId = 100;
    return (
      <FilterGroupNode
        {...baseArgs}
        group={group}
        onAddCondition={() => {
          setGroup((prev) => ({
            ...prev,
            children: [
              ...prev.children,
              {
                type: 'condition',
                id: `gen-${nextId++}`,
                colId: 'name',
                filterType: 'text',
                operator: 'contains',
                value: '',
              },
            ],
          }));
        }}
      />
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // Empty group: only "Kural" / "Grup" buttons present
    const addRule = canvas.getByRole('button', { name: /Kural/ });
    await expect(addRule).toBeInTheDocument();
    // Click → onAddCondition fires → row appears
    await userEvent.click(addRule);
    // After click, at least 1 column dropdown is rendered (combobox role)
    const combos = await canvas.findAllByRole('combobox');
    await expect(combos.length).toBeGreaterThanOrEqual(1);
  },
};
