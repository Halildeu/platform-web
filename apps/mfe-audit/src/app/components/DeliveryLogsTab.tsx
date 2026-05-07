import React, { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  DeliveryLogApiError,
  fetchAdminDeliveries,
  fetchIntentDeliveries,
} from '../services/delivery-log-api';
import { resolveDeliveryLogOrgId } from '../services/delivery-log-org';
import { getShellServices } from '../services/shell-services';
import type {
  DeliveryLogListResponse,
  DeliveryLogResponse,
  DeliveryLogStatus,
} from '../types/delivery-log';

/**
 * Faz 23.5 PR6 FE — Delivery Logs tab.
 *
 * <p>Codex thread `019e0289` iter-2 AGREE absorb:
 *  - Two explicit modes: `admin` (org-wide search) and `intent` (single
 *    intent's delivery rows). URL `?intentId=` bootstraps the intent mode
 *    so audit deeplinks land directly on the right surface.
 *  - `orgId` resolved from `getShellServices().auth.getUser()` via the
 *    whitelist helper; multi-org users without a UI selector get a clear
 *    inline error rather than a silent default.
 *  - No mock fallback path — 401/403/400/5xx surface as Türkçe inline
 *    error.
 *  - Empty filter values are not added to the request, so React Query
 *    cache keys stay stable and the backend's 24h default applies.
 */

type Mode = 'admin' | 'intent';

const PAGE_SIZE_OPTIONS = [20, 50, 100] as const;
const DEFAULT_SIZE = 20;

const STATUS_OPTIONS: ReadonlyArray<DeliveryLogStatus | ''> = [
  '',
  'PENDING',
  'ACCEPTED',
  'DELIVERED',
  'FAILED',
  'BOUNCED',
  'RETRY',
  'BLOCKED_BY_PREFERENCE',
  'BLOCKED_BY_AUTHZ',
  'BLOCKED_BY_IDEMPOTENCY',
  'BLOCKED_EXTERNAL_NOT_ALLOWED',
];

const initialModeFromLocation = (): { mode: Mode; intentId: string } => {
  if (typeof window === 'undefined') return { mode: 'admin', intentId: '' };
  const params = new URLSearchParams(window.location.search);
  const intentId = params.get('intentId') ?? '';
  return intentId.length > 0 ? { mode: 'intent', intentId } : { mode: 'admin', intentId: '' };
};

