// @vitest-environment jsdom
/**
 * useEChartsRenderer — `enabled` gate (PR-X16a render-crash fix).
 *
 * Lazy-registered charts (TreeChart, and the depth-chart campaign that
 * follows) must NOT let the renderer call `echarts.init()` before their
 * ECharts feature module has registered. ECharts' Scheduler snapshots
 * the registered layout/visual handler list at `echarts.init()` time —
 * an instance created before a lazy `registerLayout` runs never sees
 * that layout, so the series renders with no `layoutInfo` and crashes
 * its view (Codex thread 019e337e: `tree` series → `TreeView.render` →
 * `Cannot read properties of undefined (reading 'x')`, observed live on
 * testai).
 *
 * These tests lock the gate: `enabled=false` ⇒ no `init`, no
 * `setOption`; flipping to `true` ⇒ exactly one `init` + the option
 * dispatched.
 */
import {
  initCallCount,
  lastDispatchedOption,
  resetEChartsMock,
} from '../../__tests__/fixtures/echarts-mock'; // side-effect: vi.mock hoisted
import {
  installJsdomPolyfills,
  restoreJsdomPolyfills,
} from '../../__tests__/fixtures/jsdom-polyfills';

import React from 'react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';

import { useEChartsRenderer } from '../echarts-renderer';
import type { EChartsOption } from '../echarts-imports';

const OPTION = { series: [{ type: 'bar', data: [1, 2, 3] }] } as unknown as EChartsOption;

/** Minimal probe that drives `useEChartsRenderer` and attaches its container. */
function Probe({ enabled }: { enabled: boolean }): React.ReactElement {
  const { setContainerRef } = useEChartsRenderer({
    enabled,
    option: OPTION,
    // Deterministic: skip the reduced-motion option rewrite so the
    // dispatched option is exactly OPTION.
    respectReducedMotion: false,
  });
  return <div ref={setContainerRef} data-testid="probe" style={{ width: 200, height: 200 }} />;
}

beforeEach(() => {
  resetEChartsMock();
  installJsdomPolyfills();
});
afterEach(() => {
  restoreJsdomPolyfills();
});

describe('useEChartsRenderer — enabled gate', () => {
  it('enabled=false: never calls echarts.init() or setOption()', () => {
    render(<Probe enabled={false} />);
    expect(initCallCount()).toBe(0);
    expect(lastDispatchedOption()).toBeNull();
  });

  it('enabled=true: inits exactly once and dispatches the option', () => {
    render(<Probe enabled />);
    expect(initCallCount()).toBe(1);
    expect(lastDispatchedOption()).toEqual(OPTION);
  });

  it('enabled false → true: init + dispatch happen only after the flip', () => {
    const { rerender } = render(<Probe enabled={false} />);
    // Gated: nothing happened yet.
    expect(initCallCount()).toBe(0);
    expect(lastDispatchedOption()).toBeNull();

    rerender(<Probe enabled />);
    // Flip: instance created and option dispatched onto it.
    expect(initCallCount()).toBe(1);
    expect(lastDispatchedOption()).toEqual(OPTION);
  });
});
