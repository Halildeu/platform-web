import { getShellServices } from '../../app/services/shell-services';
import type {
  CompanyOption,
  ProjectOption,
} from './types';

const REPORTS_BASE = '/v1/reports';

export type BudgetErrorKind =
  | 'AUTHENTICATION_REQUIRED'
  | 'FORBIDDEN'
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
      ? (error as { response?: { status?: number; data?: { message?: string } } }).response
      : undefined;
  const message = response?.data?.message;
  if (response?.status === 401) {
    throw new BudgetApiError('AUTHENTICATION_REQUIRED', 'Oturum süresi dolmuş veya geçersiz.');
  }
  if (response?.status === 403) {
    throw new BudgetApiError(
      'FORBIDDEN',
      message ?? 'Bu şirket veya proje için veri görme yetkiniz bulunmuyor.',
    );
  }
  if (response?.status === 400) {
    throw new BudgetApiError(
      'INVALID_REQUEST',
      message ?? 'Şirket, proje veya tarih aralığı doğrulanamadı.',
    );
  }
  throw new BudgetApiError(
    'UNAVAILABLE',
    message ?? 'Gerçekleşen maliyet kaynağına ulaşılamadı. Kaynak veride değişiklik yapılmadı.',
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

export const fetchCompanies = (): Promise<CompanyOption[]> =>
  execute(() => resolveClient().get<CompanyOption[]>(`${REPORTS_BASE}/company-options`));

export const fetchProjects = (companyId: number): Promise<ProjectOption[]> =>
  execute(() =>
    resolveClient().get<ProjectOption[]>(`${REPORTS_BASE}/project-options`, {
      headers: companyHeaders(companyId),
    }),
  );
