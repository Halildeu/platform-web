import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import ForbiddenPage from './ForbiddenPage';

describe('ForbiddenPage', () => {
  it('renders the forbidden alert with i18n copy', () => {
    render(<ForbiddenPage />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    // Locale-agnostic — both `tr` and `en` dicts produce a non-empty heading.
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBeTruthy();
  });
});
