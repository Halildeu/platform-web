// @vitest-environment jsdom
/**
 * Adım 14 PR-2 — FilterFormStyle preset tests.
 */

import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FilterFormStyle, FilterFormRow } from './FilterFormStyle';

describe('FilterFormStyle', () => {
  it('renders children inside container', () => {
    render(
      <FilterFormStyle>
        <div>child-1</div>
        <div>child-2</div>
      </FilterFormStyle>,
    );
    const container = screen.getByTestId('filter-form-style');
    expect(container).toBeTruthy();
    expect(container.textContent).toContain('child-1');
    expect(container.textContent).toContain('child-2');
  });

  it('defaults direction=vertical', () => {
    render(
      <FilterFormStyle>
        <div>row</div>
      </FilterFormStyle>,
    );
    const container = screen.getByTestId('filter-form-style');
    expect(container.getAttribute('data-direction')).toBe('vertical');
    expect(container.className).toContain('flex-col');
  });

  it('supports horizontal direction', () => {
    render(
      <FilterFormStyle direction="horizontal">
        <div>row</div>
      </FilterFormStyle>,
    );
    const container = screen.getByTestId('filter-form-style');
    expect(container.getAttribute('data-direction')).toBe('horizontal');
    expect(container.className).toContain('flex-wrap');
  });

  it('accepts custom className', () => {
    render(
      <FilterFormStyle className="custom-extra">
        <div>row</div>
      </FilterFormStyle>,
    );
    const container = screen.getByTestId('filter-form-style');
    expect(container.className).toContain('custom-extra');
  });

  it('renders as custom element', () => {
    const { container } = render(
      <FilterFormStyle as="form">
        <div>row</div>
      </FilterFormStyle>,
    );
    expect(container.querySelector('form')).toBeTruthy();
  });
});

describe('FilterFormRow', () => {
  it('renders label + child input', () => {
    render(
      <FilterFormRow label="Tarih">
        <input type="text" />
      </FilterFormRow>,
    );
    expect(screen.getByText('Tarih')).toBeTruthy();
    expect(screen.getByRole('textbox')).toBeTruthy();
  });

  it('renders helper text', () => {
    render(
      <FilterFormRow label="Şube" helperText="Tüm şubeleri içerir">
        <input type="text" />
      </FilterFormRow>,
    );
    expect(screen.getByText('Tüm şubeleri içerir')).toBeTruthy();
  });

  it('omits label when not provided', () => {
    render(
      <FilterFormRow>
        <input type="text" />
      </FilterFormRow>,
    );
    const row = screen.getByTestId('filter-form-row');
    expect(row.querySelector('label')).toBeNull();
  });

  it('applies custom width class', () => {
    render(
      <FilterFormRow widthClassName="min-w-[400px]">
        <input type="text" />
      </FilterFormRow>,
    );
    const row = screen.getByTestId('filter-form-row');
    expect(row.className).toContain('min-w-[400px]');
  });
});
