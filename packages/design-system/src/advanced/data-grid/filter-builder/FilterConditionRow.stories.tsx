import React, { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { expect, within, userEvent } from 'storybook/test';
import { DndContext } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { FilterConditionRow } from './FilterConditionRow';
import type { FilterCondition } from './types';
import type { ColDef } from 'ag-grid-community';

const mockColumnDefs: ColDef[] = [
  { field: 'name', headerName: 'Ad', filter: 'agTextColumnFilter' },
  { field: 'age', headerName: 'Yas', filter: 'agNumberColumnFilter' },
  { field: 'date', headerName: 'Tarih', filter: 'agDateColumnFilter' },
  {
    field: 'department',
    headerName: 'Departman',
    filter: 'agSetColumnFilter',
    filterParams: { values: ['HR', 'IT', 'Finans', 'Operasyon'] },
  },
];

const baseCondition: FilterCondition = {
  type: 'condition',
  id: 'cond-1',
  colId: 'name',
  filterType: 'text',
  operator: 'contains',
  value: '',
};

const meta: Meta<typeof FilterConditionRow> = {
  title: 'Advanced/DataGrid/FilterBuilder/FilterConditionRow',
  component: FilterConditionRow,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  argTypes: {
    canRemove: { control: 'boolean', description: 'Whether the delete button is enabled' },
    parentLocked: {
      control: 'boolean',
      description: 'When parent group is locked, this row becomes read-only',
    },
  },
  decorators: [
    (Story) => (
      <DndContext>
        <SortableContext
          items={['cond-1', 'cond-locked', 'cond-num', 'cond-date', 'cond-set']}
          strategy={verticalListSortingStrategy}
        >
          <div style={{ maxWidth: 720 }}>
            <Story />
          </div>
        </SortableContext>
      </DndContext>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof FilterConditionRow>;

const noop = () => {};

export const Default: Story = {
  args: {
    condition: baseCondition,
    columnDefs: mockColumnDefs,
    onUpdate: noop,
    onRemove: noop,
    onMove: noop,
    onClone: noop,
    onToggleLock: noop,
    canRemove: true,
  },
};

export const Locked: Story = {
  args: {
    condition: { ...baseCondition, id: 'cond-locked', locked: true, value: 'test' },
    columnDefs: mockColumnDefs,
    onUpdate: noop,
    onRemove: noop,
    onMove: noop,
    onClone: noop,
    onToggleLock: noop,
    canRemove: true,
  },
};

export const NumberCondition: Story = {
  args: {
    condition: {
      type: 'condition',
      id: 'cond-num',
      colId: 'age',
      filterType: 'number',
      operator: 'greaterThan',
      value: 30,
    },
    columnDefs: mockColumnDefs,
    onUpdate: noop,
    onRemove: noop,
    onMove: noop,
    onClone: noop,
    onToggleLock: noop,
    canRemove: true,
  },
};

export const DateCondition: Story = {
  args: {
    condition: {
      type: 'condition',
      id: 'cond-date',
      colId: 'date',
      filterType: 'date',
      operator: 'equals',
      value: '2026-04-28',
    },
    columnDefs: mockColumnDefs,
    onUpdate: noop,
    onRemove: noop,
    onMove: noop,
    onClone: noop,
    onToggleLock: noop,
    canRemove: true,
  },
};

export const SetCondition: Story = {
  args: {
    condition: {
      type: 'condition',
      id: 'cond-set',
      colId: 'department',
      filterType: 'set',
      operator: 'in',
      value: ['HR', 'IT'],
    },
    columnDefs: mockColumnDefs,
    onUpdate: noop,
    onRemove: noop,
    onMove: noop,
    onClone: noop,
    onToggleLock: noop,
    canRemove: true,
  },
};

export const Interactive: Story = {
  render: function InteractiveStory() {
    const [cond, setCond] = useState<FilterCondition>(baseCondition);
    return (
      <FilterConditionRow
        condition={cond}
        columnDefs={mockColumnDefs}
        onUpdate={(_id, updates) => setCond((prev) => ({ ...prev, ...updates }))}
        onRemove={noop}
        onMove={noop}
        onClone={noop}
        onToggleLock={noop}
        canRemove
      />
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // Two combobox selects render: Column dropdown + Operator dropdown
    const selects = canvas.getAllByRole('combobox');
    await expect(selects.length).toBeGreaterThanOrEqual(2);
    // Column dropdown defaults to "name"
    await expect(selects[0]).toHaveValue('name');
    // Switch to age column → triggers onUpdate
    await userEvent.selectOptions(selects[0], 'age');
    await expect(selects[0]).toHaveValue('age');
  },
};
