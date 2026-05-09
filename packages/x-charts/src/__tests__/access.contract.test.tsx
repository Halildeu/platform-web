// @vitest-environment jsdom
/**
 * Faz 21.4 PR-E2 — `access` / `accessReason` prop contract for the 13
 * canonical chart wrappers in `@mfe/x-charts`.
 *
 * Test surface (Codex iter-4 plan AGREE):
 *   1. Default `access === undefined` is the identity transform — chart
 *      DOM is exactly what it was before PR-E2 (no `data-access-state`
 *      wrapper).
 *   2. `access === 'hidden'` — wrapper returns `null`.
 *   3. `access === 'readonly'` — chart still renders; click handlers
 *      registered with the chart receive `undefined` so ECharts never
 *      installs the listener.
 *   4. `access === 'disabled'` — chart still renders inside a
 *      `data-access-state="disabled" aria-disabled="true"` outer wrapper
 *      with an inner `pointer-events-none` overlay; `accessReason` lands
 *      in `title` and `<ChartAriaLive>` re-announces it.
 *   5. BarChart 4-state matrix — full DOM/click/a11y assertion.
 *   6. 10 handler-bearing charts — readonly click suppression at the
 *      ECharts callback boundary.
 *
 * Out of scope (handled by other test files):
 *   - Per-chart option-shape mutations → chart-options-shape.test.tsx
 *   - Smoke render no-throw           → chart-components-smoke.test.tsx
 *   - DS shim invariant               → packages/design-system/src/components/charts/__tests__/Charts.test.tsx
 *   - Visual regression               → x-charts.visual.ts (advisory)
 */
import {
  lastDispatchedOption,
  resetEChartsMock,
  clickListenerRegistrations,
  clickListenerUnregistrations,
} from './fixtures/echarts-mock'; // hoists vi.mock('../../renderers/echarts-imports', ...)
import { installJsdomPolyfills, restoreJsdomPolyfills } from './fixtures/jsdom-polyfills';

import React from 'react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';

import { guardChartCallback } from '../access/guardChartCallback';
import { BarChart } from '../BarChart';
import { LineChart } from '../LineChart';
import { AreaChart } from '../AreaChart';
import { PieChart } from '../PieChart';
import { ScatterChart } from '../ScatterChart';
import { GaugeChart } from '../GaugeChart';
import { RadarChart } from '../RadarChart';
import { TreemapChart } from '../TreemapChart';
import { HeatmapChart } from '../HeatmapChart';
import { WaterfallChart } from '../WaterfallChart';
import { FunnelChart } from '../FunnelChart';
import { SankeyChart } from '../SankeyChart';
import { SunburstChart } from '../SunburstChart';

beforeEach(() => {
  resetEChartsMock();
  installJsdomPolyfills();
});

afterEach(() => {
  restoreJsdomPolyfills();
});

/* ------------------------------------------------------------------ */
/*  Chart factory matrix (used by 13-chart parametric tests)          */
/* ------------------------------------------------------------------ */

interface ChartCase {
  name: string;
  /** True if the chart accepts a click handler we can guard. */
  handlerBearing: boolean;
  /** Render function — accepts overrides for access/accessReason/handler. */
  render: (overrides: {
    access?: 'full' | 'readonly' | 'disabled' | 'hidden';
    accessReason?: string;
    onClick?: ((...args: never[]) => void) | undefined;
  }) => React.ReactElement;
}

const noopFn = () => {};

