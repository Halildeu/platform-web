/**
 * Path C3 — Detection rule normalizer + Windows path safety contract
 * tests (Codex thread 019e8982 iter-2 absorb).
 *
 * Branch coverage for:
 *  - SHA-256 hex 64 validator
 *  - maxHashBytes ≤ 512 MiB cap
 *  - VersionPredicate EXACT/MIN/RANGE shapes
 *  - Path safety table-driven (semantic mirror of backend +
 *    agent guards; reason codes serve as i18n keys).
 *  - Unknown rule type → kind='unknown' (fail-closed Save).
 */

import {
  checkWindowsPathSafety,
  normalizeDetectionRule,
  DETECTION_RULE_PATH_SAFETY_MAX_BYTES,
} from '../types';

describe('checkWindowsPathSafety', () => {
  // Codex 019e8982 iter-2 path safety table (input → expected reject reason or accept).
  const TABLE: Array<{ input: string; expected: string | null }> = [
    // Accepts
    { input: 'C:\\Program Files\\7-Zip\\7z.exe', expected: null },
    { input: 'c:\\Program FILES (x86)\\Vendor\\app.exe', expected: null },
    { input: 'C:\\ProgramData\\App\\bin\\app.exe', expected: null },
    { input: 'C:\\Windows\\System32\\notepad.exe', expected: null },
    // Rejects (matches table-driven vector)
    { input: '', expected: 'pathRequired' },
    { input: '   ', expected: 'pathRequired' },
    { input: '\\\\fileserver\\share\\app.exe', expected: 'unc' },
    { input: 'C:/Program Files/7-Zip/7z.exe', expected: 'forwardSlash' },
    { input: '%ProgramFiles%\\7-Zip\\7z.exe', expected: 'envVar' },
    { input: 'C:\\Program Files\\..\\Windows\\System32\\cmd.exe', expected: 'parentTraversal' },
    { input: 'C:\\Program Files\\.\\App\\app.exe', expected: 'dotSegment' },
    { input: 'C:\\PROGRA~1\\7-Zip\\7z.exe', expected: 'shortName83' },
    { input: 'C:\\Program Files\\App\\app.exe:Zone.Identifier', expected: 'ads' },
    { input: 'C:\\Program Files\\App\\bad.exe', expected: 'controlChar' },
    { input: 'relative\\app.exe', expected: 'notAbsolute' },
    { input: 'D:\\Tools\\app.exe', expected: 'allowlist' },
  ];

  it.each(TABLE)('input %j → %j', ({ input, expected }) => {
    expect(checkWindowsPathSafety(input)).toBe(expected);
  });

  it('returns pathRequired for null and undefined', () => {
    expect(checkWindowsPathSafety(null)).toBe('pathRequired');
    expect(checkWindowsPathSafety(undefined)).toBe('pathRequired');
  });
});

