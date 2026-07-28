import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FOREIGN_PRODUCT_PREFIXES, MANAGER_NAV, ManagerShell } from './ManagerShell';

/**
 * The reason this cell ships its own chrome instead of mounting inside the suite shell is
 * that it must not carry the suite's other products (ADR-0046). That guarantee lives in
 * one list, and a list is exactly the kind of thing someone extends helpfully — "while
 * I'm here, a link to ATS would be convenient". These assertions are what makes that
 * convenient edit fail instead of shipping.
 */
describe('Etik Speak manager chrome', () => {
  it('offers only this product s own destinations', () => {
    expect(MANAGER_NAV.length).toBeGreaterThan(0);
    for (const item of MANAGER_NAV) {
      expect(item.href.startsWith('/ethic')).toBe(true);
    }
  });

  it('carries no route belonging to another product', () => {
    for (const item of MANAGER_NAV) {
      for (const foreign of FOREIGN_PRODUCT_PREFIXES) {
        expect(
          item.href.startsWith(foreign),
          `nav girdisi "${item.key}" başka bir ürünün rotasına işaret ediyor: ${item.href}`,
        ).toBe(false);
      }
    }
  });

  it('renders the rail and keeps the product screen inside it', () => {
    render(
      <ManagerShell>
        <p>vaka ekranı</p>
      </ManagerShell>,
    );

    const rail = screen.getByRole('navigation', { name: 'Etik Speak bölümleri' });
    expect(within(rail).getByRole('link', { name: 'Vakalar' })).toBeInTheDocument();
    // The screen it wraps still renders — chrome that hides the product is worse than none.
    expect(screen.getByText('vaka ekranı')).toBeInTheDocument();
    expect(screen.getByRole('main')).toContainElement(screen.getByText('vaka ekranı'));
  });

  // Every link the rail actually renders, not just the ones the manifest declares: a
  // hard-coded anchor added straight into the markup would slip past the list checks.
  it('renders no foreign link at all', () => {
    render(
      <ManagerShell>
        <p>vaka ekranı</p>
      </ManagerShell>,
    );

    for (const link of screen.getAllByRole('link')) {
      const href = link.getAttribute('href') ?? '';
      expect(href.startsWith('/ethic'), `yabancı bağlantı render edildi: ${href}`).toBe(true);
    }
  });
});