export const DeliveryLogsTab: React.FC = () => {
  const initial = useMemo(initialModeFromLocation, []);

  const [mode, setMode] = useState<Mode>(initial.mode);
  const [intentId, setIntentId] = useState<string>(initial.intentId);

  // Admin-mode filter form state.
  const [statusFilter, setStatusFilter] = useState<DeliveryLogStatus | ''>('');
  const [channelFilter, setChannelFilter] = useState<string>('');
  const [providerFilter, setProviderFilter] = useState<string>('');
  const [fromFilter, setFromFilter] = useState<string>('');
  const [toFilter, setToFilter] = useState<string>('');

  const [page, setPage] = useState<number>(0);
  const [size, setSize] = useState<number>(DEFAULT_SIZE);

  // Reset pagination whenever the mode or filters change.
  useEffect(() => {
    setPage(0);
  }, [mode, statusFilter, channelFilter, providerFilter, fromFilter, toFilter, intentId]);

  const orgId = useMemo<string | null>(() => {
    try {
      const services = getShellServices();
      return resolveDeliveryLogOrgId(services.auth.getUser());
    } catch {
      return resolveDeliveryLogOrgId(null);
    }
  }, []);

  const trimmedIntentId = intentId.trim();
  const enabled =
    Boolean(orgId) && (mode === 'admin' || (mode === 'intent' && trimmedIntentId.length > 0));

  const queryKey = useMemo(
    () => [
      'delivery-logs',
      mode,
      orgId,
      mode === 'intent' ? trimmedIntentId : null,
      statusFilter,
      channelFilter.trim(),
      providerFilter.trim(),
      fromFilter,
      toFilter,
      page,
      size,
    ],
    [
      mode,
      orgId,
      trimmedIntentId,
      statusFilter,
      channelFilter,
      providerFilter,
      fromFilter,
      toFilter,
      page,
      size,
    ],
  );

  const query = useQuery<DeliveryLogListResponse, DeliveryLogApiError>({
    queryKey,
    enabled,
    queryFn: ({ signal }) => {
      if (!orgId) {
        throw new DeliveryLogApiError(0, 'orgId is required');
      }
      if (mode === 'intent') {
        return fetchIntentDeliveries({
          intentId: trimmedIntentId,
          orgId,
          page,
          size,
          signal,
        });
      }
      return fetchAdminDeliveries({
        orgId,
        status: statusFilter || undefined,
        channel: channelFilter || undefined,
        provider: providerFilter || undefined,
        from: fromFilter || undefined,
        to: toFilter || undefined,
        page,
        size,
        signal,
      });
    },
  });

  if (orgId === null) {
    return (
      <div role="alert" data-testid="delivery-logs-org-error" style={errorBoxStyle}>
        Organizasyon bilgisi alınamadı. Birden fazla organizasyona bağlı olabilirsiniz; teslimat
        loglarını listelemek için tek bir organizasyon seçimi gerekiyor.
      </div>
    );
  }

  return (
    <section
      data-testid="delivery-logs-tab"
      style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}
    >
      <header style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <strong>Teslimat Logları</strong>
        <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
          Yetki: {orgId} · Redaction: v1
        </span>
        <ModeToggle mode={mode} onChange={setMode} />
      </header>

      {mode === 'intent' ? (
        <IntentModeForm intentId={intentId} onIntentIdChange={setIntentId} />
      ) : (
        <AdminModeForm
          status={statusFilter}
          onStatusChange={setStatusFilter}
          channel={channelFilter}
          onChannelChange={setChannelFilter}
          provider={providerFilter}
          onProviderChange={setProviderFilter}
          from={fromFilter}
          onFromChange={setFromFilter}
          to={toFilter}
          onToChange={setToFilter}
        />
      )}

      <PageSizeSelect size={size} onSizeChange={setSize} />

      {query.isError && <ErrorBanner error={query.error} />}
      {query.isLoading && <p>Yükleniyor…</p>}
      {query.isSuccess && (
        <>
          <DeliveryLogsTable rows={query.data.items} />
          <Pagination
            page={query.data.page}
            totalPages={query.data.total_pages}
            totalElements={query.data.total_elements}
            onPageChange={setPage}
          />
        </>
      )}
      {!enabled && mode === 'intent' && (
        <p
          style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}
          data-testid="delivery-logs-intent-required"
        >
          Niyet kimliği (intent id) girin.
        </p>
      )}
    </section>
  );
};

interface ModeToggleProps {
  mode: Mode;
  onChange: (mode: Mode) => void;
}

const ModeToggle: React.FC<ModeToggleProps> = ({ mode, onChange }) => (
  <div role="tablist" aria-label="Teslimat log modu" style={{ display: 'flex', gap: '0.25rem' }}>
    <button
      type="button"
      role="tab"
      aria-selected={mode === 'admin'}
      onClick={() => onChange('admin')}
      style={tabButtonStyle(mode === 'admin')}
    >
      Tüm Teslimatlar
    </button>
    <button
      type="button"
      role="tab"
      aria-selected={mode === 'intent'}
      onClick={() => onChange('intent')}
      style={tabButtonStyle(mode === 'intent')}
    >
      Intent Teslimatları
    </button>
  </div>
);

interface IntentModeFormProps {
  intentId: string;
  onIntentIdChange: (value: string) => void;
}

const IntentModeForm: React.FC<IntentModeFormProps> = ({ intentId, onIntentIdChange }) => (
  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
    <label style={{ fontSize: '0.85rem' }} htmlFor="delivery-logs-intent-id">
      Intent ID
    </label>
    <input
      id="delivery-logs-intent-id"
      data-testid="delivery-logs-intent-input"
      type="text"
      value={intentId}
      onChange={(e) => onIntentIdChange(e.target.value)}
      placeholder="örn. 89d0..."
      style={inputStyle}
    />
  </div>
);

