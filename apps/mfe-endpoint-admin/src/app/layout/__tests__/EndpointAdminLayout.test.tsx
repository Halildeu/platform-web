import { describe, it, expect, beforeAll, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { EndpointAdminLayout } from '../EndpointAdminLayout';

beforeAll(() => {
  // jsdom implements neither of these, and AppSidebar uses both (scrollIntoView
  // on the active item; matchMedia for its responsive collapse).
  Element.prototype.scrollIntoView = vi.fn();
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

/**
 * Pins the mount-aware navigation contract (platform-web #922 S1, Codex
 * 019f67ba): under the shell's `/endpoint-admin/*` splat the nav links must be
 * absolute siblings (react-router relative resolution would append to the
 * current path), standalone they must be root-relative, a plain click must SPA-
 * navigate (no full reload), and a modifier click must be left to the browser.
 */

function LocationProbe() {
  const { pathname } = useLocation();
  return <div data-testid="loc">{pathname}</div>;
}

function renderShell(initial = '/endpoint-admin/devices') {
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <Routes>
        <Route
          path="/endpoint-admin/*"
          element={
            <EndpointAdminLayout>
              <LocationProbe />
            </EndpointAdminLayout>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

function renderStandalone(initial = '/devices') {
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <EndpointAdminLayout>
        <LocationProbe />
      </EndpointAdminLayout>
    </MemoryRouter>,
  );
}

const statusLink = () => screen.getByRole('link', { name: /Service Status|Servis Durumu/ });

describe('EndpointAdminLayout navigation', () => {
  it('renders absolute sibling hrefs under the shell mount', () => {
    renderShell('/endpoint-admin/devices');
    expect(statusLink().getAttribute('href')).toBe('/endpoint-admin/status');
  });

  it('renders root-relative hrefs standalone', () => {
    renderStandalone('/devices');
    expect(statusLink().getAttribute('href')).toBe('/status');
  });

  it('SPA-navigates on a plain left-click (no reload) to the sibling', () => {
    renderShell('/endpoint-admin/devices');
    expect(screen.getByTestId('loc').textContent).toBe('/endpoint-admin/devices');
    fireEvent.click(statusLink());
    expect(screen.getByTestId('loc').textContent).toBe('/endpoint-admin/status');
  });

  it('leaves modifier-clicks to the browser (no SPA takeover)', () => {
    renderShell('/endpoint-admin/devices');
    fireEvent.click(statusLink(), { metaKey: true });
    expect(screen.getByTestId('loc').textContent).toBe('/endpoint-admin/devices');
  });

  it('does not nest a second <main> landmark', () => {
    const { container } = renderShell();
    expect(container.querySelectorAll('main').length).toBe(0);
  });
});
