import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { isAxiosError } from 'axios';
import { api, type SharedHttpRequestConfig } from '@mfe/shared-http';
import { UserProfile } from '@mfe/shared-types'; // Paylaşılan UserProfile tipini import ediyoruz
// PR-C2 iter-5 P1-2 (Codex thread `019e109c`): logout MUST also tear
// down impersonation localStorage keys so a subsequent bootstrap pass
// cannot re-hydrate a dead session via the 6-condition guard.
import { clearImpersonationOnFailurePath } from '../../../app/layout/impersonation-storage';

type UniversalGlobal = typeof globalThis & { Buffer?: typeof Buffer };

const getUniversalGlobal = (): UniversalGlobal | undefined => {
  if (typeof globalThis !== 'undefined') {
    return globalThis as UniversalGlobal;
  }
  if (typeof window !== 'undefined') {
    return window as unknown as UniversalGlobal;
  }
  if (typeof self !== 'undefined') {
    return self as unknown as UniversalGlobal;
  }
  return undefined;
};

export const decodeJwtPayload = (token: string): Record<string, unknown> | null => {
  try {
    const segments = token.split('.');
    if (segments.length < 2) {
      return null;
    }
    const normalized = segments[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(
      normalized.length + ((4 - (normalized.length % 4 || 4)) % 4),
      '=',
    );
    let decoded: string | null = null;
    const globalScope = getUniversalGlobal();
    if (globalScope && typeof globalScope.atob === 'function') {
      decoded = globalScope.atob(padded);
    } else if (globalScope?.Buffer) {
      decoded = globalScope.Buffer.from(padded, 'base64').toString('utf-8');
    }
    if (!decoded) {
      return null;
    }
    return JSON.parse(decoded);
  } catch {
    return null;
  }
};

const normalizeAuthToken = (token: string | null | undefined): string | null => {
  if (typeof token !== 'string') {
    return null;
  }
  const normalized = token.trim();
  if (!normalized || normalized === 'undefined' || normalized === 'null') {
    return null;
  }
  return normalized;
};

/**
 * MFE Auth Transport Contract — Codex iter-22/23 absorb (thread 019e0119).
 *
 * <p>The auth bootstrap is a finite-state machine, not a single boolean.
 * Protected app tree rendering and protected MFE network requests must
 * be physically blocked until {@code transportReady} is reached.
 *
 * <p>Phase semantics:
 * <ul>
 *   <li>{@code initializing} — bootstrap not yet started; pre-Keycloak.</li>
 *   <li>{@code keycloakReady} — Keycloak SDK init resolved; token may
 *       or may not exist.</li>
 *   <li>{@code cookieReady} — {@code POST /api/auth/cookie} resolved
 *       (httpOnly cookie set; gateway will translate to Authorization
 *       header on subsequent calls).</li>
 *   <li>{@code authzReady} — {@code GET /api/v1/authz/me} resolved;
 *       permissions/superAdmin available.</li>
 *   <li>{@code transportReady} — protected HTTP transport contract is
 *       fulfilled; MFEs may render and fetch protected endpoints.</li>
 *   <li>{@code refreshing} — token expiry refresh in flight (transient).</li>
 *   <li>{@code unauthenticated} — no Keycloak session; user must log in.
 *       Distinct from {@code failed}: this is the expected state on
 *       cold load before any login.</li>
 *   <li>{@code failed} — bootstrap raised a technical error (Keycloak
 *       unreachable, cookie write 5xx, etc.). UI should show a degraded
 *       state, not a login button.</li>
 * </ul>
 */
export type AuthPhase =
  | 'initializing'
  | 'keycloakReady'
  | 'cookieReady'
  | 'authzReady'
  | 'transportReady'
  | 'refreshing'
  | 'unauthenticated'
  | 'failed';

export interface AuthError {
  message: string;
  cause?: string;
}

/**
 * User Impersonation v1 PR-C2 (Codex AGREE thread `019e109c` iter-4):
 * impersonation FSM substate. Lives inside {@code AuthState} so the
 * effective subject (target during impersonation, admin otherwise) and
 * the saved admin restoration material are in one place — selectors
 * {@link selectIsImpersonating} / {@link selectImpersonationOriginalAdmin}
 * derive everything else.
 *
 * <p>Status semantics:
 * <ul>
 *   <li>{@code inactive} — no active session; default.</li>
 *   <li>{@code entering} — orchestration in flight (start request +
 *       cookie write + authz/me); banner not yet rendered.</li>
 *   <li>{@code active} — broker token swapped; banner mounted.</li>
 *   <li>{@code exiting} — revoke + admin restore in flight.</li>
 *   <li>{@code expired} — backend signalled the broker token died
 *       (TTL hit or admin force-revoked); listener will either restore
 *       the cached admin token or redirect to /login.</li>
 * </ul>
 */
export type ImpersonationStatus = 'inactive' | 'entering' | 'active' | 'exiting' | 'expired';

/**
 * PR-C2 impersonation substate. {@code originalAdmin*} fields snapshot
 * the admin identity at Start so {@code exitImpersonationSession} can
 * restore the cookie / Redux user / authz snapshot without an extra
 * Keycloak round-trip. {@code originalAdminAuthzSnapshot} is held in
 * Redux only — never persisted to localStorage (security smell minimize:
 * keep the broker-token + session metadata persisted, but the admin's
 * permission profile stays in the running tab).
 */
export interface ImpersonationSubstate {
  status: ImpersonationStatus;
  sessionId: string | null;
  startedAt: number | null;
  /** Broker token expiry (ms epoch). */
  expiresAt: number | null;
  originalAdminToken: string | null;
  originalAdminUser: UserProfile | null;
  originalAdminAuthzSnapshot: Record<string, unknown> | null;
  originalAdminExpiresAt: number | null;
  targetUser: UserProfile | null;
  targetAuthzSnapshot: Record<string, unknown> | null;
  /** Codex iter-3 absorb: last expiry/exit reason for diagnostics. */
  lastExpiredReason: string | null;
}

const INITIAL_IMPERSONATION_SUBSTATE: ImpersonationSubstate = {
  status: 'inactive',
  sessionId: null,
  startedAt: null,
  expiresAt: null,
  originalAdminToken: null,
  originalAdminUser: null,
  originalAdminAuthzSnapshot: null,
  originalAdminExpiresAt: null,
  targetUser: null,
  targetAuthzSnapshot: null,
  lastExpiredReason: null,
};

// State'imizin yapısını tanımlayan arayüz
interface AuthState {
  user: UserProfile | null;
  token: string | null;
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
  registrationStatus: 'idle' | 'loading' | 'succeeded' | 'failed';
  lastRegisteredEmail: string | null;
  expiresAt: number | null;
  /**
   * @deprecated Use {@link selectAuthPhase} / {@link selectIsTransportReady}.
   * Derived from {@code phase} for backward compatibility; kept as a boolean
   * for legacy consumers (ProtectedRoute, AppRouter) until they migrate.
   */
  initialized: boolean;
  /** MFE Auth Transport Contract FSM phase (Codex iter-22 absorb). */
  phase: AuthPhase;
  /**
   * Optional auth error context. Populated on {@code failed} phase
   * transitions; cleared when phase progresses out of {@code failed}.
   */
  authError: AuthError | null;
  /**
   * Auth bootstrap epoch — increments on logout/re-login so consumers
   * (e.g. {@code hostServices.auth.ready()}) can invalidate cached
   * Promises and rebuild a fresh ready signal. Codex iter-23 absorb.
   */
  authEpoch: number;
  /** ms timestamp of the most recent {@code transportReady} entry. */
  transportReadyAt: number | null;
  /** Cached /v1/authz/me response — shared with PermissionProvider to avoid double fetch. */
  authzSnapshot: Record<string, unknown> | null;
  /** PR-C2 impersonation FSM substate. */
  impersonation: ImpersonationSubstate;
}

type KeycloakSessionPayload = {
  token: string | null;
  profile?: Partial<UserProfile>;
  expiresAt?: number | null;
  /** Full /v1/authz/me response to share with PermissionProvider. */
  authzSnapshot?: Record<string, unknown> | null;
};

type LoginResponseV1 = {
  token: string;
  email: string;
  role: string;
  permissions?: string[];
  expiresAt?: number | null;
  sessionTimeoutMinutes?: number | null;
};

type AuthzSnapshotV1 = {
  userId?: string | number | null;
  /**
   * Canonical numeric subscriber id (Faz 23.5 hardening — Codex thread
   * `019e0316` iter-3). Backend permission-service emits {@code Long}
   * when the resolved user has a numeric DB id; UUID/sub fallback paths
   * leave it {@code null}. Selector / reducer coerce to a non-empty
   * string (or drop the field entirely) before persisting it.
   */
  subscriberId?: string | number | null;
  permissions?: string[];
  superAdmin?: boolean;
};

/**
 * Coerce a heterogeneous identity claim (string / number / null) into the
 * canonical string shape the rest of the FE expects. Returns
 * {@code undefined} for blanks, NaN, and unrecognised types so callers
 * can skip the field with {@code ?? fallback}.
 *
 * <p>Codex thread `019e0316` iter-2 absorb: a single helper used by both
 * the selector and the auth reducer so the trim / number-finite contract
 * is centralised.
 */
const coerceIdentityValue = (value: unknown): string | undefined => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return undefined;
};

