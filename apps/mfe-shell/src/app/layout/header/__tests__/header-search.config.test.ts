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
    // nav-suggestions also carries permission: SUGGESTIONS, so grant the
    // module here to isolate the remote-flag dimension.
    const withModule = (over = {}) => ctx({ hasModule: (m) => m === 'SUGGESTIONS', ...over });
    expect(
      isSearchableItemVisible(pick('nav-suggestions'), withModule({ suggestionsEnabled: false })),
    ).toBe(false);
    expect(
      isSearchableItemVisible(pick('nav-suggestions'), withModule({ suggestionsEnabled: true })),
    ).toBe(true);
  });

  it('hides the Suggestions search item without the SUGGESTIONS module', () => {
    // Regression: nav-suggestions had no `permission` — it leaked the
    // Öneriler remote into Cmd/Ctrl+K for every authenticated user.
    const navSuggestions = pick('nav-suggestions');
    expect(navSuggestions.permission).toBe('SUGGESTIONS');
    expect(isSearchableItemVisible(navSuggestions, ctx())).toBe(false);
    expect(
      isSearchableItemVisible(navSuggestions, ctx({ hasModule: (m) => m === 'SUGGESTIONS' })),
    ).toBe(true);
    expect(isSearchableItemVisible(navSuggestions, ctx({ isSuperAdmin: true }))).toBe(true);
  });

  it('hides the Ethic search item without the ETHIC module', () => {
    const navEthic = pick('nav-ethic');
    expect(navEthic.permission).toBe('ETHIC');
    expect(isSearchableItemVisible(navEthic, ctx())).toBe(false);
    expect(isSearchableItemVisible(navEthic, ctx({ hasModule: (m) => m === 'ETHIC' }))).toBe(true);
    expect(isSearchableItemVisible(navEthic, ctx({ isSuperAdmin: true }))).toBe(true);
  });
});
