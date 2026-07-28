import type { PropsWithChildren } from 'react';

/**
 * What this product's chrome is allowed to contain.
 *
 * <p>"Separately sellable" is a boundary around the *product*, not an argument for having
 * no chrome. Etik Speak takes the common parts — a header, a left rail, the session — and
 * its own destinations, and takes nothing belonging to ATS, Endpoint Admin or any other
 * product in the suite. That is what the isolated artifact buys (ADR-0046): the bundle
 * stays free of code the customer did not buy, while the person using it still gets a
 * place to stand.
 *
 * <p>This list is the contract, and it is short because the product is one screen today.
 * A second entry belongs here when a second Etik Speak screen exists — not before, and
 * never for something that lives in another product.
 */
export const MANAGER_NAV: ReadonlyArray<{ key: string; label: string; href: string }> =
  Object.freeze([{ key: 'cases', label: 'Vakalar', href: '/ethic/' }]);

/**
 * Route prefixes that must never appear in this cell's navigation.
 *
 * <p>Named rather than inferred, so the test that enforces the boundary fails loudly when
 * someone adds a link to a product this artifact does not ship. An unlisted product is
 * still refused — the assertion checks that every entry is under `/ethic`, and this list
 * exists so the failure message says *which* neighbour leaked in.
 */
export const FOREIGN_PRODUCT_PREFIXES: ReadonlyArray<string> = Object.freeze([
  '/ats',
  '/endpoint-admin',
  '/admin/meetings',
  '/access',
  '/audit',
  '/reporting',
  '/schema',
  '/users',
]);

export function ManagerShell({ children }: PropsWithChildren) {
  const current = typeof window === 'undefined' ? '/ethic/' : window.location.pathname;
  return (
    <div className="manager-shell">
      <header className="manager-shell-header">
        <span className="manager-shell-brand">Etik Speak</span>
        <span className="manager-shell-env">Test ortamı</span>
      </header>
      <div className="manager-shell-body">
        {/* Labelled, because a screen reader landing here needs to know this rail belongs
            to one product rather than to a suite it cannot see the rest of. */}
        <nav className="manager-shell-nav" aria-label="Etik Speak bölümleri">
          <ul>
            {MANAGER_NAV.map((item) => {
              const active = current === item.href || current === item.href.replace(/\/$/, '');
              return (
                <li key={item.key}>
                  <a
                    href={item.href}
                    className={active ? 'is-active' : undefined}
                    aria-current={active ? 'page' : undefined}
                  >
                    {item.label}
                  </a>
                </li>
              );
            })}
          </ul>
        </nav>
        <main className="manager-shell-main">{children}</main>
      </div>
    </div>
  );
}