// Persist helpers (yalın, localStorage yoksa gracefully düşer)
const loadPersistedAuth = (): Pick<AuthState, 'user' | 'token' | 'expiresAt'> => {
  if (typeof window === 'undefined') {
    return { user: null, token: null, expiresAt: null };
  }
  try {
    const token = normalizeAuthToken(window.localStorage.getItem('token'));
    const expiresAtRaw = window.localStorage.getItem('tokenExpiresAt');
    const expiresAt = expiresAtRaw ? Number(expiresAtRaw) : null;
    const userRaw = window.localStorage.getItem('user');
    const user = userRaw ? (JSON.parse(userRaw) as UserProfile) : null;
    return { token, user, expiresAt: Number.isFinite(expiresAt) ? expiresAt : null };
  } catch {
    return { user: null, token: null, expiresAt: null };
  }
};

const initialPersisted = loadPersistedAuth();

// Başlangıç state'i
const initialState: AuthState = {
  user: initialPersisted.user,
  token: initialPersisted.token,
  status: 'idle',
  error: null,
  registrationStatus: 'idle',
  lastRegisteredEmail: null,
  expiresAt: initialPersisted.expiresAt,
  initialized: false,
  phase: 'initializing',
  authError: null,
  authEpoch: 0,
  transportReadyAt: null,
  authzSnapshot: null,
  impersonation: { ...INITIAL_IMPERSONATION_SUBSTATE },
};

