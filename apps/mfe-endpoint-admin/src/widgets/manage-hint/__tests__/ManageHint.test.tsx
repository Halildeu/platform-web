import React from 'react';
import { afterEach, describe, it, expect } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { ManageHint } from '../ManageHint';

afterEach(cleanup);

describe('ManageHint', () => {
  it('renders the shared manage-required copy as a role=note referenceable by id', () => {
    render(<ManageHint id="hint-1" testId="mh" />);
    const note = screen.getByTestId('mh');
    expect(note.getAttribute('id')).toBe('hint-1');
    // role=note is a referenceable description target for aria-describedby.
    expect(note.getAttribute('role')).toBe('note');
    // Non-empty copy, no literal-key leak (proves the i18n key exists).
    expect(note.textContent).toBeTruthy();
    expect(note.textContent).not.toContain('endpointAdmin.authz');
  });
});
