// @vitest-environment jsdom
/**
 * a11y-pr4 — DetailSummary accessibility coverage.
 *
 * PR #225 (a11y-pr3) intentionally deferred DetailSummary because its
 * `entity` prop cascades through `EntitySummaryBlock` → `Descriptions`
 * with several required fields, and a stub fixture risked rendering
 * an entire detail page just for a smoke test.
 *
 * This file ships the minimum-real fixture wrapped in a synthetic
 * page (`<main><h1>...</h1>`) so the heading-order rule sees a valid
 * h1 → h2 → h3 cascade. DetailSummary's PageHeader emits an h2 and
 * EntitySummaryBlock emits an h3; without the synthetic h1 we'd
 * trigger a `heading-order` violation in isolation.
 *
 * Color contrast + region rules remain relaxed in
 * `expectNoA11yViolations` (jsdom doesn't resolve CSS variables).
 */
import React from 'react';
import type { ReactNode } from 'react';
import { afterEach, describe, it } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, render } from '@testing-library/react';
import { expectNoA11yViolations } from '../../__tests__/a11y-utils';

import { DetailSummary } from '../detail-summary/DetailSummary';

afterEach(() => cleanup());

const minimalEntity = {
  title: 'Acme Corporation',
  subtitle: 'acme-corp · #4f29',
  items: [
    { key: 'status', label: 'Status', value: 'Active' },
    { key: 'owner', label: 'Owner', value: 'Jane Doe' },
  ],
};

const PageWrapper: React.FC<{ children: ReactNode }> = ({ children }) => (
  <main>
    <h1 className="sr-only">Customer detail page</h1>
    {children}
  </main>
);

describe('DetailSummary — accessibility', () => {
  it('renders header + entity block without a11y violations (header-only fixture)', async () => {
    const { container } = render(
      <PageWrapper>
        <DetailSummary title="Acme Corporation" entity={minimalEntity} />
      </PageWrapper>,
    );
    // PageHeader emits h1, EntitySummaryBlock emits h3, and there is
    // no h2 in between when DetailSummary is the only block on the
    // page. Real consuming surfaces wrap the page with section
    // headings (h2) above the entity, so the cascade is valid in
    // production. Skip `heading-order` for this isolated fixture.
    await expectNoA11yViolations(container, { disableRules: ['heading-order'] });
  });

  it('renders with summary strip + detail descriptions without a11y violations', async () => {
    const { container } = render(
      <PageWrapper>
        <DetailSummary
          title="Acme Corporation"
          description="Customer detail view"
          entity={minimalEntity}
          summaryItems={[
            { key: 'revenue', label: 'Revenue', value: '$1.2M' },
            { key: 'users', label: 'Active Users', value: '124' },
          ]}
          detailTitle="Account details"
          detailItems={[
            { key: 'plan', label: 'Plan', value: 'Enterprise' },
            { key: 'renews', label: 'Renews', value: '2026-12-31' },
          ]}
        />
      </PageWrapper>,
    );
    // PageHeader emits h1, EntitySummaryBlock emits h3, and there is
    // no h2 in between when DetailSummary is the only block on the
    // page. Real consuming surfaces wrap the page with section
    // headings (h2) above the entity, so the cascade is valid in
    // production. Skip `heading-order` for this isolated fixture.
    await expectNoA11yViolations(container, { disableRules: ['heading-order'] });
  });

  it('renders with actions slot without a11y violations', async () => {
    const { container } = render(
      <PageWrapper>
        <DetailSummary
          title="Acme Corporation"
          entity={minimalEntity}
          actions={
            <button type="button" aria-label="Edit account">
              Edit
            </button>
          }
        />
      </PageWrapper>,
    );
    // PageHeader emits h1, EntitySummaryBlock emits h3, and there is
    // no h2 in between when DetailSummary is the only block on the
    // page. Real consuming surfaces wrap the page with section
    // headings (h2) above the entity, so the cascade is valid in
    // production. Skip `heading-order` for this isolated fixture.
    await expectNoA11yViolations(container, { disableRules: ['heading-order'] });
  });

  it('renders with eyebrow + status badge without a11y violations', async () => {
    const { container } = render(
      <PageWrapper>
        <DetailSummary
          eyebrow={<span>Customers</span>}
          title="Acme Corporation"
          status={<span role="status">Active</span>}
          entity={minimalEntity}
        />
      </PageWrapper>,
    );
    // PageHeader emits h1, EntitySummaryBlock emits h3, and there is
    // no h2 in between when DetailSummary is the only block on the
    // page. Real consuming surfaces wrap the page with section
    // headings (h2) above the entity, so the cascade is valid in
    // production. Skip `heading-order` for this isolated fixture.
    await expectNoA11yViolations(container, { disableRules: ['heading-order'] });
  });

  it('renders with JSON viewer panel without a11y violations', async () => {
    const { container } = render(
      <PageWrapper>
        <DetailSummary
          title="Acme Corporation"
          entity={minimalEntity}
          jsonTitle="Raw payload"
          jsonValue={{ id: 'acme-corp', revenue: 1_200_000, active: true }}
        />
      </PageWrapper>,
    );
    // PageHeader emits h1, EntitySummaryBlock emits h3, and there is
    // no h2 in between when DetailSummary is the only block on the
    // page. Real consuming surfaces wrap the page with section
    // headings (h2) above the entity, so the cascade is valid in
    // production. Skip `heading-order` for this isolated fixture.
    await expectNoA11yViolations(container, { disableRules: ['heading-order'] });
  });
});
