import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Button, Card } from './ui-adapter';

/**
 * The isolated manager renders `mfe-ethic`'s App against these stand-ins instead of the
 * suite design system (ADR-0046 keeps the suite bundle out of this artifact). That makes
 * the adapter a second, unwatched implementation of the same component contract: the
 * shared tests in `mfe-ethic` exercise the real design system, so a divergence here is
 * invisible to them and only shows up in the deployed cell.
 *
 * The divergence that mattered: spreading caller props over a literal `className`
 * replaced it. A caller adding one layout class silently stripped `manager-card`, and
 * with it the border, padding and background — rendering kept working, so nothing failed
 * except how the page looked.
 */
describe('isolated manager UI adapter', () => {
  it('keeps the card class when the caller adds one', () => {
    const { container } = render(<Card className="ethics-detail-pane">içerik</Card>);
    const card = container.querySelector('section');

    expect(card).not.toBeNull();
    expect(card).toHaveClass('manager-card');
    expect(card).toHaveClass('ethics-detail-pane');
  });

  it('keeps the card class when the caller adds none', () => {
    const { container } = render(<Card>içerik</Card>);

    expect(container.querySelector('section')).toHaveClass('manager-card');
  });

  it('keeps button classes — including the variant — when the caller adds one', () => {
    const { container } = render(
      <Button variant="secondary" className="ethics-wide-action">
        gönder
      </Button>,
    );
    const button = container.querySelector('button');

    expect(button).toHaveClass('manager-button');
    expect(button).toHaveClass('is-secondary');
    expect(button).toHaveClass('ethics-wide-action');
  });
});
