// @vitest-environment jsdom
/**
 * a11y-pr3 batch — 4 deprecated chart shims (AreaChart, BarChart,
 * LineChart, PieChart).
 *
 * These are thin compat shims that delegate to `@mfe/x-charts` chart
 * implementations. They emit a one-time deprecation warning at first
 * render. The a11y contract still applies — consumers haven't all
 * migrated yet, and axe must catch any regression introduced via the
 * shim layer (e.g. accidental aria-hidden, missing role on the
 * canvas wrapper, etc.).
 *
 * Each test renders the shim with the bare-minimum props the type
 * surface accepts and asserts no axe violations.
 */
import React from 'react';
import { afterEach, describe, it } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, render } from '@testing-library/react';
import { expectNoA11yViolations } from '../../../__tests__/a11y-utils';

import { AreaChart } from '../AreaChart';
import { BarChart } from '../BarChart';
import { LineChart } from '../LineChart';
import { PieChart } from '../PieChart';

afterEach(() => cleanup());

const sampleSeries = [{ name: 'Revenue', data: [10, 25, 40, 30, 55] }];
const sampleLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May'];

describe('Deprecated chart shims — accessibility', () => {
  it('AreaChart shim has no a11y violations', async () => {
    const { container } = render(
      <AreaChart series={sampleSeries} labels={sampleLabels} aria-label="Monthly revenue" />,
    );
    await expectNoA11yViolations(container);
  });

  it('BarChart shim has no a11y violations', async () => {
    const { container } = render(
      <BarChart series={sampleSeries} labels={sampleLabels} aria-label="Monthly revenue" />,
    );
    await expectNoA11yViolations(container);
  });

  it('LineChart shim has no a11y violations', async () => {
    const { container } = render(
      <LineChart series={sampleSeries} labels={sampleLabels} aria-label="Monthly revenue" />,
    );
    await expectNoA11yViolations(container);
  });

  it('PieChart shim has no a11y violations', async () => {
    // PieChart shim accepts a flat `ChartDataPoint[]` instead of series.
    const { container } = render(
      <PieChart
        data={[
          { name: 'Direct', value: 35 },
          { name: 'Referral', value: 25 },
          { name: 'Search', value: 40 },
        ]}
        aria-label="Traffic sources"
      />,
    );
    await expectNoA11yViolations(container);
  });
});