/**
 * Phases at which {@link AuthState.initialized} is considered {@code true}.
 * Codex iter-23 absorb: legacy {@code initialized} boolean derives from
 * this set so existing consumers (ProtectedRoute, AppRouter) keep working
 * without a forced migration in this PR.
 */
const PHASES_TREATED_AS_INITIALIZED: ReadonlySet<AuthPhase> = new Set<AuthPhase>([
  'transportReady',
  'unauthenticated',
  'failed',
]);

/**
 * Apply {@code phase} change + derived {@code initialized} mirror. Codex
 * iter-23 absorb: keeping the mirror in sync inside the reducer is safer
 * than a selector that legacy non-React consumers might bypass.
 */
const applyPhase = (state: AuthState, phase: AuthPhase): void => {
  state.phase = phase;
  state.initialized = PHASES_TREATED_AS_INITIALIZED.has(phase);
  if (phase === 'transportReady') {
    state.transportReadyAt = Date.now();
    state.authError = null;
  } else if (phase !== 'failed') {
    // Failed phase preserves authError; other transitions clear it.
    state.authError = null;
  }
};

// Login olmak için asenkron thunk
export const loginUser = createAsyncThunk(
  'auth/loginUser',
  async (loginData: { email: string; password: string }, { rejectWithValue }) => {
    try {
      // PR-HTTP-3 (Codex iter-1 P1 absorb): the login flow runs BEFORE
      // the auth FSM reaches transportReady. Without __skipAuthReadyGate
      // the request would either fail-close (unauthenticated) or wait
      // forever for transportReady, which is exactly the deadlock this
      // PR is meant to avoid.
      const loginCfg: SharedHttpRequestConfig = { __skipAuthReadyGate: true };
      const response = await api.post('/v1/auth/sessions', loginData, loginCfg);
      const data = response.data as LoginResponseV1;
      let authzSnapshot: AuthzSnapshotV1 | null = null;

      try {
        const authzCfg: SharedHttpRequestConfig = {
          headers: { Authorization: `Bearer ${data.token}` },
          // Same rationale as /v1/auth/sessions above — fired immediately
          // post-login, before the FSM has caught up to transportReady.
          __skipAuthReadyGate: true,
        };
        const authzResponse = await api.get('/v1/authz/me', authzCfg);
        authzSnapshot = authzResponse.data as AuthzSnapshotV1;
      } catch (authzError) {
        console.warn('Authorization snapshot alınamadı:', authzError);
      }

      interface RemoteProfile extends UserProfile {
        name?: string;
        firstName?: string;
        lastName?: string;
        lastLogin?: string;
        sessionTimeoutMinutes?: number;
      }
      let profile: RemoteProfile | null = null;
      if (data?.email) {
        try {
          const profileCfg: SharedHttpRequestConfig = {
            headers: { Authorization: `Bearer ${data.token}` },
            // PR-HTTP-3: post-login profile fetch runs before the FSM
            // sees the new token; gate must be bypassed.
            __skipAuthReadyGate: true,
          };
          const profileResponse = await api.get(
            `/users/by-email/${encodeURIComponent(data.email)}`,
            profileCfg,
          );
          profile = profileResponse.data as RemoteProfile;
        } catch (profileError) {
          console.warn('Kullanıcı profili alınamadı:', profileError);
        }
      }

      return { ...data, profile, authzSnapshot };
    } catch (error: unknown) {
      if (isAxiosError(error)) {
        const payload = error.response?.data as { message?: string };
        return rejectWithValue(payload?.message || 'Giriş başarısız oldu');
      }
      return rejectWithValue('Bir ağ hatası oluştu. Backend sunucunuzun çalıştığından emin olun.');
    }
  },
);

