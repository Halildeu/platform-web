import React, { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { expect, within, userEvent } from 'storybook/test';
import { FilterCombinatorRow } from './FilterCombinatorRow';
import type { FilterCombinator } from './types';

const meta: Meta<typeof FilterCombinatorRow> = {
  title: 'Advanced/DataGrid/FilterBuilder/FilterCombinatorRow',
  component: FilterCombinatorRow,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  argTypes: {
    disabled: {
      control: 'boolean',
      description: 'When parent group is locked, this combinator becomes read-only',
    },
    onSetLogic: {
      action: 'setLogic',
      description: 'Called with (id, "AND" | "OR") when toggle is clicked',
    },
  },
  decorators: [
    (Story) => (
      <div style={{ width: 400, padding: 16 }}>
        <Story />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof FilterCombinatorRow>;

const andCombinator: FilterCombinator = { type: 'combinator', id: 'c-and', logic: 'AND' };
const orCombinator: FilterCombinator = { type: 'combinator', id: 'c-or', logic: 'OR' };

export const Default: Story = {
  args: {
    combinator: andCombinator,
    onSetLogic: () => {},
  },
};

export const OrLogic: Story = {
  args: {
    combinator: orCombinator,
    onSetLogic: () => {},
  },
};

export const Disabled: Story = {
  args: {
    combinator: andCombinator,
    onSetLogic: () => {},
    disabled: true,
  },
};

export const DisabledOr: Story = {
  args: {
    combinator: orCombinator,
    onSetLogic: () => {},
    disabled: true,
  },
};

export const Interactive: Story = {
  render: function InteractiveStory() {
    const [logic, setLogic] = useState<'AND' | 'OR'>('AND');
    return (
      <FilterCombinatorRow
        combinator={{ type: 'combinator', id: 'interactive', logic }}
        onSetLogic={(_id, next) => setLogic(next)}
      />
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // Initial: AND label visible
    const toggle = canvas.getByRole('button', { name: /VE/ });
    await expect(toggle).toBeInTheDocument();
    // Click → switches to OR (label changes to VEYA)
    await userEvent.click(toggle);
    const next = await canvas.findByRole('button', { name: /VEYA/ });
    await expect(next).toBeInTheDocument();
  },
};
