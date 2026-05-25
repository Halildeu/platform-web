import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import { DestructiveCommandModal } from '../components/DestructiveCommandModal';

afterEach(() => cleanup());

describe('DestructiveCommandModal', () => {
  it('open=false iken hicbir sey render etmez', () => {
    render(
      <DestructiveCommandModal
        open={false}
        type="LOCK_USER_LOGIN"
        isSubmitting={false}
        onCancel={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );
    expect(screen.queryByTestId('destructive-command-modal')).toBeNull();
  });

  it('open=true iken modal dialog acilir', () => {
    render(
      <DestructiveCommandModal
        open
        type="LOCK_USER_LOGIN"
        isSubmitting={false}
        onCancel={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );
    expect(screen.getByTestId('destructive-command-modal')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
  });

  it('newPassword field render edilmez (secret leakage yasagi)', () => {
    const { container } = render(
      <DestructiveCommandModal
        open
        type="CHANGE_LOCAL_PASSWORD"
        isSubmitting={false}
        onCancel={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );
    // username text input + reason textarea = 2 fields, hicbiri password
    const inputs = screen.getAllByRole('textbox');
    expect(inputs).toHaveLength(2);
    // Critical: no <input type="password"> should ever be rendered for any
    // destructive command — secret material must not transit the UI or
    // command payload (server-side credential rotation handles it).
    expect(container.querySelectorAll('input[type="password"]')).toHaveLength(0);
  });

  it('bos username + bos reason ile submit edildiginde hata gosterir', () => {
    const onSubmit = vi.fn();
    render(
      <DestructiveCommandModal
        open
        type="LOCK_USER_LOGIN"
        isSubmitting={false}
        onCancel={vi.fn()}
        onSubmit={onSubmit}
      />,
    );
    fireEvent.click(screen.getByTestId('destructive-command-submit'));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByTestId('destructive-command-username-error')).toBeInTheDocument();
    expect(screen.getByTestId('destructive-command-reason-error')).toBeInTheDocument();
  });

  it('username + reason dolu iken submit beklenen body ile cagrilir (NO password)', () => {
    const onSubmit = vi.fn();
    render(
      <DestructiveCommandModal
        open
        type="LOCK_USER_LOGIN"
        isSubmitting={false}
        onCancel={vi.fn()}
        onSubmit={onSubmit}
      />,
    );
    fireEvent.change(screen.getByTestId('destructive-command-username'), {
      target: { value: 'acme\\admin' },
    });
    fireEvent.change(screen.getByTestId('destructive-command-reason'), {
      target: { value: 'Brute force kilidi' },
    });
    fireEvent.click(screen.getByTestId('destructive-command-submit'));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const body = onSubmit.mock.calls[0]?.[0];
    expect(body).toEqual({
      type: 'LOCK_USER_LOGIN',
      reason: 'Brute force kilidi',
      payload: { username: 'acme\\admin' },
    });
    // Critical: payload must not include newPassword / password / secret
    expect(Object.keys(body.payload)).toEqual(['username']);
  });

  it('cancel butonu onCancel callback tetikler', () => {
    const onCancel = vi.fn();
    render(
      <DestructiveCommandModal
        open
        type="LOCK_USER_LOGIN"
        isSubmitting={false}
        onCancel={onCancel}
        onSubmit={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId('destructive-command-cancel'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('isSubmitting=true iken submit + cancel butonlari disabled', () => {
    render(
      <DestructiveCommandModal
        open
        type="LOCK_USER_LOGIN"
        isSubmitting
        onCancel={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );
    expect(screen.getByTestId('destructive-command-submit')).toBeDisabled();
    expect(screen.getByTestId('destructive-command-cancel')).toBeDisabled();
  });
});
