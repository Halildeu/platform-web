/* ------------------------------------------------------------------ */
/*  Layer Stack — z-index management for overlays                      */
/*                                                                     */
/*  Manages a stack of overlay layers to ensure proper z-index         */
/*  ordering without hardcoded z-index values. Each new overlay        */
/*  registers itself and gets an auto-incremented z-index.             */
/*                                                                     */
/*  Faz 2.1 — Layer Stack                                              */
/* ------------------------------------------------------------------ */

/* ---- Z-Index Scale ---- */

export const Z_INDEX_BASE = {
  /** Page content */
  content: 0,
  /** Sticky headers, floating action buttons */
  sticky: 100,
  /** Dropdown menus, tooltips */
  dropdown: 200,
  /**
   * Popover (default non-modal). Codex 019dde60 iter-47b1 — semantically
   * distinct from `dropdown` so the auto-close registry coming in
   * iter-47b2 can target popovers explicitly. Z-index band intentionally
   * shared with `dropdown` (visual stacking unchanged) per Codex review.
   */
  popover: 200,
  /** Modal overlays, drawers */
  modal: 300,
  /** Toast notifications */
  toast: 400,
  /** Top-most: spotlight, coachmarks */
  spotlight: 500,
} as const;

export type ZIndexLayer = keyof typeof Z_INDEX_BASE;

/**
 * Layer participation flags. Codex 019dde60 iter-47b1 — captures the
 * COMPONENT capability, not the runtime prop state. A modal that has
 * `disableFocusTrap=true` still registers as `participatesInFocusTrap:
 * true` (the consumer hook then chooses not to use the trap), keeping
 * the layer-stack semantic stable across props.
 */
export type LayerParticipation = {
  /**
   * Whether this layer should be considered when answering
   * `isTopFocusTrapLayer`. Default by type:
   *   modal  → true
   *   modal-style popover (enableFocusTrap=true) → true
   *   default popover, dropdown, toast → false
   */
  participatesInFocusTrap: boolean;
  /**
   * Whether this layer should be considered when answering
   * `isTopDismissableLayer` (Escape + outside-click LIFO). Default
   * by type:
   *   modal, dropdown, popover (default), modal-style popover → true
   *   toast → false (non-interactive overlay)
   */
  participatesInDismissal: boolean;
};

const DEFAULT_PARTICIPATION: Record<ZIndexLayer, LayerParticipation> = {
  content: { participatesInFocusTrap: false, participatesInDismissal: false },
  sticky: { participatesInFocusTrap: false, participatesInDismissal: false },
  dropdown: { participatesInFocusTrap: false, participatesInDismissal: true },
  popover: { participatesInFocusTrap: false, participatesInDismissal: true },
  modal: { participatesInFocusTrap: true, participatesInDismissal: true },
  toast: { participatesInFocusTrap: false, participatesInDismissal: false },
  spotlight: { participatesInFocusTrap: false, participatesInDismissal: false },
};

/* ---- Layer Stack Manager ---- */

type LayerEntry = {
  id: string;
  layer: ZIndexLayer;
  zIndex: number;
  timestamp: number;
  participation: LayerParticipation;
};

let stack: LayerEntry[] = [];
let counter = 0;

/**
 * Registers a new overlay layer and returns its z-index. Later
 * registrations within the same layer get higher z-indices.
 *
 * @example
 * ```ts
 * registerLayer("my-modal", "modal");                       // defaults
 * registerLayer("my-popover", "popover", {
 *   participatesInFocusTrap: true,                           // modal-style
 * });
 * ```
 *
 * Codex 019dde60 iter-47b1 — third `options` parameter overrides the
 * default participation flags for the chosen `layer` type. Backward-
 * compatible: existing two-arg calls keep their default participation.
 */
export function registerLayer(
  id: string,
  layer: ZIndexLayer = 'dropdown',
  options?: Partial<LayerParticipation>,
): number {
  // Remove existing entry with same id (re-registration)
  stack = stack.filter((entry) => entry.id !== id);

  counter += 1;
  const base = Z_INDEX_BASE[layer];
  const zIndex = base + counter;

  const participation: LayerParticipation = {
    ...DEFAULT_PARTICIPATION[layer],
    ...options,
  };

  stack.push({ id, layer, zIndex, timestamp: Date.now(), participation });
  return zIndex;
}

/**
 * Unregisters a layer from the stack.
 */
export function unregisterLayer(id: string): void {
  stack = stack.filter((entry) => entry.id !== id);
}

/**
 * Returns the current top-most z-index across all layers.
 * Useful for ensuring a new overlay appears above everything.
 */
export function getTopZIndex(): number {
  if (stack.length === 0) return Z_INDEX_BASE.content;
  return Math.max(...stack.map((entry) => entry.zIndex));
}

/**
 * Returns whether the given layer id is the top-most in the stack.
 * Useful for determining which overlay should handle ESC key.
 *
 * @deprecated Codex 019dde60 iter-47b1 — prefer `isTopFocusTrapLayer`
 * (for keyboard focus trap gating) or `isTopDismissableLayer` (for
 * Escape / outside-click gating). The legacy `isTopLayer` ignores
 * participation flags and would let a `toast` (non-interactive,
 * z-index above modal) capture Escape, which is wrong UX. Kept as a
 * compatibility shim until iter-47c.
 */
export function isTopLayer(id: string): boolean {
  if (stack.length === 0) return false;
  const topEntry = stack.reduce((top, entry) => (entry.zIndex > top.zIndex ? entry : top));
  return topEntry.id === id;
}

/**
 * Returns whether the given layer id is the top-most layer that
 * participates in the keyboard focus trap. Codex 019dde60 iter-47b1.
 *
 * Use case: nested modals — only the topmost modal's `useFocusTrap`
 * should intercept Tab; the underlying modal's trap stays armed but
 * passes Tab through. Toasts and dropdowns never participate even if
 * their visual z-index is higher.
 */
export function isTopFocusTrapLayer(id: string): boolean {
  const eligible = stack.filter((e) => e.participation.participatesInFocusTrap);
  if (eligible.length === 0) return false;
  const top = eligible.reduce((best, entry) => (entry.zIndex > best.zIndex ? entry : best));
  return top.id === id;
}

/**
 * Returns whether the given layer id is the top-most layer that
 * participates in dismissal (Escape + outside-click). Codex 019dde60
 * iter-47b1.
 *
 * Use case: modal-over-popover — Escape should close the modal first,
 * then the popover. A toast on top of both does NOT consume Escape
 * because it doesn't participate in dismissal.
 */
export function isTopDismissableLayer(id: string): boolean {
  const eligible = stack.filter((e) => e.participation.participatesInDismissal);
  if (eligible.length === 0) return false;
  const top = eligible.reduce((best, entry) => (entry.zIndex > best.zIndex ? entry : best));
  return top.id === id;
}

/**
 * Returns the current stack for debugging purposes.
 */
export function getLayerStack(): readonly LayerEntry[] {
  return [...stack];
}

/**
 * Resets the layer stack. Only use in tests.
 */
export function resetLayerStack(): void {
  stack = [];
  counter = 0;
}
