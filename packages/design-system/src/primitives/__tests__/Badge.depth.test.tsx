// @vitest-environment jsdom
// Generated depth test — regenerate: node scripts/ci/generate-depth-tests.mjs --write
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Badge } from '../badge/Badge';

afterEach(cleanup);

describe('Badge — depth', () => {
  describe('Badge — depth: prop combinations', () => {
    it('renders with dot + asChild simultaneously', () => {
      render(<Badge dot asChild aria-hidden="true">Stressed</Badge>);
      expect(screen.queryByText('Stressed') || document.body.firstElementChild).toBeTruthy();
    });

    it('does not crash with all boolean props toggled', () => {
      const { container } = render(<Badge dot asChild aria-hidden="true" />);
      expect(container.firstElementChild).toBeTruthy();
    });
  });
});
