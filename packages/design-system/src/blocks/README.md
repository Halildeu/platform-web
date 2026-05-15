# Blocks — Composite/Template Components

## Purpose

A **block** is a composite UI surface built from multiple primitives + components + patterns, intended as a high-level building block for full page regions (dashboards, CRUD lists, admin panels, review flows, forms, layouts).

Blocks fill the gap between:

| Layer         | Atomicity                 | Examples                                  |
| ------------- | ------------------------- | ----------------------------------------- |
| `primitives/` | atomic (1 element)        | Button, Input, Dialog, Tooltip            |
| `components/` | 2+ primitive compositions | Pagination, Combobox, Breadcrumb          |
| `patterns/`   | page-region layouts       | PageHeader, FilterBar, DetailDrawer       |
| **`blocks/`** | **composite templates**   | **MetricCard, EntityTable, ActivityFeed** |

Blocks are **production-ready, opinionated assemblies** — drop-in solutions for common page sections.

## Folder Convention

Every block lives in its own kebab-case folder:

```
blocks/
├── README.md              ← this file
├── index.ts               ← barrel re-export
├── registry.ts            ← marketplace metadata (BlockMeta[])
├── types.ts               ← BlockMeta + BlockRegistry types
├── __tests__/             ← shared block tests + registry tests
└── <kebab-case-name>/     ← per-block folder
    ├── <PascalCase>.tsx           ← block source
    ├── <PascalCase>.stories.tsx   ← Storybook stories
    ├── <PascalCase>.figma.tsx     ← Figma Code Connect bindings
    ├── index.ts                   ← named exports (component + types)
    └── __tests__/                 ← block-specific tests
        ├── <PascalCase>.contract.test.tsx
        └── <PascalCase>.depth.test.tsx
```

## Block `index.ts` shape

```ts
// blocks/<kebab>/index.ts
export { <PascalCase> } from './<PascalCase>';
export type {
  <PascalCase>Props,
  <PascalCase>RelatedType,
  // ... other public types
} from './<PascalCase>';
```

## Top-level `blocks/index.ts` shape

```ts
// blocks/index.ts
// Marketplace registry (existing)
export type { BlockMeta, BlockRegistry } from './types';
export { blockRegistry, getAllBlocks, getBlocksByCategory, searchBlocks, getBlock } from './registry';

// Per-block components (one line per block)
export { <PascalCase> } from './<kebab>';
```

## Story taxonomy

Stories must declare canonical taxonomy:

```ts
export default {
  title: 'Blocks/<PascalCase>',
  // ...
};
```

Categories: `Dashboard/`, `CRUD/`, `Admin/`, `Review/`, `Form/`, `Layout/` as sub-taxonomy when natural (`Blocks/Dashboard/MetricCard`).

## Type export rule

Every block folder's `index.ts` **must** re-export all public types (props, related entity types, locale text types). Mirror the source file's `export interface`/`export type` declarations.

## Registry metadata

Every new block must register its metadata in `registry.ts`:

```ts
{
  id: '<kebab-case-name>',
  name: '<PascalCase>',
  category: 'dashboard' | 'crud' | 'admin' | 'review' | 'form' | 'layout',
  description: '<one-line summary>',
  components: ['<Component1>', '<Component2>', ...],   // DS components used
  tags: ['<tag1>', '<tag2>', ...],                     // search keywords
}
```

The registry powers the **Design Lab block marketplace** (browse, search, filter blocks by category/tag).

## Compat shim pattern (migration from `enterprise/`)

When migrating an existing `enterprise/<Name>.tsx` into a block:

1. `git mv` source files to `blocks/<kebab>/<Name>.{tsx,stories.tsx,figma.tsx}`
2. `git mv` test files to `blocks/<kebab>/__tests__/<Name>.{contract,depth}.test.tsx`
3. Create `blocks/<kebab>/index.ts` (named + type exports)
4. Add `export { <PascalCase> } from './<kebab>';` to `blocks/index.ts`
5. Add block metadata entry to `registry.ts`
6. Update `enterprise/index.ts` to compat shim:
   ```ts
   // <Name> moved to ../blocks/<kebab>/ (Phase 2 — yyyy-mm-dd)
   export { <PascalCase> } from '../blocks/<kebab>/<PascalCase>';
   export type { <PascalCase>Props } from '../blocks/<kebab>/<PascalCase>';
   ```
7. Update story title: `Enterprise/<Name>` → `Blocks/<Name>` (or `Blocks/<Category>/<Name>`)
8. Update `apps/mfe-shell/public/scorecard.json` path field: `enterprise/<Name>.tsx` → `blocks/<kebab>/<Name>.tsx`
9. Fix any moved-file relative imports (`../utils/cn` → `../../utils/cn` etc.)
10. Verify `npx tsc --noEmit` is clean for new paths

## Compat shim lifetime

The `enterprise/index.ts` re-export shim is **temporary** — kept for backward compatibility while consumers migrate to canonical block imports. Future cleanup (`Phase 4`) may remove the shim after the deprecation window.

## Not a block

The following are **not** blocks and should not live in `blocks/`:

- Single primitives → `primitives/`
- 2-3 primitive compositions without page-region intent → `components/`
- Page layout regions (header, sidebar, drawer wrappers) → `patterns/`
- Generic utilities (format, color, tone helpers) → `utils/`
- Domain-specific widgets (regulatory, locale-restricted) → `enterprise/domain/<locale>/`

## Sister documents

- Component authoring: `STANDARDS.md`
- Slot pattern: `SLOT-PATTERN.md`
- Portal behavior: `PORTAL-BEHAVIOR.md`
- API tiers: `API-STABILITY-TIERS.md`
- Phase 2 triage (this migration): Codex thread `019e2701` peer review record