describe('normalizeDetectionRule', () => {
  it('normalizes WINGET_PACKAGE typed', () => {
    const result = normalizeDetectionRule({
      type: 'WINGET_PACKAGE',
      packageId: '7zip.7zip',
    });
    expect(result).toEqual({
      kind: 'typed',
      rule: { type: 'WINGET_PACKAGE', packageId: '7zip.7zip', source: undefined },
    });
  });

  it('rejects WINGET_PACKAGE without packageId', () => {
    const result = normalizeDetectionRule({ type: 'WINGET_PACKAGE' });
    expect(result.kind).toBe('unknown');
    if (result.kind === 'unknown') {
      expect(result.reason).toBe('winget.packageIdMissing');
    }
  });

  it('normalizes REGISTRY_UNINSTALL typed', () => {
    const result = normalizeDetectionRule({
      type: 'REGISTRY_UNINSTALL',
      displayNamePattern: '7-Zip*',
      minVersion: '24.00',
    });
    expect(result).toEqual({
      kind: 'typed',
      rule: {
        type: 'REGISTRY_UNINSTALL',
        displayNamePattern: '7-Zip*',
        minVersion: '24.00',
      },
    });
  });

  it('normalizes FILE_EXISTS typed', () => {
    const result = normalizeDetectionRule({
      type: 'FILE_EXISTS',
      absolutePath: 'C:\\Program Files\\7-Zip\\7z.exe',
    });
    expect(result).toEqual({
      kind: 'typed',
      rule: {
        type: 'FILE_EXISTS',
        absolutePath: 'C:\\Program Files\\7-Zip\\7z.exe',
      },
    });
  });

  it('normalizes FILE_SHA256 typed', () => {
    const sha = 'a'.repeat(64);
    const result = normalizeDetectionRule({
      type: 'FILE_SHA256',
      absolutePath: 'C:\\Program Files\\App\\bin\\app.exe',
      expectedSha256: sha,
      maxHashBytes: 1024,
    });
    expect(result).toEqual({
      kind: 'typed',
      rule: {
        type: 'FILE_SHA256',
        absolutePath: 'C:\\Program Files\\App\\bin\\app.exe',
        expectedSha256: sha,
        maxHashBytes: 1024,
      },
    });
  });

  it('rejects FILE_SHA256 with bad SHA hex', () => {
    const result = normalizeDetectionRule({
      type: 'FILE_SHA256',
      absolutePath: 'C:\\Program Files\\App\\bin\\app.exe',
      expectedSha256: 'not-hex',
    });
    expect(result.kind).toBe('unknown');
    if (result.kind === 'unknown') {
      expect(result.reason).toBe('sha256.invalid');
    }
  });

  it('rejects FILE_SHA256 with maxHashBytes over 512 MiB', () => {
    const sha = 'b'.repeat(64);
    const result = normalizeDetectionRule({
      type: 'FILE_SHA256',
      absolutePath: 'C:\\Program Files\\App\\bin\\app.exe',
      expectedSha256: sha,
      maxHashBytes: DETECTION_RULE_PATH_SAFETY_MAX_BYTES + 1,
    });
    expect(result.kind).toBe('unknown');
    if (result.kind === 'unknown') {
      expect(result.reason).toBe('sha256.maxHashBytesInvalid');
    }
  });

  it('rejects FILE_SHA256 with negative or fractional maxHashBytes', () => {
    const sha = 'c'.repeat(64);
    expect(
      normalizeDetectionRule({
        type: 'FILE_SHA256',
        absolutePath: 'C:\\Program Files\\App\\bin\\app.exe',
        expectedSha256: sha,
        maxHashBytes: -1,
      }).kind,
    ).toBe('unknown');
    expect(
      normalizeDetectionRule({
        type: 'FILE_SHA256',
        absolutePath: 'C:\\Program Files\\App\\bin\\app.exe',
        expectedSha256: sha,
        maxHashBytes: 1.5,
      }).kind,
    ).toBe('unknown');
  });

  it('normalizes FILE_VERSION EXACT predicate', () => {
    const result = normalizeDetectionRule({
      type: 'FILE_VERSION',
      absolutePath: 'C:\\Program Files\\App\\bin\\app.exe',
      versionPredicate: { kind: 'EXACT', value: '24.09' },
    });
    expect(result.kind).toBe('typed');
    if (result.kind === 'typed') {
      expect(result.rule.type).toBe('FILE_VERSION');
      if (result.rule.type === 'FILE_VERSION') {
        expect(result.rule.versionPredicate).toEqual({ kind: 'EXACT', value: '24.09' });
      }
    }
  });

  it('normalizes FILE_VERSION MIN predicate', () => {
    const result = normalizeDetectionRule({
      type: 'FILE_VERSION',
      absolutePath: 'C:\\Program Files\\App\\bin\\app.exe',
      versionPredicate: { kind: 'MIN', value: '1.0.0' },
    });
    expect(result.kind).toBe('typed');
    if (result.kind === 'typed' && result.rule.type === 'FILE_VERSION') {
      expect(result.rule.versionPredicate).toEqual({ kind: 'MIN', value: '1.0.0' });
    }
  });

  it('normalizes FILE_VERSION RANGE predicate', () => {
    const result = normalizeDetectionRule({
      type: 'FILE_VERSION',
      absolutePath: 'C:\\Program Files\\App\\bin\\app.exe',
      versionPredicate: {
        kind: 'RANGE',
        min: '1.0',
        max: '2.0',
        minInclusive: true,
        maxInclusive: false,
      },
      fileVersionField: 'PRODUCT_VERSION',
    });
    expect(result.kind).toBe('typed');
    if (result.kind === 'typed' && result.rule.type === 'FILE_VERSION') {
      expect(result.rule.versionPredicate).toEqual({
        kind: 'RANGE',
        min: '1.0',
        max: '2.0',
        minInclusive: true,
        maxInclusive: false,
      });
      expect(result.rule.fileVersionField).toBe('PRODUCT_VERSION');
    }
  });

  it('rejects FILE_VERSION with unknown predicate kind', () => {
    const result = normalizeDetectionRule({
      type: 'FILE_VERSION',
      absolutePath: 'C:\\Program Files\\App\\bin\\app.exe',
      versionPredicate: { kind: 'UNSUPPORTED', value: '1.0' },
    });
    expect(result.kind).toBe('unknown');
    if (result.kind === 'unknown') {
      expect(result.reason).toMatch(/^predicate\./);
    }
  });

  it('fails closed on unknown rule type', () => {
    const result = normalizeDetectionRule({ type: 'PROCESS_RUNNING', name: 'foo.exe' });
    expect(result.kind).toBe('unknown');
    if (result.kind === 'unknown') {
      expect(result.reason).toBe('type.unknown');
    }
  });

  it('fails closed on null input', () => {
    expect(normalizeDetectionRule(null).kind).toBe('unknown');
  });

  it('lowercases SHA-256 hex on hydrate', () => {
    const upper = 'A'.repeat(64);
    const result = normalizeDetectionRule({
      type: 'FILE_SHA256',
      absolutePath: 'C:\\Program Files\\App\\bin\\app.exe',
      expectedSha256: upper,
    });
    if (result.kind === 'typed' && result.rule.type === 'FILE_SHA256') {
      expect(result.rule.expectedSha256).toBe('a'.repeat(64));
    } else {
      throw new Error('expected typed FILE_SHA256');
    }
  });
});
