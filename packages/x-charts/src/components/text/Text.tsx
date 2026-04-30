import React, { forwardRef } from 'react';
import { cn } from '../../utils/cn';

/* ------------------------------------------------------------------ */
/*  Text — Typography primitive (x-charts internal)                    */
/*                                                                     */
/*  This is an x-charts-internal copy of the design-system Text        */
/*  primitive. It exists to keep `@mfe/x-charts` runtime-independent   */
/*  of the design-system package (so the DS legacy chart entries can shim   */
/*  around x-charts without creating a package cycle).                 */
/*                                                                     */
/*  Differences from the DS primitive:                                  */
/*   - `asChild` / Slot polymorphism is NOT supported.                  */
/*     x-charts has no usage that requires it; if a future need        */
/*     emerges it should be added consciously rather than silently     */
/*     ignored.                                                         */
/*  Renders any HTML element (p, span, h1-h6, label, etc.)             */
/*  with consistent typography tokens.                                  */
/* ------------------------------------------------------------------ */

type TextElement =
  | 'p'
  | 'span'
  | 'div'
  | 'label'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'h4'
  | 'h5'
  | 'h6'
  | 'strong'
  | 'em'
  | 'small'
  | 'blockquote'
  | 'code'
  | 'pre'
  | 'kbd';

export type TextVariant =
  | 'default'
  | 'secondary'
  | 'muted'
  | 'success'
  | 'warning'
  | 'error'
  | 'info';

export type TextSize = 'xs' | 'sm' | 'base' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl';

export type TextWeight = 'normal' | 'medium' | 'semibold' | 'bold';

/** Props for the Text component. */
export interface TextProps extends React.HTMLAttributes<HTMLElement> {
  /** HTML element to render */
  as?: TextElement | (string & {});
  variant?: TextVariant;
  size?: TextSize;
  weight?: TextWeight;
  /** Truncate with ellipsis */
  truncate?: boolean;
  /** Limit visible lines (uses line-clamp) */
  lineClamp?: 1 | 2 | 3 | 4 | 5;
  /** Monospace font */
  mono?: boolean;
}

const variantStyles: Record<TextVariant, string> = {
  default: 'text-text-primary',
  secondary: 'text-text-secondary',
  muted: 'text-[var(--text-disabled)]',
  success: 'text-state-success-text',
  warning: 'text-state-warning-text',
  error: 'text-state-danger-text',
  info: 'text-state-info-text',
};

const sizeStyles: Record<TextSize, string> = {
  xs: 'text-xs',
  sm: 'text-sm',
  base: 'text-base',
  lg: 'text-lg',
  xl: 'text-xl',
  '2xl': 'text-2xl',
  '3xl': 'text-3xl',
  '4xl': 'text-4xl',
};

const weightStyles: Record<TextWeight, string> = {
  normal: 'font-normal',
  medium: 'font-medium',
  semibold: 'font-semibold',
  bold: 'font-bold',
};

const lineClampStyles: Record<number, string> = {
  1: 'line-clamp-1',
  2: 'line-clamp-2',
  3: 'line-clamp-3',
  4: 'line-clamp-4',
  5: 'line-clamp-5',
};

/**
 * Typography primitive with variant, size, weight, truncation, and
 * polymorphic element support.
 *
 * @example
 * ```tsx
 * <Text as="h2" size="xl" weight="bold">Dashboard</Text>
 * <Text variant="secondary" size="sm" truncate>Long text...</Text>
 * ```
 */
export const Text = forwardRef<HTMLElement, TextProps>(
  (
    {
      as: Tag_ = 'span',
      variant = 'default',
      size,
      weight,
      truncate = false,
      lineClamp,
      mono = false,
      className,
      children,
      ...rest
    },
    ref,
  ) => {
    const mergedClassName = cn(
      variantStyles[variant],
      size && sizeStyles[size],
      weight && weightStyles[weight],
      truncate && 'truncate',
      lineClamp && lineClampStyles[lineClamp],
      mono && 'font-mono',
      className,
    );

    const Tag = Tag_ as React.ElementType;
    return (
      <Tag ref={ref as React.Ref<HTMLElement>} className={mergedClassName} {...rest}>
        {children}
      </Tag>
    );
  },
);

Text.displayName = 'Text';
