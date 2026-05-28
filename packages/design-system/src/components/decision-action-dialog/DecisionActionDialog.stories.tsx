import React, { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { DecisionActionDialog } from './DecisionActionDialog';
import type { ApprovalAction, ApprovalActor } from '../../types/approval';

const meta: Meta<typeof DecisionActionDialog> = {
  title: 'Components/Workflow/DecisionActionDialog',
  component: DecisionActionDialog,
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div style={{ padding: '1.5rem' }}>
        <Story />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof DecisionActionDialog>;

const requestSummary = {
  title: 'Release v2.1',
  target: 'platform/release-canary',
  type: 'release_gate',
};

const candidates: ApprovalActor[] = [
  { id: 'u1', name: 'Alice Adams', role: 'Maintainer' },
  { id: 'u2', name: 'Bob Brown', role: 'Reviewer' },
];

function Harness({ mode }: { mode: ApprovalAction }) {
  const [open, setOpen] = useState(true);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Diyalogu ac
      </button>
      <DecisionActionDialog
        open={open}
        mode={mode}
        requestSummary={requestSummary}
        candidates={mode === 'delegate' ? candidates : undefined}
        attestationStatement={
          mode === 'attest' ? 'Bu karari verme yetkim var ve cikar catismam yok.' : undefined
        }
        presetReasons={
          mode === 'reject'
            ? [
                { code: 'incomplete_evidence', label: 'Eksik kanit' },
                { code: 'policy_violation', label: 'Politika ihlali' },
                { code: 'duplicate', label: 'Yinelenen istek' },
              ]
            : undefined
        }
        onConfirm={(payload) => {
          // eslint-disable-next-line no-console
          console.log('confirm', payload);
          setOpen(false);
        }}
        onCancel={() => setOpen(false)}
      />
    </>
  );
}

export const Approve: Story = { render: () => <Harness mode="approve" /> };
export const Reject: Story = { render: () => <Harness mode="reject" /> };
export const Delegate: Story = { render: () => <Harness mode="delegate" /> };
export const RequestChanges: Story = { render: () => <Harness mode="request_changes" /> };
export const Attest: Story = { render: () => <Harness mode="attest" /> };
