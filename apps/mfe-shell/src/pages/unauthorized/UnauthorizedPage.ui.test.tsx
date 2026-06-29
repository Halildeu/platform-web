// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import UnauthorizedPage from './UnauthorizedPage.ui';

vi.mock('@mfe/design-system', () => ({
  Alert: ({ title, children }: { title?: string; children?: React.ReactNode }) => (
    <div role="alert">
      {title && <strong>{title}</strong>}
      {children}
    </div>
  ),
  Button: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { children?: React.ReactNode }) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
}));

vi.mock('@mfe/auth', () => ({
  usePermissions: () => ({
    authz: {
      userId: 'user-1',
      roles: ['USER'],
    },
  }),
}));

vi.mock('@mfe/auth/ui', () => ({
  ExplainPermissionModal: ({ open }: { open: boolean }) =>
    open ? <div data-testid="explain-modal" /> : null,
}));

vi.mock('@mfe/shared-http', () => ({
  api: {
    post: vi.fn(),
  },
}));

vi.mock('../../app/i18n', () => ({
  useShellCommonI18n: () => ({
    t: (key: string) => key,
  }),
}));

describe('UnauthorizedPage', () => {
  it('shows any-module requirements from route state', () => {
    render(
      <MemoryRouter
        initialEntries={[
          {
            pathname: '/unauthorized',
            state: {
              from: '/admin/meetings',
              reason: 'module_denied',
              requiredAnyModule: ['MEETING', 'TRANSCRIPT'],
            },
          },
        ]}
      >
        <UnauthorizedPage />
      </MemoryRouter>,
    );

    expect(screen.getByText('Modül erişimi yok')).toBeInTheDocument();
    expect(screen.getByText('Gerekli modüllerden biri:')).toBeInTheDocument();
    expect(screen.getByText('MEETING veya TRANSCRIPT')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Neden erişemiyorum?' })).toBeInTheDocument();
  });
});
