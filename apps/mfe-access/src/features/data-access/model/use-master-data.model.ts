/**
 * Master data scope picker hook — backend
 * `/api/v1/master-data/{companies,projects,branches,departments}` endpoint'lerini
 * tüketir. Frontend ScopeAssignModal text input → dropdown geçişi için.
 *
 * Backend kaynak: platform-backend permission-service MasterDataController
 * (PR #21 sonrası). reports_db secondary datasource'tan workcube_mikrolink
 * tablolarını direct SQL ile okur. Tablo yok / connection fail → boş list
 * (graceful — UI "veri yok" mesajı ile karşılar).
 *
 * 2026-04-29 follow-up.
 */

import { useQuery } from '@tanstack/react-query';
import { api } from '@mfe/shared-http';
import type { ScopeKind } from '../../../entities/data-access-scope';

export interface MasterDataItem {
  id: number;
  name: string;
  status: boolean;
}

const ENDPOINT_BY_KIND: Record<ScopeKind, string> = {
  COMPANY: '/v1/master-data/companies',
  PROJECT: '/v1/master-data/projects',
  BRANCH: '/v1/master-data/branches',
  DEPOT: '/v1/master-data/departments',
};

/**
 * Master data listesi çeker. scopeKind'e göre uygun endpoint'i kullanır.
 *
 * Behavior:
 * - Endpoint başarılı → MasterDataItem[]
 * - Endpoint 4xx/5xx veya backend graceful empty → boş array
 * - Frontend caller boş list durumunda manuel scope ID input fallback gösterebilir
 *
 * @param scopeKind COMPANY | PROJECT | BRANCH | DEPOT
 * @param enabled hook'un fetch yapması için açma kapama (modal open state ile bağla)
 */
export function useMasterData(scopeKind: ScopeKind | null, enabled: boolean = true) {
  return useQuery({
    queryKey: ['master-data', scopeKind],
    queryFn: async (): Promise<MasterDataItem[]> => {
      if (!scopeKind) return [];
      const endpoint = ENDPOINT_BY_KIND[scopeKind];
      if (!endpoint) return [];
      try {
        const res = await api.get(endpoint);
        return (res.data as MasterDataItem[]) ?? [];
      } catch {
        // Backend graceful: 4xx/5xx → boş list dönder, dropdown disabled state
        return [];
      }
    },
    enabled: enabled && !!scopeKind,
    staleTime: 60_000, // 1dk cache (master data tipik nadiren değişir)
  });
}
