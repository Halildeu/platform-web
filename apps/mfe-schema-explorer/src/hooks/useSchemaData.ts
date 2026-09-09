import { useQuery } from '@tanstack/react-query';
import { schemaApi, type SchemaScope, type SchemaSnapshot } from '../api/schemaApi';

const scopeKey = (scope?: SchemaScope) => [scope?.source ?? '', scope?.schema ?? ''];

export function useSchemaSnapshot(scope?: SchemaScope) {
  return useQuery<SchemaSnapshot>({
    queryKey: ['schema-snapshot', ...scopeKey(scope)],
    queryFn: () => schemaApi.getSnapshot(scope),
  });
}

export function useColumnSearch(query: string, scope?: SchemaScope) {
  return useQuery({
    queryKey: ['column-search', query, ...scopeKey(scope)],
    queryFn: () => schemaApi.searchColumns(query, scope),
    enabled: query.length >= 2,
  });
}

export function useImpactAnalysis(tableName: string | null, hops = 2, scope?: SchemaScope) {
  return useQuery({
    queryKey: ['impact', tableName, hops, ...scopeKey(scope)],
    queryFn: () => schemaApi.getImpact(tableName!, hops, scope),
    enabled: !!tableName,
  });
}
