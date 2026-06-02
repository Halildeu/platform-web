import { describe, expect, it } from 'vitest';
import { createEndpointAdminT } from '../index';

/**
 * Path C3 — Catalog authoring i18n contract (Codex thread 019e8982
 * iter-2 absorb): TR + EN parity for every key the page/drawer/editor
 * renders.
 */

const KEYS = [
  'endpointAdmin.catalog.page.title',
  'endpointAdmin.catalog.page.newButton',
  'endpointAdmin.catalog.page.statusFilter',
  'endpointAdmin.catalog.page.empty',
  'endpointAdmin.catalog.page.error',
  'endpointAdmin.catalog.col.catalogItemId',
  'endpointAdmin.catalog.col.displayName',
  'endpointAdmin.catalog.col.provider',
  'endpointAdmin.catalog.col.packageId',
  'endpointAdmin.catalog.col.status',
  'endpointAdmin.catalog.col.riskTier',
  'endpointAdmin.catalog.col.enabled',
  'endpointAdmin.catalog.col.lastUpdatedAt',
  'endpointAdmin.catalog.drawer.title.new',
  'endpointAdmin.catalog.drawer.title.edit',
  'endpointAdmin.catalog.drawer.close',
  'endpointAdmin.catalog.drawer.cancel',
  'endpointAdmin.catalog.drawer.save.new',
  'endpointAdmin.catalog.drawer.save.edit',
  'endpointAdmin.catalog.drawer.loading',
  'endpointAdmin.catalog.drawer.unknownRule',
  'endpointAdmin.catalog.field.catalogItemId',
  'endpointAdmin.catalog.field.provider',
  'endpointAdmin.catalog.field.packageId',
  'endpointAdmin.catalog.field.displayName',
  'endpointAdmin.catalog.field.publisher',
  'endpointAdmin.catalog.field.riskTier',
  'endpointAdmin.catalog.detection.heading',
  'endpointAdmin.catalog.detection.serverAuthoritative',
  'endpointAdmin.catalog.detection.type.WINGET_PACKAGE',
  'endpointAdmin.catalog.detection.type.REGISTRY_UNINSTALL',
  'endpointAdmin.catalog.detection.type.FILE_EXISTS',
  'endpointAdmin.catalog.detection.type.FILE_SHA256',
  'endpointAdmin.catalog.detection.type.FILE_VERSION',
  'endpointAdmin.catalog.detection.winget.packageId',
  'endpointAdmin.catalog.detection.winget.source',
  'endpointAdmin.catalog.detection.registry.displayNamePattern',
  'endpointAdmin.catalog.detection.registry.minVersion',
  'endpointAdmin.catalog.detection.file.absolutePath',
  'endpointAdmin.catalog.detection.sha256.expectedSha256',
  'endpointAdmin.catalog.detection.sha256.maxHashBytes',
  'endpointAdmin.catalog.detection.version.fileVersionField',
  'endpointAdmin.catalog.detection.version.field.FILE_VERSION',
  'endpointAdmin.catalog.detection.version.field.PRODUCT_VERSION',
  'endpointAdmin.catalog.detection.version.predicateKind',
  'endpointAdmin.catalog.detection.version.kind.EXACT',
  'endpointAdmin.catalog.detection.version.kind.MIN',
  'endpointAdmin.catalog.detection.version.kind.RANGE',
  'endpointAdmin.catalog.detection.version.value',
  'endpointAdmin.catalog.detection.version.min',
  'endpointAdmin.catalog.detection.version.max',
  'endpointAdmin.catalog.detection.version.minInclusive',
  'endpointAdmin.catalog.detection.version.maxInclusive',
  'endpointAdmin.catalog.validation.path.ok',
  'endpointAdmin.catalog.validation.path.pathRequired',
  'endpointAdmin.catalog.validation.path.unc',
  'endpointAdmin.catalog.validation.path.forwardSlash',
  'endpointAdmin.catalog.validation.path.envVar',
  'endpointAdmin.catalog.validation.path.parentTraversal',
  'endpointAdmin.catalog.validation.path.dotSegment',
  'endpointAdmin.catalog.validation.path.shortName83',
  'endpointAdmin.catalog.validation.path.ads',
  'endpointAdmin.catalog.validation.path.controlChar',
  'endpointAdmin.catalog.validation.path.notAbsolute',
  'endpointAdmin.catalog.validation.path.allowlist',
  'endpointAdmin.catalog.validation.sha256.invalid',
  'endpointAdmin.catalog.validation.sha256.maxHashBytesInvalid',
  'endpointAdmin.catalog.permission.required',
  'endpointAdmin.catalog.error.fetch',
  'endpointAdmin.catalog.error.forbidden',
  'endpointAdmin.catalog.error.validation',
  'endpointAdmin.catalog.error.badRequest',
  'endpointAdmin.catalog.error.generic',
];

describe('Path C3 catalog authoring i18n — TR locale', () => {
  const t = createEndpointAdminT('tr');

  for (const key of KEYS) {
    it(`${key} resolves to a non-key TR string`, () => {
      const v = t(key);
      expect(v).not.toBe(key);
      expect(v.length).toBeGreaterThan(0);
    });
  }

  it('title contains Turkish "Katalo"', () => {
    expect(t('endpointAdmin.catalog.page.title')).toContain('Katalo');
  });

  it('path safety unc message hints UNC path forbidden', () => {
    expect(t('endpointAdmin.catalog.validation.path.unc').toLowerCase()).toContain('unc');
  });
});

describe('Path C3 catalog authoring i18n — EN locale parity', () => {
  const t = createEndpointAdminT('en');

  for (const key of KEYS) {
    it(`${key} resolves to a non-key EN string`, () => {
      const v = t(key);
      expect(v).not.toBe(key);
      expect(v.length).toBeGreaterThan(0);
    });
  }

  it('title contains "Catalog"', () => {
    expect(t('endpointAdmin.catalog.page.title')).toContain('Catalog');
  });
});
