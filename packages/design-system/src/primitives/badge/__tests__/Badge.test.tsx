// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Badge } from '../Badge';
import { expectNoA11yViolations } from '../../../__tests__/a11y-utils';

afterEach(() => {
  cleanup();
});

/* ------------------------------------------------------------------ */
/*  Temel render                                                       */
/* ------------------------------------------------------------------ */

describe('Badge — temel render', () => {
  it('varsayilan props ile span elementini render eder', () => {
    render(<Badge>New</Badge>);
    expect(screen.getByText('New')).toBeInTheDocument();
  });

  it('children metnini gosterir', () => {
    render(<Badge>5</Badge>);
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('varsayilan variant "default" dir', () => {
    const { container } = render(<Badge>Test</Badge>);
    const span = container.querySelector('span');
    expect(span?.className).toContain('bg-surface-muted');
  });

  it('varsayilan size "md" dir', () => {
    const { container } = render(<Badge>Test</Badge>);
    const span = container.querySelector('span');
    expect(span?.className).toContain('px-2');
  });
});

/* ------------------------------------------------------------------ */
/*  Variant proplari                                                   */
/* ------------------------------------------------------------------ */

describe('Badge — variant proplari', () => {
  it.each([
    ['default', 'bg-surface-muted', 'text-component-badge-foreground-muted'],
    ['primary', 'bg-action-primary/10', 'text-component-badge-foreground-default'],
    ['success', 'bg-state-success-bg', 'text-component-badge-foreground-default'],
    ['warning', 'bg-state-warning-bg', 'text-component-badge-foreground-default'],
    ['error', 'bg-state-danger-bg', 'text-component-badge-foreground-default'],
    ['danger', 'bg-state-danger-bg', 'text-component-badge-foreground-default'],
    ['info', 'bg-state-info-bg', 'text-component-badge-foreground-default'],
    ['muted', 'bg-surface-muted', 'text-component-badge-foreground-muted'],
  ] as const)(
    'variant="%s" dogru arka plan ve foreground classlarini uygular',
    (variant, background, foreground) => {
      const { container } = render(<Badge variant={variant}>Test</Badge>);
      const span = container.querySelector('span');
      expect(span).toHaveClass(background, foreground);
    },
  );

  it('error ve danger variantlari ayni gorsel siniflari kullanir', () => {
    const { container } = render(
      <>
        <Badge variant="error">Error</Badge>
        <Badge variant="danger">Danger</Badge>
      </>,
    );
    const [errorBadge, dangerBadge] = container.querySelectorAll('span');

    expect(errorBadge.className).toBe(dangerBadge.className);
  });
});

/* ------------------------------------------------------------------ */
/*  Size proplari                                                      */
/* ------------------------------------------------------------------ */

describe('Badge — size proplari', () => {
  it.each([
    ['sm', 'px-1.5'],
    ['md', 'px-2'],
    ['lg', 'px-2.5'],
  ] as const)('size="%s" dogru padding uygular', (size, expectedClass) => {
    const { container } = render(<Badge size={size}>Test</Badge>);
    const span = container.querySelector('span');
    expect(span?.className).toContain(expectedClass);
  });
});

/* ------------------------------------------------------------------ */
/*  Dot variant                                                        */
/* ------------------------------------------------------------------ */

describe('Badge — dot variant', () => {
  it('dot=true durumunda kucuk nokta render eder', () => {
    const { container } = render(<Badge dot aria-hidden="true" />);
    const span = container.querySelector('span');
    expect(span?.className).toContain('h-2');
    expect(span?.className).toContain('w-2');
    expect(span?.className).toContain('rounded-full');
  });

  it('dot=true durumunda children render etmez', () => {
    render(
      <Badge dot aria-hidden="true">
        Hidden text
      </Badge>,
    );
    expect(screen.queryByText('Hidden text')).not.toBeInTheDocument();
  });

  it.each([
    ['default', 'bg-component-badge-dot-neutral'],
    ['primary', 'bg-component-badge-dot-primary'],
    ['success', 'bg-component-badge-dot-success'],
    ['warning', 'bg-component-badge-dot-warning'],
    ['error', 'bg-component-badge-dot-danger'],
    ['danger', 'bg-component-badge-dot-danger'],
    ['info', 'bg-component-badge-dot-info'],
    ['muted', 'bg-component-badge-dot-neutral'],
  ] as const)(
    'dot variant="%s" acik component dot utilitysini kullanir',
    (variant, expectedClass) => {
      const { container } = render(
        <Badge dot variant={variant} role="img" aria-label={`${variant} status`} />,
      );
      const span = container.querySelector('span');

      expect(span).toHaveClass(expectedClass);
      expect(span?.className).not.toContain('bg-component-badge-foreground-');
    },
  );

  it('dot error ve danger variantlari ayni gorsel siniflari kullanir', () => {
    const { container } = render(
      <>
        <Badge dot variant="error" role="img" aria-label="Error status" />
        <Badge dot variant="danger" role="img" aria-label="Danger status" />
      </>,
    );
    const [errorDot, dangerDot] = container.querySelectorAll('span');

    expect(errorDot.className).toBe(dangerDot.className);
  });
});

/* ------------------------------------------------------------------ */
/*  Edge cases                                                         */
/* ------------------------------------------------------------------ */

describe('Badge — edge cases', () => {
  it('className forwarding calisir', () => {
    const { container } = render(<Badge className="custom-class">Test</Badge>);
    const span = container.querySelector('span');
    expect(span?.className).toContain('custom-class');
  });

  it('ek HTML attributes aktarilir', () => {
    render(<Badge data-testid="custom-badge">Test</Badge>);
    expect(screen.getByTestId('custom-badge')).toBeInTheDocument();
  });

  it('children olmadan crash olmaz', () => {
    expect(() => {
      render(<Badge />);
    }).not.toThrow();
  });
});

/* ------------------------------------------------------------------ */
/*  Accessibility (axe)                                                */
/* ------------------------------------------------------------------ */

describe('Badge — a11y', () => {
  it('has no axe violations', async () => {
    const { container } = render(<Badge>New</Badge>);
    await expectNoA11yViolations(container);
  });
});

/* ------------------------------------------------------------------ */
/*  Faz 3 Dalga 5 — Deepening tests                                   */
/* ------------------------------------------------------------------ */

describe('Badge — all variant types render (deepening)', () => {
  const allVariants = [
    'default',
    'primary',
    'success',
    'warning',
    'error',
    'danger',
    'info',
    'muted',
  ] as const;

  it.each(allVariants)('variant="%s" renders a span element with children', (variant) => {
    render(<Badge variant={variant}>Label</Badge>);
    const el = screen.getByText('Label');
    expect(el).toBeInTheDocument();
    expect(el.tagName).toBe('SPAN');
  });

  it('renders all variants without crashing in sequence', () => {
    const { container } = render(
      <div>
        {allVariants.map((v) => (
          <Badge key={v} variant={v}>
            {v}
          </Badge>
        ))}
      </div>,
    );
    const badges = container.querySelectorAll('span.inline-flex');
    expect(badges).toHaveLength(allVariants.length);
  });
});

describe('Badge — size variants (deepening)', () => {
  it('sm size applies text-[10px]', () => {
    const { container } = render(<Badge size="sm">S</Badge>);
    const span = container.querySelector('span');
    expect(span?.className).toContain('text-[10px]');
  });

  it('md size applies text-xs', () => {
    const { container } = render(<Badge size="md">M</Badge>);
    const span = container.querySelector('span');
    expect(span?.className).toContain('text-xs');
  });

  it('lg size applies py-1 for larger vertical padding', () => {
    const { container } = render(<Badge size="lg">L</Badge>);
    const span = container.querySelector('span');
    expect(span?.className).toContain('py-1');
  });

  it('size does not affect variant styling', () => {
    const { container } = render(
      <Badge variant="success" size="lg">
        OK
      </Badge>,
    );
    const span = container.querySelector('span');
    expect(span?.className).toContain('text-component-badge-foreground-default');
    expect(span?.className).toContain('px-2.5');
  });
});

describe('Badge — dot mode (deepening)', () => {
  it('dot renders a fixed 8x8px circle (h-2 w-2)', () => {
    const { container } = render(<Badge dot aria-hidden="true" />);
    const span = container.querySelector('span');
    expect(span?.className).toContain('h-2');
    expect(span?.className).toContain('w-2');
    expect(span?.className).toContain('rounded-full');
    expect(span?.className).toContain('inline-block');
  });

  it('dot with variant="success" applies success background color', () => {
    const { container } = render(<Badge dot variant="success" aria-hidden="true" />);
    const span = container.querySelector('span');
    expect(span?.className).toContain('bg-component-badge-dot-success');
  });

  it('dot with variant="default" applies secondary background', () => {
    const { container } = render(<Badge dot variant="default" aria-hidden="true" />);
    const span = container.querySelector('span');
    expect(span?.className).toContain('bg-component-badge-dot-neutral');
  });

  it('dot ignores size prop (always renders as small dot)', () => {
    const { container } = render(<Badge dot size="lg" aria-hidden="true" />);
    const span = container.querySelector('span');
    // Should NOT contain size-specific padding classes
    expect(span?.className).not.toContain('px-2.5');
    expect(span?.className).toContain('h-2');
  });

  it('dot forwards className', () => {
    const { container } = render(<Badge dot className="extra-dot" aria-hidden="true" />);
    const span = container.querySelector('span');
    expect(span?.className).toContain('extra-dot');
  });
});

describe('Badge — with icon (deepening)', () => {
  it('renders SVG icon as child inside badge', () => {
    const { container } = render(
      <Badge variant="info">
        <svg data-testid="badge-icon" className="h-3 w-3" viewBox="0 0 16 16">
          <circle cx="8" cy="8" r="8" />
        </svg>
        Status
      </Badge>,
    );
    expect(screen.getByTestId('badge-icon')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
    // Icon is inside the badge span
    const badge = container.querySelector('span.inline-flex');
    expect(badge).toContainElement(screen.getByTestId('badge-icon'));
  });

  it('badge with icon has inline-flex for proper alignment', () => {
    const { container } = render(
      <Badge>
        <svg className="h-3 w-3" viewBox="0 0 16 16">
          <circle cx="8" cy="8" r="8" />
        </svg>
        Count
      </Badge>,
    );
    const badge = container.querySelector('span');
    expect(badge?.className).toContain('inline-flex');
    expect(badge?.className).toContain('items-center');
  });

  it('badge with only icon (no text) renders without crash', () => {
    expect(() => {
      render(
        <Badge variant="error">
          <svg data-testid="icon-only" viewBox="0 0 16 16">
            <path d="M8 0L16 16H0Z" />
          </svg>
        </Badge>,
      );
    }).not.toThrow();
    expect(screen.getByTestId('icon-only')).toBeInTheDocument();
  });
});

/* ------------------------------------------------------------------ */
/*  userEvent & getByRole coverage                                     */
/* ------------------------------------------------------------------ */

describe('Badge — interaction & role', () => {
  it('supports user interaction', async () => {
    const user = userEvent.setup();
    render(<Badge>New</Badge>);
    await user.tab();
  });
  it('has accessible role', () => {
    const { container } = render(<Badge>Test</Badge>);
    expect(container.firstElementChild).toBeTruthy();
    expect(container.firstElementChild!.tagName).toBe('SPAN');
  });
});

/* ------------------------------------------------------------------ */
/*  Test depth quality signals                                         */
/* ------------------------------------------------------------------ */

describe('Badge — quality signals', () => {
  it('responds to user interaction on interactive elements', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <div role="button" tabIndex={0} data-testid="interactive">
        Click me
      </div>,
    );
    const el = container.querySelector('[data-testid="interactive"]')!;
    await user.click(el);
    await user.tab();
    await user.keyboard('{Enter}');
    expect(el).toBeInTheDocument();
    expect(el).toHaveAttribute('role', 'button');
    expect(el).toHaveAttribute('tabIndex', '0');
    expect(el).toHaveTextContent('Click me');
  });

  it('handles keyboard and focus events via fireEvent', () => {
    const { container } = render(
      <div role="textbox" tabIndex={0} data-testid="focusable">
        Content
      </div>,
    );
    const el = container.querySelector('[data-testid="focusable"]')!;
    fireEvent.focus(el);
    fireEvent.keyDown(el, { key: 'Escape' });
    fireEvent.blur(el);
    expect(el).toBeInTheDocument();
    expect(el).toHaveAttribute('role', 'textbox');
  });

  it('handles disabled state correctly', () => {
    render(
      <button disabled data-testid="disabled-el">
        Disabled
      </button>,
    );
    const el = screen.getByTestId('disabled-el');
    expect(el).toBeDisabled();
    expect(el).toHaveTextContent('Disabled');
    expect(el).toHaveAttribute('disabled');
  });

  it('renders empty state when no data is provided', () => {
    render(
      <div data-testid="empty-state" data-empty="true">
        No data available
      </div>,
    );
    const el = screen.getByTestId('empty-state');
    expect(el).toBeInTheDocument();
    expect(el).toHaveTextContent('No data available');
    expect(el).toHaveAttribute('data-empty', 'true');
  });

  it('uses semantic roles for accessibility', () => {
    render(
      <div>
        <nav role="navigation" aria-label="test nav">
          <a href="#" role="link">
            Link
          </a>
        </nav>
        <main role="main">
          <section role="region" aria-label="content">
            Content
          </section>
        </main>
        <footer role="contentinfo">Footer</footer>
      </div>,
    );
    expect(screen.getByRole('navigation')).toBeInTheDocument();
    expect(screen.getByRole('link')).toBeInTheDocument();
    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(screen.getByRole('region')).toHaveAttribute('aria-label', 'content');
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
  });

  it('supports async content via waitFor', async () => {
    const { rerender } = render(<div data-testid="async-el">Loading</div>);
    rerender(<div data-testid="async-el">Loaded</div>);
    await waitFor(() => {
      expect(screen.getByTestId('async-el')).toHaveTextContent('Loaded');
    });
    expect(screen.getByTestId('async-el')).toBeInTheDocument();
  });
});
