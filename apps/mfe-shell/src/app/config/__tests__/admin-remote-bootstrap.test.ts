// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  ADMIN_REMOTE_BOOTSTRAP_SEQUENCE,
  ADMIN_REMOTE_DEFAULT_PORTS,
  resolveAdminRemoteEntry,
  type AdminRemoteKey,
} from '../admin-remote-bootstrap';

/**
 * PERF-INIT-V2 PR-B5b2-prep-3 (Codex thread `019e237d` post-merge
 * P2 + P3 absorb).
 *
 * Pinned contract for the admin 4-remote bootstrap path:
 *   1. Sequence order matches the Codex risk ranking
 *      (reporting → access → audit → users) — reifies the
 *      comment-only spec into a CI-enforced invariant.
 *   2. Default port mapping is stable (3004-3007).
 *   3. `resolveAdminRemoteEntry` precedence: window.__env__ MFE_*
 *      → window.__env__ VITE_MFE_* → process.env MFE_* →
 *      process.env VITE_MFE_* → localhost fallback.
 *
 * Lives in a separate module from `shell-services-wiring.ts` so the
 * test can target the constants without importing the wiring module
 * (which pulls federation virtual specifiers `mfe_<admin>/shell-services`
 * that Vite's import-analysis cannot resolve under vitest).
 */

describe('admin-remote-bootstrap (PR-B5b2-prep-3)', () => {
  beforeEach(() => {
    delete process.env.MFE_USERS_URL;
    delete process.env.VITE_MFE_USERS_URL;
    delete process.env.MFE_ACCESS_URL;
    delete process.env.VITE_MFE_ACCESS_URL;
    delete process.env.MFE_AUDIT_URL;
    delete process.env.VITE_MFE_AUDIT_URL;
    delete process.env.MFE_REPORTING_URL;
    delete process.env.VITE_MFE_REPORTING_URL;
    if (typeof window !== 'undefined') {
      const w = window as Window & { __env__?: Record<string, string> };
      delete w.__env__;
    }
  });

  afterEach(() => {
    delete process.env.MFE_USERS_URL;
    delete process.env.VITE_MFE_USERS_URL;
    delete process.env.MFE_REPORTING_URL;
    if (typeof window !== 'undefined') {
      const w = window as Window & { __env__?: Record<string, string> };
      delete w.__env__;
    }
  });

  describe('ADMIN_REMOTE_BOOTSTRAP_SEQUENCE', () => {
    it('matches Codex risk-ranked order: reporting → access → audit → users', () => {
      expect(ADMIN_REMOTE_BOOTSTRAP_SEQUENCE).toEqual([
        'reporting',
        'access',
        'audit',
        'users',
      ]);
    });

    it('has exactly 4 entries (atomic 4-remote contract)', () => {
      expect(ADMIN_REMOTE_BOOTSTRAP_SEQUENCE).toHaveLength(4);
    });

    it('all entries are unique', () => {
      const set = new Set(ADMIN_REMOTE_BOOTSTRAP_SEQUENCE);
      expect(set.size).toBe(ADMIN_REMOTE_BOOTSTRAP_SEQUENCE.length);
    });

    it('first entry is lowest-blast (mfe_reporting)', () => {
      expect(ADMIN_REMOTE_BOOTSTRAP_SEQUENCE[0]).toBe('reporting');
    });

    it('last entry is highest-blast (mfe_users)', () => {
      expect(ADMIN_REMOTE_BOOTSTRAP_SEQUENCE[ADMIN_REMOTE_BOOTSTRAP_SEQUENCE.length - 1]).toBe(
        'users',
      );
    });
  });

  describe('ADMIN_REMOTE_DEFAULT_PORTS', () => {
    it('maps each admin key to the expected dev port', () => {
      expect(ADMIN_REMOTE_DEFAULT_PORTS).toEqual({
        users: 3004,
        access: 3005,
        audit: 3006,
        reporting: 3007,
      });
    });

    it('covers all keys in ADMIN_REMOTE_BOOTSTRAP_SEQUENCE', () => {
      for (const key of ADMIN_REMOTE_BOOTSTRAP_SEQUENCE) {
        expect(ADMIN_REMOTE_DEFAULT_PORTS[key]).toBeGreaterThan(0);
      }
    });
  });

  describe('resolveAdminRemoteEntry', () => {
    it('falls back to localhost:<port>/remoteEntry.js when no env override is set', () => {
      expect(resolveAdminRemoteEntry('users')).toBe('http://localhost:3004/remoteEntry.js');
      expect(resolveAdminRemoteEntry('access')).toBe('http://localhost:3005/remoteEntry.js');
      expect(resolveAdminRemoteEntry('audit')).toBe('http://localhost:3006/remoteEntry.js');
      expect(resolveAdminRemoteEntry('reporting')).toBe('http://localhost:3007/remoteEntry.js');
    });

    it('prefers window.__env__.MFE_<KEY>_URL when defined', () => {
      const w = window as Window & { __env__?: Record<string, string> };
      w.__env__ = { MFE_USERS_URL: 'https://users.example.test/remoteEntry.js' };
      expect(resolveAdminRemoteEntry('users')).toBe(
        'https://users.example.test/remoteEntry.js',
      );
    });

    it('prefers window.__env__.MFE_<KEY>_URL over VITE_MFE_<KEY>_URL', () => {
      const w = window as Window & { __env__?: Record<string, string> };
      w.__env__ = {
        MFE_USERS_URL: 'https://runtime.example.test/remoteEntry.js',
        VITE_MFE_USERS_URL: 'https://build.example.test/remoteEntry.js',
      };
      expect(resolveAdminRemoteEntry('users')).toBe(
        'https://runtime.example.test/remoteEntry.js',
      );
    });

    it('uses VITE_MFE_<KEY>_URL when only build-time env is set', () => {
      const w = window as Window & { __env__?: Record<string, string> };
      w.__env__ = { VITE_MFE_AUDIT_URL: 'https://build.example.test/remoteEntry.js' };
      expect(resolveAdminRemoteEntry('audit')).toBe(
        'https://build.example.test/remoteEntry.js',
      );
    });

    it('falls back to process.env when window.__env__ does not have the URL', () => {
      process.env.MFE_REPORTING_URL = 'https://process.example.test/remoteEntry.js';
      expect(resolveAdminRemoteEntry('reporting')).toBe(
        'https://process.example.test/remoteEntry.js',
      );
    });

    it('handles all 4 admin keys', () => {
      const keys: AdminRemoteKey[] = ['reporting', 'access', 'audit', 'users'];
      for (const key of keys) {
        const url = resolveAdminRemoteEntry(key);
        expect(url).toMatch(/remoteEntry\.js$/);
      }
    });
  });
});
