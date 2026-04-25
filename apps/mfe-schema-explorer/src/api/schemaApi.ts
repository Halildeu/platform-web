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
api.interceptors.request.use((config) => {
  try {
    // 1) Try localStorage (Keycloak token persistence pattern)
    let token: string | null = null;
    if (typeof window !== 'undefined' && window.localStorage) {
      token = window.localStorage.getItem('token');
      // Edge case: 'undefined' / 'null' string'i (eski code path artığı)
      if (token === 'undefined' || token === 'null' || !token?.trim()) {
        token = null;
      }
    }
    // 2) Fallback: shell-injected window.__authToken__ (eğer host bridge varsa)
    if (!token && typeof window !== 'undefined') {
      const w = window as Window & { __authToken__?: string };
      if (typeof w.__authToken__ === 'string' && w.__authToken__.trim()) {
        token = w.__authToken__;
      }
    }
    if (token) {
      config.headers = config.headers ?? {};
      (config.headers as Record<string, string>).Authorization = `Bearer ${token}`;
    }
  } catch {
    // localStorage SSR'da yok / private mode'da access denied — sessizce devam (request 401 dönerse UI handle eder)
  }
  return config;
});

/* Re-export shared types for backward compatibility within this MFE */
export type ColumnInfo = SchemaColumnInfo;
export type TableInfo = SchemaTableInfo;
export type Relationship = SchemaRelationship;
export type { SchemaSnapshot };
export type ColumnSearchResult = SchemaColumnSearchResult;
export type ImpactResult = SchemaImpactResult;

export const schemaApi = {
  getSnapshot: (schema?: string) =>
    api.get<SchemaSnapshot>('/snapshot', { params: { schema } }).then(r => r.data),

  getTable: (tableName: string, schema?: string) =>
    api.get<{ table: TableInfo; outgoingFks: Relationship[]; incomingRefs: Relationship[]; domain: string }>(
      `/tables/${tableName}`, { params: { schema } }
    ).then(r => r.data),

  searchColumns: (q: string, schema?: string) =>
    api.get<ColumnSearchResult>('/search/columns', { params: { q, schema } }).then(r => r.data),

  getImpact: (tableName: string, hops = 2, schema?: string) =>
    api.get<ImpactResult>(`/impact/${tableName}`, { params: { hops, schema } }).then(r => r.data),

  getDomains: (schema?: string) =>
    api.get<{ domainCount: number; domains: { name: string; tableCount: number; tables: string[] }[] }>(
      '/domains', { params: { schema } }
    ).then(r => r.data),
};
