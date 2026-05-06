# Tailwind 4 Content Scanner — Literal-Class-Only Rule

> Project rule (2026-05). Architectural rationale: ADR
> [`adr-test-environment-strategy.md`](../architecture/frontend/adr-test-environment-strategy.md)
> §L3 (CSSOM Harness — caught the bug class three times: PR-10,
> PR-12, PR-15).

## The rule

**Tailwind class names that need to compile to CSS MUST appear as
literal strings in source files.** Template-literal-built class
names are silently dropped by Tailwind 4's content scanner.

❌ **Anti-pattern** (silently broken):

```ts
function focusRingClassWithColor(strategy: 'ring' | 'outline', color: string) {
  const opacity = strategy === 'outline' ? '50' : '30';
  // Tailwind will see "focus-visible:ring-${...}" and treat it as a fragment.
  // No CSS rule is emitted. The class is on the DOM but invisible.
  return [
    `focus-visible:ring-${strategy === 'outline' ? '1' : '2'}`,
    `focus-visible:ring-[color-mix(in_oklab,${color}_${opacity}%,transparent)]`,
  ].join(' ');
}
```

✅ **Correct pattern** (lookup table with literal values):

```ts
const FOCUS_RING_CLASSES: Record<FocusStrategy, string> = {
  ring: [
    'focus-visible:outline-hidden',
    'focus-visible:ring-2',
    'focus-visible:ring-[color-mix(in_oklab,var(--focus-ring)_30%,transparent)]',
    'focus-visible:ring-offset-2',
  ].join(' '),
  outline: [...],
  inset: [...],
  none: 'focus-visible:outline-hidden',
};

export function focusRingClass(strategy: FocusStrategy = 'ring'): string {
  return FOCUS_RING_CLASSES[strategy];
}
```

## Why the scanner can't see template literals

Tailwind 4 walks source files looking for **literal strings** that
match its class-name grammar (`bg-token`, `text-token/N`, `ring-[...]`,
etc.). It uses regex tokenization on each file, NOT runtime evaluation.
A template-literal expression like `` `bg-${color}` `` produces `bg-`
and `${color}` as separate tokens — neither matches a complete
utility, so neither generates CSS.

This isn't a Tailwind bug; it's a fundamental property of static
content scanning. The fix is to materialize every class name we want
compiled as a complete literal string somewhere in the source tree
the scanner walks.

## How to find the bug

The bug is invisible at runtime:

- The class IS on the DOM element (verified via `element.className`)
- `getComputedStyle()` returns the **default UA value** (e.g.
  `box-shadow: none`, `background-color: rgba(0,0,0,0)`)
- jsdom can't see this — its CSS parser doesn't run Tailwind anyway

The cssom canary IS the gate that catches it. If a token-bound class
fails to emit, `expectToken` / `expectFocusRing` fails because the
computed value doesn't match the expected token value. PR-10 + PR-12 +
PR-15 all caught the bug this way.

## Approved patterns for "I need dynamic colors"

When a function needs to return classes for one of several token
choices, pre-register every choice as a literal entry:

### Strategy lookup (most common)

```ts
const VARIANT_CLASSES: Record<Variant, string> = {
  primary: 'bg-action-primary text-text-inverse hover:bg-accent-primary-hover',
  secondary: 'bg-surface-muted text-text-primary hover:bg-surface-default',
  danger: 'bg-state-error-text text-text-inverse hover:bg-state-error-text/90',
};
```

### Token-keyed override (PR-15 pattern)

```ts
const COLOR_OVERRIDE_RING_CLASSES: Record<string, Record<FocusStrategy, string>> = {
  'state-error-text': { ring: '...', outline: '...', inset: '...', none: '...' },
  // Adding a new token? Register here. Surface unsupported tokens
  // explicitly via dev warning + fallback to the default ring.
};

export function focusRingClassWithColor(strategy, color) {
  const tokenName = color.match(/^var\(--([\w-]+)\)$/)?.[1];
  if (tokenName && COLOR_OVERRIDE_RING_CLASSES[tokenName]) {
    return COLOR_OVERRIDE_RING_CLASSES[tokenName][strategy];
  }
  // Fallback to default — graceful degradation.
}
```

