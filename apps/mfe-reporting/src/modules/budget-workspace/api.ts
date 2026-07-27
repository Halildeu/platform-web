import { getShellServices } from '../../app/services/shell-services';
import type {
  BudgetControlSummary,
  BudgetLineInput,
  BudgetPlanView,
} from './types';

const BASE = '/api/v1/budgets';

export type BudgetErrorKind =
  | 'AUTHENTICATION_REQUIRED'
  | 'FORBIDDEN'
  | 'CONFLICT'
  | 'NOT_FOUND'
  | 'INVALID_REQUEST'
  | 'UNAVAILABLE';

export class BudgetApiError extends Error {
  constructor(
    readonly kind: BudgetErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'BudgetApiError';
  }
}

const resolveClient = () => getShellServices().http;

const requireAuthReady = async (): Promise<void> => {
  try {
    const result = await getShellServices().auth.ready();
    if (!result.ok) {
      throw new BudgetApiError(
        'AUTHENTICATION_REQUIRED',
        'Oturum güvenli bağlantı için henüz hazır değil. Lütfen yeniden deneyin.',
      );
    }
  } catch (error) {
    if (error instanceof BudgetApiError) throw error;
    throw new BudgetApiError(
      'AUTHENTICATION_REQUIRED',
      'Oturum doğrulanamadı. Lütfen yeniden giriş yapın.',
    );
  }
};

const companyHeaders = (companyId: number): Record<string, string> => {
  if (!Number.isInteger(companyId) || companyId < 1) {
    throw new BudgetApiError('INVALID_REQUEST', 'Geçerli bir şirket seçilmelidir.');
  }
  return { 'X-Company-Id': String(companyId) };
};

const mapError = (error: unknown): never => {
  if (error instanceof BudgetApiError) throw error;
  const response =
    typeof error === 'object' && error !== null && 'response' in error
      ? (error as {
          response?: {
            status?: number;
            data?: unknown;
          };
        }).response
      : undefined;
  if (response) {
    const status = response.status;
    const serverMessage =
      typeof response.data === 'object' &&
      response.data !== null &&
      'message' in response.data &&
      typeof response.data.message === 'string'
        ? response.data.message
        : null;
    if (status === 401) {
      throw new BudgetApiError('AUTHENTICATION_REQUIRED', 'Oturum süresi dolmuş veya geçersiz.');
    }
    if (status === 403) {
      throw new BudgetApiError(
        'FORBIDDEN',
        serverMessage ?? 'Bu şirket veya bütçe işlemi için yetkiniz bulunmuyor.',
      );
    }
    if (status === 404) {
      throw new BudgetApiError('NOT_FOUND', 'Bütçe kaydı bu şirket kapsamında bulunamadı.');
    }
    if (status === 409) {
      throw new BudgetApiError(
        'CONFLICT',
        serverMessage ?? 'Bütçe başka bir işlem nedeniyle değişti. Veriyi yenileyin.',
      );
    }
    if (status === 400) {
      throw new BudgetApiError(
        'INVALID_REQUEST',
        serverMessage ?? 'Bütçe isteği doğrulanamadı.',
      );
    }
  }
  throw new BudgetApiError(
    'UNAVAILABLE',
    'Bütçe servisine ulaşılamadı. Veriler değiştirilmedi; daha sonra yeniden deneyin.',
  );
};

const execute = async <T>(request: () => Promise<{ data: T }>): Promise<T> => {
  await requireAuthReady();
  try {
    const { data } = await request();
    return data;
  } catch (error) {
    return mapError(error);
  }
};

export const createBudget = (
  companyId: number,
  fiscalYear: number,
  baseCurrency: string,
): Promise<BudgetPlanView> =>
  execute(() =>
    resolveClient().post<BudgetPlanView>(
      BASE,
      { companyId, fiscalYear, baseCurrency },
      { headers: companyHeaders(companyId) },
    ),
  );

export const replaceBudgetLines = (
  companyId: number,
  planId: string,
  versionId: string,
  lines: BudgetLineInput[],
): Promise<BudgetPlanView> =>
  execute(() =>
    resolveClient().put<BudgetPlanView>(
      `${BASE}/${encodeURIComponent(planId)}/versions/${encodeURIComponent(versionId)}/lines`,
      { lines },
      { headers: companyHeaders(companyId) },
    ),
  );

export const submitBudget = (
  companyId: number,
  planId: string,
  versionId: string,
): Promise<BudgetPlanView> =>
  execute(() =>
    resolveClient().post<BudgetPlanView>(
      `${BASE}/${encodeURIComponent(planId)}/versions/${encodeURIComponent(versionId)}/submit`,
      undefined,
      { headers: companyHeaders(companyId) },
    ),
  );

export const approveBudget = (
  companyId: number,
  planId: string,
  versionId: string,
): Promise<BudgetPlanView> =>
  execute(() =>
    resolveClient().post<BudgetPlanView>(
      `${BASE}/${encodeURIComponent(planId)}/versions/${encodeURIComponent(versionId)}/approve`,
      undefined,
      { headers: companyHeaders(companyId) },
    ),
  );

export const fetchBudget = (
  companyId: number,
  planId: string,
  versionId: string,
): Promise<BudgetPlanView> =>
  execute(() =>
    resolveClient().get<BudgetPlanView>(
      `${BASE}/${encodeURIComponent(planId)}/versions/${encodeURIComponent(versionId)}`,
      { headers: companyHeaders(companyId) },
    ),
  );

export const fetchBudgetControl = (
  companyId: number,
  planId: string,
  versionId: string,
): Promise<BudgetControlSummary> =>
  execute(() =>
    resolveClient().get<BudgetControlSummary>(
      `${BASE}/${encodeURIComponent(planId)}/versions/${encodeURIComponent(versionId)}/control`,
      { headers: companyHeaders(companyId) },
    ),
  );
