import { describe, expect, it } from 'vitest';

async function readSource(relativePath: string): Promise<string> {
  const fs = await import('fs/promises');
  const path = await import('path');
  const here = path.dirname(new URL(import.meta.url).pathname);
  return fs.readFile(path.join(here, relativePath), 'utf8');
}

describe('EndpointSoftwareTriagePages presets (WEB-014F)', () => {
  it('pins the three standalone grid ids and route-local export filenames', async () => {
    const source = await readSource('../EndpointSoftwareTriagePages.tsx');

    expect(source).toContain("gridId: 'endpoint-admin-outdated-software-list'");
    expect(source).toContain("gridId: 'endpoint-admin-prohibited-software-list'");
    expect(source).toContain("gridId: 'endpoint-admin-software-diff-list'");
    expect(source).toContain("exportFileBaseName: 'endpoint-outdated-software'");
    expect(source).toContain("exportFileBaseName: 'endpoint-prohibited-software'");
    expect(source).toContain("exportFileBaseName: 'endpoint-software-diff'");
  });

  it('uses backend-supported fail-closed filter model shapes', async () => {
    const source = await readSource('../EndpointSoftwareTriagePages.tsx');

    expect(source).toContain("initialFilterModel: numberGreaterThanZero('outdated_upgrade_count')");
    expect(source).toContain(
      "initialFilterModel: numberGreaterThanZero('prohibited_findings_count')",
    );
    expect(source).toContain("initialFilterModel: setFilter('software_diff_status', ['OK'])");
    expect(source).toContain("filterType: 'number'");
    expect(source).toContain("type: 'greaterThan'");
    expect(source).toContain("filterType: 'set'");
  });

  it('makes route-relevant hidden columns visible by default', async () => {
    const source = await readSource('../EndpointSoftwareTriagePages.tsx');

    for (const colId of [
      'outdated_upgrade_count',
      'prohibited_decision',
      'prohibited_findings_count',
      'software_diff_status',
      'software_diff_added_count',
      'software_diff_removed_count',
      'software_diff_version_changed_count',
    ]) {
      expect(source).toContain(`'${colId}'`);
    }
  });

  it('is wired into the endpoint-admin router with the standalone paths', async () => {
    const routerSource = await readSource('../../../app/router/EndpointAdminRouter.tsx');

    expect(routerSource).toContain('path="outdated-software-list"');
    expect(routerSource).toContain('path="prohibited-software-list"');
    expect(routerSource).toContain('path="software-diff-list"');
    expect(routerSource).toContain("import('@mfe/design-system/advanced/data-grid/setup')");
  });
});
