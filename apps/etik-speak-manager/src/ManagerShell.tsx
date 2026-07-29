import type { PropsWithChildren } from 'react';
import { Scale } from 'lucide-react';
import { ShellHeader, ShellSidebar } from '@mfe/design-system/patterns';
import type { ShellSidebarNavItem } from '@mfe/design-system/patterns';

/**
 * What this product's chrome is allowed to contain.
 *
 * <p>"Separately sellable" is a boundary around the *product*, not an argument for having
 * no chrome — and not, it turned out, an argument for having *different* chrome either.
 * The first version of this shell drew its own header and rail with its own invented
 * tokens, and the person moving between the platform and Etik Speak landed in what looked
 * like someone else's product. The chrome is now the same design-system patterns the
 * suite shell renders ({@code ShellHeader}, {@code ShellSidebar}) with the same generated
 * theme — only the destinations differ, and those stay strictly this product's own.
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

/** Same geometry and card styling the suite shell passes to the same component. */
const SIDEBAR_CLASS =
  'fixed bottom-0 left-0 top-[var(--shell-header-h)] z-30 mt-4 mx-2 mb-2 pb-2 !rounded-2xl !border !border-border-subtle';

export function ManagerShell({ children }: PropsWithChildren) {
  const current = typeof window === 'undefined' ? '/ethic/' : window.location.pathname;
  const activeItem = MANAGER_NAV.find(
    (item) => current === item.href || current === item.href.replace(/\/$/, ''),
  );

  return (
    <div className="flex min-h-screen flex-col text-text-primary">
      {/* The same header pattern the suite renders, carrying this product's identity.
          It sets --shell-header-h on the document element, exactly as in the suite. */}
      <ShellHeader
        navItems={MANAGER_NAV.map((item) => ({
          key: item.key,
          path: item.href,
          label: item.label,
        }))}
        currentPath={current}
        onNavigate={(path: string) => {
          if (path !== current) window.location.assign(path);
        }}
        startSlot={
          <span className="flex items-baseline gap-2 px-1">
            <span className="text-sm font-semibold">Etik Speak</span>
            <span className="text-[11px] text-text-subtle">Test ortamı</span>
          </span>
        }
        navAriaLabel="Etik Speak üst gezinme"
        cssHeightVar="--shell-header-h"
      />

      {/* The same sidebar pattern, same widths, same floating-card styling. Labelled,
          because a screen reader landing here needs to know this rail belongs to one
          product rather than to a suite it cannot see the rest of. */}
      <nav aria-label="Etik Speak bölümleri">
        <ShellSidebar
          navItems={MANAGER_NAV.map((item) => ({
            key: item.key,
            label: item.label,
            href: item.href,
            icon: <Scale aria-hidden />,
            dataTestId: `manager-nav-${item.key}`,
          }))}
          activeKey={activeItem?.key}
          onNavigate={(_key: string, item: ShellSidebarNavItem) => {
            if (item.href && item.href !== current) window.location.assign(item.href);
          }}
          brandTitle="Etik Speak"
          brandSubtitle="Test ortamı"
          storageKey="etik-speak-manager-sidebar"
          defaultMode="expanded"
          cssWidthVar="--shell-sidebar-w"
          collapsedWidth={76}
          expandedWidth={280}
          className={SIDEBAR_CLASS}
        />
      </nav>

      {/* Main content — offset by header height and sidebar width, as in the suite. */}
      <div
        className="flex flex-1 flex-col"
        style={{
          paddingTop: 'var(--shell-header-h, 0px)',
          paddingLeft: 'var(--shell-sidebar-w, 0px)',
        }}
      >
        <main className="flex min-h-0 flex-1 flex-col px-6 py-4">{children}</main>
      </div>
    </div>
  );
}
