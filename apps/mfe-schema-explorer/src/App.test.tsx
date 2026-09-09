import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const api = vi.hoisted(() => ({
  getSources: vi.fn(),
  getSchemas: vi.fn(),
  getSnapshot: vi.fn(),
}));
vi.mock('./api/schemaApi', () => ({ schemaApi: api, scopedUrl: (p: string) => p }));
// cytoscape needs a canvas; the graph is not what these tests are about.
vi.mock('./components/SchemaGraph', () => ({ SchemaGraph: () => <div data-testid="graph" /> }));

import App from './App';

const snapshotFor = (source?: string, schema?: string) => {
  const owner = schema ?? (source === 'ifs' ? 'IFSAPP' : 'workcube_mikrolink');
  return {
    version: '1.1',
    metadata: {
      dbType: source === 'ifs' ? 'oracle' : 'mssql', host: '', database: '', schema: owner,
      extractedAt: '', tableCount: 1, columnCount: 2, relationshipCount: 0, domainCount: 0,
    },
    tables: { T: { name: 'T', schema: owner, columns: [], rowCount: null, columnCount: 0 } },
    relationships: [],
    domains: {},
    analysis: { deadTables: [], hubTables: [] },
  };
};

/**
 * gitops#3605 — the header gains a source picker. Choosing IFS must reload the
 * schema list from that source and rebuild the snapshot for it with the schema
 * reset, so the service resolves IFS's own default owner (IFSAPP) rather than
 * carrying a Workcube schema name across.
 */
describe('schema explorer source picker', () => {
  beforeEach(() => {
    api.getSources.mockReset().mockResolvedValue([
      { source: 'workcube', engine: 'mssql' },
      { source: 'ifs', engine: 'oracle' },
    ]);
    api.getSchemas.mockReset().mockImplementation(async (source?: string) =>
      source === 'ifs'
        ? [{ name: 'IFSAPP', tableCount: 10886 }]
        : [{ name: 'workcube_mikrolink', tableCount: 1565 }]);
    api.getSnapshot.mockReset().mockImplementation(
      async (scope?: { source?: string; schema?: string }) => snapshotFor(scope?.source, scope?.schema));
  });

  it('starts on the primary lane and lists its schemas', async () => {
    render(<App />);

    await screen.findByTestId('se-source-select');
    expect(await screen.findByText('workcube_mikrolink (1565)')).toBeInTheDocument();
    expect(api.getSchemas).toHaveBeenCalledWith(undefined);
    expect(api.getSnapshot).toHaveBeenCalledWith({ source: undefined, schema: undefined });
  });

  it('switching to ifs reloads the schema list and the snapshot for that source', async () => {
    render(<App />);
    const picker = await screen.findByTestId('se-source-select');

    fireEvent.change(picker, { target: { value: 'ifs' } });

    expect(await screen.findByText('IFSAPP (10886)')).toBeInTheDocument();
    await waitFor(() => expect(api.getSnapshot).toHaveBeenCalledWith({ source: 'ifs', schema: undefined }));
    expect(api.getSchemas).toHaveBeenLastCalledWith('ifs');
  });

  it('hides the picker when the service exposes no sources', async () => {
    api.getSources.mockResolvedValue([]);
    render(<App />);

    expect(await screen.findByText('workcube_mikrolink (1565)')).toBeInTheDocument();
    expect(screen.queryByTestId('se-source-select')).toBeNull();
  });
});
