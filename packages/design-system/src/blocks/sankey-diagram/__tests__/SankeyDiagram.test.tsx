// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

import { SankeyDiagram } from '../SankeyDiagram';
import { expectNoA11yViolations } from '../../../__tests__/a11y-utils';

describe('SankeyDiagram', () => {
  it('renders nodes and links', () => {
    const nodes = [
      { id: 'a', label: 'Source' },
      { id: 'b', label: 'Target' },
    ];
    const links = [{ source: 'a', target: 'b', value: 100 }];
    const { container } = render(<SankeyDiagram nodes={nodes} links={links} />);
    expect(container.querySelector('svg')).toBeTruthy();
  });

  it('has no accessibility violations', async () => {
    const nodes = [
      { id: 'a', label: 'Source' },
      { id: 'b', label: 'Target' },
    ];
    const links = [{ source: 'a', target: 'b', value: 100 }];
    const { container } = render(<SankeyDiagram nodes={nodes} links={links} />);
    await expectNoA11yViolations(container);
  });

  it('has accessible ARIA structure', () => {
    const nodes = [
      { id: 'a', label: 'Source' },
      { id: 'b', label: 'Target' },
    ];
    const links = [{ source: 'a', target: 'b', value: 100 }];
    render(<SankeyDiagram nodes={nodes} links={links} />);
    const img = screen.getByRole('img');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('aria-label', 'Sankey diagram');
  });
});
