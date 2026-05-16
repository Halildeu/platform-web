// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

import { ApprovalWorkflow } from '../ApprovalWorkflow';
import type { ApprovalStep } from '../ApprovalWorkflow';
import { expectNoA11yViolations } from '../../../__tests__/a11y-utils';

describe('ApprovalWorkflow', () => {
  const steps = [
    { id: '1', label: 'Submit', status: 'approved' as const },
    { id: '2', label: 'Review', status: 'in-review' as const },
    { id: '3', label: 'Approve', status: 'pending' as const },
  ];

  it('renders steps', () => {
    const { container } = render(<ApprovalWorkflow steps={steps} />);
    expect(container.textContent).toContain('Submit');
    expect(container.textContent).toContain('Review');
  });

  it('access="hidden" renders nothing', () => {
    const { container } = render(<ApprovalWorkflow steps={steps} access="hidden" />);
    expect(container.innerHTML).toBe('');
  });

  it('has no accessibility violations', async () => {
    const { container } = render(<ApprovalWorkflow steps={steps} />);
    await expectNoA11yViolations(container);
  });

  it('has accessible ARIA structure', () => {
    const { container } = render(<ApprovalWorkflow steps={steps} />);
    const items = screen.getAllByRole('listitem');
    expect(items.length).toBeGreaterThan(0);
    expect(container.querySelector('[aria-current="step"]')).toBeTruthy();
  });

  // ---------------------------------------------------------------------
  // ApprovalWorkflow — uncovered branches
  // ---------------------------------------------------------------------

  const richSteps: ApprovalStep[] = [
    {
      id: '1',
      label: 'Manager Review',
      status: 'approved',
      assignee: { id: 'a1', name: 'Alice Bob', avatarUrl: 'https://example.com/a.png' },
      timestamp: '2025-01-15T10:30:00Z',
      comment: 'Looks good',
    },
    {
      id: '2',
      label: 'Director Review',
      status: 'in-review',
      assignee: { id: 'a2', name: 'Charlie Delta', initials: 'CD' },
      timestamp: '2025-01-16T14:00:00Z',
    },
    {
      id: '3',
      label: 'VP Approval',
      status: 'pending',
      assignee: { id: 'a3', name: 'Eve' },
    },
    {
      id: '4',
      label: 'Skipped Step',
      status: 'skipped',
    },
  ];

  it('renders all steps with connectors', () => {
    render(<ApprovalWorkflow steps={richSteps} orientation="horizontal" />);
    expect(screen.getByText('Manager Review')).toBeTruthy();
    expect(screen.getByText('VP Approval')).toBeTruthy();
  });

  it('renders vertical orientation', () => {
    render(<ApprovalWorkflow steps={richSteps} orientation="vertical" />);
    expect(screen.getByText('Director Review')).toBeTruthy();
  });

  it('auto-detects current step (first pending/in-review)', () => {
    render(
      <ApprovalWorkflow
        steps={richSteps}
        onApprove={vi.fn()}
        onReject={vi.fn()}
        onDelegate={vi.fn()}
      />,
    );
    // "Director Review" is in-review, so it should be current with action buttons
    expect(screen.getByText('Approve')).toBeTruthy();
    expect(screen.getByText('Reject')).toBeTruthy();
    expect(screen.getByText('Delegate')).toBeTruthy();
  });

  it('handles approve action on current step', () => {
    const onApprove = vi.fn();
    render(<ApprovalWorkflow steps={richSteps} onApprove={onApprove} />);
    fireEvent.click(screen.getByText('Approve'));
    expect(onApprove).toHaveBeenCalledWith('2');
  });

  it('handles reject flow — open textarea, type, confirm', async () => {
    const onReject = vi.fn();
    render(<ApprovalWorkflow steps={richSteps} onReject={onReject} />);
    fireEvent.click(screen.getByText('Reject'));
    // Textarea appears
    const textarea = await screen.findByLabelText('Rejection reason');
    fireEvent.change(textarea, { target: { value: 'Not complete' } });
    fireEvent.click(screen.getByText('Confirm Reject'));
    expect(onReject).toHaveBeenCalledWith('2', 'Not complete');
  });

  it('handles reject cancel', async () => {
    const onReject = vi.fn();
    render(<ApprovalWorkflow steps={richSteps} onReject={onReject} />);
    fireEvent.click(screen.getByText('Reject'));
    await screen.findByLabelText('Rejection reason');
    fireEvent.click(screen.getByText('Cancel'));
    expect(onReject).not.toHaveBeenCalled();
  });

  it('rejects confirm is disabled when comment is empty', async () => {
    const onReject = vi.fn();
    render(<ApprovalWorkflow steps={richSteps} onReject={onReject} />);
    fireEvent.click(screen.getByText('Reject'));
    const confirmBtn = await screen.findByText('Confirm Reject');
    expect(confirmBtn).toHaveProperty('disabled', true);
  });

  it('handles delegate flow — input, type, confirm', async () => {
    const onDelegate = vi.fn();
    render(<ApprovalWorkflow steps={richSteps} onDelegate={onDelegate} />);
    fireEvent.click(screen.getByText('Delegate'));
    const input = await screen.findByLabelText('New assignee');
    fireEvent.change(input, { target: { value: 'new-person@example.com' } });
    fireEvent.click(screen.getByText('Confirm Delegate'));
    expect(onDelegate).toHaveBeenCalledWith('2', 'new-person@example.com');
  });

  it('delegate input supports Enter key', async () => {
    const onDelegate = vi.fn();
    render(<ApprovalWorkflow steps={richSteps} onDelegate={onDelegate} />);
    fireEvent.click(screen.getByText('Delegate'));
    const input = await screen.findByLabelText('New assignee');
    fireEvent.change(input, { target: { value: 'person@co.com' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onDelegate).toHaveBeenCalledWith('2', 'person@co.com');
  });

  it('delegate cancel resets state', async () => {
    const onDelegate = vi.fn();
    render(<ApprovalWorkflow steps={richSteps} onDelegate={onDelegate} />);
    fireEvent.click(screen.getByText('Delegate'));
    await screen.findByLabelText('New assignee');
    // There should be two Cancel buttons (one per action box)
    const cancelBtns = screen.getAllByText('Cancel');
    fireEvent.click(cancelBtns[cancelBtns.length - 1]);
    expect(onDelegate).not.toHaveBeenCalled();
  });

  it('returns null when access="hidden"', () => {
    const { container } = render(<ApprovalWorkflow steps={richSteps} access="hidden" />);
    expect(container.innerHTML).toBe('');
  });

  it('compact mode hides timestamps and comments', () => {
    render(<ApprovalWorkflow steps={richSteps} compact />);
    // The timestamp and comment should not be rendered
    expect(screen.queryByText('Looks good')).toBeNull();
  });

  it('disabled access prevents actions', () => {
    render(
      <ApprovalWorkflow
        steps={richSteps}
        access="disabled"
        onApprove={vi.fn()}
        accessReason="No permission"
      />,
    );
    // Approve button should not be rendered because canAct is false
    expect(screen.queryByText('Approve')).toBeNull();
  });

  it('handles all steps completed — activeIndex falls to last', () => {
    const completedSteps: ApprovalStep[] = [
      { id: '1', label: 'Step 1', status: 'approved' },
      { id: '2', label: 'Step 2', status: 'approved' },
    ];
    render(<ApprovalWorkflow steps={completedSteps} />);
    expect(screen.getByText('Step 2')).toBeTruthy();
  });

  it('renders avatar with avatarUrl', () => {
    render(<ApprovalWorkflow steps={richSteps} />);
    const img = document.querySelector('img[alt="Alice Bob"]');
    expect(img).toBeTruthy();
  });

  it('renders avatar initials when no avatarUrl', () => {
    render(<ApprovalWorkflow steps={richSteps} />);
    // 'Charlie Delta' has initials='CD' provided
    expect(screen.getByText('CD')).toBeTruthy();
  });

  it('formatTimestamp handles invalid date gracefully', () => {
    const stepsWithBadDate: ApprovalStep[] = [
      { id: '1', label: 'Step', status: 'pending', timestamp: 'not-a-date' },
    ];
    // Should not throw
    render(<ApprovalWorkflow steps={stepsWithBadDate} />);
    expect(screen.getByText('Step')).toBeTruthy();
  });
});