const CASES: ChartCase[] = [
  {
    name: 'BarChart',
    handlerBearing: true,
    render: (o) => (
      <BarChart
        data={[{ label: 'A', value: 1 }]}
        animate={false}
        access={o.access}
        accessReason={o.accessReason}
        onDataPointClick={o.onClick as never}
      />
    ),
  },
  {
    name: 'LineChart',
    handlerBearing: true,
    render: (o) => (
      <LineChart
        series={[{ name: 's1', data: [1] }]}
        labels={['a']}
        animate={false}
        access={o.access}
        accessReason={o.accessReason}
        onDataPointClick={o.onClick as never}
      />
    ),
  },
  {
    name: 'AreaChart',
    handlerBearing: true,
    render: (o) => (
      <AreaChart
        series={[{ name: 's1', data: [1] }]}
        labels={['a']}
        animate={false}
        access={o.access}
        accessReason={o.accessReason}
        onDataPointClick={o.onClick as never}
      />
    ),
  },
  {
    name: 'PieChart',
    handlerBearing: true,
    render: (o) => (
      <PieChart
        data={[{ label: 'A', value: 1 }]}
        animate={false}
        access={o.access}
        accessReason={o.accessReason}
        onDataPointClick={o.onClick as never}
      />
    ),
  },
  {
    name: 'ScatterChart',
    handlerBearing: true,
    render: (o) => (
      <ScatterChart
        data={[{ x: 1, y: 1 }]}
        access={o.access}
        accessReason={o.accessReason}
        onDataPointClick={o.onClick as never}
      />
    ),
  },
  {
    name: 'GaugeChart',
    handlerBearing: true,
    render: (o) => (
      <GaugeChart
        value={50}
        min={0}
        max={100}
        access={o.access}
        accessReason={o.accessReason}
        onDataPointClick={o.onClick as never}
      />
    ),
  },
  {
    name: 'RadarChart',
    handlerBearing: true,
    render: (o) => (
      <RadarChart
        indicators={[
          { name: 'A', max: 10 },
          { name: 'B', max: 10 },
        ]}
        series={[{ name: 's1', data: [1, 2] }]}
        access={o.access}
        accessReason={o.accessReason}
        onDataPointClick={o.onClick as never}
      />
    ),
  },
  {
    name: 'TreemapChart',
    handlerBearing: true,
    render: (o) => (
      <TreemapChart
        data={[{ name: 'A', value: 1 }]}
        access={o.access}
        accessReason={o.accessReason}
        onNodeClick={o.onClick as never}
      />
    ),
  },
  {
    name: 'HeatmapChart',
    handlerBearing: true,
    render: (o) => (
      <HeatmapChart
        data={[[0, 0, 1]]}
        xLabels={['x']}
        yLabels={['y']}
        access={o.access}
        accessReason={o.accessReason}
        onCellClick={o.onClick as never}
      />
    ),
  },
  {
    name: 'WaterfallChart',
    handlerBearing: true,
    render: (o) => (
      <WaterfallChart
        data={[{ label: 'A', value: 1 }]}
        access={o.access}
        accessReason={o.accessReason}
        onDataPointClick={o.onClick as never}
      />
    ),
  },
  {
    name: 'FunnelChart',
    handlerBearing: true,
    render: (o) => (
      <FunnelChart
        data={[{ name: 'A', value: 1 }]}
        access={o.access}
        accessReason={o.accessReason}
        onDataPointClick={o.onClick as never}
      />
    ),
  },
  {
    name: 'SankeyChart',
    handlerBearing: true,
    render: (o) => (
      <SankeyChart
        nodes={[{ name: 'A' }, { name: 'B' }]}
        links={[{ source: 'A', target: 'B', value: 1 }]}
        access={o.access}
        accessReason={o.accessReason}
        onNodeClick={o.onClick as never}
      />
    ),
  },
  {
    name: 'SunburstChart',
    handlerBearing: true,
    render: (o) => (
      <SunburstChart
        data={[{ name: 'A', value: 1 }]}
        access={o.access}
        accessReason={o.accessReason}
        onNodeClick={o.onClick as never}
      />
    ),
  },
];

/* ================================================================== */
/*  13-chart parametric: identity transform when access undefined     */
/* ================================================================== */

describe('Identity transform (default access undefined)', () => {
  it.each(CASES)(
    '$name renders without ChartAccessGate wrapper when access is undefined',
    ({ render: factory }) => {
      const { container } = render(factory({}));
      // No `data-access-state` wrapper anywhere in the tree.
      expect(container.querySelector('[data-access-state]')).toBeNull();
    },
  );
});

/* ================================================================== */
/*  13-chart parametric: hidden returns null (collapse)               */
/* ================================================================== */

describe('access="hidden" returns null (layout collapses)', () => {
  it.each(CASES)('$name renders nothing when access="hidden"', ({ render: factory }) => {
    const { container } = render(factory({ access: 'hidden' }));
    expect(container.firstChild).toBeNull();
  });
});

