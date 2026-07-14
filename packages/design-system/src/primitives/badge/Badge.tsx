import React, { forwardRef } from 'react';
import { cn } from '../../utils/cn';
import { Slot } from '../_shared/Slot';
import { stateAttrs } from '../../internal/interaction-core';

/* ------------------------------------------------------------------ */
/*  Badge — Small status / count indicator                             */
/* ------------------------------------------------------------------ */

export type BadgeVariant =
  | 'default'
  | 'primary'
  | 'success'
  | 'warning'
  | 'error'
  | 'danger'
  | 'info'
  | 'muted';

export type BadgeSize = 'sm' | 'md' | 'lg';

/**
 * Badge renders a small status or count indicator with semantic color variants.
 */
export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Visual color variant. @default "default" */
  variant?: BadgeVariant;
  /** @deprecated Use `variant` instead. Will be removed in v3.0.0. */
  tone?: BadgeVariant;
  /** Badge size controlling padding and font size. @default "md" */
  size?: BadgeSize;
  /**
   * Render as a dot (no children).
   * A standalone dot must use an explicit semantic role plus an accessible
   * name. A dot beside a visible status label must be aria-hidden; color alone
   * must never communicate the status.
   */
  dot?: boolean;
  /**
   * Render via Slot — merges Badge props onto the child element.
   * @example <Badge asChild><a href="/status">Active</a></Badge>
   */
  asChild?: boolean;
}

const variantStyles: Record<BadgeVariant, string> = {
  default: 'bg-surface-muted text-component-badge-foreground-muted',
  primary: 'bg-action-primary/10 text-component-badge-foreground-default',
  success: 'bg-state-success-bg text-component-badge-foreground-default',
  warning: 'bg-state-warning-bg text-component-badge-foreground-default',
  error: 'bg-state-danger-bg text-component-badge-foreground-default',
  danger: 'bg-state-danger-bg text-component-badge-foreground-default',
  info: 'bg-state-info-bg text-component-badge-foreground-default',
  muted: 'bg-surface-muted text-component-badge-foreground-muted',
};

const dotStyles: Record<BadgeVariant, string> = {
  default: 'bg-component-badge-dot-neutral',
  primary: 'bg-component-badge-dot-primary',
  success: 'bg-component-badge-dot-success',
  warning: 'bg-component-badge-dot-warning',
  error: 'bg-component-badge-dot-danger',
  danger: 'bg-component-badge-dot-danger',
  info: 'bg-component-badge-dot-info',
  muted: 'bg-component-badge-dot-neutral',
};

const sizeStyles: Record<BadgeSize, string> = {
  sm: 'px-1.5 py-0.5 text-[10px]',
  md: 'px-2 py-0.5 text-xs',
  lg: 'px-2.5 py-1 text-xs',
};

/**
 * Small status or count indicator with semantic color variants and optional dot mode.
 *
 * @example
 * ```tsx
 * <Badge variant="success" size="md">Active</Badge>
 * <Badge variant="error" dot role="img" aria-label="Error status" />
 * <span><Badge variant="success" dot aria-hidden="true" /> Active</span>
 * ```
 */
export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  (
    {
      variant: variantProp,
      tone,
      size = 'md',
      dot = false,
      asChild = false,
      className,
      children,
      ...rest
    },
    ref,
  ) => {
    const variant = variantProp ?? tone ?? 'default';

    if (process.env.NODE_ENV !== 'production' && tone !== undefined) {
      console.warn(
        '[DesignSystem] "Badge" prop "tone" is deprecated. Use "variant" instead. "tone" will be removed in v3.0.0.',
      );
    }

    const componentAttrs = stateAttrs({ component: 'badge' });

    if (dot) {
      const ariaHidden = rest['aria-hidden'];
      const ariaLabel = rest['aria-label'];
      const ariaLabelledBy = rest['aria-labelledby'];
      const isDecorative = ariaHidden === true || ariaHidden === 'true';
      const hasAccessibleName =
        rest.role === 'img' &&
        ((typeof ariaLabel === 'string' && ariaLabel.trim().length > 0) ||
          (typeof ariaLabelledBy === 'string' && ariaLabelledBy.trim().length > 0));

      if (process.env.NODE_ENV !== 'production' && !isDecorative && !hasAccessibleName) {
        console.warn(
          '[DesignSystem] A dot-only Badge must be decorative (`aria-hidden="true"`) or expose a non-color status (`role="img"` with `aria-label` or `aria-labelledby`).',
        );
      }

      return (
        <span
          ref={ref}
          className={cn(
            'inline-block h-2 w-2 rounded-full forced-colors:border forced-colors:border-[Canvas] forced-colors:bg-[CanvasText] forced-colors:outline forced-colors:outline-1 forced-colors:outline-offset-1 forced-colors:outline-[CanvasText]',
            dotStyles[variant],
            className,
          )}
          data-badge-dot=""
          {...componentAttrs}
          {...rest}
        />
      );
    }

    const mergedClassName = cn(
      'inline-flex items-center justify-center rounded-full font-medium leading-none',
      variantStyles[variant],
      sizeStyles[size],
      className,
    );

    const sharedProps = {
      className: mergedClassName,
      ...componentAttrs,
      ...rest,
    };

    if (asChild) {
      return (
        <Slot ref={ref} {...sharedProps}>
          {children}
        </Slot>
      );
    }

    return (
      <span ref={ref} {...sharedProps}>
        {children}
      </span>
    );
  },
);

Badge.displayName = 'Badge';
