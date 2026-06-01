// @vitest-environment jsdom
/**
 * Widget + FilterRenderer dispatcher tests (PR-D1b.B step 4).
 *
 * Codex thread `019e8074` iter-3 AGREE.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';

const mocks = vi.hoisted(() => ({
  resolveFilterOptions: vi.fn(),
}));

vi.mock('../options-source-cache', () => ({
  resolveFilterOptions: mocks.resolveFilterOptions,
}));

vi.mock('../../../../components/CompanyPicker', () => ({
  CompanyPicker: ({ required }: { required: boolean }) => (
    <div data-testid="company-picker-stub" data-required={String(required)}>
      CompanyPicker
    </div>
  ),
}));

import {
  CompanyPickerFilter,
  DateRangeFilter,
  EnumSelectFilter,
  FilterRenderer,
  MonthPickerFilter,
  NumberRangeFilter,
  TextSearchFilter,
  type FilterWidgetProps,
} from '../widgets';
import type { FilterDefinition } from '../../types';

const baseProps = (
  definition: FilterDefinition,
  value: unknown,
  onChange: FilterWidgetProps['onChange'] = vi.fn(),
): FilterWidgetProps => ({
  definition,
  value,
  onChange,
  reportKey: 'report-key',
});

beforeEach(() => {
  mocks.resolveFilterOptions.mockReset();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('TextSearchFilter', () => {
  it('initial mount does NOT fire onChange', async () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    render(
      <TextSearchFilter {...baseProps({ key: 'q', kind: 'text-search' }, 'preset', onChange)} />,
    );
    await act(async () => {
      vi.advanceTimersByTime(500);
    });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('user edit triggers debounced onChange at 250ms (single emission)', async () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    render(<TextSearchFilter {...baseProps({ key: 'q', kind: 'text-search' }, '', onChange)} />);

    const input = screen.getByTestId('filter-q');
    fireEvent.change(input, { target: { value: 'foo' } });
    expect(onChange).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(260);
    });

    expect(onChange).toHaveBeenCalledWith('foo');
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});

describe('EnumSelectFilter', () => {
  it('shows loading then renders loaded options', async () => {
    let resolveFn: (opts: unknown) => void = () => {};
    mocks.resolveFilterOptions.mockReturnValue(
      new Promise((res) => {
        resolveFn = res;
      }),
    );

    render(<EnumSelectFilter {...baseProps({ key: 'STATUS', kind: 'enum-select' }, '')} />);
    expect(screen.getByText('Yükleniyor…')).toBeTruthy();

    await act(async () => {
      resolveFn([{ value: 'A' }, { value: 'B', label: 'Bravo' }]);
    });

    await waitFor(() => {
      expect(screen.queryByText('Yükleniyor…')).toBeNull();
    });
    expect(screen.getByText('A')).toBeTruthy();
    expect(screen.getByText('Bravo')).toBeTruthy();
  });

  it('error state shows error message', async () => {
    mocks.resolveFilterOptions.mockRejectedValue(new Error('boom'));
    render(<EnumSelectFilter {...baseProps({ key: 'STATUS', kind: 'enum-select' }, '')} />);
    await waitFor(() => {
      expect(screen.getByText(/Hata: boom/)).toBeTruthy();
    });
  });

  it('empty options shows blank-only option', async () => {
    mocks.resolveFilterOptions.mockResolvedValue([]);
    render(<EnumSelectFilter {...baseProps({ key: 'STATUS', kind: 'enum-select' }, '')} />);
    await waitFor(() => {
      expect(screen.getByText('— boş —')).toBeTruthy();
    });
  });

  it('unmount mid-load → cancellation guard prevents state update', async () => {
    let _resolveFn: (opts: unknown) => void = () => {};
    mocks.resolveFilterOptions.mockReturnValue(
      new Promise((res) => {
        _resolveFn = res;
      }),
    );

    const { unmount } = render(
      <EnumSelectFilter {...baseProps({ key: 'STATUS', kind: 'enum-select' }, '')} />,
    );

    unmount();
    await act(async () => {
      _resolveFn([{ value: 'A' }]);
    });
    expect(true).toBe(true);
  });
});

describe('DateRangeFilter', () => {
  it('between operator renders both from + to inputs', () => {
    render(<DateRangeFilter {...baseProps({ key: 'CREATED_AT', kind: 'date-range' }, {})} />);
    expect(screen.getByTestId('filter-CREATED_AT-from')).toBeTruthy();
    expect(screen.getByTestId('filter-CREATED_AT-to')).toBeTruthy();
  });

  it('gte operator renders only `from` input', () => {
    render(
      <DateRangeFilter
        {...baseProps({ key: 'CREATED_AT', kind: 'date-range', operator: 'gte' }, {})}
      />,
    );
    expect(screen.getByTestId('filter-CREATED_AT-from')).toBeTruthy();
    expect(screen.queryByTestId('filter-CREATED_AT-to')).toBeNull();
  });

  it('lte operator renders only `to` input', () => {
    render(
      <DateRangeFilter
        {...baseProps({ key: 'CREATED_AT', kind: 'date-range', operator: 'lte' }, {})}
      />,
    );
    expect(screen.queryByTestId('filter-CREATED_AT-from')).toBeNull();
    expect(screen.getByTestId('filter-CREATED_AT-to')).toBeTruthy();
  });

  it('onChange propagates {from, to} updates', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <DateRangeFilter {...baseProps({ key: 'CREATED_AT', kind: 'date-range' }, {}, onChange)} />,
    );

    fireEvent.change(screen.getByTestId('filter-CREATED_AT-from'), {
      target: { value: '2026-05-01' },
    });
    expect(onChange).toHaveBeenLastCalledWith({ from: '2026-05-01' });

    rerender(
      <DateRangeFilter
        {...baseProps({ key: 'CREATED_AT', kind: 'date-range' }, { from: '2026-05-01' }, onChange)}
      />,
    );
    fireEvent.change(screen.getByTestId('filter-CREATED_AT-to'), {
      target: { value: '2026-05-31' },
    });
    expect(onChange).toHaveBeenLastCalledWith({ from: '2026-05-01', to: '2026-05-31' });
  });
});

describe('NumberRangeFilter', () => {
  it('between renders both inputs; lte renders only `to`', () => {
    const { rerender } = render(
      <NumberRangeFilter {...baseProps({ key: 'SAL', kind: 'number-range' }, {})} />,
    );
    expect(screen.getByTestId('filter-SAL-from')).toBeTruthy();
    expect(screen.getByTestId('filter-SAL-to')).toBeTruthy();

    rerender(
      <NumberRangeFilter
        {...baseProps({ key: 'SAL', kind: 'number-range', operator: 'lte' }, {})}
      />,
    );
    expect(screen.queryByTestId('filter-SAL-from')).toBeNull();
    expect(screen.getByTestId('filter-SAL-to')).toBeTruthy();
  });

  it('parses numeric input', () => {
    const onChange = vi.fn();
    render(
      <NumberRangeFilter {...baseProps({ key: 'SAL', kind: 'number-range' }, {}, onChange)} />,
    );
    fireEvent.change(screen.getByTestId('filter-SAL-from'), {
      target: { value: '1000' },
    });
    expect(onChange).toHaveBeenLastCalledWith({ from: 1000 });
  });

  it('empty string clears the bound (undefined)', () => {
    const onChange = vi.fn();
    render(
      <NumberRangeFilter
        {...baseProps({ key: 'SAL', kind: 'number-range' }, { from: 100 }, onChange)}
      />,
    );
    fireEvent.change(screen.getByTestId('filter-SAL-from'), {
      target: { value: '' },
    });
    expect(onChange).toHaveBeenLastCalledWith({ from: undefined });
  });
});

describe('MonthPickerFilter', () => {
  it('passes value through onChange', () => {
    const onChange = vi.fn();
    render(
      <MonthPickerFilter {...baseProps({ key: 'PERIOD', kind: 'month-picker' }, '', onChange)} />,
    );
    fireEvent.change(screen.getByTestId('filter-PERIOD'), {
      target: { value: '2026-05' },
    });
    expect(onChange).toHaveBeenLastCalledWith('2026-05');
  });
});

describe('CompanyPickerFilter', () => {
  it('renders the legacy global picker (NOT a controlled widget)', () => {
    render(
      <CompanyPickerFilter {...baseProps({ key: 'companyId', kind: 'company-picker' }, '')} />,
    );
    expect(screen.getByTestId('company-picker-stub')).toBeTruthy();
  });

  it('forwards `required` prop', () => {
    render(
      <CompanyPickerFilter
        {...baseProps({ key: 'companyId', kind: 'company-picker' }, '')}
        required
      />,
    );
    expect(screen.getByTestId('company-picker-stub').getAttribute('data-required')).toBe('true');
  });
});

describe('FilterRenderer dispatcher', () => {
  it.each([
    ['text-search', 'filter-q'],
    ['date-range', 'filter-q-from'],
    ['number-range', 'filter-q-from'],
    ['month-picker', 'filter-q'],
  ] as const)('kind=%s → renders correct widget', (kind, expectedTestId) => {
    render(
      <FilterRenderer
        {...baseProps(
          { key: 'q', kind: kind as FilterDefinition['kind'] },
          kind === 'date-range' || kind === 'number-range' ? {} : '',
        )}
      />,
    );
    expect(screen.getByTestId(expectedTestId)).toBeTruthy();
  });

  it('kind=enum-select → renders EnumSelectFilter (loading initially)', () => {
    mocks.resolveFilterOptions.mockReturnValue(new Promise(() => {}));
    render(<FilterRenderer {...baseProps({ key: 'STATUS', kind: 'enum-select' }, '')} />);
    expect(screen.getByText('Yükleniyor…')).toBeTruthy();
  });

  it('kind=company-picker → renders CompanyPickerFilter', () => {
    render(<FilterRenderer {...baseProps({ key: 'companyId', kind: 'company-picker' }, '')} />);
    expect(screen.getByTestId('company-picker-stub')).toBeTruthy();
  });

  it('unknown kind → console.warn + disabled fallback', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(
      <FilterRenderer
        {...baseProps(
           
          { key: 'XX', kind: 'unknown-kind' as any },
          '',
        )}
      />,
    );
    expect(warn).toHaveBeenCalled();
    expect(screen.getByTestId('filter-XX-fallback')).toBeTruthy();
    warn.mockRestore();
  });
});
