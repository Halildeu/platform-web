import React, { Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAppSelector } from '../store/store.hooks';
import { isPermitAllMode } from '../auth/auth-config';
import { ProtectedRoute } from '../guards/ProtectedRoute';
import { selectAuthPhase } from '../../features/auth/model/auth.slice';
import { MODULE_KEYS } from '../../features/auth/lib/permissions.constants';
import {
  isEndpointAdminRemoteEnabled,
  isEthicRemoteEnabled,
  isInterviewEvidenceRemoteEnabled,
  isMeetingRemoteEnabled,
  isSuggestionsRemoteEnabled,
} from '../shell-navigation';
import { useShellCommonI18n } from '../i18n';
import {
  SuggestionsApp,
  EthicApp,
  AccessModule,
  AuditModule,
  UsersModule,
  SchemaExplorerModule,
  MeetingModule,
  InterviewEvidenceModule,
  EndpointAdminModule,
} from './lazy-routes';
import { ReportingLayout } from '../../pages/admin/reports/ReportingLayout';
import {
  AtsProductHubRoute,
  InterviewEvidenceRoute,
  RecruiterWorkspaceRoute,
} from './InterviewEvidenceRoute';
import {
  ATS_PRODUCT_HUB_ENTRY,
  INTERVIEW_EVIDENCE_ENTRY,
} from '../../features/ats-product-catalog/model/ats-capability-registry';
import { RECRUITER_WORKSPACE_ENTRY } from '../../features/ats-portals/model/ats-portal-registry';
import { EndpointAdminRouteBoundary } from './EndpointAdminRouteBoundary';
const ReportBuilderWizard = React.lazy(() =>
  import('../../pages/admin/reports/builder/ReportBuilderWizard').then((m) => ({
    default: m.ReportBuilderWizard,
  })),
);
const DashboardBuilder = React.lazy(() =>
  import('../../pages/admin/reports/dashboard-builder/DashboardBuilder').then((m) => ({
    default: m.DashboardBuilder,
  })),
);
const ReportEditorRoute = React.lazy(() =>
  import('../../pages/admin/reports/builder/ReportEditor').then((m) => ({
    default: m.ReportEditorRoute,
  })),
);

/* ---- Page imports ---- */
// PERF-INIT-V2 PR-B4a (login micro-entry): LoginPage / RegisterPage /
// UnauthorizedPage are now lazy-loaded.  Auth-flow pages (Login/Register)
// are needed at most once per session — cold-cache first visit or logout.
// UnauthorizedPage is the denial-edge page (rendered when an authenticated
// user lacks the requiredModule for a route).  All three are low-traffic
// from the shell's authenticated-user perspective; lazy-loading keeps the
// eager bundle graph for /home and /admin/* free of their code.  The
// existing Suspense fallback at line ~100 covers the chunk-fetch state.
const LoginPage = React.lazy(() => import('../../pages/login/LoginPage.ui'));
const RegisterPage = React.lazy(() => import('../../pages/register/RegisterPage.ui'));
const UnauthorizedPage = React.lazy(() => import('../../pages/unauthorized/UnauthorizedPage.ui'));

import ThemeMatrixPage from '../../pages/runtime/ThemeMatrixPage';
import { HomePage } from '../../pages/home/HomePage';

// PERF-INIT-V2 PR-B4b (admin pages lazy-load): ThemeAdminPage, DesignLabPage,
// and DesignLabRoutes are admin-surface UIs that an average authenticated
// user on /home never visits.  Lazy-loading keeps the eager shell chunk
// graph free of the entire Design Lab tree (token editor, theme matrix,
// component galleries, Storybook-like surfaces — large transitive cost).
// Suspense fallback is already wired at the AppRouter outer boundary.
const ThemeAdminPage = React.lazy(() => import('../../pages/admin/ThemeAdminPage'));
const DesignLabPage = React.lazy(() => import('../../pages/admin/DesignLabPage'));
const DesignLabRoutes = React.lazy(() =>
  import('../../pages/admin/design-lab/DesignLabRoutes').then((m) => ({
    default: m.DesignLabRoutes,
  })),
);

