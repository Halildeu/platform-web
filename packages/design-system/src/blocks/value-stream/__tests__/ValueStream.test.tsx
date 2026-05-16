// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

import { ValueStream } from '../ValueStream';
import { expectNoA11yViolations } from '../../../__tests__/a11y-utils';

describe('ValueStream', () => {
  it('renders steps', () => {
    const steps = [
      { id: '1', label: 'Cut', processTime: 10, waitTime: 30 },
      { id: '2', label: 'Weld', processTime: 20, waitTime: 15 },
    ];
    const { container } = render(<ValueStream steps={steps} />);
    expect(container.textContent).toContain('Cut');
  });

  it('fires onStepClick when step is clicked', () => {
    const onClick = vi.fn();
    const steps = [{ id: '1', label: 'Cut', processTime: 10 }];
    render(<ValueStream steps={steps} onStepClick={onClick} />);
    fireEvent.click(screen.getByText('Cut'));
    expect(onClick).toHaveBeenCalledWith('1');
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('has no accessibility violations', async () => {
    const steps = [{ id: '1', label: 'Cut', processTime: 10, waitTime: 30 }];
    const { container } = render(<ValueStream steps={steps} />);
    await expectNoA11yViolations(container);
  });

  it('has accessible ARIA structure', () => {
    const steps = [{ id: '1', label: 'Cut', processTime: 10, waitTime: 30 }];
    render(<ValueStream steps={steps} />);
    const figure = screen.getByRole('figure');
    expect(figure).toBeInTheDocument();
    expect(figure).toHaveAttribute('aria-label', 'Value stream map');
  });
});