interface AdminModeFormProps {
  status: DeliveryLogStatus | '';
  onStatusChange: (value: DeliveryLogStatus | '') => void;
  channel: string;
  onChannelChange: (value: string) => void;
  provider: string;
  onProviderChange: (value: string) => void;
  from: string;
  onFromChange: (value: string) => void;
  to: string;
  onToChange: (value: string) => void;
}

const AdminModeForm: React.FC<AdminModeFormProps> = ({
  status,
  onStatusChange,
  channel,
  onChannelChange,
  provider,
  onProviderChange,
  from,
  onFromChange,
  to,
  onToChange,
}) => (
  <form
    role="search"
    aria-label="Teslimat log filtreleri"
    style={{ display: 'grid', gap: '0.5rem', gridTemplateColumns: 'repeat(5, 1fr)' }}
    onSubmit={(e) => e.preventDefault()}
  >
    <label style={labelStyle}>
      Durum
      <select
        data-testid="delivery-logs-status-select"
        value={status}
        onChange={(e) => onStatusChange(e.target.value as DeliveryLogStatus | '')}
        style={inputStyle}
      >
        {STATUS_OPTIONS.map((option) => (
          <option key={option} value={option}>
            {option || '— hepsi —'}
          </option>
        ))}
      </select>
    </label>
    <label style={labelStyle}>
      Kanal
      <input
        data-testid="delivery-logs-channel-input"
        value={channel}
        onChange={(e) => onChannelChange(e.target.value)}
        placeholder="email, sms, slack, …"
        style={inputStyle}
      />
    </label>
    <label style={labelStyle}>
      Sağlayıcı
      <input
        data-testid="delivery-logs-provider-input"
        value={provider}
        onChange={(e) => onProviderChange(e.target.value)}
        placeholder="smtp, netgsm, …"
        style={inputStyle}
      />
    </label>
    <label style={labelStyle}>
      Başlangıç (UTC)
      <input
        data-testid="delivery-logs-from-input"
        type="datetime-local"
        value={from}
        onChange={(e) => onFromChange(e.target.value)}
        style={inputStyle}
      />
    </label>
    <label style={labelStyle}>
      Bitiş (UTC)
      <input
        data-testid="delivery-logs-to-input"
        type="datetime-local"
        value={to}
        onChange={(e) => onToChange(e.target.value)}
        style={inputStyle}
      />
    </label>
  </form>
);

interface PageSizeSelectProps {
  size: number;
  onSizeChange: (size: number) => void;
}

