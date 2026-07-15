import React, { useMemo, useState } from 'react';
import { Badge } from '@mfe/design-system/primitives';
import { PageHeader } from '@mfe/design-system/patterns';
import {
  ATS_CAPABILITY_REGISTRY,
  ATS_PRODUCT_ROLES,
  type AtsCapabilityMode,
  type AtsProductRole,
} from '../model/ats-capability-registry';

type RoleFilter = 'ALL' | AtsProductRole;

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

const InterviewEvidenceAvailabilityPage: React.FC = () => {
  const [activeRole, setActiveRole] = useState<RoleFilter>('ALL');
  const visibleCapabilities = useMemo(
    () =>
      activeRole === 'ALL'
        ? ATS_CAPABILITY_REGISTRY
        : ATS_CAPABILITY_REGISTRY.filter((capability) =>
            (capability.targetRoles as readonly AtsProductRole[]).includes(activeRole),
          ),
    [activeRole],
  );

  return (
    <div
      className="mx-auto w-full max-w-7xl space-y-6 px-4 pb-24 pt-6 sm:px-6 sm:pb-6 lg:px-8"
      data-testid="ats-product-availability"
    >
      <PageHeader
        title="ATS ürün alanı"
        subtitle="Erişiminiz açık. Canlı Interview Evidence çalışma alanı bu dağıtımda henüz etkin değil; kullanabileceğiniz güvenli önizlemeleri ve açılmayı bekleyen bağımlılıkları burada görebilirsiniz."
      />

      <div
        className="rounded-2xl border border-state-info-border bg-state-info-bg p-4 text-sm text-text-primary"
        role="status"
        data-testid="ats-remote-unavailable-status"
      >
        <p className="font-semibold">Menü ve adresiniz hazır; yetkiniz korunuyor.</p>
        <p className="mt-1 text-text-secondary">
          Bu sayfa sessizce ana ekrana yönlendirmez. Canlı modül açıldığında aynı adres gerçek
          çalışma alanını gösterecek. Aşağıdaki örnekler sentetiktir ve hiçbir üretim kaydını
          değiştirmez.
        </p>
      </div>

      <section aria-labelledby="ats-role-filter-heading" className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="ats-role-filter-heading" className="text-lg font-semibold text-text-primary">
              Rolünüze göre özellikler
            </h2>
            <p className="mt-1 text-sm text-text-secondary">
              Bir rol seçerek o rolün ürün yolunu ve işlem sınırlarını inceleyin.
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

              {capability.safePreview ? (
                <details className="mt-4 rounded-xl border border-border-subtle bg-surface-muted p-3">
                  <summary className="cursor-pointer text-sm font-semibold text-text-primary underline decoration-action-primary decoration-2 underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring">
                    Güvenli örneği incele
                  </summary>
                  <dl className="mt-3 space-y-2 text-sm text-text-secondary">
                    <div>
                      <dt className="font-semibold text-text-primary">Senaryo</dt>
                      <dd>{capability.safePreview.scenario}</dd>
                    </div>
                    <div>
                      <dt className="font-semibold text-text-primary">Gösterilecek çıktı</dt>
                      <dd>{capability.safePreview.output}</dd>
                    </div>
                    <div>
                      <dt className="font-semibold text-text-primary">Güvenlik sınırı</dt>
                      <dd>{capability.safePreview.boundary}</dd>
                    </div>
                  </dl>
                </details>
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
        <h2 className="font-semibold text-text-primary">Bu sayfanın açmadığı kapılar</h2>
        <p className="mt-1 text-text-secondary">
          Gerçek aday verisi, kayıt başlatma, üretim mutasyonu, otomatik eleme veya sıralama,
          istihdam kararı, Legal/DPO, owner ve müşteri onayı bu katalogla açılmaz.
        </p>
      </aside>
    </div>
  );
};

export default InterviewEvidenceAvailabilityPage;
