import React, { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { expect, within, userEvent } from 'storybook/test';
import { FilterValueEditor } from './FilterValueEditor';
import type { FilterType } from './types';

const meta: Meta<typeof FilterValueEditor> = {
  title: 'Advanced/DataGrid/FilterBuilder/FilterValueEditor',
  component: FilterValueEditor,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  argTypes: {
    filterType: {
      control: 'select',
      options: ['text', 'number', 'date', 'set'] satisfies FilterType[],
      description: 'Drives which input variant renders',
    },
    operator: {
      control: 'text',
      description: 'Filter operator (e.g. contains, greaterThan, inRange, blank)',
    },
    disabled: { control: 'boolean', description: 'Disables the input' },
  },
  decorators: [
    (Story) => (
      <div style={{ width: 360, padding: 16 }}>
        <Story />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof FilterValueEditor>;

export const TextInput: Story = {
  render: () => {
    const [value, setValue] = useState<unknown>('');
    return (
      <FilterValueEditor
        filterType="text"
        operator="contains"
        value={value}
        onChange={(v) => setValue(v)}
      />
    );
  },
};

export const NumberInput: Story = {
  render: () => {
    const [value, setValue] = useState<unknown>(null);
    return (
      <FilterValueEditor
        filterType="number"
        operator="greaterThan"
        value={value}
        onChange={(v) => setValue(v)}
      />
    );
  },
};

export const NumberRange: Story = {
  render: () => {
    const [value, setValue] = useState<unknown>(10);
    const [valueTo, setValueTo] = useState<unknown>(100);
    return (
      <FilterValueEditor
        filterType="number"
        operator="inRange"
        value={value}
        valueTo={valueTo}
        onChange={(v, vt) => {
          setValue(v);
          setValueTo(vt);
        }}
      />
    );
  },
};

export const DateInput: Story = {
  render: () => {
    const [value, setValue] = useState<unknown>('');
    return (
      <FilterValueEditor
        filterType="date"
        operator="equals"
        value={value}
        onChange={(v) => setValue(v)}
      />
    );
  },
};

export const SetInput: Story = {
  render: () => {
    const [value, setValue] = useState<unknown>([]);
    return (
      <FilterValueEditor
        filterType="set"
        operator="in"
        value={value}
        setValues={['HR', 'Finans', 'IT', 'Operasyon', 'Pazarlama']}
        onChange={(v) => setValue(v)}
      />
    );
  },
};

export const BlankOperator: Story = {
  render: () => (
    <FilterValueEditor filterType="text" operator="blank" value="" onChange={() => {}} />
  ),
};

export const Interactive: Story = {
  render: function InteractiveStory() {
    const [value, setValue] = useState<unknown>('');
    return (
      <FilterValueEditor
        filterType="text"
        operator="contains"
        value={value}
        onChange={(v) => setValue(v)}
      />
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole('textbox');
    await expect(input).toBeInTheDocument();
    await userEvent.type(input, 'hello');
    await expect(input).toHaveValue('hello');
  },
};