const PageSizeSelect: React.FC<PageSizeSelectProps> = ({ size, onSizeChange }) => (
  <label style={{ fontSize: '0.85rem' }}>
    Sayfa boyutu:{' '}
    <select
      data-testid="delivery-logs-size-select"
      value={size}
      onChange={(e) => onSizeChange(Number(e.target.value))}
    >
      {PAGE_SIZE_OPTIONS.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  </label>
);

interface DeliveryLogsTableProps {
  rows: DeliveryLogResponse[];
}

const DeliveryLogsTable: React.FC<DeliveryLogsTableProps> = ({ rows }) => {
  if (rows.length === 0) {
    return (
      <p data-testid="delivery-logs-empty" style={{ color: 'var(--text-secondary)' }}>
        Bu filtreler için teslimat kaydı bulunamadı.
      </p>
    );
  }
  return (
    <table data-testid="delivery-logs-table" style={tableStyle}>
      <thead>
        <tr>
          <th>ID</th>
          <th>Intent</th>
          <th>Kanal</th>
          <th>Sağlayıcı</th>
          <th>Durum</th>
          <th>Hata Kategorisi</th>
          <th>Sağlayıcı Mesaj ID</th>
          <th>Aktivite</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.delivery_id}>
            <td>{row.delivery_id}</td>
            <td title={row.correlation_id ?? ''}>{row.intent_id}</td>
            <td>{row.channel}</td>
            <td>{row.provider}</td>
            <td>{row.status}</td>
            <td title={row.failure_summary_redacted}>{row.failure_category}</td>
            <td>{row.provider_msg_id_masked ?? '—'}</td>
            <td>{formatTimestamp(row.activity_at)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};

interface PaginationProps {
  page: number;
  totalPages: number;
  totalElements: number;
  onPageChange: (page: number) => void;
}

const Pagination: React.FC<PaginationProps> = ({
  page,
  totalPages,
  totalElements,
  onPageChange,
}) => {
  const safeTotalPages = Math.max(totalPages, 1);
  const onFirst = page === 0;
  const onLast = page >= safeTotalPages - 1;
  return (
    <nav
      aria-label="Teslimat log sayfaları"
      style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}
    >
      <button
        type="button"
        data-testid="delivery-logs-prev"
        disabled={onFirst}
        onClick={() => onPageChange(page - 1)}
      >
        ‹ Önceki
      </button>
      <span data-testid="delivery-logs-page-indicator">
        Sayfa {page + 1} / {safeTotalPages}
      </span>
      <button
        type="button"
        data-testid="delivery-logs-next"
        disabled={onLast}
        onClick={() => onPageChange(page + 1)}
      >
        Sonraki ›
      </button>
      <span style={{ marginLeft: 'auto', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
        {totalElements} kayıt
      </span>
    </nav>
  );
};

interface ErrorBannerProps {
  error: DeliveryLogApiError;
}

const ErrorBanner: React.FC<ErrorBannerProps> = ({ error }) => (
  <div role="alert" data-testid="delivery-logs-error" style={errorBoxStyle}>
    {translate(error)}
  </div>
);

function translate(error: DeliveryLogApiError): string {
  if (error.status === 401) {
    return 'Oturum doğrulanamadı. Yeniden giriş yapın.';
  }
  if (error.status === 403) {
    return 'Bu organizasyon için teslimat loglarını görüntüleme yetkiniz yok.';
  }
  if (error.status === 400) {
    return error.message
      ? `Filtreler geçersiz: ${error.message}`
      : 'Filtreler geçersiz. Tarih aralığını ve sayfa boyutunu kontrol edin.';
  }
  if (error.status === 404) {
    return 'Belirtilen niyet (intent) bu organizasyonda bulunamadı.';
  }
  return 'Teslimat logları alınamadı. Lütfen tekrar deneyin.';
}

function formatTimestamp(iso: string | null): string {
  if (!iso) return '—';
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return '—';
  return new Date(ms).toLocaleString('tr-TR');
}

const tableStyle: React.CSSProperties = {
  borderCollapse: 'collapse',
  width: '100%',
  fontSize: '0.85rem',
};

const errorBoxStyle: React.CSSProperties = {
  border: '1px solid var(--state-warning-border, #d97706)',
  background: 'var(--state-warning-surface, #fffbeb)',
  color: 'var(--state-warning-text, #92400e)',
  padding: '0.75rem 1rem',
  borderRadius: 4,
};

const inputStyle: React.CSSProperties = {
  border: '1px solid var(--border-subtle, #d4d4d8)',
  borderRadius: 4,
  padding: '0.25rem 0.5rem',
  fontSize: '0.85rem',
};

const labelStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  fontSize: '0.75rem',
  color: 'var(--text-primary, #444)',
};

function tabButtonStyle(active: boolean): React.CSSProperties {
  return {
    padding: '0.25rem 0.75rem',
    borderRadius: 4,
    border: '1px solid',
    borderColor: active ? 'var(--border-emphasis, #1f2937)' : 'var(--border-subtle, #d4d4d8)',
    background: active ? 'var(--surface-emphasis, #f3f4f6)' : 'var(--surface-default, #fff)',
    fontSize: '0.85rem',
    cursor: 'pointer',
  };
}

export default DeliveryLogsTab;
