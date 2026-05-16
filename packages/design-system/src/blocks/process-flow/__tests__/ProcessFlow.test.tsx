// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

import { ProcessFlow } from '../ProcessFlow';
import { expectNoA11yViolations } from '../../../__tests__/a11y-utils';

describe('ProcessFlow', () => {
  it('renders nodes', () => {
    const nodes = [
      { id: '1', type: 'start' as const, label: 'Begin' },
      { id: '2', type: 'task' as const, label: 'Process' },
      { id: '3', type: 'end' as const, label: 'Done' },
    ];
    const edges = [
      { from: '1', to: '2' },
      { from: '2', to: '3' },
    ];
    const { container } = render(<ProcessFlow nodes={nodes} edges={edges} />);
    expect(container.textContent).toContain('Begin');
  });

  it('fires onNodeClick when node is clicked', () => {
    const onClick = vi.fn();
    const nodes = [
      { id: '1', type: 'start' as const, label: 'Begin' },
      { id: '2', type: 'end' as const, label: 'Done' },
    ];
    const edges = [{ from: '1', to: '2' }];
    render(<ProcessFlow nodes={nodes} edges={edges} onNodeClick={onClick} />);
    fireEvent.click(screen.getByText('Begin'));
    expect(onClick).toHaveBeenCalledWith('1');
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('has no accessibility violations', async () => {
    const nodes = [
      { id: '1', type: 'start' as const, label: 'Begin' },
      { id: '2', type: 'end' as const, label: 'Done' },
    ];
    const edges = [{ from: '1', to: '2' }];
    const { container } = render(<ProcessFlow nodes={nodes} edges={edges} />);
    await expectNoA11yViolations(container);
  });

  it('has accessible ARIA structure', () => {
    const nodes = [
      { id: '1', type: 'start' as const, label: 'Begin' },
      { id: '2', type: 'end' as const, label: 'Done' },
    ];
    const edges = [{ from: '1', to: '2' }];
    render(<ProcessFlow nodes={nodes} edges={edges} />);
    const figure = screen.getByRole('figure');
    expect(figure).toBeInTheDocument();
    expect(figure).toHaveAttribute('aria-label', 'Process flow diagram');
  });
});
