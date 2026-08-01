import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { UserDetail, UserModuleAccessLevel } from '@mfe/shared-types';
import {
  fetchUsers,
  fetchUserDetail,
  triggerPasswordReset,
  toggleUserStatus,
  updateUserModuleAccess,
  updateUserRole,
  updateUser,
  revokeUserModuleAccess,
  grantSuperAdmin,
  revokeSuperAdmin,
  fetchUserMfaStatus,
  resetUserTotp,
  updateUserMfaPhone,
  updateUserMfaRequired,
  updateUserMfaMethods,
  UserMfaStatus,
  RequestScope,
  UsersApiResponse,
  UserMutationAck,
  SuperAdminMutationResponse,
} from '../../../entities/user/api/users.api';
import { UsersFilters, UsersQueryParams } from './user-management.types';

const USERS_QUERY_KEY = 'users';

const normalizeParams = (filters: UsersFilters): UsersQueryParams => ({
  search: filters.search.trim() || undefined,
  status: filters.status,
  role: filters.role,
  moduleKey: filters.moduleKey || undefined,
  moduleLevel: filters.moduleLevel,
});

export const useUsersQuery = (
  filters: UsersFilters,
  pagination: { page: number; pageSize: number },
  scope?: RequestScope,
  options?: { enabled?: boolean },
) => {
  return useQuery<UsersApiResponse>({
    queryKey: [USERS_QUERY_KEY, filters, pagination, scope],
    queryFn: () =>
      fetchUsers(
        {
          ...normalizeParams(filters),
          page: pagination.page,
          pageSize: pagination.pageSize,
        },
        scope,
      ),
    keepPreviousData: true,
    enabled: options?.enabled ?? true,
  });
};

export const useUserDetailQuery = (
  user: { id: string; email: string } | null,
  scope?: RequestScope,
) => {
  return useQuery<UserDetail>({
    queryKey: [USERS_QUERY_KEY, 'detail', user?.id, scope],
    queryFn: () => {
      if (!user) {
        return Promise.reject(new Error('Kullanıcı seçilmedi'));
      }
      return fetchUserDetail(user, scope);
    },
    enabled: Boolean(user),
  });
};

/**
 * MFA state lives in Keycloak, so it is fetched separately from the user
 * detail rather than folded into it: the panel must be able to show the rest
 * of a user even when the MFA surface is unavailable (it answers 503 in
 * environments where the Keycloak admin client is not provisioned).
 */
export const useUserMfaStatus = (userId: string | null, scope?: RequestScope) =>
  useQuery<UserMfaStatus, Error>({
    queryKey: [USERS_QUERY_KEY, 'mfa', userId],
    queryFn: () => {
      if (!userId) {
        return Promise.reject(new Error('Kullanıcı seçilmedi'));
      }
      return fetchUserMfaStatus({ userId, scope });
    },
    enabled: Boolean(userId),
    retry: false,
  });

export const useUserMutations = (scope?: RequestScope) => {
  const queryClient = useQueryClient();

  const invalidateUsers = () =>
    queryClient.invalidateQueries({
      predicate: (query) => Array.isArray(query.queryKey) && query.queryKey[0] === USERS_QUERY_KEY,
    });

  const updateRoleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: string }) =>
      updateUserRole({ userId, role, scope }),
    onSuccess: () => invalidateUsers(),
  });

  const updateModuleMutation = useMutation({
    mutationFn: ({
      userId,
      moduleKey,
      level,
      performedBy,
      companyId,
      allowGlobalScope,
    }: {
      userId: string;
      moduleKey: string;
      level: UserModuleAccessLevel;
      performedBy?: string;
      companyId?: string;
      allowGlobalScope?: boolean;
    }) =>
      updateUserModuleAccess({
        userId,
        moduleKey,
        level,
        performedBy,
        companyId,
        allowGlobalScope,
        scope,
      }),
    onSuccess: () => invalidateUsers(),
  });

  const revokeModuleMutation = useMutation({
    mutationFn: ({ assignmentId, performedBy }: { assignmentId: string; performedBy?: string }) =>
      revokeUserModuleAccess({ assignmentId, performedBy, scope }),
    onSuccess: () => invalidateUsers(),
  });

  const toggleStatusMutation = useMutation<
    UserMutationAck,
    Error,
    { userId: string; enabled: boolean }
  >({
    mutationFn: ({ userId, enabled }: { userId: string; enabled: boolean }) =>
      toggleUserStatus({ userId, enabled, scope }),
    onSuccess: () => invalidateUsers(),
  });

  const updateSessionTimeoutMutation = useMutation({
    mutationFn: ({
      userId,
      sessionTimeoutMinutes,
    }: {
      userId: string;
      sessionTimeoutMinutes: number;
    }) => updateUser({ userId, payload: { sessionTimeoutMinutes }, scope }),
    onSuccess: () => invalidateUsers(),
  });

  const resetPasswordMutation = useMutation({
    mutationFn: ({ email }: { email: string }) => triggerPasswordReset({ email }),
  });

  // Codex 019dda1c iter-33: super-admin grant/revoke. Both mutations
  // invalidate the users query so UI re-renders with the latest role
  // assignment; the response.bootstrapWarning (if any) is surfaced via
  // toast in the calling action — see UserActions.ui.tsx.
  const grantSuperAdminMutation = useMutation<
    SuperAdminMutationResponse,
    Error,
    { userId: string }
  >({
    mutationFn: ({ userId }) => grantSuperAdmin({ userId, scope }),
    onSuccess: () => invalidateUsers(),
  });

  const revokeSuperAdminMutation = useMutation<
    SuperAdminMutationResponse,
    Error,
    { userId: string }
  >({
    mutationFn: ({ userId }) => revokeSuperAdmin({ userId, scope }),
    onSuccess: () => invalidateUsers(),
  });

  const invalidateMfa = (userId: string) =>
    queryClient.invalidateQueries({ queryKey: [USERS_QUERY_KEY, 'mfa', userId] });

  const resetTotpMutation = useMutation<void, Error, { userId: string }>({
    mutationFn: ({ userId }) => resetUserTotp({ userId, scope }),
    onSuccess: (_data, { userId }) => invalidateMfa(userId),
  });

  const updateMfaPhoneMutation = useMutation<void, Error, { userId: string; phone: string | null }>({
    mutationFn: ({ userId, phone }) => updateUserMfaPhone({ userId, phone, scope }),
    onSuccess: (_data, { userId }) => invalidateMfa(userId),
  });

  const updateMfaRequiredMutation = useMutation<void, Error, { userId: string; required: boolean }>({
    mutationFn: ({ userId, required }) => updateUserMfaRequired({ userId, required, scope }),
    onSuccess: (_data, { userId }) => invalidateMfa(userId),
  });

  const updateMfaMethodsMutation = useMutation<void, Error, { userId: string; methods: string[] }>({
    mutationFn: ({ userId, methods }) => updateUserMfaMethods({ userId, methods, scope }),
    onSuccess: (_data, { userId }) => invalidateMfa(userId),
  });

  return {
    updateRoleMutation,
    updateModuleMutation,
    revokeModuleMutation,
    toggleStatusMutation,
    updateSessionTimeoutMutation,
    resetPasswordMutation,
    grantSuperAdminMutation,
    revokeSuperAdminMutation,
    resetTotpMutation,
    updateMfaPhoneMutation,
    updateMfaRequiredMutation,
    updateMfaMethodsMutation,
  };
};
