import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge } from '@mfe/design-system/primitives';
import { PageHeader } from '@mfe/design-system/patterns';
import {
  ATS_PRODUCT_ROLES,
  INTERVIEW_EVIDENCE_ENTRY,
  resolveAtsCapabilities,
  type AtsCapabilityMode,
  type AtsProductRole,
} from '../model/ats-capability-registry';
import SafeScenarioRunner from './SafeScenarioRunner';
import SyntheticResumeDraftDemo from './SyntheticResumeDraftDemo';

type RoleFilter = 'ALL' | AtsProductRole;

export interface AtsProductHubPageProps {
  remoteEnabled: boolean;
}

const MODE_PRESENTATION: Record<
  AtsCapabilityMode,
  { label: string; variant: 'success' | 'warning' | 'info' | 'muted' }
> = {
  LIVE_READ: { label: 'Canlı · okuma', variant: 'success' },
  LIVE_WRITE: { label: 'Canlı · işlem', variant: 'success' },
  SYNTHETIC_SANDBOX: { label: 'Sentetik deneme', variant: 'info' },
  PROPOSAL_ONLY: { label: 'Yalnız öneri', variant: 'warning' },
  OWNER_GATED: { label: 'Onay kapılı', variant: 'muted' },
  UNAVAILABLE: { label: 'Canlı modül bekliyor', variant: 'muted' },
};

const ROLE_FILTERS: readonly RoleFilter[] = [
  'ALL',
  'CANDIDATE',
  'RECRUITER',
  'HIRING_MANAGER',
  'INTERVIEWER',
  'AUDITOR',
  'ADMIN',
];

const roleLabel = (role: RoleFilter): string =>
  role === 'ALL' ? 'Tüm roller' : ATS_PRODUCT_ROLES[role];

/**
 * Permanent shell-owned ATS product hub.
 *
 * The hub remains available while the Interview Evidence remote is OFF or ON.
 * `remoteEnabled` changes only the declared runtime presentation and launch
 * action; ProtectedRoute remains the authorization boundary outside this page.
 */
