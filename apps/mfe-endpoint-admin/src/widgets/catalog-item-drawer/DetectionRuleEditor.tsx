import React from 'react';

import { useEndpointAdminI18n } from '../../i18n';
import type {
  DetectionRule,
  DetectionRuleType,
  FileVersionField,
  VersionPredicate,
  VersionPredicateKind,
  PathRejectReason,
} from '../../entities/endpoint-software-catalog/types';
import { checkWindowsPathSafety } from '../../entities/endpoint-software-catalog/types';

/**
 * Path C3 — DetectionRuleEditor (Codex thread 019e8982 iter-2 absorb,
 * ready_for_impl=true).
 *
 * Segmented type selector + dispatches to a type-specific subform.
 * Each subform owns its field validation; the editor emits a typed
 * `DetectionRule` on every change. Server-side validation remains
 * authoritative; UI guards are best-effort previews.
 *
 * Unknown rule shapes are NOT editable here — the parent
 * (CatalogItemDrawer) handles that branch by showing a read-only
 * JSON summary and disabling Save (Codex iter-2 absorb §4).
 */

const SHA256_HEX_RE = /^[0-9a-f]{64}$/;
const MAX_HASH_BYTES = 512 * 1024 * 1024;

const TYPE_ORDER: DetectionRuleType[] = [
  'WINGET_PACKAGE',
  'REGISTRY_UNINSTALL',
  'FILE_EXISTS',
  'FILE_SHA256',
  'FILE_VERSION',
];

export interface DetectionRuleEditorProps {
  /** Current rule (parent owns state; editor is controlled). */
  value: DetectionRule;
  onChange: (next: DetectionRule) => void;
  disabled?: boolean;
}

function defaultRuleForType(t: DetectionRuleType): DetectionRule {
  switch (t) {
    case 'WINGET_PACKAGE':
      return { type: 'WINGET_PACKAGE', packageId: '' };
    case 'REGISTRY_UNINSTALL':
      return { type: 'REGISTRY_UNINSTALL', displayNamePattern: '' };
    case 'FILE_EXISTS':
      return { type: 'FILE_EXISTS', absolutePath: '' };
    case 'FILE_SHA256':
      return { type: 'FILE_SHA256', absolutePath: '', expectedSha256: '' };
    case 'FILE_VERSION':
      return {
        type: 'FILE_VERSION',
        absolutePath: '',
        versionPredicate: { kind: 'EXACT', value: '' },
      };
  }
}

// ---------------------------------------------------------------------------
// Path preview hint (semantic mirror, not regex copy).
// ---------------------------------------------------------------------------

function PathPreviewHint({
  reason,
  t,
}: {
  reason: PathRejectReason | null;
  t: (k: string) => string;
}): React.ReactElement | null {
  if (!reason) {
    return (
      <p className="catalog-item-drawer__hint catalog-item-drawer__hint--ok">
        {t('endpointAdmin.catalog.validation.path.ok')}
      </p>
    );
  }
  const key = `endpointAdmin.catalog.validation.path.${reason}`;
  return <p className="catalog-item-drawer__hint catalog-item-drawer__hint--warn">{t(key)}</p>;
}

// ---------------------------------------------------------------------------
// Subform: WINGET_PACKAGE.
// ---------------------------------------------------------------------------

interface SubformProps<R extends DetectionRule> {
  rule: R;
  onChange: (next: R) => void;
  disabled?: boolean;
}

const WingetPackageForm: React.FC<
  SubformProps<Extract<DetectionRule, { type: 'WINGET_PACKAGE' }>>
