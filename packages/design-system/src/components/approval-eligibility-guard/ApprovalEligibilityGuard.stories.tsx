import React, { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { ApprovalEligibilityGuard } from './ApprovalEligibilityGuard';
import type { EligibilityReason } from '../../types/approval';

const meta: Meta<typeof ApprovalEligibilityGuard> = {
  title: 'Components/Workflow/ApprovalEligibilityGuard',
  component: ApprovalEligibilityGuard,
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div style={{ padding: '1.5rem', maxWidth: 520 }}>
        <Story />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof ApprovalEligibilityGuard>;

const proposerSelf: EligibilityReason = {
  code: 'proposer_self',
  message: 'Kendi onerinizi onaylayamazsiniz (4-eyes ilkesi).',
};

const tierMismatch: EligibilityReason = {
  code: 'tier_mismatch',
  message: 'Bu kademe icin yetkin yetersiz.',
  helpUrl: 'https://design.mfe.dev/governance/tier-policy',
};

const delegateConflict: EligibilityReason = {
  code: 'delegate_conflict',
  message: 'Aktif devir politikaniz sizi bu istekten dislyor.',
};

export const Eligible: Story = {
  render: () => (
    <ApprovalEligibilityGuard reasons={[]}>
      <button type="button">Onayla</button>
    </ApprovalEligibilityGuard>
  ),
};

export const InlineBlocked: Story = {
  render: () => (
    <ApprovalEligibilityGuard reasons={[proposerSelf]}>
      <button type="button">Onayla</button>
    </ApprovalEligibilityGuard>
  ),
};

export const BannerWithSingleReason: Story = {
  render: () => (
    <ApprovalEligibilityGuard reasons={[tierMismatch]} variant="banner">
      <button type="button">Onayla</button>
    </ApprovalEligibilityGuard>
  ),
};

export const BannerWithMultipleReasons: Story = {
  render: () => (
    <ApprovalEligibilityGuard
      reasons={[proposerSelf, tierMismatch, delegateConflict]}
      variant="banner"
      bannerTitle="Onaylama yetkin yok"
    >
      <button type="button">Onayla</button>
    </ApprovalEligibilityGuard>
  ),
};

export const ToggleBlocked: Story = {
  render: () => {
    const [blocked, setBlocked] = useState(true);
    return (
      <div className="flex flex-col gap-3">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={blocked} onChange={(e) => setBlocked(e.target.checked)} />
          Yetkisiz simulasyonu
        </label>
        <ApprovalEligibilityGuard
          reasons={blocked ? [proposerSelf] : []}
          onBlocked={(info) => console.log('blocked event', info.reasons)}
        >
          <button type="button">Onayla</button>
        </ApprovalEligibilityGuard>
      </div>
    );
  },
};
