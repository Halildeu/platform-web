// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import NotificationPreferenceForm from '../NotificationPreferenceForm';

/**
 * Faz 23.6 PR-B1 — rich preference form unit tests.
 *
 * FormDrawer is mocked to a minimal pass-through so we can test the form
 * payload contract without booting the design-system portal/focus-trap
 * machinery (Codex thread `019e034e` iter-2 absorb — drawer concerns
 * stay out of the form's behaviour tests).
 */

vi.mock('@mfe/design-system', () => ({
  FormDrawer: ({
    children,
    footer,
    open,
  }: {
    children: React.ReactNode;
    footer?: React.ReactNode;
    open: boolean;
  }) => {
    if (!open) return null;
    return (
      <div data-testid="form-drawer-mock">
        {children}
        {footer}
      </div>
    );
  },
  TimePicker: ({
    value,
    onValueChange,
    ...rest
  }: {
    value?: string | null;
    onValueChange?: (v: string | null) => void;
    [k: string]: unknown;
  }) => (
    <input
      type="time"
      value={value ?? ''}
      onChange={(e) => onValueChange?.(e.target.value || null)}
      {...rest}
    />
  ),
  InputNumber: ({
    value,
    onChange,
    ...rest
  }: {
    value?: number | null;
    onChange?: (v: number | null) => void;
    [k: string]: unknown;
  }) => (
    <input
      type="number"
      value={value ?? ''}
      onChange={(e) => onChange?.(e.target.value === '' ? null : Number(e.target.value))}
      {...rest}
    />
  ),
}));

const baseProps = {
  open: true,
  mode: 'create' as const,
  submitting: false,
  onCancel: vi.fn(),
};

beforeEach(() => {
  baseProps.onCancel.mockReset();
});

afterEach(() => {
  cleanup();
});

describe('NotificationPreferenceForm — create mode defaults', () => {
  it('renders empty form when open with create mode', () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<NotificationPreferenceForm {...baseProps} onSubmit={onSubmit} />);
    expect(screen.getByTestId('pref-form-topic')).toHaveValue('');
    expect(screen.getByTestId('pref-form-channel')).toHaveValue('');
    expect(screen.getByTestId('pref-form-enabled')).toBeChecked();
    expect(screen.getByTestId('pref-form-bypass')).toBeChecked();
    // Quiet hours off by default
    expect(screen.getByTestId('pref-form-quiet-toggle')).not.toBeChecked();
    // Frequency limit "Limit yok" checked by default
    expect(screen.getByTestId('pref-form-freq-no-limit')).toBeChecked();
  });

  it('submits the minimal payload with quiet hours null + freq 0 + bypass true', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<NotificationPreferenceForm {...baseProps} onSubmit={onSubmit} />);
    fireEvent.change(screen.getByTestId('pref-form-topic'), {
      target: { value: 'auth.password-reset' },
    });
    fireEvent.change(screen.getByTestId('pref-form-channel'), { target: { value: 'email' } });
    fireEvent.click(screen.getByTestId('pref-form-save'));

    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toEqual({
      topicKey: 'auth.password-reset',
      channel: 'email',
      enabled: true,
      quietHours: null,
      frequencyLimitPerDay: 0,
      bypassForCritical: true,
    });
  });

  it('treats blank topic / channel as wildcard nulls', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<NotificationPreferenceForm {...baseProps} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByTestId('pref-form-enabled')); // uncheck enabled
    fireEvent.click(screen.getByTestId('pref-form-save'));

    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const arg = onSubmit.mock.calls[0][0];
    expect(arg.topicKey).toBeNull();
    expect(arg.channel).toBeNull();
    expect(arg.enabled).toBe(false);
  });
});

describe('NotificationPreferenceForm — quiet hours canonical mode', () => {
  it('serialises a canonical quiet-hours payload on save', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<NotificationPreferenceForm {...baseProps} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByTestId('pref-form-quiet-toggle'));
    // Default canonical: 22:00-07:00 / DEFAULT_DAYS (Mon..Fri)
    fireEvent.click(screen.getByTestId('pref-form-save'));

    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const arg = onSubmit.mock.calls[0][0];
    expect(arg.quietHours).toMatchObject({
      start: '22:00',
      end: '07:00',
      days: ['MON', 'TUE', 'WED', 'THU', 'FRI'],
    });
    expect(typeof arg.quietHours.timezone).toBe('string');
  });

  it('blocks save when start === end (would imply 24h mute)', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<NotificationPreferenceForm {...baseProps} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByTestId('pref-form-quiet-toggle'));
    fireEvent.change(screen.getByTestId('pref-form-quiet-end'), { target: { value: '22:00' } });

    expect(screen.getByTestId('pref-form-quiet-error')).toBeInTheDocument();
    expect(screen.getByTestId('pref-form-save')).toBeDisabled();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe('NotificationPreferenceForm — frequency limit', () => {
  it('sends frequencyLimitPerDay=0 when "Limit yok" is checked', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<NotificationPreferenceForm {...baseProps} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByTestId('pref-form-save'));
    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0].frequencyLimitPerDay).toBe(0);
  });

  it('sends a positive integer when "Limit yok" is unchecked and a value typed', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<NotificationPreferenceForm {...baseProps} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByTestId('pref-form-freq-no-limit'));
    fireEvent.change(screen.getByTestId('pref-form-freq-value'), { target: { value: '5' } });
    fireEvent.click(screen.getByTestId('pref-form-save'));
    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0].frequencyLimitPerDay).toBe(5);
  });

  it('blocks save when limit input is empty after unchecking "Limit yok"', () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<NotificationPreferenceForm {...baseProps} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByTestId('pref-form-freq-no-limit'));
    expect(screen.getByTestId('pref-form-freq-error')).toBeInTheDocument();
    expect(screen.getByTestId('pref-form-save')).toBeDisabled();
  });
});

