import React from 'react';

/**
 * Suspense fallback shared by the drawer's lazily loaded tab panels and by
 * the lazily loaded sections of the "Yazılımlar" tab.
 */
export const TabFallback: React.FC = () => (
  <div
    role="status"
    aria-live="polite"
    className="px-6 py-4 text-sm text-text-secondary"
    data-testid="drawer-tab-fallback"
  >
    Yükleniyor…
  </div>
);
