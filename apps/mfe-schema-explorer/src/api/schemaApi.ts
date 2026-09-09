import axios from 'axios';
import type {
  SchemaColumnInfo,
  SchemaTableInfo,
  SchemaRelationship,
  SchemaSnapshot,
  SchemaColumnSearchResult,
  SchemaImpactResult,
} from '@mfe/shared-types';

const BASE_URL = import.meta.env.VITE_SCHEMA_API_URL || '/api/v1/schema';

const api = axios.create({ baseURL: BASE_URL });

/* 2026-04-25 Faz 19.MSSQL.J — Auth interceptor eklendi
 * Sebep: schema-explorer @mfe/shared-http kullanmıyor (dependency yok), kendi axios'unu yaratıyordu.
 * Sonuç: Authorization header eklenmiyor → backend api-gateway 401 UNAUTHORIZED.
 * Fix: localStorage'tan JWT oku + window.__env__ veya shell context'inden token resolver pattern.
 *      Diğer MFE'ler @mfe/shared-http registerAuthTokenResolver ile çalışıyor. */
/* Token resolver — localStorage 'token' veya window.__authToken__ */
function resolveAuthToken(): string | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const t = window.localStorage.getItem('token');
      if (t && t !== 'undefined' && t !== 'null' && t.trim()) return t;
    }
    if (typeof window !== 'undefined') {
      const w = window as Window & { __authToken__?: string };
      if (typeof w.__authToken__ === 'string' && w.__authToken__.trim()) return w.__authToken__;
    }
  } catch {
    /* localStorage SSR / private mode access denied */
  }
  return null;
}

api.interceptors.request.use((config) => {
  const token = resolveAuthToken();
  if (token) {
    config.headers = config.headers ?? {};
    (config.headers as Record<string, string>).Authorization = `Bearer ${token}`;
  }
  return config;
});

/* 2026-04-25 Faz 19.MSSQL.L — window.fetch monkey-patch
 * Sebep: schema-explorer App.tsx + 7 component dosyası raw fetch() kullanıyor (axios değil).
 * E2E sim: /api/v1/schema/schemas → 401 (Authorization header eksik) → React tree çöküyor
 *          (TypeError: n.map is not a function). Tek noktadan çözüm.
 * Pattern: sadece /api/* path'ler için header inject (cross-origin fetch'e dokunma). */
if (typeof window !== 'undefined' && !(window as Window & { __mfeSchemaFetchPatched__?: boolean }).__mfeSchemaFetchPatched__) {
  const originalFetch = window.fetch.bind(window);
  window.fetch = function patchedFetch(input: RequestInfo | URL, init?: RequestInit) {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const isApi = typeof url === 'string' && (url.startsWith('/api/') || url.includes(window.location.origin + '/api/'));
    if (isApi) {
      const token = resolveAuthToken();
      if (token) {
        const headers = new Headers(init?.headers || {});
        if (!headers.has('Authorization')) {
          headers.set('Authorization', `Bearer ${token}`);
        }
        init = { ...(init || {}), headers };
      }
    }
    return originalFetch(input, init);
  };
  (window as Window & { __mfeSchemaFetchPatched__?: boolean }).__mfeSchemaFetchPatched__ = true;
}

/* Re-export shared types for backward compatibility within this MFE */
export type ColumnInfo = SchemaColumnInfo;
export type TableInfo = SchemaTableInfo;
export type Relationship = SchemaRelationship;
export type { SchemaSnapshot };
export type ColumnSearchResult = SchemaColumnSearchResult;
export type ImpactResult = SchemaImpactResult;

/* gitops#3605 — the service reads more than one catalog now (Workcube MSSQL
 * and IFS ERP Oracle). Every call carries the pair the user picked: which
 * source, and which schema/owner inside it. An absent source is the primary
 * (Workcube) lane, so existing deployments behave exactly as before. */
export interface SchemaScope {
  source?: string;
  schema?: string;
}

export interface SchemaSourceInfo {
  source: string;
  engine: string;
}

export interface SchemaListEntry {
  name: string;
  tableCount: number;
}

function scopeParams(scope?: SchemaScope) {
  return {
    schema: scope?.schema || undefined,
    source: scope?.source || undefined,
  };
}

/** Builds a scoped URL for the panels that still use raw fetch(). Existing
 * query parameters on `path` are preserved. */
export function scopedUrl(path: string, scope?: SchemaScope): string {
  const absoluteBase = /^https?:\/\//.test(BASE_URL);
  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost';
  const url = new URL(`${BASE_URL}${path}`, origin);
  if (scope?.source) url.searchParams.set('source', scope.source);
  if (scope?.schema) url.searchParams.set('schema', scope.schema);
  return absoluteBase ? url.toString() : `${url.pathname}${url.search}`;
}

export const schemaApi = {
  getSources: () =>
    api.get<SchemaSourceInfo[]>('/sources').then(r => r.data),

  getSchemas: (source?: string) =>
    api.get<SchemaListEntry[]>('/schemas', { params: { source: source || undefined } }).then(r => r.data),

  getSnapshot: (scope?: SchemaScope) =>
    api.get<SchemaSnapshot>('/snapshot', { params: scopeParams(scope) }).then(r => r.data),

  getTable: (tableName: string, scope?: SchemaScope) =>
    api.get<{ table: TableInfo; outgoingFks: Relationship[]; incomingRefs: Relationship[]; domain: string }>(
      `/tables/${tableName}`, { params: scopeParams(scope) }
    ).then(r => r.data),

  searchColumns: (q: string, scope?: SchemaScope) =>
    api.get<ColumnSearchResult>('/search/columns', { params: { q, ...scopeParams(scope) } }).then(r => r.data),

  getImpact: (tableName: string, hops = 2, scope?: SchemaScope) =>
    api.get<ImpactResult>(`/impact/${tableName}`, { params: { hops, ...scopeParams(scope) } }).then(r => r.data),

  getDomains: (scope?: SchemaScope) =>
    api.get<{ domainCount: number; domains: { name: string; tableCount: number; tables: string[] }[] }>(
      '/domains', { params: scopeParams(scope) }
    ).then(r => r.data),
};
