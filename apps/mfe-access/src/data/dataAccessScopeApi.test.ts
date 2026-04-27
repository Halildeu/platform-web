// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  dataAccessScopeApi,
  ScopeServiceUnavailableError,
  ScopeAlreadyGrantedError,
  ScopeValidationError,
} from './dataAccessScopeApi';

vi.mock('@mfe/shared-http', () => {
  const api = {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  };
  return {
    api,
    logUnexpected: vi.fn(),
  };
});

vi.mock('../app/services/shell-services', () => ({
  getShellServices: () => {
    throw new Error('no shell services');
  },
}));

const httpMockedModule = await import('@mfe/shared-http');
const httpMock = httpMockedModule.api as unknown as {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

const buildAxiosError = (status: number, message?: string) => {
  const err = Object.assign(new Error(message ?? `HTTP ${status}`), {
    isAxiosError: true,
    response: {
      status,
      data: { message: message ?? `HTTP ${status}` },
    },
  });
  return err;
};

describe('dataAccessScopeApi', () => {
  beforeEach(() => {
    httpMock.get.mockReset();
    httpMock.post.mockReset();
    httpMock.delete.mockReset();
  });

  it('list — returns scopes on 200', async () => {
    httpMock.get.mockResolvedValueOnce({
      data: [
        {
          id: 1,
          userId: '7e6e29ab-0000-0000-0000-000000000001',
          orgId: 1,
          scopeKind: 'COMPANY',
          scopeRef: '["1001"]',
          grantedAt: '2026-04-27T00:00:00Z',
          active: true,
        },
      ],
    });

    const result = await dataAccessScopeApi.list('7e6e29ab-0000-0000-0000-000000000001', 1);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: 1, scopeKind: 'COMPANY' });
    expect(httpMock.get).toHaveBeenCalledWith('/v1/access/scope', {
      params: { userId: '7e6e29ab-0000-0000-0000-000000000001', orgId: 1 },
    });
  });

  it('grant — returns response on 201', async () => {
    httpMock.post.mockResolvedValueOnce({
      data: {
        scopeId: 42,
        userId: '7e6e29ab-0000-0000-0000-000000000001',
        orgId: 1,
        scopeKind: 'PROJECT',
        scopeRef: '["1001"]',
        grantedAt: '2026-04-27T00:00:00Z',
        openFgaObjectType: 'project',
        openFgaObjectId: '1001',
      },
    });

    const result = await dataAccessScopeApi.grant({
      userId: '7e6e29ab-0000-0000-0000-000000000001',
      orgId: 1,
      scopeKind: 'PROJECT',
      scopeRef: '["1001"]',
    });

    expect(result.scopeId).toBe(42);
    expect(result.openFgaObjectType).toBe('project');
    expect(httpMock.post).toHaveBeenCalledWith('/v1/access/scope', expect.any(Object));
  });

  it('revoke — sends DELETE with revokedBy param', async () => {
    httpMock.delete.mockResolvedValueOnce({ data: undefined });

    await dataAccessScopeApi.revoke(7, '7e6e29ab-0000-0000-0000-000000000099');
    expect(httpMock.delete).toHaveBeenCalledWith('/v1/access/scope/7', {
      params: { revokedBy: '7e6e29ab-0000-0000-0000-000000000099' },
    });
  });

  it('list — wraps 503 as ScopeServiceUnavailableError', async () => {
    httpMock.get.mockRejectedValueOnce(buildAxiosError(503, 'reports_db disabled'));

    await expect(
      dataAccessScopeApi.list('7e6e29ab-0000-0000-0000-000000000001', 1),
    ).rejects.toBeInstanceOf(ScopeServiceUnavailableError);
  });

  it('grant — wraps 409 as ScopeAlreadyGrantedError', async () => {
    httpMock.post.mockRejectedValueOnce(buildAxiosError(409, 'already granted'));

    await expect(
      dataAccessScopeApi.grant({
        userId: '7e6e29ab-0000-0000-0000-000000000001',
        orgId: 1,
        scopeKind: 'COMPANY',
        scopeRef: '["1001"]',
      }),
    ).rejects.toBeInstanceOf(ScopeAlreadyGrantedError);
  });

  it('grant — wraps 422 as ScopeValidationError with fieldErrors', async () => {
    const err = Object.assign(new Error('invalid'), {
      isAxiosError: true,
      response: {
        status: 422,
        data: { message: 'invalid', fieldErrors: { scopeRef: ['must not be blank'] } },
      },
    });
    httpMock.post.mockRejectedValueOnce(err);

    const promise = dataAccessScopeApi.grant({
      userId: '7e6e29ab-0000-0000-0000-000000000001',
      orgId: 1,
      scopeKind: 'COMPANY',
      scopeRef: '',
    });

    await expect(promise).rejects.toBeInstanceOf(ScopeValidationError);
    await expect(promise).rejects.toMatchObject({
      fieldErrors: { scopeRef: ['must not be blank'] },
    });
  });
});