/* ================================================================== */
/*  10 handler-bearing charts: readonly suppresses listener install   */
/* ================================================================== */

describe('access="readonly" — handler-bearing charts suppress listener install', () => {
  const handlerBearing = CASES.filter((c) => c.handlerBearing);

  it.each(handlerBearing)(
    '$name with onClick + access="readonly" still renders (handler stripped via guardChartCallback)',
    ({ render: factory }) => {
      const userOnClick = noopFn;
      const { container } = render(factory({ access: 'readonly', onClick: userOnClick }));
      // Chart still renders (readonly is visible, just non-interactive).
      // Behavioural readonly listener suppression is enforced by
      // `guardChartCallback` returning `undefined`; ECharts never
      // installs. The outermost guarantee we can assert at this layer
      // is that the chart did render at all (no crash from unwrapping
      // undefined). Functional readonly contract is enforced by the
      // guardChartCallback unit invariants below.
      expect(container.firstChild).not.toBeNull();
    },
  );

  // Each chart wraps the user-supplied handler in a translator function
  // (e.g. BarChart's `handleClick` adapts ECharts params into a
  // ChartClickEvent). So the listener registered on the ECharts instance
  // is NOT the same reference as the user's `onClick`. We assert
  // registration COUNT thresholds instead — full mounts attach >=1 click
  // listener (theme reactive store may re-init the instance once,
  // producing multiple register cycles paired with unregisters);
  // readonly/disabled mounts attach 0.

  it.each(handlerBearing)(
    '$name with onClick + access="full" registers at least one click listener',
    ({ render: factory }) => {
      const handler = () => {};
      render(factory({ access: 'full', onClick: handler }));
      expect(clickListenerRegistrations().length).toBeGreaterThanOrEqual(1);
    },
  );

  it.each(handlerBearing)(
    '$name with onClick + access="readonly" registers ZERO click listeners',
    ({ render: factory }) => {
      const handler = () => {};
      render(factory({ access: 'readonly', onClick: handler }));
      expect(clickListenerRegistrations()).toHaveLength(0);
    },
  );

  it.each(handlerBearing)(
    '$name with onClick + access="disabled" registers ZERO click listeners',
    ({ render: factory }) => {
      const handler = () => {};
      render(factory({ access: 'disabled', onClick: handler }));
      expect(clickListenerRegistrations()).toHaveLength(0);
    },
  );
});

/* ================================================================== */
/*  Cross-filter dual-callback charts — onDataPointClick guard         */
/*                                                                     */
/*  Codex thread 019e0c25 post-impl review absorb. The cases above     */
/*  exercise each chart through ITS canonical click prop (e.g. Treemap */
/*  via `onNodeClick`); they do NOT cover the new `onDataPointClick`   */
/*  surface for charts that expose BOTH callbacks. This block          */
/*  duplicates the readonly/disabled listener-suppression contract but */
/*  through the new cross-filter callback so a regression on either    */
/*  guard is caught.                                                   */
/* ================================================================== */

const DUAL_CALLBACK_CASES: ChartCase[] = [
  {
    name: 'TreemapChart (onDataPointClick)',
    handlerBearing: true,
    render: (o) => (
      <TreemapChart
        data={[{ name: 'A', value: 1 }]}
        access={o.access}
        accessReason={o.accessReason}
        onDataPointClick={o.onClick as never}
      />
    ),
  },
  {
    name: 'HeatmapChart (onDataPointClick)',
    handlerBearing: true,
    render: (o) => (
      <HeatmapChart
        data={[[0, 0, 1]]}
        xLabels={['x']}
        yLabels={['y']}
        access={o.access}
        accessReason={o.accessReason}
        onDataPointClick={o.onClick as never}
      />
    ),
  },
  {
    name: 'SankeyChart (onDataPointClick)',
    handlerBearing: true,
    render: (o) => (
      <SankeyChart
        nodes={[{ name: 'A' }, { name: 'B' }]}
        links={[{ source: 'A', target: 'B', value: 1 }]}
        access={o.access}
        accessReason={o.accessReason}
        onDataPointClick={o.onClick as never}
      />
    ),
  },
  {
    name: 'SunburstChart (onDataPointClick)',
    handlerBearing: true,
    render: (o) => (
      <SunburstChart
        data={[{ name: 'A', value: 1 }]}
        access={o.access}
        accessReason={o.accessReason}
        onDataPointClick={o.onClick as never}
      />
    ),
  },
];