> = ({ rule, onChange, disabled }) => {
  const { t } = useEndpointAdminI18n();
  return (
    <div className="catalog-item-drawer__subform">
      <label>
        {t('endpointAdmin.catalog.detection.winget.packageId')}
        <input
          type="text"
          value={rule.packageId}
          onChange={(e) => onChange({ ...rule, packageId: e.target.value })}
          disabled={disabled}
          data-testid="detection-rule-winget-packageId"
        />
      </label>
      <label>
        {t('endpointAdmin.catalog.detection.winget.source')}
        <input
          type="text"
          value={rule.source ?? ''}
          onChange={(e) =>
            onChange({
              ...rule,
              source: e.target.value.length > 0 ? e.target.value : undefined,
            })
          }
          disabled={disabled}
          placeholder="winget"
          data-testid="detection-rule-winget-source"
        />
      </label>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Subform: REGISTRY_UNINSTALL.
// ---------------------------------------------------------------------------

const RegistryUninstallForm: React.FC<
  SubformProps<Extract<DetectionRule, { type: 'REGISTRY_UNINSTALL' }>>
> = ({ rule, onChange, disabled }) => {
  const { t } = useEndpointAdminI18n();
  return (
    <div className="catalog-item-drawer__subform">
      <label>
        {t('endpointAdmin.catalog.detection.registry.displayNamePattern')}
        <input
          type="text"
          value={rule.displayNamePattern}
          onChange={(e) => onChange({ ...rule, displayNamePattern: e.target.value })}
          disabled={disabled}
          data-testid="detection-rule-registry-displayNamePattern"
        />
      </label>
      <label>
        {t('endpointAdmin.catalog.detection.registry.minVersion')}
        <input
          type="text"
          value={rule.minVersion ?? ''}
          onChange={(e) =>
            onChange({
              ...rule,
              minVersion: e.target.value.length > 0 ? e.target.value : undefined,
            })
          }
          disabled={disabled}
          placeholder="optional"
          data-testid="detection-rule-registry-minVersion"
        />
      </label>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Subform: FILE_EXISTS.
// ---------------------------------------------------------------------------

const FileExistsForm: React.FC<SubformProps<Extract<DetectionRule, { type: 'FILE_EXISTS' }>>> = ({
  rule,
  onChange,
  disabled,
}) => {
  const { t } = useEndpointAdminI18n();
  const reason = checkWindowsPathSafety(rule.absolutePath);
  return (
    <div className="catalog-item-drawer__subform">
      <label>
        {t('endpointAdmin.catalog.detection.file.absolutePath')}
        <input
          type="text"
          value={rule.absolutePath}
          onChange={(e) => onChange({ ...rule, absolutePath: e.target.value })}
          disabled={disabled}
          placeholder="C:\\Program Files\\Vendor\\app.exe"
          data-testid="detection-rule-file-absolutePath"
        />
      </label>
      <PathPreviewHint reason={reason} t={t} />
    </div>
  );
};

// ---------------------------------------------------------------------------
// Subform: FILE_SHA256.
// ---------------------------------------------------------------------------

const FileSha256Form: React.FC<SubformProps<Extract<DetectionRule, { type: 'FILE_SHA256' }>>> = ({
  rule,
  onChange,
  disabled,
}) => {
  const { t } = useEndpointAdminI18n();
  const pathReason = checkWindowsPathSafety(rule.absolutePath);
  const shaLower = rule.expectedSha256.toLowerCase();
  const shaOk = SHA256_HEX_RE.test(shaLower);
  const maxBytesError =
    rule.maxHashBytes !== undefined &&
    (!Number.isInteger(rule.maxHashBytes) ||
      rule.maxHashBytes < 0 ||
      rule.maxHashBytes > MAX_HASH_BYTES);
  return (
    <div className="catalog-item-drawer__subform">
      <label>
        {t('endpointAdmin.catalog.detection.file.absolutePath')}
        <input
          type="text"
          value={rule.absolutePath}
          onChange={(e) => onChange({ ...rule, absolutePath: e.target.value })}
          disabled={disabled}
          data-testid="detection-rule-sha256-absolutePath"
        />
      </label>
      <PathPreviewHint reason={pathReason} t={t} />
      <label>
        {t('endpointAdmin.catalog.detection.sha256.expectedSha256')}
        <input
          type="text"
          value={rule.expectedSha256}
          onChange={(e) => onChange({ ...rule, expectedSha256: e.target.value })}
          disabled={disabled}
          placeholder="64 hex (lowercase)"
          data-testid="detection-rule-sha256-expectedSha256"
        />
      </label>
      {!shaOk && rule.expectedSha256.length > 0 && (
        <p className="catalog-item-drawer__hint catalog-item-drawer__hint--warn">
          {t('endpointAdmin.catalog.validation.sha256.invalid')}
        </p>
      )}
      <label>
        {t('endpointAdmin.catalog.detection.sha256.maxHashBytes')}
        <input
          type="number"
          min={0}
          max={MAX_HASH_BYTES}
          value={rule.maxHashBytes ?? ''}
          onChange={(e) => {
            const raw = e.target.value;
            if (raw === '') {
              onChange({ ...rule, maxHashBytes: undefined });
              return;
            }
            const n = Number(raw);
            onChange({ ...rule, maxHashBytes: Number.isFinite(n) ? n : undefined });
          }}
          disabled={disabled}
          placeholder={`≤ ${MAX_HASH_BYTES}`}
          data-testid="detection-rule-sha256-maxHashBytes"
        />
      </label>
      {maxBytesError && (
        <p className="catalog-item-drawer__hint catalog-item-drawer__hint--warn">
          {t('endpointAdmin.catalog.validation.sha256.maxHashBytesInvalid')}
        </p>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Subform: FILE_VERSION (with VersionPredicate sub-discriminator).
// ---------------------------------------------------------------------------

const VERSION_KINDS: VersionPredicateKind[] = ['EXACT', 'MIN', 'RANGE'];
const FILE_VERSION_FIELDS: FileVersionField[] = ['FILE_VERSION', 'PRODUCT_VERSION'];

const FileVersionForm: React.FC<SubformProps<Extract<DetectionRule, { type: 'FILE_VERSION' }>>> = ({
  rule,
  onChange,
  disabled,
}) => {
  const { t } = useEndpointAdminI18n();
  const pathReason = checkWindowsPathSafety(rule.absolutePath);

  function setKind(kind: VersionPredicateKind) {
    let next: VersionPredicate;
    if (kind === 'EXACT') next = { kind: 'EXACT', value: '' };
    else if (kind === 'MIN') next = { kind: 'MIN', value: '' };
    else
      next = {
        kind: 'RANGE',
        min: '',
        max: '',
        minInclusive: true,
        maxInclusive: false,
      };
    onChange({ ...rule, versionPredicate: next });
  }

  return (
    <div className="catalog-item-drawer__subform">
      <label>
        {t('endpointAdmin.catalog.detection.file.absolutePath')}
        <input
          type="text"
          value={rule.absolutePath}
          onChange={(e) => onChange({ ...rule, absolutePath: e.target.value })}
          disabled={disabled}
          data-testid="detection-rule-version-absolutePath"
        />
      </label>
      <PathPreviewHint reason={pathReason} t={t} />
      <label>
        {t('endpointAdmin.catalog.detection.version.fileVersionField')}
        <select
          value={rule.fileVersionField ?? 'FILE_VERSION'}
          onChange={(e) =>
            onChange({ ...rule, fileVersionField: e.target.value as FileVersionField })
          }
          disabled={disabled}
          data-testid="detection-rule-version-fileVersionField"
        >
          {FILE_VERSION_FIELDS.map((f) => (
            <option key={f} value={f}>
              {t(`endpointAdmin.catalog.detection.version.field.${f}`)}
            </option>
          ))}
        </select>
      </label>
      <fieldset className="catalog-item-drawer__predicate">
        <legend>{t('endpointAdmin.catalog.detection.version.predicateKind')}</legend>
        <div className="catalog-item-drawer__predicate-tabs" role="tablist">
          {VERSION_KINDS.map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={rule.versionPredicate.kind === k}
              disabled={disabled}
              onClick={() => setKind(k)}
              data-testid={`detection-rule-version-kind-${k}`}
            >
              {t(`endpointAdmin.catalog.detection.version.kind.${k}`)}
            </button>
          ))}
        </div>
        {(() => {
          const predicate = rule.versionPredicate;
          if (predicate.kind === 'EXACT' || predicate.kind === 'MIN') {
            const narrowed = predicate; // narrowed by discriminator above
            return (
              <label>
                {t('endpointAdmin.catalog.detection.version.value')}
                <input
                  type="text"
                  value={narrowed.value}
                  onChange={(e) =>
                    onChange({
                      ...rule,
                      versionPredicate: { kind: narrowed.kind, value: e.target.value },
                    })
                  }
                  disabled={disabled}
                  placeholder="e.g. 24.09"
                  data-testid="detection-rule-version-value"
                />
              </label>
            );
          }
          // RANGE branch
          const narrowed = predicate;
          return (
            <div className="catalog-item-drawer__range">
              <label>
                {t('endpointAdmin.catalog.detection.version.min')}
                <input
                  type="text"
                  value={narrowed.min}
                  onChange={(e) =>
                    onChange({
                      ...rule,
                      versionPredicate: { ...narrowed, min: e.target.value },
                    })
                  }
                  disabled={disabled}
                  data-testid="detection-rule-version-min"
                />
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={narrowed.minInclusive}
                  onChange={(e) =>
                    onChange({
                      ...rule,
                      versionPredicate: { ...narrowed, minInclusive: e.target.checked },
                    })
                  }
                  disabled={disabled}
                  data-testid="detection-rule-version-minInclusive"
                />
                {t('endpointAdmin.catalog.detection.version.minInclusive')}
              </label>
              <label>
                {t('endpointAdmin.catalog.detection.version.max')}
                <input
                  type="text"
                  value={narrowed.max}
                  onChange={(e) =>
                    onChange({
                      ...rule,
                      versionPredicate: { ...narrowed, max: e.target.value },
                    })
                  }
                  disabled={disabled}
                  data-testid="detection-rule-version-max"
                />
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={narrowed.maxInclusive}
                  onChange={(e) =>
                    onChange({
                      ...rule,
                      versionPredicate: { ...narrowed, maxInclusive: e.target.checked },
                    })
                  }
                  disabled={disabled}
                  data-testid="detection-rule-version-maxInclusive"
                />
                {t('endpointAdmin.catalog.detection.version.maxInclusive')}
              </label>
            </div>
          );
        })()}
      </fieldset>
    </div>
  );
};

// ---------------------------------------------------------------------------
// DetectionRuleEditor (parent).
// ---------------------------------------------------------------------------

export const DetectionRuleEditor: React.FC<DetectionRuleEditorProps> = ({
  value,
  onChange,
  disabled,
}) => {
  const { t } = useEndpointAdminI18n();

  function selectType(t: DetectionRuleType) {
    if (t === value.type) return;
    onChange(defaultRuleForType(t));
  }

  return (
    <section className="catalog-item-drawer__detection-rule" data-testid="detection-rule-editor">
      <header>
        <h4>{t('endpointAdmin.catalog.detection.heading')}</h4>
        <p className="catalog-item-drawer__caveat">
          {t('endpointAdmin.catalog.detection.serverAuthoritative')}
        </p>
      </header>
      <div className="catalog-item-drawer__type-tabs" role="tablist">
        {TYPE_ORDER.map((t2) => (
          <button
            key={t2}
            type="button"
            role="tab"
            aria-selected={value.type === t2}
            disabled={disabled}
            onClick={() => selectType(t2)}
            data-testid={`detection-rule-type-${t2}`}
          >
            {t(`endpointAdmin.catalog.detection.type.${t2}`)}
          </button>
        ))}
      </div>
      {value.type === 'WINGET_PACKAGE' && (
        <WingetPackageForm rule={value} onChange={onChange} disabled={disabled} />
      )}
      {value.type === 'REGISTRY_UNINSTALL' && (
        <RegistryUninstallForm rule={value} onChange={onChange} disabled={disabled} />
      )}
      {value.type === 'FILE_EXISTS' && (
        <FileExistsForm rule={value} onChange={onChange} disabled={disabled} />
      )}
      {value.type === 'FILE_SHA256' && (
        <FileSha256Form rule={value} onChange={onChange} disabled={disabled} />
      )}
      {value.type === 'FILE_VERSION' && (
        <FileVersionForm rule={value} onChange={onChange} disabled={disabled} />
      )}
    </section>
  );
};

export default DetectionRuleEditor;
