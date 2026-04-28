// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdaptiveForm, type FormField } from '../AdaptiveForm';

/**
 * K3-1 (PHASE F5 fallback) — AdaptiveForm standard behavior contract.
 *
 * AI/MCP/adaptive provider yokken component schema-driven, deterministik,
 * input-only davranır. AI suggestion / computed reorder / external dependency
 * yok. Bu testler "AI runtime/config olmadan" davranışı kilitler.
 */

const SCHEMA: FormField[] = [
  { key: 'firstName', type: 'text', label: 'Ad', required: true, defaultValue: 'Ali' },
  { key: 'age', type: 'number', label: 'Yas', defaultValue: 30 },
  {
    key: 'role',
    type: 'select',
    label: 'Rol',
    options: [
      { label: 'Yonetici', value: 'admin' },
      { label: 'Kullanici', value: 'user' },
    ],
  },
  { key: 'notes', type: 'textarea', label: 'Notlar' },
];

afterEach(cleanup);

describe('AdaptiveForm — fallback (no AI runtime)', () => {
  it('renders fields in schema order — no AI re-ordering', () => {
    render(<AdaptiveForm fields={SCHEMA} />);
    const labels = screen.getAllByText(/Ad|Yas|Rol|Notlar/);
    // First three should be Ad, Yas, Rol (Notlar 4th)
    expect(labels[0]).toHaveTextContent('Ad');
    expect(labels[1]).toHaveTextContent('Yas');
    expect(labels[2]).toHaveTextContent('Rol');
    expect(labels[3]).toHaveTextContent('Notlar');
  });

  it('uses field defaultValue as initial input value', () => {
    render(<AdaptiveForm fields={SCHEMA} />);
    const nameInput = screen.getByLabelText(/Ad/) as HTMLInputElement;
    expect(nameInput.value).toBe('Ali');
    const ageInput = screen.getByLabelText(/Yas/) as HTMLInputElement;
    expect(ageInput.value).toBe('30');
  });

  it('honours explicit columns=2 prop without auto-layout override', () => {
    render(<AdaptiveForm fields={SCHEMA} columns={2} />);
    const form = document.querySelector('[data-component="adaptive-form"]');
    expect(form).toBeInTheDocument();
    // No fields hidden by adaptive logic
    expect(screen.getAllByText(/Ad|Yas|Rol|Notlar/).length).toBeGreaterThanOrEqual(4);
  });

  it('honours explicit layout="horizontal" prop', () => {
    const { container } = render(<AdaptiveForm fields={SCHEMA} layout="horizontal" />);
    const form = container.querySelector('[data-component="adaptive-form"]');
    expect(form).toHaveAttribute('data-layout', 'horizontal');
  });

  it('hides dependent fields when dependsOn condition is not met (only based on values)', () => {
    const conditionalSchema: FormField[] = [
      { key: 'isPremium', type: 'checkbox', label: 'Premium' },
      {
        key: 'discount',
        type: 'text',
        label: 'Indirim Kodu',
        dependsOn: { field: 'isPremium', value: true },
      },
    ];
    render(<AdaptiveForm fields={conditionalSchema} />);
    expect(screen.queryByLabelText(/Indirim Kodu/)).not.toBeInTheDocument();
    expect(screen.getByText(/Premium/)).toBeInTheDocument();
  });

  it('shows dependent field when dependsOn becomes true (deterministic, value-driven)', async () => {
    const conditionalSchema: FormField[] = [
      { key: 'isPremium', type: 'checkbox', label: 'Premium' },
      {
        key: 'discount',
        type: 'text',
        label: 'Indirim Kodu',
        dependsOn: { field: 'isPremium', value: true },
      },
    ];
    render(<AdaptiveForm fields={conditionalSchema} />);
    const checkbox = screen.getByLabelText(/Premium/);
    await userEvent.click(checkbox);
    expect(screen.getByLabelText(/Indirim Kodu/)).toBeInTheDocument();
  });

  it('does not block submit when a hidden dependent required field has no value (visible-only validation)', async () => {
    const hiddenRequiredSchema: FormField[] = [
      {
        key: 'kind',
        type: 'select',
        label: 'Tip',
        defaultValue: 'free',
        options: [
          { label: 'Free', value: 'free' },
          { label: 'Pro', value: 'pro' },
        ],
      },
      {
        key: 'invoice',
        type: 'text',
        label: 'Fatura',
        required: true,
        dependsOn: { field: 'kind', value: 'pro' },
      },
    ];
    const onSubmit = vi.fn();
    render(<AdaptiveForm fields={hiddenRequiredSchema} onSubmit={onSubmit} />);
    const submit = screen.getByRole('button', { name: /Gonder/ });
    await userEvent.click(submit);
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ kind: 'free' }));
  });

  it('calls onSubmit with current values from defaults + user input (no AI augmentation)', async () => {
    const onSubmit = vi.fn();
    render(<AdaptiveForm fields={SCHEMA} onSubmit={onSubmit} />);
    const notes = screen.getByLabelText(/Notlar/);
    await userEvent.type(notes, 'manual entry');
    const submit = screen.getByRole('button', { name: /Gonder/ });
    await userEvent.click(submit);
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith({
      firstName: 'Ali',
      age: 30,
      notes: 'manual entry',
    });
  });

  it('does not trigger any external runtime call on render or submit (no MCP/fetch)', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() =>
        Promise.reject(new Error('fetch should not be called in fallback mode')),
      );
    try {
      render(<AdaptiveForm fields={SCHEMA} onSubmit={vi.fn()} />);
      const submit = screen.getByRole('button', { name: /Gonder/ });
      await userEvent.click(submit);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