// Yeni kullanıcı kaydı için asenkron thunk
export const registerUser = createAsyncThunk(
  'auth/registerUser',
  async (userData: Record<string, string>, { rejectWithValue }) => {
    try {
      // PR-HTTP-3: registration is a public endpoint; user is by
      // definition unauthenticated. Bypass the auth-ready gate so the
      // request flies during the {@code unauthenticated} phase.
      const registerCfg: SharedHttpRequestConfig = { __skipAuthReadyGate: true };
      const response = await api.post('/users/public/register', userData, registerCfg);
      return response.data;
    } catch (error: unknown) {
      if (isAxiosError(error)) {
        const payload = error.response?.data as { message?: string };
        return rejectWithValue(payload?.message || 'Kayıt başarısız oldu.');
      }
      return rejectWithValue('Bir ağ hatası oluştu. Backend sunucunuzun çalıştığından emin olun.');
    }
  },
);

// Auth slice'ını oluşturuyoruz
const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    // Logout action'ı
    logout: (state) => {
      state.user = null;
      state.token = null;
      state.status = 'idle';
      state.registrationStatus = 'idle';
      state.error = null;
      state.lastRegisteredEmail = null;
      state.expiresAt = null;
      state.authzSnapshot = null;
      // PR-C2: logout also tears down any active impersonation substate
      // so a subsequent re-login starts clean (no leaked broker token /
      // sessionId metadata in Redux even if localStorage was already
      // cleared by the listener).
      state.impersonation = { ...INITIAL_IMPERSONATION_SUBSTATE };
      // Codex iter-23 absorb: bump epoch so any cached
      // {@code hostServices.auth.ready()} Promises are invalidated.
      state.authEpoch = state.authEpoch + 1;
      applyPhase(state, 'unauthenticated');
      if (typeof window !== 'undefined') {
        try {
          window.localStorage.removeItem('token');
          window.localStorage.removeItem('user');
          window.localStorage.removeItem('tokenExpiresAt');
        } catch {
          // ignore
        }
      }
      // Codex iter-5 P1-2 absorb (thread `019e109c`): tear down all
      // {@code impersonation.*} localStorage keys so a stale broker
      // exchanged token + sessionId pair cannot satisfy the
      // AuthBootstrapper 6-condition hydrate guard on the next page
      // load. Without this, logout left the impersonation slots
      // intact (only generic auth keys were cleared) and a refresh
      // could falsely re-enter impersonation mode against a
      // disposed session.
      clearImpersonationOnFailurePath();
    },
    // Kayıt durumunu sıfırlamak için yeni reducer
    resetRegistrationStatus: (state) => {
      state.registrationStatus = 'idle';
      state.error = null;
      state.lastRegisteredEmail = null;
    },
    setKeycloakSession: (state, action: PayloadAction<KeycloakSessionPayload>) => {
      const incomingToken = normalizeAuthToken(action.payload.token);
      const { profile, expiresAt, authzSnapshot } = action.payload;
      if (authzSnapshot !== undefined) {
        state.authzSnapshot = authzSnapshot;
      }
      state.token = incomingToken;
      state.expiresAt = expiresAt ?? null;
      if (incomingToken) {
        // Faz 23.5 hardening (Codex thread `019e0316` iter-3 + Delta-8):
        // resolve canonical subscriberId in priority
        // (snapshot > profile > previous-state-when-same-user). The
        // sameProfile guard prevents leaking a previous session's id
        // when a brand-new profile lands without a snapshot.
        const previousUser = state.user;
        const snapshotSubscriberId = coerceIdentityValue(
          (authzSnapshot as Record<string, unknown> | null | undefined)?.['subscriberId'],
        );
        const profileSubscriberId = coerceIdentityValue(
          (profile as Record<string, unknown> | null | undefined)?.['subscriberId'],
        );
        const sameProfile =
          !profile ||
          (profile.id !== undefined && profile.id === previousUser?.id) ||
          (profile.email !== undefined && profile.email === previousUser?.email);
        const nextSubscriberId =
          snapshotSubscriberId ??
          profileSubscriberId ??
          (sameProfile ? previousUser?.subscriberId : undefined);

        // Faz 23.5 hardening Delta-8: explicitly write subscriberId so the
        // previous state's value is not silently carried through the
        // `...state.user` spread when the new identity has no canonical id.
        const persistedUser = profile
          ? {
              ...(state.user ?? {
                email: profile.email ?? '',
                role: 'USER',
                permissions: [],
              }),
              ...profile,
              email: profile.email ?? state.user?.email ?? '',
              role: profile.role ?? state.user?.role ?? 'USER',
              permissions: Array.isArray(profile.permissions)
                ? profile.permissions
                : (state.user?.permissions ?? []),
              subscriberId: nextSubscriberId,
            }
          : state.user
            ? { ...state.user, subscriberId: nextSubscriberId }
            : state.user;
        state.user = persistedUser ?? null;
        state.status = 'succeeded';
        if (typeof window !== 'undefined') {
          try {
            window.localStorage.setItem('token', incomingToken);
            window.localStorage.setItem('user', JSON.stringify(state.user ?? {}));
            if (state.expiresAt) {
              window.localStorage.setItem('tokenExpiresAt', String(state.expiresAt));
            } else {
              window.localStorage.removeItem('tokenExpiresAt');
            }
          } catch {
            // ignore
          }
        }
      } else {
        state.user = null;
        state.status = 'idle';
        state.expiresAt = null;
        if (typeof window !== 'undefined') {
          try {
            window.localStorage.removeItem('token');
            window.localStorage.removeItem('user');
            window.localStorage.removeItem('tokenExpiresAt');
          } catch {
            // ignore
          }
        }
      }
    },
    setAuthInitialized: (state, action: PayloadAction<boolean>) => {
      // Codex iter-23 absorb: legacy boolean kept; mirrors phase. Setting
      // {@code true} only nudges initialized; phase remains the source of
      // truth. New consumers should use {@link setAuthPhase}.
      state.initialized = action.payload;
    },
    /**
     * Phase transition action. Codex iter-22 §Auth-1 absorb (thread
     * 019e0119): MFE Auth Transport Contract FSM advances strictly through
     * this action. The {@link applyPhase} helper keeps the legacy
     * {@code initialized} boolean in sync.
     */
    setAuthPhase: (state, action: PayloadAction<AuthPhase>) => {
      applyPhase(state, action.payload);
    },
    /**
     * Set {@code phase=failed} with structured error context. Distinct
     * from {@code unauthenticated}: failed indicates a technical bootstrap
     * problem (Keycloak unreachable, cookie write 5xx) that should NOT
     * surface a login button — it should show a degraded-state UI.
     */
    setAuthFailed: (state, action: PayloadAction<AuthError>) => {
      state.authError = action.payload;
      applyPhase(state, 'failed');
    },
    /**
     * Bump auth epoch (force {@link hostServices.auth.ready()} Promise
     * cache invalidation). Used by callers that need to reset the auth
     * pipeline without full logout (e.g. token refresh failure).
     */
    bumpAuthEpoch: (state) => {
      state.authEpoch = state.authEpoch + 1;
    },
    /**
     * User Impersonation v1 PR-C2 (Codex AGREE thread `019e109c` iter-4):
     * enter an impersonation session. Atomically swaps:
     * <ul>
     *   <li>{@code state.auth.token}     → exchanged broker token</li>
     *   <li>{@code state.auth.user}      → target user (effective subject)</li>
     *   <li>{@code state.auth.expiresAt} → broker token expiry</li>
     *   <li>{@code state.auth.authzSnapshot} → target authz snapshot</li>
     *   <li>{@code state.auth.impersonation.status} → 'active'</li>
     * </ul>
     * The {@code originalAdmin*} fields snapshot the admin identity so
     * {@link exitImpersonationSession} can restore it without an extra
     * Keycloak round-trip. {@code authEpoch} is bumped exactly once
     * inside the reducer (Codex iter-2 invariant: callers MUST NOT bump
     * separately) so cached {@code auth.ready()} Promises and listeners
     * observe a single identity-switch event.
     */
    enterImpersonationSession: (
      state,
      action: PayloadAction<{
        sessionId: string;
        exchangedToken: string;
        expiresAt: number | null;
        targetUser: UserProfile | null;
        targetAuthzSnapshot: Record<string, unknown> | null;
        originalAdminToken: string;
        originalAdminUser: UserProfile | null;
        originalAdminAuthzSnapshot: Record<string, unknown> | null;
        originalAdminExpiresAt: number | null;
      }>,
    ) => {
      const {
        sessionId,
        exchangedToken,
        expiresAt,
        targetUser,
        targetAuthzSnapshot,
        originalAdminToken,
        originalAdminUser,
        originalAdminAuthzSnapshot,
        originalAdminExpiresAt,
      } = action.payload;

      state.impersonation = {
        status: 'active',
        sessionId,
        startedAt: Date.now(),
        expiresAt,
        originalAdminToken,
        originalAdminUser,
        originalAdminAuthzSnapshot,
        originalAdminExpiresAt,
        targetUser,
        targetAuthzSnapshot,
        lastExpiredReason: null,
      };
      // Effective subject swap. {@code state.auth.user} returns the
      // target user during impersonation so PermissionProvider /
      // ImpersonationBanner / consumers see the broker identity.
      state.token = normalizeAuthToken(exchangedToken);
      state.user = targetUser;
      state.expiresAt = expiresAt;
      state.authzSnapshot = targetAuthzSnapshot;
      state.status = 'succeeded';
      state.authEpoch = state.authEpoch + 1;
    },
    /**
     * PR-C2 hydrate path: page refresh during an active impersonation
     * session. Restores the substate from persisted metadata + the
     * freshly-fetched target authz snapshot so the banner mounts
     * without a full enter orchestration. Caller (AuthBootstrapper
     * impersonation guard branch) is responsible for verifying the
     * 6-condition guard before dispatching.
     */
    hydrateImpersonationSession: (
      state,
      action: PayloadAction<{
        sessionId: string;
        exchangedToken: string;
        expiresAt: number | null;
        startedAt: number | null;
        targetUser: UserProfile | null;
        targetAuthzSnapshot: Record<string, unknown> | null;
        originalAdminToken: string;
        originalAdminExpiresAt: number | null;
      }>,
    ) => {
      const {
        sessionId,
        exchangedToken,
        expiresAt,
        startedAt,
        targetUser,
        targetAuthzSnapshot,
        originalAdminToken,
        originalAdminExpiresAt,
      } = action.payload;

      state.impersonation = {
        status: 'active',
        sessionId,
        startedAt: startedAt ?? Date.now(),
        expiresAt,
        originalAdminToken,
        // {@code originalAdminUser} / {@code originalAdminAuthzSnapshot}
        // are not persisted (security smell); after a hydrate the
        // listener / exit path falls back to a fresh authz/me fetch.
        originalAdminUser: null,
        originalAdminAuthzSnapshot: null,
        originalAdminExpiresAt,
        targetUser,
        targetAuthzSnapshot,
        lastExpiredReason: null,
      };
      state.token = normalizeAuthToken(exchangedToken);
      state.user = targetUser;
      state.expiresAt = expiresAt;
      state.authzSnapshot = targetAuthzSnapshot;
      state.status = 'succeeded';
      state.authEpoch = state.authEpoch + 1;
    },
    /**
     * PR-C2 exit reducer: restore the cached admin identity. Called by
     * {@code exitImpersonationSession} orchestration AFTER the backend
     * revoke succeeded (Codex iter-3 invariant: revoke-first; on
     * revoke failure no state mutation, banner shows retry).
     */
    exitImpersonationSession: (
      state,
      action: PayloadAction<{
        adminToken: string;
        adminUser: UserProfile | null;
        adminAuthzSnapshot: Record<string, unknown> | null;
        adminExpiresAt: number | null;
      }>,
    ) => {
      const { adminToken, adminUser, adminAuthzSnapshot, adminExpiresAt } = action.payload;
      state.impersonation = { ...INITIAL_IMPERSONATION_SUBSTATE };
      state.token = normalizeAuthToken(adminToken);
      state.user = adminUser;
      state.expiresAt = adminExpiresAt;
      state.authzSnapshot = adminAuthzSnapshot;
      state.status = 'succeeded';
      state.authEpoch = state.authEpoch + 1;
    },
    /**
     * PR-C2: backend signalled the broker token died. Reducer-side
     * cleanup only (token / user fields stay until the listener decides
     * between admin restore vs /login redirect — see
     * impersonation-expired-listener.ts).
     *
     * <p>Codex iter-5 P2 absorb (thread `019e109c`): bump {@code authEpoch}
     * so token-string-only consumers ({@code onTokenChange} subscribers
     * such as the audit live-stream) re-evaluate and tear down the
     * stale broker connection. Without the bump, {@code state.token}
     * remains identical until the listener restores the admin token,
     * leaving any open SSE/EventSource against the broker JWT alive
     * for an unbounded window. Plan v2 contract — enter / exit /
     * expired all bump the epoch from inside the reducer.
     */
    markImpersonationExpired: (state, action: PayloadAction<{ reason: string }>) => {
      state.impersonation.status = 'expired';
      state.impersonation.lastExpiredReason = action.payload.reason;
      state.authEpoch = state.authEpoch + 1;
    },
  },
  // Asenkron thunk'ların durumlarını yöneten bölüm
  extraReducers: (builder) => {
    builder
      // Login durumları
      .addCase(loginUser.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(loginUser.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.token = action.payload.token;
        const profile = action.payload.profile ?? null;
        const tokenClaims =
          typeof action.payload.token === 'string' ? decodeJwtPayload(action.payload.token) : null;
        const tokenClaimsRecord =
          tokenClaims && typeof tokenClaims === 'object'
            ? (tokenClaims as Record<string, unknown>)
            : null;
        const tokenUserId =
          tokenClaimsRecord && typeof tokenClaimsRecord['userId'] !== 'undefined'
            ? tokenClaimsRecord['userId']
            : undefined;
        const tokenSessionTimeout =
          tokenClaimsRecord && typeof tokenClaimsRecord['sessionTimeoutMinutes'] === 'number'
            ? (tokenClaimsRecord['sessionTimeoutMinutes'] as number)
            : undefined;
        const permissionsFromToken =
          tokenClaimsRecord && Array.isArray(tokenClaimsRecord['permissions'])
            ? (tokenClaimsRecord['permissions'] as unknown[])
            : [];
        const roleFromToken =
          tokenClaimsRecord && typeof tokenClaimsRecord['role'] === 'string'
            ? String(tokenClaimsRecord['role'])
            : undefined;
        const authzUserId = action.payload.authzSnapshot?.userId;
        const authzPermissions = Array.isArray(action.payload.authzSnapshot?.permissions)
          ? action.payload.authzSnapshot?.permissions
          : [];
        const inferredUserId =
          profile?.id ??
          (typeof authzUserId === 'number' || typeof authzUserId === 'string'
            ? authzUserId
            : undefined) ??
          (typeof tokenUserId === 'number' || typeof tokenUserId === 'string'
            ? tokenUserId
            : undefined) ??
          (action.payload as Record<string, unknown>).userId ??
          (action.payload as Record<string, unknown>).id;
        const profileFullName =
          profile?.fullName ??
          profile?.name ??
          [profile?.firstName, profile?.lastName]
            .filter((part: string | undefined) => part && part.trim().length > 0)
            .join(' ')
            .trim();
        const displayName =
          profileFullName && profileFullName.length > 0
            ? profileFullName
            : (action.payload.email?.split('@')[0] ?? undefined);
        const lastLoginAt = profile?.lastLoginAt ?? profile?.lastLogin ?? undefined;
        const sessionTimeoutMinutes =
          profile?.sessionTimeoutMinutes ??
          tokenSessionTimeout ??
          action.payload.sessionTimeoutMinutes ??
          undefined;
        const normalizedPermissions =
          Array.isArray(authzPermissions) && authzPermissions.length > 0
            ? authzPermissions
            : Array.isArray(action.payload.permissions)
              ? action.payload.permissions
              : permissionsFromToken;

        // Faz 23.5 hardening (Codex thread `019e0316` iter-3): canonical
        // subscriberId from /api/v1/authz/me. Keeps undefined when the
        // backend left it null (UUID-only fallback).
        const normalizedSubscriberId = coerceIdentityValue(
          (action.payload.authzSnapshot as Record<string, unknown> | null | undefined)?.[
            'subscriberId'
          ],
        );

        const normalizedUser: UserProfile = {
          id:
            inferredUserId !== undefined && inferredUserId !== null
              ? String(inferredUserId)
              : undefined,
          ...(normalizedSubscriberId !== undefined ? { subscriberId: normalizedSubscriberId } : {}),
          email: action.payload.email,
          role: action.payload.role ?? roleFromToken ?? 'USER',
          permissions: normalizedPermissions.map((permission) => String(permission)),
          displayName,
          fullName: profileFullName ?? undefined,
          lastLoginAt,
          sessionTimeoutMinutes,
        };
        state.user = normalizedUser;
        state.expiresAt =
          typeof action.payload.expiresAt === 'number' ? action.payload.expiresAt : null;
      })
      .addCase(loginUser.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload as string;
      })
      // Register durumları
      .addCase(registerUser.pending, (state) => {
        state.registrationStatus = 'loading';
        state.error = null;
        state.lastRegisteredEmail = null;
      })
      .addCase(registerUser.fulfilled, (state, action) => {
        state.registrationStatus = 'succeeded';
        state.lastRegisteredEmail =
          (action.payload as { email?: string } | undefined)?.email ?? null;
      })
      .addCase(registerUser.rejected, (state, action) => {
        state.registrationStatus = 'failed';
        state.error = action.payload as string;
      });
  },
});

