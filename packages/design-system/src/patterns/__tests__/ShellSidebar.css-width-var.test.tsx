// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { ShellSidebar } from '../shell-sidebar/ShellSidebar';

const TEST_WIDTH_VAR = '--test-shell-sidebar-width';

afterEach(() => {
  document.documentElement.style.removeProperty(TEST_WIDTH_VAR);
});

describe('ShellSidebar CSS width variable lifecycle', () => {
  it('removes the layout width variable when the sidebar unmounts', () => {
    const { unmount } = render(
      <ShellSidebar
        navItems={[]}
        cssWidthVar={TEST_WIDTH_VAR}
        collapsedWidth={64}
        expandedWidth={280}
        showFullscreenToggle={false}
      />,
    );

    expect(document.documentElement.style.getPropertyValue(TEST_WIDTH_VAR)).toBe('280px');

    unmount();

    expect(document.documentElement.style.getPropertyValue(TEST_WIDTH_VAR)).toBe('');
  });
});
