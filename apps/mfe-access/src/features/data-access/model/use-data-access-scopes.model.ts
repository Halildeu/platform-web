import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { dataAccessScopeApi, ScopeServiceUnavailableError } from '../../../data/dataAccessScopeApi';
import type {
  DataAccessScope,
  ScopeGrantRequest,
  ScopeGrantResponse,
} from '../../../entities/data-access-scope';

export const dataAccessScopesQueryKey = (userId: string, orgId: number) =>
  ['data-access-scopes', userId, orgId] as const;

export interface UseDataAccessScopesResult {
  scopes: DataAccessScope[];
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  isServiceUnavailable: boolean;
  error: unknown;
  refetch: () => void;
}

export const useDataAccessScopes = (
  userId: string | undefined,
  orgId: number | undefined,
): UseDataAccessScopesResult => {
  const enabled = Boolean(userId && typeof orgId === 'number' && Number.isFinite(orgId));

  const query = useQuery({
    queryKey: enabled
      ? dataAccessScopesQueryKey(userId as string, orgId as number)
      : (['data-access-scopes', 'idle'] as const),
    queryFn: () => dataAccessScopeApi.list(userId as string, orgId as number),
    enabled,
    staleTime: 30_000,
    retry: (failureCount, error) => {
      if (error instanceof ScopeServiceUnavailableError) return false;
      return failureCount < 2;
    },
  });

  return {
    scopes: query.data ?? [],
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    isServiceUnavailable: query.error instanceof ScopeServiceUnavailableError,
    error: query.error,
    refetch: () => {
      void query.refetch();
    },
  };
};

export const useGrantDataAccessScope = () => {
  const queryClient = useQueryClient();
  return useMutation<ScopeGrantResponse, Error, ScopeGrantRequest>({
    mutationFn: (req) => dataAccessScopeApi.grant(req),
    onSuccess: async (_data, vars) => {
      await queryClient.invalidateQueries({
        queryKey: dataAccessScopesQueryKey(vars.userId, vars.orgId),
      });
    },
  });
};

export interface RevokeDataAccessScopeVars {
  scopeId: number;
  userId: string;
  orgId: number;
  revokedBy?: string;
}

export const useRevokeDataAccessScope = () => {
  const queryClient = useQueryClient();
  return useMutation<void, Error, RevokeDataAccessScopeVars>({
    mutationFn: ({ scopeId, revokedBy }) => dataAccessScopeApi.revoke(scopeId, revokedBy),
    onSuccess: async (_data, vars) => {
      await queryClient.invalidateQueries({
        queryKey: dataAccessScopesQueryKey(vars.userId, vars.orgId),
      });
    },
  });
};