export const {
  logout,
  resetRegistrationStatus,
  setKeycloakSession,
  setAuthInitialized,
  setAuthPhase,
  setAuthFailed,
  bumpAuthEpoch,
  enterImpersonationSession,
  hydrateImpersonationSession,
  exitImpersonationSession,
  markImpersonationExpired,
} = authSlice.actions;

/**
 * Auth FSM selectors. Codex iter-22 §Auth-1 absorb — protected MFE render
 * and protected HTTP request paths must consult these selectors instead
 * of the legacy {@code initialized} boolean.
 */
export const selectAuthPhase = (state: { auth: AuthState }): AuthPhase => state.auth.phase;
export const selectIsTransportReady = (state: { auth: AuthState }): boolean =>
  state.auth.phase === 'transportReady';
export const selectAuthError = (state: { auth: AuthState }): AuthError | null =>
  state.auth.authError;
export const selectAuthEpoch = (state: { auth: AuthState }): number => state.auth.authEpoch;

/**
 * User Impersonation v1 PR-C2 selectors (Codex AGREE thread `019e109c`
 * iter-4). {@link selectIsImpersonating} is the boolean gate consulted
 * by ImpersonationBanner / ImpersonateAction / refresh handler guard;
 * the rest expose the original-admin restoration material so the
 * orchestration / listener layers can reach it without poking the
 * substate directly.
 */
