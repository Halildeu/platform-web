import React, { useMemo, useState } from 'react';
import { AuditEventFeed } from './AuditEventFeed';
import { DeliveryLogsTab } from './DeliveryLogsTab';

type AuditTab = 'audit-events' | 'delivery-logs';

const initialTabFromLocation = (): AuditTab => {
  if (typeof window === 'undefined') return 'audit-events';
  const params = new URLSearchParams(window.location.search);
  // intentId implies the operator deeplinked into a delivery investigation,
  // so we land on the Delivery Logs tab automatically.
  if (params.get('intentId')) return 'delivery-logs';
  return 'audit-events';
};

class AuditAppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[AuditApp] Unhandled error yakalandı', error, info.componentStack);
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 24 }}>
          <h2>Denetim modülü yüklenirken beklenmeyen bir hata oluştu.</h2>
          <p>Lütfen sayfayı yenileyin. Sorun devam ederse sistem yöneticinizle iletişime geçin.</p>
        </div>
      );
    }
    return this.props.children;
  }
}

export const AuditApp: React.FC = () => {
  const initialTab = useMemo(initialTabFromLocation, []);
  const [tab, setTab] = useState<AuditTab>(initialTab);

  return (
    <AuditAppErrorBoundary>
      <main data-testid="audit-events-page" style={{ padding: '1.5rem' }}>
        <header style={{ marginBottom: '1rem' }}>
          <h1>Audit Event Feed</h1>
          <p>Monitor system-wide audit events, inspect diffs and export reports.</p>
          <div
            role="tablist"
            aria-label="Denetim sekmeleri"
            style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}
          >
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'audit-events'}
              data-testid="audit-tab-events"
              onClick={() => setTab('audit-events')}
              style={tabButtonStyle(tab === 'audit-events')}
            >
              Olay Akışı
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'delivery-logs'}
              data-testid="audit-tab-delivery-logs"
              onClick={() => setTab('delivery-logs')}
              style={tabButtonStyle(tab === 'delivery-logs')}
            >
              Teslimat Logları
            </button>
          </div>
        </header>
        {tab === 'audit-events' ? <AuditEventFeed /> : <DeliveryLogsTab />}
      </main>
    </AuditAppErrorBoundary>
  );
};

function tabButtonStyle(active: boolean): React.CSSProperties {
  return {
    padding: '0.4rem 0.9rem',
    borderRadius: 4,
    border: '1px solid',
    borderColor: active ? 'var(--border-emphasis, #1f2937)' : 'var(--border-subtle, #d4d4d8)',
    background: active ? 'var(--surface-emphasis, #f3f4f6)' : 'var(--surface-default, #fff)',
    fontSize: '0.9rem',
    cursor: 'pointer',
  };
}

export default AuditApp;
