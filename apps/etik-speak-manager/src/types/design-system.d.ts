/**
 * Type surface for the design system as this cell consumes it.
 *
 * At runtime Vite aliases `@mfe/design-system` to the package SOURCE — the same
 * components, the same markup, the same classes the suite shell renders. At type-check
 * time the full source cannot enter this program: the package carries internal typing
 * debt against React 19 typings and against the real `@mfe/shared-http` surface
 * (grid-variants wants `put`/`delete`/`timeout`), and this cell's CI runs `tsc` over
 * everything the program reaches. So the types here re-export only the *type files* of
 * what the cell actually uses, which are clean, and declare the component values against
 * them. Runtime behaviour is untouched — this file compiles to nothing.
 */
declare module '@mfe/design-system/patterns' {
  import type { ComponentType } from 'react';
  import type {
    ShellHeaderProps,
    ShellHeaderNavItem,
  } from '../../../../packages/design-system/src/patterns/shell-header/types';
  import type {
    ShellSidebarProps,
    ShellSidebarNavItem,
  } from '../../../../packages/design-system/src/patterns/shell-sidebar/types';

  export const ShellHeader: ComponentType<ShellHeaderProps>;
  export const ShellSidebar: ComponentType<ShellSidebarProps>;
  export type { ShellHeaderProps, ShellHeaderNavItem, ShellSidebarProps, ShellSidebarNavItem };
}

declare module '@mfe/design-system' {
  import type { ComponentType, PropsWithChildren, ButtonHTMLAttributes, HTMLAttributes, ElementType } from 'react';

  /* The five primitives mfe-ethic renders. Props mirror the real components' public
     surface as mfe-ethic exercises it; the real implementations are what ship. */
  export const Badge: ComponentType<PropsWithChildren<{ variant?: string; className?: string }>>;
  export const Button: ComponentType<
    PropsWithChildren<
      ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string; size?: string }
    >
  >;
  export const Card: ComponentType<
    PropsWithChildren<HTMLAttributes<HTMLElement> & { variant?: string; padding?: string }>
  >;
  export const Stack: ComponentType<
    PropsWithChildren<{ direction?: 'row' | 'column'; gap?: number; className?: string }>
  >;
  export const Text: ComponentType<
    PropsWithChildren<{
      as?: ElementType;
      size?: string;
      weight?: string;
      variant?: string;
      id?: string;
    }>
  >;
}