const XSuiteDashboardPage = React.lazy(() => import('../../pages/admin/XSuiteDashboardPage'));
const ServiceControlPage = React.lazy(
  () => import('../../pages/admin/service-control/ServiceControlPage'),
);
// Faz 23.5 PR3: subscriber-facing notification preferences page.
const NotificationPreferencesPage = React.lazy(
  () => import('../../pages/settings/NotificationPreferencesPage'),
);
const UnsubscribeLandingPage = React.lazy(
  () => import('../../pages/notifications/unsubscribe/UnsubscribeLandingPage.ui'),
);
const CandidateApplicationPage = React.lazy(
  () => import('../../pages/jobs/CandidateApplicationPage'),
);
const PublicJobsPage = React.lazy(() => import('../../pages/jobs/PublicJobsPage'));
const CandidatePortalPage = React.lazy(() => import('../../pages/candidate/CandidatePortalPage'));
const RecruiterWorkspacePage = React.lazy(
  () => import('../../features/ats-portals/ui/RecruiterWorkspacePage'),
);

/* ------------------------------------------------------------------ */
/*  AppRouter — All application routes                                 */
/* ------------------------------------------------------------------ */

const AuthTraceRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Dev-only auth state logging
  return <>{children}</>;
};

export const AppRouter: React.FC = () => {
  const { t } = useShellCommonI18n();
  const authState = useAppSelector((state) => state.auth);
  const { token, initialized } = authState;
  // Phase 2 PR-Auth-1 (Codex iter-22/24 §Auth-1 absorb, thread 019e0119):
  // FSM phase used to suppress login flicker during transitional bootstrap
  // states (initializing/keycloakReady/cookieReady/authzReady). Login UI
  // only renders on terminal `unauthenticated` phase. `failed` phase
  // surfaces a degraded UI (technical bootstrap error), NOT a login button.
  const authPhase = useAppSelector(selectAuthPhase);
  const isAuthBootstrapping =
    authPhase === 'initializing' ||
    authPhase === 'keycloakReady' ||
    authPhase === 'cookieReady' ||
    authPhase === 'authzReady';
  const isAuthFailed = authPhase === 'failed';
  const permitAllMode = isPermitAllMode();
  const suggestionsEnabled = isSuggestionsRemoteEnabled();
  const ethicEnabled = isEthicRemoteEnabled();
  const endpointAdminEnabled = isEndpointAdminRemoteEnabled();
  const meetingEnabled = isMeetingRemoteEnabled();
  const interviewEvidenceEnabled = isInterviewEvidenceRemoteEnabled();

  const defaultShellPath = '/home';

  return (
    <Suspense fallback={<div>{t('shell.header.suspenseLoading')}</div>}>
      <Routes>
        <Route
          path="/suggestions"
          element={
            suggestionsEnabled ? (
              <ProtectedRoute requiredModule="SUGGESTIONS">
                <SuggestionsApp />
              </ProtectedRoute>
            ) : (
              <Navigate to={defaultShellPath} replace />
            )
          }
        />
        <Route
          path="/ethic"
          element={
            ethicEnabled ? (
              <ProtectedRoute requiredModule="ETHIC">
                <EthicApp />
              </ProtectedRoute>
            ) : (
              <Navigate to={defaultShellPath} replace />
            )
          }
        />
        <Route
          path="/access/*"
          element={
            <ProtectedRoute requiredModule="ACCESS">
              <AccessModule />
            </ProtectedRoute>
          }
        />
        {/*
         * PR-FE-2 (Codex thread 019e08e2 iter-7 AGREE absorb, 2026-05-08):
         * `/admin/access/*` alias for the canonical `/access/*` route.
         * Pre-fix the admin URL space included `/admin/users`,
         * `/admin/reports/*`, `/admin/themes`, etc. but NOT
         * `/admin/access/*` — direct navigation (browser address bar,
         * bookmarks, dashboard breadcrumb) fell through the wildcard
         * `*` route at the bottom and bounced the user to `/home` even
         * with `modules.ACCESS=MANAGE`. The alias keeps the old
         * non-prefixed `/access/*` route working and simply maps the
         * `/admin/`-prefixed variant to the same element.
         */}
        <Route
          path="/admin/access/*"
          element={
            <ProtectedRoute requiredModule="ACCESS">
              <AccessModule />
            </ProtectedRoute>
          }
        />
        <Route
          path="/endpoint-admin/*"
          element={
            <EndpointAdminRouteBoundary enabled={endpointAdminEnabled}>
              <EndpointAdminModule />
            </EndpointAdminRouteBoundary>
          }
        />
        <Route
          path="/audit/events"
          element={
            <ProtectedRoute requiredModule="AUDIT">
              <AuditModule />
            </ProtectedRoute>
          }
        />
        {/*
         * PR-FE-2 (Codex thread 019e08e2 iter-7 AGREE absorb, 2026-05-08):
         * `/admin/audit/events` alias — same rationale as
         * `/admin/access/*` above. Direct navigation to the admin URL
         * space variant previously fell through to `/home`; the alias
         * routes it to the canonical AuditModule with the same
         * `requiredModule="AUDIT"` guard.
         */}
        <Route
          path="/admin/audit/events"
          element={
            <ProtectedRoute requiredModule="AUDIT">
              <AuditModule />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/audit/*"
          element={
            <ProtectedRoute requiredModule="AUDIT">
              <AuditModule />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/reports/builder"
          element={
            <ProtectedRoute requiredModule="REPORT">
              <Suspense
                fallback={
                  <div className="flex justify-center py-16">
                    <span className="inline-flex h-6 w-6 animate-spin rounded-full border-2 border-border-subtle border-t-action-primary" />
                  </div>
                }
              >
                <ReportBuilderWizard />
              </Suspense>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/reports/builder/dashboard"
          element={
            <ProtectedRoute requiredModule="REPORT">
              <Suspense
                fallback={
                  <div className="flex justify-center py-16">
                    <span className="inline-flex h-6 w-6 animate-spin rounded-full border-2 border-border-subtle border-t-action-primary" />
                  </div>
                }
              >
                <DashboardBuilder />
              </Suspense>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/reports/builder/edit/:reportKey"
          element={
            <ProtectedRoute requiredModule="REPORT">
              <Suspense
                fallback={
                  <div className="flex justify-center py-16">
                    <span className="inline-flex h-6 w-6 animate-spin rounded-full border-2 border-border-subtle border-t-action-primary" />
                  </div>
                }
              >
                <ReportEditorRoute />
              </Suspense>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/reports/*"
          element={
            <ProtectedRoute requiredModule="REPORT">
              <ReportingLayout />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/reports"
          element={
            <ProtectedRoute requiredModule="REPORT">
              <ReportingLayout />
            </ProtectedRoute>
          }
        />
        <Route path="/reports/*" element={<Navigate to="/admin/reports" replace />} />
        <Route path="/reports" element={<Navigate to="/admin/reports" replace />} />
        <Route
          path="/admin/meetings/*"
          element={
            meetingEnabled ? (
              <ProtectedRoute requiredAnyModule={[MODULE_KEYS.MEETING, MODULE_KEYS.TRANSCRIPT]}>
                <MeetingModule />
              </ProtectedRoute>
            ) : (
              <Navigate to={defaultShellPath} replace />
            )
          }
        />
        <Route path="/meetings/*" element={<Navigate to="/admin/meetings" replace />} />
        <Route path="/meetings" element={<Navigate to="/admin/meetings" replace />} />
        <Route
          path={RECRUITER_WORKSPACE_ENTRY.routePattern}
          element={<RecruiterWorkspaceRoute content={<RecruiterWorkspacePage />} />}
        />
        {/* FULLATS-WEB-ACCESS-04: the protected product hub is permanent. Remote readiness
            controls only the real module launch and never hides the catalog. */}
        <Route
          path={ATS_PRODUCT_HUB_ENTRY.routePattern}
          element={<AtsProductHubRoute remoteEnabled={interviewEvidenceEnabled} />}
        />
        <Route
          path={INTERVIEW_EVIDENCE_ENTRY.routePattern}
          element={
            <InterviewEvidenceRoute
              remoteEnabled={interviewEvidenceEnabled}
              remoteContent={<InterviewEvidenceModule />}
            />
          }
        />
        <Route
          path="/admin/users"
          element={
            <AuthTraceRoute>
              <ProtectedRoute requiredModule="USER_MANAGEMENT">
                <UsersModule />
              </ProtectedRoute>
            </AuthTraceRoute>
          }
        />
        <Route
          path="/admin/schema-explorer/*"
          element={
            <ProtectedRoute requiredModule="THEME">
              <SchemaExplorerModule />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/themes"
          element={
            <ProtectedRoute requiredModule="THEME">
              <ThemeAdminPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/design-lab/*"
          element={
            <ProtectedRoute requiredModule="THEME">
              <DesignLabRoutes />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/design-lab-legacy"
          element={
            <ProtectedRoute requiredModule="THEME">
              <DesignLabPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/x-suite-dashboard"
          element={
            <ProtectedRoute requiredModule="THEME">
              <XSuiteDashboardPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/services"
          element={
            <ProtectedRoute requiredModule="THEME">
              <ServiceControlPage />
            </ProtectedRoute>
          }
        />
        <Route path="/home" element={<HomePage />} />
        <Route path="/runtime/theme-matrix" element={<ThemeMatrixPage />} />
        {/* Faz 23.5 PR3: subscriber-facing preference editor. Auth gate
            handled in-page via selectNotifyIdentity (returns null →
            "Önce oturum açın" message). */}
        <Route path="/settings/notifications" element={<NotificationPreferencesPage />} />
        {/* Faz 23.5 M5 G3: public RFC 8058 one-click unsubscribe landing.
            Reached from email footers; token-authenticated (HMAC) — NO
            ProtectedRoute wrapper. Anonymous users who click a link in
            an email read on a logged-out device must reach the success
            state without a login prompt. */}
        <Route path="/notifications/unsubscribe" element={<UnsubscribeLandingPage />} />
        {/* Faz 25 FULLATS-WEB-APPLY-01: public candidate entry. Job links must
            remain usable on logged-out devices, so this route deliberately
            sits outside ProtectedRoute. The first slice is local-only and
            never uploads the selected PDF or submits candidate data. */}
        <Route path="/candidate" element={<CandidatePortalPage />} />
        <Route path="/candidate/" element={<CandidatePortalPage />} />
        <Route path="/jobs" element={<PublicJobsPage />} />
        <Route path="/jobs/" element={<PublicJobsPage />} />
        <Route path="/jobs/:jobSlug/apply" element={<CandidateApplicationPage />} />
        <Route path="/jobs/:jobSlug/apply/" element={<CandidateApplicationPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/unauthorized" element={<UnauthorizedPage />} />
        <Route
          path="/"
          element={
            // Phase 2 PR-Auth-1 absorb (Codex iter-22/24): suppress login
            // flicker during transitional auth phases. ValidatingMessage
            // shown until phase reaches a terminal state (transportReady /
            // unauthenticated / failed). Without this, the brief
            // initializing→keycloakReady→cookieReady transition flashes the
            // login button on cold reload.
            //
            // `failed` phase surfaces a degraded technical-error UI rather
            // than the login button — distinct from `unauthenticated`.
            isAuthFailed && !permitAllMode ? (
              <div className="px-6 py-10 text-sm font-medium text-danger">
                {t('auth.session.failed', {
                  defaultValue: 'Auth bootstrap failed. Please reload or contact support.',
                })}
              </div>
            ) : (!initialized || isAuthBootstrapping) && !permitAllMode ? (
              <div className="px-6 py-10 text-sm font-medium text-text-secondary">
                {t('auth.session.validating')}
              </div>
            ) : (
              <Navigate to={token || permitAllMode ? defaultShellPath : '/login'} replace />
            )
          }
        />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Suspense>
  );
};
