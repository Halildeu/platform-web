import React from 'react';

/**
 * EndpointAdminApp — FE-000 safe skeleton.
 *
 * Scope:
 *   - Self-contained placeholder. Renders a card explaining the
 *     module is "shell-safe skeleton, backend wiring pending".
 *   - NO live status surface, NO RTK Query, NO sidebar nav entry,
 *     NO ProtectedRoute claim wiring. Those land in FE-001+ once
 *     backend image `e9cb8dd0` ships to the target environment
 *     and the OpenFGA seed for `module:endpoint-admin` is
 *     confirmed end-to-end.
 *
 * Why this is intentionally tiny:
 *   PR #258 attempted to ship the full surface (live status page +
 *   RTK Query + ProtectedRoute claim) at once, then white-screened
 *   testai because the shell-services wiring path forced the MF
 *   runtime to evaluate a STUB entry. PR #261 reverted. The follow-
 *   up (this PR) restores ONLY the shell-safe skeleton — no domain
 *   surface, no auth claim — to prove the wiring fix in isolation.
 */
const EndpointAdminApp: React.FC = () => {
  return (
    <main
      data-testid="endpoint-admin-skeleton"
      style={{
        padding: '24px',
        maxWidth: '720px',
        margin: '0 auto',
      }}
    >
      <h1 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '8px' }}>Uç nokta yönetimi</h1>
      <p style={{ color: 'var(--text-secondary, #475569)', marginBottom: '16px' }}>
        Bu modül henüz hazırlık aşamasında. Canlı durum paneli, kayıt akışları ve denetim olayları
        yakında bağlanacak.
      </p>
      <section
        style={{
          padding: '16px',
          border: '1px solid var(--border-subtle, #e2e8f0)',
          borderRadius: '8px',
          background: 'var(--surface-card, #ffffff)',
        }}
      >
        <h2 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '4px' }}>Geliştirici notu</h2>
        <p style={{ fontSize: '13px', color: 'var(--text-tertiary, #64748b)' }}>
          Bu sayfa <code>VITE_SHELL_ENABLE_ENDPOINT_ADMIN_REMOTE</code> flag&apos;i açık olduğunda
          görünür. Varsayılan kapalıdır; backend görüntüsü <code>e9cb8dd0</code> ve OpenFGA tohumu{' '}
          <code>module:endpoint-admin</code> ortamlara yayınlandıktan sonra etkinleştirilecek.
        </p>
      </section>
    </main>
  );
};

EndpointAdminApp.displayName = 'EndpointAdminApp';

export default EndpointAdminApp;