const InterviewEvidenceAvailabilityPage: React.FC<AtsProductHubPageProps> = ({ remoteEnabled }) => {
  const [activeRole, setActiveRole] = useState<RoleFilter>('ALL');
  const capabilities = useMemo(() => resolveAtsCapabilities(remoteEnabled), [remoteEnabled]);
  const visibleCapabilities = useMemo(
    () =>
      activeRole === 'ALL'
        ? capabilities
        : capabilities.filter((capability) =>
            (capability.targetRoles as readonly AtsProductRole[]).includes(activeRole),
          ),
    [activeRole, capabilities],
  );

  return (
    <div
      className="mx-auto w-full max-w-7xl space-y-6 px-4 pb-24 pt-6 sm:px-6 sm:pb-6 lg:px-8"
      data-testid="ats-product-hub"
    >
      <PageHeader
        title="ATS Ürün Merkezi"
        subtitle="Yetkinizin izin verdiği ürün yollarını, güvenli denemeleri ve açılmayı bekleyen kapıları tek yerde inceleyin. Rol filtreleri hedef deneyimi anlatır; kullanıcı yetkisi vermez."
      />

      <section
        className={`rounded-2xl border p-4 text-sm text-text-primary ${
          remoteEnabled
            ? 'border-state-success-border bg-state-success-bg'
            : 'border-state-info-border bg-state-info-bg'
        }`}
        aria-labelledby="ats-runtime-heading"
        data-testid="ats-runtime-status"
      >
        <h2 id="ats-runtime-heading" className="font-semibold">
          {remoteEnabled
            ? 'Canlı mülakat çalışma alanı bu dağıtımda hazır.'
            : 'Canlı mülakat çalışma alanı bu dağıtımda henüz açık değil.'}
        </h2>
        <p className="mt-1 text-text-secondary">
          {remoteEnabled
            ? 'Ürün Merkezi görünür kalır. Gerçek çalışma alanı ayrı açılır ve kullanıcının rol/policy tavanını aşmaz.'
            : 'Ürün Merkezi sessiz yönlendirme yapmadan görünür kalır. Güvenli örnekler sentetiktir ve hiçbir üretim kaydını değiştirmez.'}
        </p>
        {remoteEnabled ? (
          <Link
            to={INTERVIEW_EVIDENCE_ENTRY.route}
            className="mt-4 inline-flex min-h-11 items-center rounded-lg bg-action-primary px-4 py-2 font-semibold text-action-primary-text underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
            data-testid="ats-live-interview-evidence-link"
          >
            Canlı Interview Evidence modülünü aç
          </Link>
        ) : (
          <p className="mt-3 font-medium text-text-secondary" data-testid="ats-live-module-gated">
            Canlı modül bağlantısı, deployment bağımlılığı hazır olmadan gösterilmez.
          </p>
        )}
      </section>

      <section aria-labelledby="ats-role-filter-heading" className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="ats-role-filter-heading" className="text-lg font-semibold text-text-primary">
              Rol yoluna göre özellikler
            </h2>
            <p className="mt-1 text-sm text-text-secondary">
              Bir hedef rol seçerek o deneyimde planlanan özellikleri ve işlem sınırlarını
              inceleyin.
            </p>
          </div>
          <p className="text-sm font-medium text-text-secondary" aria-live="polite">
            {visibleCapabilities.length} özellik gösteriliyor
          </p>
        </div>

        <div className="flex flex-wrap gap-2" aria-label="Ürün rolü filtresi">
          {ROLE_FILTERS.map((role) => {
            const selected = role === activeRole;
            return (
              <button
                key={role}
                type="button"
                className={`rounded-full border px-3 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 ${
                  selected
                    ? 'border-action-primary bg-action-primary/10 text-text-primary'
                    : 'border-border-subtle bg-surface-default text-text-secondary hover:bg-surface-muted'
                }`}
                aria-pressed={selected}
                onClick={() => setActiveRole(role)}
                data-testid={`ats-role-filter-${role.toLowerCase()}`}
              >
                {roleLabel(role)}
              </button>
            );
          })}
        </div>

        {activeRole === 'CANDIDATE' ? (
          <p
            className="rounded-xl border border-state-warning-border bg-state-warning-bg p-3 text-sm text-text-secondary"
            role="note"
            data-testid="ats-candidate-role-boundary"
          >
            Aday filtresi, aday portalında sunulması planlanan deneyimi anlatır. Bu yönetici adresi
            adaya verilmez; gerçek CV/PII yükleme ve aday hesabı aktivasyonu ayrı kimlik, Legal/DPO
            ve owner kapılarına bağlıdır.
          </p>
        ) : null}
      </section>

      <section
        aria-label={`${roleLabel(activeRole)} ATS özellikleri`}
        className="grid grid-cols-1 gap-4 lg:grid-cols-2"
        data-testid="ats-capability-grid"
      >
        {visibleCapabilities.map((capability) => {
          const mode = MODE_PRESENTATION[capability.mode];
          return (
            <article
              key={capability.id}
              className="min-w-0 rounded-2xl border border-border-subtle bg-surface-default p-5 shadow-xs"
              data-testid={`ats-capability-${capability.id}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <h3 className="text-base font-semibold text-text-primary">{capability.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-text-secondary">
                    {capability.description}
                  </p>
                </div>
                <Badge variant={mode.variant} size="sm">
                  {mode.label}
                </Badge>
              </div>

              <div className="mt-4 flex flex-wrap gap-2" aria-label="Hedef roller">
                {capability.targetRoles.map((role) => (
                  <span
                    key={role}
                    className="rounded-full bg-surface-muted px-2.5 py-1 text-xs font-medium text-text-secondary"
                  >
                    {ATS_PRODUCT_ROLES[role]}
                  </span>
                ))}
              </div>

              <dl className="mt-4 space-y-3 text-sm">
                <div>
                  <dt className="font-semibold text-text-primary">Canlı kullanım için gereken</dt>
                  <dd className="mt-1 text-text-secondary">{capability.liveDependency}</dd>
                </div>
                <div>
                  <dt className="font-semibold text-text-primary">İşlem sınırı</dt>
                  <dd className="mt-1 text-text-secondary">{capability.actionCeiling}</dd>
                </div>
              </dl>

              {capability.safeExperience?.kind === 'SYNTHETIC_RESUME_DRAFT' ? (
                <SyntheticResumeDraftDemo />
              ) : capability.safeExperience?.kind === 'SCENARIO_RUNNER' &&
                capability.safePreview ? (
                <SafeScenarioRunner
                  capabilityId={capability.id}
                  actionLabel={capability.safeExperience.actionLabel}
                  preview={capability.safePreview}
                />
              ) : capability.mode === 'LIVE_READ' ? (
                <p className="mt-4 rounded-xl border border-state-info-border bg-state-info-bg p-3 text-sm text-text-secondary">
                  Canlı salt-okunur görünüm ayrı modül bağlantısından açılır; bu kart işlem veya
                  mutasyon başlatmaz.
                </p>
              ) : (
                <p className="mt-4 rounded-xl border border-border-subtle bg-surface-muted p-3 text-sm text-text-secondary">
                  Bu özellik için güvenli önizleme yok; gerekli kapılar açılmadan işlem
                  başlatılamaz.
                </p>
              )}
            </article>
          );
        })}
      </section>

      <aside
        className="rounded-2xl border border-state-warning-border bg-state-warning-bg p-4 text-sm"
        data-testid="ats-product-boundary"
      >
        <h2 className="font-semibold text-text-primary">Bu merkezin açmadığı kapılar</h2>
        <p className="mt-1 text-text-secondary">
          Gerçek aday verisi, CV/PII yükleme, kayıt başlatma, üretim mutasyonu, otomatik eleme veya
          sıralama, istihdam kararı, Legal/DPO, owner ve müşteri onayı bu merkezle açılmaz.
        </p>
      </aside>
    </div>
  );
};

export default InterviewEvidenceAvailabilityPage;
