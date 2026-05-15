/**
 * R15 user-visible repair regression guard (Codex 019e2aef iter-3).
 *
 * mfe-reporting must federate `@mfe/auth` as a singleton so the host
 * shell's PermissionProvider context is shared across the federation
 * boundary. Without this, the reporting remote bundle resolves its own
 * `@mfe/auth` instance whose default context returns `isSuperAdmin: () =>
 * false` and `canViewReport: () => false`, causing ReportingHub to drop
 * all dynamic reports tagged with a `reportGroup` even when the host
 * authz state proves the user has the matching grants.
 *
 * Same singleton entry already lives in mfe-users and mfe-access; this
 * guard prevents the entry from being accidentally removed during a
 * future vite.config rewrite.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('mfe-reporting module-federation config', () => {
  const configPath = resolve(__dirname, '../../vite.config.ts');
  const config = readFileSync(configPath, 'utf-8');

  it('federates @mfe/auth as a singleton', () => {
    // Must be in sharedProdOnly so production builds publish it.
    expect(config).toMatch(/'@mfe\/auth':\s*\{\s*singleton:\s*true/);
  });

  it('aliases @mfe/auth to the local source path for dev', () => {
    expect(config).toContain("find: '@mfe/auth'");
    expect(config).toMatch(/packages\/auth\/src/);
  });
});
