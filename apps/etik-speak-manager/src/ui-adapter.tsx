import {
  createElement,
  type ButtonHTMLAttributes,
  type ElementType,
  type HTMLAttributes,
  type PropsWithChildren,
} from 'react';

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
  return (
    <button
      className={`manager-button ${variant === 'secondary' ? 'is-secondary' : ''}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function Card({
  children,
  ...props
}: PropsWithChildren<HTMLAttributes<HTMLDivElement> & { variant?: string; padding?: string }>) {
  const { variant: _variant, padding: _padding, ...htmlProps } = props;
  return (
    <section className="manager-card" {...htmlProps}>
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