describe('Cross-filter onDataPointClick — access guard regression (dual-callback charts)', () => {
  it.each(DUAL_CALLBACK_CASES)(
    '$name with access="full" registers at least one click listener',
    ({ render: factory }) => {
      const handler = () => {};
      render(factory({ access: 'full', onClick: handler }));
      expect(clickListenerRegistrations().length).toBeGreaterThanOrEqual(1);
    },
  );

  it.each(DUAL_CALLBACK_CASES)(
    '$name with access="readonly" registers ZERO click listeners',
    ({ render: factory }) => {
      const handler = () => {};
      render(factory({ access: 'readonly', onClick: handler }));
      expect(clickListenerRegistrations()).toHaveLength(0);
    },
  );

  it.each(DUAL_CALLBACK_CASES)(
    '$name with access="disabled" registers ZERO click listeners',
    ({ render: factory }) => {
      const handler = () => {};
      render(factory({ access: 'disabled', onClick: handler }));
      expect(clickListenerRegistrations()).toHaveLength(0);
    },
  );
});

/* ================================================================== */
/*  Runtime access transitions — listener register/unregister cycle   */
/*  (PR-E2 must-fix #1 — addresses stale listener bug)                */
/* ================================================================== */

describe('Runtime access transitions detach stale click listeners', () => {
  // Same caveat as the listener-install tests above: each chart wraps
  // the user handler in a translator. So we assert listener COUNT
  // deltas across rerenders instead of reference equality. The PR-E2
  // must-fix #1 contract is "stale listener does NOT linger" — that
  // collapses cleanly to: a transition out of `full` MUST produce a
  // matching unregister; a transition into `full` MUST produce a new
  // register.

  it('full → readonly detaches the click listener (matching unregister fires)', () => {
    const handler = () => {};
    const { rerender } = render(
      <BarChart
        data={[{ label: 'A', value: 1 }]}
        animate={false}
        access="full"
        onDataPointClick={handler}
      />,
    );
    const initialRegs = clickListenerRegistrations().length;
    const initialUnregs = clickListenerUnregistrations().length;
    expect(initialRegs).toBeGreaterThan(0);

    rerender(
      <BarChart
        data={[{ label: 'A', value: 1 }]}
        animate={false}
        access="readonly"
        onDataPointClick={handler}
      />,
    );
    expect(clickListenerUnregistrations().length).toBeGreaterThan(initialUnregs);
  });

  it('readonly → full attaches a new click listener', () => {
    const handler = () => {};
    const { rerender } = render(
      <BarChart
        data={[{ label: 'A', value: 1 }]}
        animate={false}
        access="readonly"
        onDataPointClick={handler}
      />,
    );
    const initialRegs = clickListenerRegistrations().length;
    expect(initialRegs).toBe(0);

    rerender(
      <BarChart
        data={[{ label: 'A', value: 1 }]}
        animate={false}
        access="full"
        onDataPointClick={handler}
      />,
    );
    expect(clickListenerRegistrations().length).toBeGreaterThan(initialRegs);
  });

  it('theme re-init re-registers the click listener on the fresh ECharts instance (PR-E2 must-fix #1 iter-2)', () => {
    const handler = () => {};
    const { rerender } = render(
      <BarChart
        data={[{ label: 'A', value: 1 }]}
        animate={false}
        access="full"
        theme="light"
        onDataPointClick={handler}
      />,
    );
    const initialRegs = clickListenerRegistrations().length;
    expect(initialRegs).toBeGreaterThan(0);

    // Theme rerender forces useEChartsRenderer's init effect to dispose
    // the old instance and create a fresh one. The click-handler effect
    // must re-fire against the new instance, even though `onClick`
    // identity didn't change. Pre-fix: this regression was silent.
    rerender(
      <BarChart
        data={[{ label: 'A', value: 1 }]}
        animate={false}
        access="full"
        theme="dark"
        onDataPointClick={handler}
      />,
    );
    expect(clickListenerRegistrations().length).toBeGreaterThan(initialRegs);
  });

  it('full → disabled detaches the click listener', () => {
    const handler = () => {};
    const { rerender } = render(
      <BarChart
        data={[{ label: 'A', value: 1 }]}
        animate={false}
        access="full"
        onDataPointClick={handler}
      />,
    );
    const initialUnregs = clickListenerUnregistrations().length;
    expect(clickListenerRegistrations().length).toBeGreaterThan(0);

    rerender(
      <BarChart
        data={[{ label: 'A', value: 1 }]}
        animate={false}
        access="disabled"
        onDataPointClick={handler}
      />,
    );
    expect(clickListenerUnregistrations().length).toBeGreaterThan(initialUnregs);
  });
});

