import {
  createElement,
  type ButtonHTMLAttributes,
  type ElementType,
  type HTMLAttributes,
  type PropsWithChildren,
} from 'react';

/**
 * Keep the adapter's own class when a caller supplies one.
 *
 * <p>Spreading caller props over a literal `className` silently *replaces* it, so a
 * component that asked for one extra class would lose its border, padding and
 * background and still render — nothing throws, nothing logs, and the shared
 * `mfe-ethic` tests pass because they run against the real design system rather
 * than this stand-in.
 */
function cx(...parts: Array<string | undefined | false>) {
  return parts.filter(Boolean).join(' ');
}

export function Badge({ children }: PropsWithChildren<{ variant?: string }>) {
  return <span className="manager-badge">{children}</span>;
}

export function Button({
  children,
  variant,
  size,
  ...props
}: PropsWithChildren<
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string; size?: string }
>) {
  const { className, ...htmlProps } = props;
  return (
    <button
      {...htmlProps}
      className={cx('manager-button', variant === 'secondary' && 'is-secondary', className)}
    >
      {children}
    </button>
  );
}

export function Card({
  children,
  ...props
}: PropsWithChildren<HTMLAttributes<HTMLDivElement> & { variant?: string; padding?: string }>) {
  const { variant: _variant, padding: _padding, className, ...htmlProps } = props;
  return (
    <section {...htmlProps} className={cx('manager-card', className)}>
      {children}
    </section>
  );
}

export function Stack({
  children,
  direction = 'column',
  gap = 2,
}: PropsWithChildren<{ direction?: 'row' | 'column'; gap?: number }>) {
  const safeGap = Number.isInteger(gap) && gap >= 0 && gap <= 8 ? gap : 2;
  return (
    <div className={`manager-stack manager-stack-${direction} manager-gap-${safeGap}`}>
      {children}
    </div>
  );
}

export function Text({
  as = 'span',
  children,
  ...props
}: PropsWithChildren<{
  as?: ElementType;
  size?: string;
  weight?: string;
  variant?: string;
  id?: string;
}>) {
  const { size: _size, weight: _weight, variant: _variant, ...elementProps } = props;
  return createElement(as, elementProps, children);
}
