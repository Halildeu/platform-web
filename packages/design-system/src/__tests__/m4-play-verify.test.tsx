/**
 * M4 follow-up — actually runs the play functions of the 11 stories that were
 * enriched in PR #64 to prove they pass at runtime (not just compile via
 * `storybook build`). Addresses the "fake test / unrun assertion" risk.
 *
 * Invocation:
 *   npx vitest run --config packages/design-system/vitest.config.ts \
 *     src/__tests__/m4-play-verify.test.tsx
 */
import { describe, test } from 'vitest';
import { composeStories } from '@storybook/react';

import * as FilterCombinatorRowStories from '../advanced/data-grid/filter-builder/FilterCombinatorRow.stories';
import * as FilterConditionRowStories from '../advanced/data-grid/filter-builder/FilterConditionRow.stories';
import * as FilterGroupNodeStories from '../advanced/data-grid/filter-builder/FilterGroupNode.stories';
import * as FilterValueEditorStories from '../advanced/data-grid/filter-builder/FilterValueEditor.stories';
import * as FilterBuilderPanelStories from '../advanced/data-grid/filter-builder/FilterBuilderPanel.stories';
import * as GroupedCardGalleryStories from '../components/grouped-card-gallery/GroupedCardGallery.stories';
import * as GallerySearchBarStories from '../components/grouped-card-gallery/GallerySearchBar.stories';
import * as HoverDescriptionStories from '../primitives/hover-description/HoverDescription.stories';
import * as FullscreenToggleStories from '../primitives/fullscreen-toggle/FullscreenToggle.stories';
import * as ShellHeaderStories from '../patterns/shell-header/ShellHeader.stories';
import * as ShellSidebarStories from '../patterns/shell-sidebar/ShellSidebar.stories';

const components = [
  ['FilterCombinatorRow', FilterCombinatorRowStories],
  ['FilterConditionRow', FilterConditionRowStories],
  ['FilterGroupNode', FilterGroupNodeStories],
  ['FilterValueEditor', FilterValueEditorStories],
  ['FilterBuilderPanel', FilterBuilderPanelStories],
  ['GroupedCardGallery', GroupedCardGalleryStories],
  ['GallerySearchBar', GallerySearchBarStories],
  ['HoverDescription', HoverDescriptionStories],
  ['FullscreenToggle', FullscreenToggleStories],
  ['ShellHeader', ShellHeaderStories],
  ['ShellSidebar', ShellSidebarStories],
] as const;

describe('M4 play function runtime verification (11 stories)', () => {
  for (const [name, stories] of components) {
    test(`${name}.Interactive runs play function without throwing`, async () => {
      const composed = composeStories(stories as Record<string, unknown>);
      const Interactive = (composed as Record<string, unknown>).Interactive as
        | { run?: () => Promise<void> }
        | undefined;

      if (!Interactive) {
        throw new Error(`${name}: no Interactive story exported`);
      }
      if (typeof Interactive.run !== 'function') {
        throw new Error(
          `${name}.Interactive.run is not a function — composeStories did not attach play()`,
        );
      }
      // Storybook 10's composeStories returns a `.run()` that internally
      // renders the story into a fresh canvasElement and invokes play().
      // No external render() needed — that previously caused a double-mount
      // / NotFoundError on cleanup.
      await Interactive.run();
    });
  }
});
