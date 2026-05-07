import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { isAxiosError } from 'axios';
import { api } from '@mfe/shared-http';
import { UserProfile } from '@mfe/shared-types'; // Paylaşılan UserProfile tipini import ediyoruz

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
      const response = await api.post('/v1/auth/sessions', loginData);
      const data = response.data as LoginResponseV1;
      let authzSnapshot: AuthzSnapshotV1 | null = null;

      try {
        const authzResponse = await api.get('/v1/authz/me', {
          headers: {
            Authorization: `Bearer ${data.token}`,
          },
        });
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
          const profileResponse = await api.get(
            `/users/by-email/${encodeURIComponent(data.email)}`,
            {
              headers: {
                Authorization: `Bearer ${data.token}`,
              },
            },
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
      const response = await api.post('/users/public/register', userData);
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

export default authSlice.reducer;