### Variant + state product (Alert pattern)

```ts
const variantStyles: Record<AlertVariant, string> = {
  info: 'bg-state-info-bg border-state-info-text/20 text-state-info-text',
  success: 'bg-state-success-bg border-state-success-text/20 text-state-success-text',
  // ...
};
```

## When the scanner DOES see template literals

Two cases where templates work:

1. **The full class still exists as a literal somewhere else.** If
   another file in the source tree has `bg-action-primary` as a
   complete literal, the scanner emits the rule, and your template
   `` `bg-${color}` `` (with `color = 'action-primary'`) renders
   correctly because the rule is already in the bundle. This is
   **accidental** — fragile to refactors. Don't rely on it.

2. **You add the class to a `safelist`.** Tailwind config can list
   class names that must always compile, even if no source file
   references them. Useful for API-driven content. Not used in this
   repo as of 2026-05.

## Caught bugs (case studies)

### PR-10 (Codex thread `019dfa25`) — Checkbox/Switch focus ring invisible

`peerFocusVisibleRingClass` and `hasFocusVisibleRingClass` initially
built classes with `` `peer-focus-visible:ring-${ringWidth}` ``. The
class was on the DOM but `box-shadow: none`. Fix: token-keyed
literal lookup mirroring `FOCUS_RING_CLASSES`.

### PR-12 (Codex thread `019dfa4b`) — Modal/drawer backdrops invisible

`bg-surface-inverse/40` was used in 12 files. Tailwind theme had
`--color-surface-overlay` registered but NOT `--color-surface-inverse`
(both alias the same underlying token via `theme.css`). Tailwind
silently dropped the class because the color name wasn't in the
theme registry. Production modal backdrops were transparent.

Fix: sweep all 12 files to `bg-surface-overlay/N`. Same visual
outcome, registered class.

### PR-15 (Codex thread `019dfaed`) — Button danger ring invisible

`focusRingClassWithColor` built classes via template literals.
Production source called `focusRingClassWithColor("ring",
"var(--state-error-text)")` and got back a string the scanner
ignored. Button danger had no visible focus ring.

Fix: `COLOR_OVERRIDE_RING_CLASSES` lookup table with literal entries
for every registered token. Registry membership is now an explicit
gate.

## How to enforce in CI

The cssom canary is the contract layer:

- `expectToken(el, prop, tokenName)` — fails if the computed style
  doesn't match the resolved token value. Catches "class on DOM but
  CSS not emitted".
- `expectFocusRing(el)` — fails if neither outline nor box-shadow is
  set after focus. Catches missing ring rules.
- Token-contract tests (PR-15 Button danger pattern):
  ```ts
  expect(button.className).toContain(
    'focus-visible:ring-[color-mix(in_oklab,var(--state-error-text)_30%,transparent)]',
  );
  ```
  Catches "fell back to default fallback path" — the className would
  not contain the expected literal if the registry missed.

## Adding a new dynamic-class function

Checklist:

- [ ] Identify every concrete output the function will return
- [ ] Define a `Record<Key, string>` lookup table with literal values
- [ ] Body is `return TABLE[key]` (no template literals in returned string)
- [ ] If lookup can miss: dev-time warning + safe fallback (don't return empty)
- [ ] cssom canary test asserts the contract for at least one
      registered key (e.g., `expectToken` or `className.toContain`)
- [ ] Doc comment explaining the scanner limitation + how to add
      a new key

## References

- ADR §L3: [`adr-test-environment-strategy.md`](../architecture/frontend/adr-test-environment-strategy.md)
- focus-policy.ts: [`packages/design-system/src/internal/interaction-core/focus-policy.ts`](../../packages/design-system/src/internal/interaction-core/focus-policy.ts)
- PR-10 helpers: `peerFocusVisibleRingClass`, `hasFocusVisibleRingClass`
- PR-12 sweep: 12 files swept from `bg-surface-inverse/N` → `bg-surface-overlay/N`
- PR-15 lookup: `COLOR_OVERRIDE_RING_CLASSES`
