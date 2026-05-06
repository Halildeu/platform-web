# Tailwind 4 — "Class on DOM but no CSS emitted" Rule

> Project rule (2026-05). Architectural rationale: ADR
> [`adr-test-environment-strategy.md`](../architecture/frontend/adr-test-environment-strategy.md)
> §L3 (CSSOM Harness — caught two related bug classes between PR-10
> and PR-15).

## Two failure modes, one symptom

A Tailwind class can land on a DOM element but produce no CSS — `getComputedStyle()` returns the UA default. We've hit two distinct root causes for this symptom in 2 weeks:

**Mode A: Scanner can't see template-literal class names.** Tailwind 4 walks source files looking for **literal strings** that match its class-name grammar. A template expression like `` `bg-${color}` `` produces fragments the scanner ignores. Even if `color = "action-primary"` at runtime, the rule never gets emitted unless `bg-action-primary` ALSO appears as a complete literal somewhere in the source tree.

**Mode B: Class is literal but token isn't in the Tailwind theme registry.** Tailwind's `@theme inline` block declares which tokens map to which Tailwind utility names. If a literal class (e.g., `bg-surface-inverse/40`) references a token that isn't `--color-*` registered, Tailwind drops the rule even though the source has the literal. PR-12 hit this — `--surface-inverse` existed in `theme.css` but `--color-surface-inverse` was not in `generated-theme-inline.css`.

Both modes silently fail at the CSS layer. cssom canary catches both because `expectToken` / `expectFocusRing` reads computed style.

## Rule for Mode A: literal classes only

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

## Runtime composition vs runtime generation

The rule applies to **how class strings are produced**, not to where
they're combined. There are two patterns to distinguish:

✅ **Runtime composition** (safe). Constituents are literal strings
that the scanner already sees in source. `cn()` / `clsx()` / template
literals that join precomputed literals at runtime are fine:

```ts
const VARIANT_CLASSES: Record<Variant, string> = {
  primary: 'bg-action-primary text-text-inverse',
  danger:  'bg-state-error-text text-text-inverse',
};
className={cn('px-3 py-2', VARIANT_CLASSES[variant], disabled && 'opacity-50')}
```

The scanner sees `bg-action-primary`, `bg-state-error-text`, `opacity-50`
all as literals in the source tree. Whichever combination the runtime
picks, the rules are already in the bundle.

❌ **Runtime generation** (unsafe). The full class is built by string
interpolation at runtime, with no copy of it as a literal in source:

```ts
className={cn(`bg-${color}`)}                 // ❌ "bg-${...}" → fragments
className={`text-${variant === 'sm' ? 'sm' : 'base'}`}  // ❌ same
```

Even if `color === "action-primary"` at runtime, Tailwind never sees
`bg-action-primary` as a complete token unless another file also
contains it as a literal — and that's accidental fragility.

**Slot/callback edge.** When a library accepts user-provided class
strings (e.g., a `slotProps` consumer prop), the consumer's source
must contain the constituent classes as literals, scanned by Tailwind
in the same build. If consumers can pass arbitrary tokens that the
library generates utilities from, you need either a registered lookup
on the library side OR a Tailwind 4 `@source inline(...)` directive
that pre-emits the class set.

## How to find the bug

The bug is invisible at runtime:

- The class IS on the DOM element (verified via `element.className`)
- `getComputedStyle()` returns the **default UA value** (e.g.
  `box-shadow: none`, `background-color: rgba(0,0,0,0)`)
- jsdom can't see this — its CSS parser doesn't run Tailwind anyway

The cssom canary IS the gate that catches both Mode A and Mode B
failures: `expectToken` / `expectFocusRing` fails because the
computed value doesn't match the expected token value, regardless of
which mode caused the missing emission. PR-10 + PR-15 (Mode A
template-literal scanner) and PR-12 (Mode B unregistered theme
token) all caught here.

## Rule for Mode B: every Tailwind-utility token must be in the @theme registry

When you reference a token in a Tailwind utility (`bg-X`, `text-X`,
`border-X`, etc.), the token's `--color-X` (or analogous) entry MUST
exist in `apps/mfe-shell/src/styles/generated-theme-inline.css`
(the `@theme inline` block). The generator script
`scripts/theme/generate-theme-css.mjs` produces this from the token
source.

If a token alias exists in `theme.css` but isn't promoted to
`--color-*`, Tailwind drops the utility silently.

PR-12's case: `theme.css` had `--surface-inverse: var(--surface-overlay-bg)`
but `--color-surface-inverse` was NOT in the `@theme` block. Fix: swept
`bg-surface-inverse` → `bg-surface-overlay` (registered) for every
backdrop callsite. Alternative would be promoting
`--color-surface-inverse` to the `@theme` — chose the rename because
creating two equivalent class names invites drift.

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

## When the scanner DOES emit a class without seeing it directly

Two escape hatches:

1. **The full class exists as a literal in another file the scanner
   walks.** If `bg-action-primary` appears as a complete literal in
   any scanned source, Tailwind emits the rule and your runtime
   `` `bg-${color}` `` accidentally works when `color === 'action-primary'`.
   This is **fragile** — the rule disappears the moment the literal
   reference is removed, refactored, or moved to an unscanned file.
   Don't rely on it.

2. **`@source inline(...)` directive in your CSS** (Tailwind 4
   native, NOT a JS config field). For API-driven content where the
   class set isn't statically known, you can list classes inline:

   ```css
   @import 'tailwindcss';
   @source inline('bg-action-primary', 'bg-state-error-text', 'bg-state-success-bg');
   ```

   The scanner treats each listed string as if it appeared in source.
   Useful for chart color palettes, theme variants generated from
   tokens, etc. The `apps/mfe-shell/src/index.css` and
   `packages/design-system/src/__tests__/cssom-harness.css` files
   already use `@source` for the design-system source tree; if you
   need additional inline classes, add `@source inline(...)` here.

   This repo does not use the legacy JS-config `safelist:` array —
   Tailwind 4 has deprecated that surface in favor of `@source inline`.

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
