// @vitest-environment jsdom
/**
 * ChartDashboard responsive columns contract
 *
 * Faz 21.10 (Codex thread `019defa5` follow-up). PR3a-d shipped
 * wrapper-level responsive defaults; this test locks the
 * **composite widget** layer's first responsive primitive: per-breakpoint
 * column counts via the object form of `columns`.
 *
 * Contract:
 *   columns={3}                       → grid-cols-1 sm:grid-cols-2 lg:grid-cols-3
 *   columns={{ sm:1, md:2, lg:3 }}    → grid-cols-1 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3
 */

import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ChartDashboard } from '../ChartDashboard';

describe('ChartDashboard responsive columns', () => {
  it('literal columns=3 emits the mobile-first cascade', () => {
    const { getByTestId } = render(
      <ChartDashboard columns={3}>
        <div>card</div>
      </ChartDashboard>,
    );
    const grid = getByTestId('chart-dashboard');
    expect(grid.className).toContain('grid-cols-1');
    expect(grid.className).toContain('sm:grid-cols-2');
    expect(grid.className).toContain('lg:grid-cols-3');
  });

  it('object columns={ sm:1, md:2, lg:3 } emits per-breakpoint Tailwind variants', () => {
    const { getByTestId } = render(
      <ChartDashboard columns={{ sm: 1, md: 2, lg: 3 }}>
        <div>card</div>
      </ChartDashboard>,
    );
    const grid = getByTestId('chart-dashboard');
    // mobile baseline (always grid-cols-{sm})
    expect(grid.className).toContain('grid-cols-1');
    // sm/md/lg overrides
    expect(grid.className).toContain('sm:grid-cols-1');
    expect(grid.className).toContain('md:grid-cols-2');
    expect(grid.className).toContain('lg:grid-cols-3');
  });

  it('object columns with only lg specified still renders mobile baseline', () => {
    const { getByTestId } = render(
      <ChartDashboard columns={{ lg: 4 }}>
        <div>card</div>
      </ChartDashboard>,
    );
    const grid = getByTestId('chart-dashboard');
    // sm not provided → fallback baseline = grid-cols-1
    expect(grid.className).toContain('grid-cols-1');
    expect(grid.className).toContain('lg:grid-cols-4');
    // sm/md NOT injected
    expect(grid.className).not.toContain('sm:grid-cols-2');
    expect(grid.className).not.toContain('md:grid-cols-3');
  });

  it('default (no columns prop) falls back to literal=3', () => {
    const { getByTestId } = render(
      <ChartDashboard>
        <div>card</div>
      </ChartDashboard>,
    );
    const grid = getByTestId('chart-dashboard');
    expect(grid.className).toContain('lg:grid-cols-3');
  });

  it('gap prop literal still works with object columns', () => {
    const { getByTestId } = render(
      <ChartDashboard columns={{ sm: 1, md: 2 }} gap="lg">
        <div>card</div>
      </ChartDashboard>,
    );
    const grid = getByTestId('chart-dashboard');
    expect(grid.className).toContain('gap-6'); // GAP_MAP.lg
  });
});