describe('NotificationPreferenceForm — edit mode tuple lock (P1 absorb)', () => {
  it('disables and locks topicKey/channel inputs to prevent backend tuple drift', () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <NotificationPreferenceForm
        {...baseProps}
        mode="edit"
        initialValue={{
          id: 1,
          topicKey: 'auth.password-reset',
          channel: 'email',
          enabled: true,
          quietHours: null,
          frequencyLimitPerDay: null,
          bypassForCritical: true,
          createdAt: '2026-05-07T08:00:00Z',
          updatedAt: '2026-05-07T08:00:00Z',
        }}
        onSubmit={onSubmit}
      />,
    );

    const topic = screen.getByTestId('pref-form-topic') as HTMLInputElement;
    const channel = screen.getByTestId('pref-form-channel') as HTMLInputElement;
    expect(topic).toBeDisabled();
    expect(topic).toHaveAttribute('readonly');
    expect(channel).toBeDisabled();
    expect(channel).toHaveAttribute('readonly');
    expect(screen.getByTestId('pref-form-tuple-locked-note')).toBeInTheDocument();
  });

  it('does NOT disable topicKey/channel in create mode', () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<NotificationPreferenceForm {...baseProps} onSubmit={onSubmit} />);
    expect(screen.getByTestId('pref-form-topic')).not.toBeDisabled();
    expect(screen.getByTestId('pref-form-channel')).not.toBeDisabled();
    expect(screen.queryByTestId('pref-form-tuple-locked-note')).not.toBeInTheDocument();
  });
});

describe('NotificationPreferenceForm — edit mode preserves rich fields', () => {
  it('hydrates from initialValue and round-trips quiet hours / frequency / bypass', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <NotificationPreferenceForm
        {...baseProps}
        mode="edit"
        initialValue={{
          id: 7,
          topicKey: 'report.export.ready',
          channel: 'email',
          enabled: false,
          quietHours: {
            start: '22:00',
            end: '07:00',
            timezone: 'Europe/Istanbul',
            days: ['MON', 'TUE', 'WED', 'THU', 'FRI'],
          },
          frequencyLimitPerDay: 5,
          bypassForCritical: false,
          createdAt: '2026-05-07T08:00:00Z',
          updatedAt: '2026-05-07T08:00:00Z',
        }}
        onSubmit={onSubmit}
      />,
    );

    expect(screen.getByTestId('pref-form-topic')).toHaveValue('report.export.ready');
    expect(screen.getByTestId('pref-form-channel')).toHaveValue('email');
    expect(screen.getByTestId('pref-form-enabled')).not.toBeChecked();
    expect(screen.getByTestId('pref-form-bypass')).not.toBeChecked();
    expect(screen.getByTestId('pref-form-quiet-toggle')).toBeChecked();
    expect(screen.getByTestId('pref-form-freq-no-limit')).not.toBeChecked();
    expect(screen.getByTestId('pref-form-freq-value')).toHaveValue(5);

    fireEvent.click(screen.getByTestId('pref-form-save'));
    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const arg = onSubmit.mock.calls[0][0];
    expect(arg.quietHours).toMatchObject({
      start: '22:00',
      end: '07:00',
      days: ['MON', 'TUE', 'WED', 'THU', 'FRI'],
    });
    expect(arg.frequencyLimitPerDay).toBe(5);
    expect(arg.bypassForCritical).toBe(false);
  });

  it('preserves non-canonical quietHours payload when the user leaves quiet section as custom', async () => {
    // Codex Delta — non-canonical preservation: the operator opens the
    // editor for an existing rule whose quiet hours payload is custom
    // shape. They edit ONLY the channel and save. The submitted body
    // must carry the original raw object, not null.
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const customRaw = { rules: [{ from: 22, to: 7 }] };
    render(
      <NotificationPreferenceForm
        {...baseProps}
        mode="edit"
        initialValue={{
          id: 11,
          topicKey: 'system.maintenance',
          channel: 'sms',
          enabled: true,
          quietHours: customRaw,
          frequencyLimitPerDay: null,
          bypassForCritical: true,
          createdAt: '2026-05-07T08:00:00Z',
          updatedAt: '2026-05-07T08:00:00Z',
        }}
        onSubmit={onSubmit}
      />,
    );

    expect(screen.getByTestId('pref-form-quiet-custom-note')).toBeInTheDocument();
    fireEvent.change(screen.getByTestId('pref-form-channel'), { target: { value: 'email' } });
    fireEvent.click(screen.getByTestId('pref-form-save'));

    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0].quietHours).toEqual(customRaw);
    expect(onSubmit.mock.calls[0][0].channel).toBe('email');
  });
});