export const selectImpersonationStatus = (state: { auth: AuthState }): ImpersonationStatus =>
  state.auth.impersonation.status;
export const selectIsImpersonating = (state: { auth: AuthState }): boolean =>
  state.auth.impersonation.status === 'active';
export const selectImpersonationOriginalAdmin = (state: { auth: AuthState }): UserProfile | null =>
  state.auth.impersonation.originalAdminUser;
export const selectImpersonationOriginalAuthzSnapshot = (state: {
  auth: AuthState;
}): Record<string, unknown> | null => state.auth.impersonation.originalAdminAuthzSnapshot;
export const selectImpersonationSessionId = (state: { auth: AuthState }): string | null =>
  state.auth.impersonation.sessionId;
export const selectImpersonationOriginalAdminToken = (state: { auth: AuthState }): string | null =>
  state.auth.impersonation.originalAdminToken;
export const selectImpersonationOriginalAdminExpiresAt = (state: {
  auth: AuthState;
}): number | null => state.auth.impersonation.originalAdminExpiresAt;
export const selectImpersonationExpiresAt = (state: { auth: AuthState }): number | null =>
  state.auth.impersonation.expiresAt;

/**
 * Codex 019e1bed C-prime AGREE — shell-level superAdmin selector for
 * remote MFE consumers that should NOT depend on a local `@mfe/auth`
 * `PermissionContext` instance. When a remote's Vite alias bypasses
 * Module Federation shared-singleton registration (e.g. mfe-users PR-C2),
 * the local context falls back to its default `isSuperAdmin: () => false`
 * even though the shell has hydrated `authzSnapshot.superAdmin = true`.
 * `getShellServices().auth.isSuperAdmin()` reads through this selector,
 * giving every remote one canonical answer.
 */
export const selectIsSuperAdmin = (state: { auth: AuthState }): boolean =>
  state.auth.authzSnapshot != null &&
  (state.auth.authzSnapshot as { superAdmin?: boolean }).superAdmin === true;

export default authSlice.reducer;
