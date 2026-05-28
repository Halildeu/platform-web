import React, { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { AssigneePicker } from './AssigneePicker';
import type { ApprovalActor } from '../../types/approval';

const meta: Meta<typeof AssigneePicker> = {
  title: 'Components/Workflow/AssigneePicker',
  component: AssigneePicker,
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div style={{ padding: '1.5rem', maxWidth: 480 }}>
        <Story />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof AssigneePicker>;

const sample: ApprovalActor[] = [
  { id: 'u1', name: 'Alice Adams', role: 'Maintainer', email: 'alice@example.com' },
  { id: 'u2', name: 'Bob Brown', role: 'Reviewer', email: 'bob@example.com' },
  { id: 'u3', name: 'Carol Chen', role: 'Maintainer' },
  { id: 'u4', name: 'David Daniel', role: 'Approver' },
];

export const Single: Story = {
  render: () => {
    const [value, setValue] = useState<ApprovalActor | null>(null);
    return <AssigneePicker candidates={sample} value={value} onChange={setValue} />;
  },
};

export const Multi: Story = {
  render: () => {
    const [value, setValue] = useState<ApprovalActor[]>([sample[0]]);
    return (
      <AssigneePicker
        mode="multi"
        candidates={sample}
        value={value}
        onChange={setValue}
        maxVisible={3}
      />
    );
  },
};

export const FourEyesExclusion: Story = {
  render: () => {
    const [value, setValue] = useState<ApprovalActor | null>(null);
    return (
      <AssigneePicker
        candidates={sample}
        value={value}
        onChange={setValue}
        excludeIds={['u1']}
        placeholder="Onerinin sahibi listede degildir (4-eyes)"
      />
    );
  },
};

export const Disabled: Story = {
  args: {
    candidates: sample,
    value: sample[0],
    onChange: () => {},
    disabled: true,
  },
};

export const ReadonlyAccess: Story = {
  args: {
    candidates: sample,
    mode: 'multi',
    value: [sample[0], sample[1]],
    onChange: () => {},
    access: 'readonly',
  },
};
