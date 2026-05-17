import { describe, expect, it } from 'vitest';
import {
  SEARCHABLE_ITEMS,
  isSearchableItemVisible,
  type SearchableItem,
  type SearchableItemVisibilityCtx,
} from '../header-search.config';

const pick = (id: string): SearchableItem => {
  const item = SEARCHABLE_ITEMS.find((i) => i.id === id);
  if (!item) throw new Error(`searchable item not found: ${id}`);
  return item;
};

const ctx = (over: Partial<SearchableItemVisibilityCtx> = {}): SearchableItemVisibilityCtx => ({
  isSuperAdmin: false,
  hasModule: () => false,
  suggestionsEnabled: true,
  ethicEnabled: true,
  ...over,
});

describe('isSearchableItemVisible — global search permission gate', () => {
  it('hides the schema-explorer tool from users without the THEME module', () => {
    // Regression: tool-schema had no `permission`, so it leaked into the
    // Cmd/Ctrl+K command palette for everyone — clicking it landed on
    // /unauthorized (the /admin/schema-explorer route guard needs THEME).
    const toolSchema = pick('tool-schema');
    expect(toolSchema.permission).toBe('THEME');

    expect(isSearchableItemVisible(toolSchema, ctx())).toBe(false);
  });

  it('shows the schema-explorer tool when the THEME module is granted', () => {
    const toolSchema = pick('tool-schema');
    expect(isSearchableItemVisible(toolSchema, ctx({ hasModule: (m) => m === 'THEME' }))).toBe(
      true,
    );
  });

  it('shows permission-gated items to super admins with no explicit modules', () => {
    // hasModule does not implicitly return true for super admins, so the
    // predicate must honour isSuperAdmin — otherwise a super admin loses
    // every gated search result.
    const toolSchema = pick('tool-schema');
    expect(isSearchableItemVisible(toolSchema, ctx({ isSuperAdmin: true }))).toBe(true);
  });

  it('keeps ungated navigation/command items visible', () => {
    expect(isSearchableItemVisible(pick('nav-home'), ctx())).toBe(true);
    expect(isSearchableItemVisible(pick('cmd-theme-toggle'), ctx())).toBe(true);
  });

  it('still gates items behind remote feature flags', () => {
    expect(
      isSearchableItemVisible(pick('nav-suggestions'), ctx({ suggestionsEnabled: false })),
    ).toBe(false);
    expect(
      isSearchableItemVisible(pick('nav-suggestions'), ctx({ suggestionsEnabled: true })),
    ).toBe(true);
  });
});
