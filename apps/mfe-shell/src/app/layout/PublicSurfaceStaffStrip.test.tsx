// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PublicSurfaceStaffStrip } from './PublicSurfaceStaffStrip';

const renderStrip = (token: string | null, returnPath = '/admin/ats/recruiter') =>
  render(
    <MemoryRouter>
      <PublicSurfaceStaffStrip token={token} returnPath={returnPath} />
    </MemoryRouter>,
  );

describe('PublicSurfaceStaffStrip (#1047)', () => {
  afterEach(cleanup);

  it('is absent from the DOM for a visitor without a session', () => {
    const { container } = renderStrip(null);

    // Kabul: "oturumsuz ziyaretçi: şerit YOK (DOM'da hiç yok, gizli değil)".
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByTestId('staff-public-surface-strip')).not.toBeInTheDocument();
  });

  it('gives signed-in staff one click back to where they came from', () => {
    renderStrip('staff-token', '/admin/ats/recruiter');

    expect(screen.getByTestId('staff-public-surface-strip')).toBeVisible();
    expect(screen.getByRole('link', { name: /Platform'a dön/ })).toHaveAttribute(
      'href',
      '/admin/ats/recruiter',
    );
    expect(screen.getByText(/adayların gördüğü görünümdür/i)).toBeVisible();
  });
});
