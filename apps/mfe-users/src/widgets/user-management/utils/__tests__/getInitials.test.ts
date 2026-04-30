// @vitest-environment node
//
// Codex 019dddf4 iter-43 — getInitials behavior contract.
//
// Locked behavior (mirrors apps/mfe-shell/src/app/layout/header/UserMenuDropdown.tsx):
//   - prefer fullName → displayName → name
//   - split on whitespace, first 2 tokens, first character each
//   - .toUpperCase() (NOT toLocaleUpperCase) so "Çiğdem" stays "Ç"
//   - email fallback (first letter of local-part) when no name
//   - "U" final fallback

import { describe, expect, it } from 'vitest';
import { getInitials } from '../getInitials';

describe('getInitials', () => {
  describe('fullName precedence', () => {
    it('returns 2-letter initials from a 2-token fullName', () => {
      expect(getInitials({ fullName: 'Halil Kocoglu' })).toBe('HK');
    });

    it('preserves Turkish characters (no transliteration)', () => {
      expect(getInitials({ fullName: 'Çiğdem Öz' })).toBe('ÇÖ');
    });

    it('handles single-token fullName', () => {
      expect(getInitials({ fullName: 'Ada' })).toBe('A');
    });

    it('takes only the first 2 tokens for 3+ token names', () => {
      expect(getInitials({ fullName: 'John Ronald Reuel Tolkien' })).toBe('JR');
    });

    it('trims surrounding whitespace before splitting', () => {
      expect(getInitials({ fullName: '  Halil   Kocoglu  ' })).toBe('HK');
    });
  });

  describe('field precedence', () => {
    it('falls back to displayName when fullName is empty', () => {
      expect(getInitials({ fullName: '', displayName: 'Display Name' })).toBe('DN');
    });

    it('falls back to name when fullName/displayName are empty', () => {
      expect(getInitials({ name: 'Plain Name' })).toBe('PN');
    });

    it('email is used only when no name fields are present', () => {
      expect(getInitials({ email: 'user@example.com' })).toBe('U');
      expect(getInitials({ fullName: 'Halil', email: 'halil@example.com' })).toBe('H');
    });
  });

  describe('fallback behavior', () => {
    it('returns "U" for null user', () => {
      expect(getInitials(null)).toBe('U');
    });

    it('returns "U" for undefined user', () => {
      expect(getInitials(undefined)).toBe('U');
    });

    it('returns "U" for empty object', () => {
      expect(getInitials({})).toBe('U');
    });

    it('returns "U" when all fields are whitespace-only', () => {
      expect(getInitials({ fullName: '   ', displayName: '\t', name: '\n' })).toBe('U');
    });
  });

  describe('case normalization', () => {
    it('uppercases lowercase initials', () => {
      expect(getInitials({ fullName: 'jane doe' })).toBe('JD');
    });

    it('preserves uppercase initials unchanged', () => {
      expect(getInitials({ fullName: 'JANE DOE' })).toBe('JD');
    });

    it('uppercases mixed-case initials', () => {
      expect(getInitials({ fullName: 'jaNe dOe' })).toBe('JD');
    });
  });
});
