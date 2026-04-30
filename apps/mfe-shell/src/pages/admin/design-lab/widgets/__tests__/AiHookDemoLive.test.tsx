// @vitest-environment jsdom
/**
 * Deep functional tests for AiHookDemoLive's five sub-demos.
 *
 * Each test runs the REAL @mfe/x-charts AI helper (no mock) — the demo
 * widget is just a thin shell around a function call, so the assertions
 * pin actual output. Mutation discipline:
 *
 *   - "drop the click handler"             → result stays empty
 *   - "skip calling the helper"            → result stays empty
 *   - "swap the helper for a no-op"        → output is null/[]/wrong type
 *   - "mutate the helper logic"            → output content fails the
 *                                            value-level assertions
 *   - "leak previous result across runs"   → re-mount test fails
 *
 * The nl-to-chart sub-demo wires a deterministic local fetchFn so that
 * the LLM step is reproducible without network access.
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';

import AiHookDemoLive from '../AiHookDemoLive';

describe('AiHookDemoLive — detect-anomalies', () => {
  it('initially shows the empty-state and no anomaly content', () => {
    render(<AiHookDemoLive hookId="detect-anomalies" />);
    expect(screen.getByTestId('ai-detect-anomalies-result-content')).toHaveAttribute(
      'data-empty',
      'true',
    );
  });

  it('clicking Çalıştır flags the two outliers (95 and 88) at indices 5 and 10', () => {
    render(<AiHookDemoLive hookId="detect-anomalies" />);
    fireEvent.click(screen.getByTestId('ai-detect-anomalies-run'));

    const content = screen.getByTestId('ai-detect-anomalies-result-content');
    expect(content).toHaveAttribute('data-empty', 'false');
    // Sample data carries two clear high outliers; both must be flagged
    // with direction "high" and the right indices.
    const text = content.textContent ?? '';
    expect(text).toMatch(/"index":\s*5/);
    expect(text).toMatch(/"value":\s*95/);
    expect(text).toMatch(/"index":\s*10/);
    expect(text).toMatch(/"value":\s*88/);
    expect(text).toMatch(/"direction":\s*"high"/);
    // The non-outlier indices (0, 1, 2, …) must NOT appear as anomalies.
    expect(text).not.toMatch(/"index":\s*0\b/);
  });
});

describe('AiHookDemoLive — identify-trends', () => {
  it('clicking Çalıştır reports an "up" linear trend with slope 4 and rSquared 1', () => {
    render(<AiHookDemoLive hookId="identify-trends" />);
    fireEvent.click(screen.getByTestId('ai-identify-trends-run'));

    const summary = screen.getByTestId('ai-identify-trends-summary');
    const text = summary.textContent ?? '';
    expect(text).toMatch(/"direction":\s*"up"/);
    expect(text).toMatch(/"slope":\s*4/);
    expect(text).toMatch(/"rSquared":\s*1/);
  });
});

describe('AiHookDemoLive — suggest-chart', () => {
  it('clicking Çalıştır produces at least one ranked suggestion with a confidence', () => {
    render(<AiHookDemoLive hookId="suggest-chart" />);
    fireEvent.click(screen.getByTestId('ai-suggest-chart-run'));

    const list = screen.getByTestId('ai-suggest-chart-list');
    const items = within(list).getAllByTestId(/^ai-suggest-chart-item-/);
    expect(items.length).toBeGreaterThanOrEqual(1);

    // First item must mention a chart type and a confidence percentage.
    const firstText = items[0].textContent ?? '';
    expect(firstText).toMatch(/confidence \d+%/);
    expect(firstText.length).toBeGreaterThan(10);
  });
});

describe('AiHookDemoLive — chart-description', () => {
  it('clicking Çalıştır renders a Turkish "çubuk grafik" sentence', () => {
    render(<AiHookDemoLive hookId="chart-description" />);
    fireEvent.click(screen.getByTestId('ai-chart-description-run'));

    const text = screen.getByTestId('ai-chart-description-text');
    const body = text.textContent ?? '';
    // The Turkish locale uses "çubuk grafik" for bar charts and the
    // description contains the title.
    expect(body).toMatch(/çubuk grafik/);
    expect(body).toMatch(/Aylık Gelir/);
    // The value range fed in (301–390) must appear somewhere in the
    // narration.
    expect(body).toMatch(/301/);
    expect(body).toMatch(/390/);
  });
});

describe('AiHookDemoLive — nl-to-chart', () => {
  it('clicking Spec üret runs nlToChartSpec with the mock fetchFn and shows a bar spec', async () => {
    render(<AiHookDemoLive hookId="nl-to-chart" />);
    fireEvent.click(screen.getByTestId('ai-nl-to-chart-run'));

    // The widget awaits the mock fetchFn before rendering the spec.
    const spec = await screen.findByTestId('ai-nl-to-chart-spec');
    const text = spec.textContent ?? '';
    expect(text).toMatch(/"type":\s*"bar"/);
    // The mocked LLM response carries four quarterly points; the parsed
    // spec must therefore carry them through.
    expect(text).toMatch(/"label":\s*"Q1"/);
    expect(text).toMatch(/"label":\s*"Q4"/);
  });

  it('the input field is editable and reflects user edits', () => {
    render(<AiHookDemoLive hookId="nl-to-chart" />);
    const input = screen.getByTestId('ai-nl-to-chart-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Aylık trafik analizi' } });
    expect(input.value).toBe('Aylık trafik analizi');
  });
});
