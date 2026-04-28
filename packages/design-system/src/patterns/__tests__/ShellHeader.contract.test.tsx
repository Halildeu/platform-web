// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { ShellHeader } from '../shell-header/ShellHeader';
import type { ShellHeaderNavItem } from '../shell-header/types';

describe('ShellHeader — contract', () => {
  const navItems: ShellHeaderNavItem[] = [
    { key: '/', path: '/', label: 'Home' },
    { key: '/reports', path: '/reports', label: 'Reports' },
  ];

  const defaultProps = {
    navItems,
    currentPath: '/',
    onNavigate: vi.fn(),
  };

  it('renders without crash', () => {
    const { container } = render(<ShellHeader {...defaultProps} />);
    expect(container.firstElementChild).toBeTruthy();
  });

  it('exposes displayName for devtools and SSR boundary', () => {
    expect(ShellHeader.displayName).toBe('ShellHeader');
  });

  it('renders the header landmark (banner role)', () => {
    render(<ShellHeader {...defaultProps} />);
    expect(screen.getByRole('banner')).toBeInTheDocument();
  });
});
