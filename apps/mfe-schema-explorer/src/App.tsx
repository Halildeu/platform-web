import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useSchemaSnapshot } from './hooks/useSchemaData';
import { schemaApi, type SchemaScope, type SchemaSourceInfo, type SchemaListEntry } from './api/schemaApi';
import { Sidebar } from './components/Sidebar';
import { SchemaGraph } from './components/SchemaGraph';
import { TableDetail } from './components/TableDetail';
import { ColumnSearch } from './components/ColumnSearch';
import { ImpactAnalysis } from './components/ImpactAnalysis';
import { DeadTables } from './components/DeadTables';
import { HubTables } from './components/HubTables';
import { ExportPanel } from './components/ExportPanel';
import { FindPath } from './components/FindPath';
import { HealthScore } from './components/HealthScore';
import { DriftDashboard } from './components/DriftDashboard';
import { AiChat } from './components/AiChat';
import './styles/schema-explorer.css';

type ViewMode = 'domain' | 'neighborhood';
type PanelMode = 'graph' | 'search' | 'path' | 'hubs' | 'dead' | 'health' | 'impact' | 'drift' | 'chat' | 'export';

const App = () => {
  // gitops#3605: the service exposes several catalogs (Workcube MSSQL, IFS
  // ERP Oracle). `activeSource` undefined = the primary lane, so a deployment
  // with a single source looks exactly as it did before.
  const [activeSource, setActiveSource] = useState<string | undefined>(undefined);
  const [sources, setSources] = useState<SchemaSourceInfo[]>([]);
  const [activeSchema, setActiveSchema] = useState<string | undefined>(undefined);
  const [schemas, setSchemas] = useState<SchemaListEntry[]>([]);
  const scope = useMemo<SchemaScope>(() => ({ source: activeSource, schema: activeSchema }), [activeSource, activeSchema]);
  const { data: snapshot, isLoading, error } = useSchemaSnapshot(scope);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('domain');
  const [panelMode, setPanelMode] = useState<PanelMode>('graph');

  // Load the configured catalog sources once.
  useEffect(() => {
    schemaApi.getSources()
      .then(list => setSources(Array.isArray(list) ? list : []))
      .catch(() => setSources([]));
  }, []);

  // The schema list belongs to the selected source: IFS lists Oracle owners,
  // Workcube lists MSSQL schemas.
  // The header is usable before any snapshot arrives, so a slow reply for the
  // previous source must not land after the user has already switched: the
  // list is cleared on change and a stale reply is dropped (Codex 01a0884d).
  useEffect(() => {
    let current = true;
    setSchemas([]);
    schemaApi.getSchemas(activeSource)
      .then(list => { if (current) setSchemas(Array.isArray(list) ? list : []); })
      .catch(() => { if (current) setSchemas([]); });
    return () => { current = false; };
  }, [activeSource]);

  const handleTableSelect = useCallback((tableName: string) => {
    setSelectedTable(tableName);
    setViewMode('neighborhood');
    setPanelMode('graph');
  }, []);

  const handleSchemaChange = useCallback((schema: string) => {
    setActiveSchema(schema || undefined);
    setSelectedTable(null);
    setPanelMode('graph');
    setViewMode('domain');
  }, []);

  // Changing the source invalidates the schema: a Workcube schema name means
  // nothing to Oracle. Falling back to undefined lets the service pick that
  // source's own default (IFSAPP for IFS).
  const handleSourceChange = useCallback((source: string) => {
    setActiveSource(source || undefined);
    setActiveSchema(undefined);
    setSelectedTable(null);
    setPanelMode('graph');
    setViewMode('domain');
  }, []);

  // gitops#3605: the header (source + schema pickers) must not wait for the
  // snapshot. A cold Workcube snapshot takes ~100 s on a fresh pod; an IFS user
  // could not even reach the source picker meanwhile. Only the snapshot-backed
  // parts (stats, sidebar, panels, detail) render the loading / error state.
  const renderMainPanel = () => {
    if (isLoading) {
      return (
        <div className="se-loading" data-testid="se-loading">
          <div className="se-loading__spinner" />
          <p>Loading schema data...</p>
        </div>
      );
    }
    if (error || !snapshot) {
      return (
        <div className="se-error">
          <p>Failed to load schema data</p>
          <p className="se-error__detail">{(error as Error)?.message}</p>
        </div>
      );
    }
    switch (panelMode) {
      case 'search':
        return <ColumnSearch onTableSelect={handleTableSelect} scope={scope} />;
      case 'path':
        return <FindPath snapshot={snapshot} selectedTable={selectedTable} onTableSelect={handleTableSelect} scope={scope} />;
      case 'hubs':
        return <HubTables snapshot={snapshot} onTableSelect={handleTableSelect} />;
      case 'dead':
        return <DeadTables snapshot={snapshot} onTableSelect={handleTableSelect} />;
      case 'health':
        return <HealthScore onTableSelect={handleTableSelect} scope={scope} />;
      case 'impact':
        return selectedTable
          ? <ImpactAnalysis tableName={selectedTable} onTableSelect={handleTableSelect} scope={scope} />
          : <div className="se-search__empty">Select a table first to run impact analysis</div>;
      case 'drift':
        return <DriftDashboard onTableSelect={handleTableSelect} scope={scope} />;
      case 'chat':
        return <AiChat onTableSelect={handleTableSelect} />;
      case 'export':
        return <ExportPanel snapshot={snapshot} selectedTable={selectedTable} />;
      default:
        return (
          <SchemaGraph
            snapshot={snapshot}
            selectedTable={selectedTable}
            viewMode={viewMode}
            onTableSelect={handleTableSelect}
            onViewModeChange={setViewMode}
          />
        );
    }
  };

  return (
    <div className={`se-layout ${selectedTable ? '' : 'se-layout--no-detail'}`}>
      <header className="se-header">
        <h1 className="se-header__title">SchemaLens</h1>

        {/* Source selector — which catalog (Workcube MSSQL, IFS Oracle) */}
        {sources.length > 0 && (
          <select
            className="se-header__schema-select"
            aria-label="Data source"
            data-testid="se-source-select"
            value={activeSource || ''}
            onChange={e => handleSourceChange(e.target.value)}
          >
            {sources.map((s, i) => (
              <option key={s.source} value={i === 0 ? '' : s.source}>
                {s.source} · {s.engine}
              </option>
            ))}
          </select>
        )}

        {/* Schema selector */}
        <select
          className="se-header__schema-select"
          aria-label="Schema"
          data-testid="se-schema-select"
          value={activeSchema || ''}
          onChange={e => handleSchemaChange(e.target.value)}
        >
          <option value="">Default Schema</option>
          {schemas.map(s => (
            <option key={s.name} value={s.name}>
              {s.name} ({s.tableCount})
            </option>
          ))}
        </select>

        <div className="se-header__stats">
          {snapshot ? (
            <>
              <span><strong>{snapshot.metadata.tableCount.toLocaleString()}</strong> tables</span>
              <span><strong>{snapshot.metadata.columnCount.toLocaleString()}</strong> columns</span>
              <span><strong>{snapshot.metadata.relationshipCount.toLocaleString()}</strong> rels</span>
              <span><strong>{snapshot.metadata.domainCount}</strong> domains</span>
            </>
          ) : (
            <span className="se-header__stats-pending">{isLoading ? 'loading catalog…' : '—'}</span>
          )}
        </div>
        <nav className="se-header__nav">
          {([
            ['graph', 'ER Graph'],
            ['search', 'Columns'],
            ['path', 'Find Path'],
            ['hubs', 'Hubs'],
            ['dead', 'Dead Tables'],
            ['health', 'Health'],
            ['impact', 'Impact'],
            ['drift', 'Drift'],
            ['chat', 'AI Chat'],
            ['export', 'Export'],
          ] as [PanelMode, string][]).map(([mode, label]) => (
            <button
              key={mode}
              className={`se-header__nav-btn ${panelMode === mode ? 'se-header__nav-btn--active' : ''}`}
              onClick={() => setPanelMode(mode)}
            >
              {label}
            </button>
          ))}
        </nav>
      </header>

      {snapshot ? (
        <Sidebar
          snapshot={snapshot}
          selectedTable={selectedTable}
          onSelect={handleTableSelect}
        />
      ) : (
        <aside className="se-sidebar se-sidebar--pending" aria-busy={isLoading} />
      )}

      <main className="se-main">
        {renderMainPanel()}
      </main>

      {snapshot && selectedTable && (
        <TableDetail
          snapshot={snapshot}
          tableName={selectedTable}
          onClose={() => setSelectedTable(null)}
          onFkClick={handleTableSelect}
        />
      )}
    </div>
  );
};

/** Wrapper with own QueryClientProvider — needed when loaded as MF remote */
const AppWithProviders = () => {
  const shellQC = typeof window !== 'undefined'
    ? (window as unknown as Record<string, unknown>).__SHELL_QUERY_CLIENT__ as QueryClient | undefined
    : undefined;
  const localQC = useRef<QueryClient>();
  if (!shellQC && !localQC.current) {
    localQC.current = new QueryClient({
      defaultOptions: { queries: { staleTime: 5 * 60 * 1000, retry: 1 } },
    });
  }
  return (
    <QueryClientProvider client={shellQC ?? localQC.current!}>
      <App />
    </QueryClientProvider>
  );
};

export default AppWithProviders;
