import axios, { AxiosError } from 'axios';
import { api, logUnexpected, type ApiInstance } from '@mfe/shared-http';
import type {
  DataAccessScope,
  ScopeGrantRequest,
  ScopeGrantResponse,
} from '../entities/data-access-scope';
import { getShellServices } from '../app/services/shell-services';

const BASE = '/v1/access/scope';

export class ScopeServiceUnavailableError extends Error {
  readonly status = 503;
  constructor(message = 'data_access scope service is unavailable') {
    super(message);
    this.name = 'ScopeServiceUnavailableError';
  }
}

export class ScopeAlreadyGrantedError extends Error {
  readonly status = 409;
  constructor(message = 'scope already granted') {
    super(message);
    this.name = 'ScopeAlreadyGrantedError';
  }
}

export class ScopeValidationError extends Error {
  readonly status = 422;
  constructor(
    message = 'scope reference invalid',
    public readonly fieldErrors?: Record<string, string[]>,
  ) {
    super(message);
    this.name = 'ScopeValidationError';
  }
}

type ErrorPayload = {
  error?: string;
  message?: string;
  fieldErrors?: Record<string, string[]>;
  meta?: { traceId?: string };
};

const resolveHttpClient = (): ApiInstance => {
  try {
    return getShellServices().http;
  } catch {
    return api;
  }
};

const wrapError = (err: unknown): never => {
  if (axios.isAxiosError(err)) {
    const ax = err as AxiosError<ErrorPayload>;
    const status = ax.response?.status;
    const data = ax.response?.data;
    const msg = data?.message || data?.error || ax.message || 'request failed';

    logUnexpected('dataAccessScopeApi.error', msg, {
      status,
      traceId: data?.meta?.traceId,
      fieldErrors: data?.fieldErrors,
    });

    if (status === 503) throw new ScopeServiceUnavailableError(msg);
    if (status === 409) throw new ScopeAlreadyGrantedError(msg);
    if (status === 422) throw new ScopeValidationError(msg, data?.fieldErrors);
    throw new Error(msg);
  }
  throw err;
};

export const dataAccessScopeApi = {
  async list(userId: string, orgId: number): Promise<DataAccessScope[]> {
    try {
      const client = resolveHttpClient();
      const res = await client.get<DataAccessScope[]>(BASE, { params: { userId, orgId } });
      return Array.isArray(res.data) ? res.data : [];
    } catch (err: unknown) {
      return wrapError(err);
    }
  },

  async grant(req: ScopeGrantRequest): Promise<ScopeGrantResponse> {
    try {
      const client = resolveHttpClient();
      const res = await client.post<ScopeGrantResponse>(BASE, req);
      return res.data;
    } catch (err: unknown) {
      return wrapError(err);
    }
  },

  async revoke(scopeId: number, revokedBy?: string): Promise<void> {
    try {
      const client = resolveHttpClient();
      await client.delete(`${BASE}/${scopeId}`, {
        params: revokedBy ? { revokedBy } : undefined,
      });
    } catch (err: unknown) {
      wrapError(err);
    }
  },
};
