// @vitest-environment jsdom
// Generated depth test — regenerate: node scripts/ci/generate-depth-tests.mjs --write
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, render } from '@testing-library/react';
import { ControlChart } from '../ControlChart';

afterEach(cleanup);

const requiredProps = {
  data: 'Array<{ x: string',
};
describe('ControlChart — depth', () => {
  describe('ControlChart — depth: basic resilience', () => {
    it('renders without crash', () => {
      const { container } = render(<ControlChart {...requiredProps} />);
      expect(container.firstElementChild).toBeTruthy();
    });

    it('renders twice without side effects', () => {
      render(<ControlChart {...requiredProps} />);
      cleanup();
      const { container: c2 } = render(<ControlChart {...requiredProps} />);
      expect(c2.firstElementChild).toBeTruthy();
    });
  });
});