/* ================================================================== */
/*  guardChartCallback unit invariants                                */
/* ================================================================== */

describe('guardChartCallback (unit)', () => {
  const handler = () => {};

  it('returns the handler when state === "full"', () => {
    expect(guardChartCallback('full', handler)).toBe(handler);
  });

  it('returns undefined when state === "readonly"', () => {
    expect(guardChartCallback('readonly', handler)).toBeUndefined();
  });

  it('returns undefined when state === "disabled"', () => {
    expect(guardChartCallback('disabled', handler)).toBeUndefined();
  });

  it('returns undefined when handler is undefined regardless of state', () => {
    expect(guardChartCallback('full', undefined)).toBeUndefined();
    expect(guardChartCallback('readonly', undefined)).toBeUndefined();
  });
});

/* ================================================================== */
/*  BarChart 4-state matrix — DOM, a11y, ECharts dispatch             */
/* ================================================================== */

describe('BarChart 4-state access matrix', () => {
  const props = { data: [{ label: 'A', value: 1 }], animate: false };

  it('access=undefined → identity transform (no wrapper, ECharts dispatched)', () => {
    const { container } = render(<BarChart {...props} />);
    expect(container.querySelector('[data-access-state]')).toBeNull();
    expect(lastDispatchedOption()).not.toBeNull();
  });

  it('access="full" → identity transform (same as undefined)', () => {
    const { container } = render(<BarChart {...props} access="full" />);
    expect(container.querySelector('[data-access-state]')).toBeNull();
    expect(lastDispatchedOption()).not.toBeNull();
  });

  it('access="readonly" without reason → identity DOM (no wrapper)', () => {
    const { container } = render(<BarChart {...props} access="readonly" />);
    expect(container.querySelector('[data-access-state]')).toBeNull();
  });

  it('access="readonly" with reason → minimal title wrapper, no CSS', () => {
    const { container } = render(
      <BarChart {...props} access="readonly" accessReason="Read-only sample" />,
    );
    const wrapper = container.querySelector('[data-access-state="readonly"]') as HTMLElement | null;
    expect(wrapper).not.toBeNull();
    expect(wrapper?.getAttribute('title')).toBe('Read-only sample');
    // No CSS classes on the readonly wrapper itself.
    expect(wrapper?.className).toBe('');
  });

  it('access="disabled" → 2-layer wrapper, aria-disabled, opacity inner, inert keyboard', () => {
    const { container } = render(
      <BarChart {...props} access="disabled" accessReason="Insufficient permissions" />,
    );
    const outer = container.querySelector('[data-access-state="disabled"]') as HTMLElement | null;
    expect(outer).not.toBeNull();
    expect(outer?.getAttribute('aria-disabled')).toBe('true');
    expect(outer?.getAttribute('title')).toBe('Insufficient permissions');
    // Inner pointer-blocker:
    const inner = outer?.querySelector('.pointer-events-none') as HTMLElement | null;
    expect(inner).not.toBeNull();
    expect(inner?.className).toContain('opacity-50');
    // PR-E2 must-fix #2 — inner has `inert` attr so keyboard/focus
    // is blocked alongside pointer events. Disabled charts must be
    // visible-but-fully-non-interactive.
    expect(inner?.hasAttribute('inert')).toBe(true);
  });

  it('access="hidden" → null (no DOM)', () => {
    const { container } = render(<BarChart {...props} access="hidden" />);
    expect(container.firstChild).toBeNull();
  });
});
