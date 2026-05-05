import type { Preview } from '@storybook/react';

/**
 * L4 invariant matrix preview config (PR-3).
 *
 * Minimal companion to .storybook-invariants/main.ts. The matrix stories
 * themselves set their own theme/density/direction via story args (not
 * via a Storybook globalTypes toolbar) so each named story produces a
 * deterministic snapshot independent of UI state. This preview file
 * therefore just loads the production CSS entry the matrix renders
 * against — same Tailwind 4 + token chain that mfe-shell uses.
 *
 * The matrix stories deliberately avoid the .storybook (full) preview's
 * theme decorator: the decorator pulls theme from globals at render
 * time, which Playwright's screenshot run does not toggle. Invariant
 * snapshots must be reproducible from the URL alone.
 */

import '../apps/mfe-shell/src/index.css';

const preview: Preview = {
  parameters: {
    layout: 'fullscreen',
    docs: {
      autodocs: false,
    },
    // Disable backgrounds add-on default; matrix stories set their own
    // surface via the production token system.
    backgrounds: {
      disable: true,
    },
  },
};

export default preview;
