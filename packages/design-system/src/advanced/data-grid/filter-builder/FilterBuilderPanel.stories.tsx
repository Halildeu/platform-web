import React, { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { expect, within, userEvent } from 'storybook/test';
import { FilterBuilderPanel, FilterBuilderButton } from './FilterBuilderPanel';
import type { ColDef, GridApi } from 'ag-grid-community';

const mockColumnDefs: ColDef[] = [
  { field: 'name', headerName: 'Ad', filter: 'agTextColumnFilter' },
  {
    field: 'department',
    headerName: 'Departman',
    filter: 'agSetColumnFilter',
    filterParams: { values: ['HR', 'Finans', 'IT', 'Operasyon'] },
  },
  { field: 'salary', headerName: 'Maas', filter: 'agNumberColumnFilter' },
  { field: 'startDate', headerName: 'Baslangic Tarihi', filter: 'agDateColumnFilter' },
];

interface MockGridApiOptions {
  initialModel?: Record<string, unknown>;
  rowCount?: number;
}

const createMockGridApi = (opts: MockGridApiOptions = {}): GridApi => {
  let model: Record<string, unknown> = opts.initialModel ?? {};
  return {
    getFilterModel: () => model,
    setFilterModel: (next: Record<string, unknown> | null) => {
      model = next ?? {};
    },
    onFilterChanged: () => {},
    getDisplayedRowCount: () => opts.rowCount ?? 42,
    addEventListener: () => {},
    removeEventListener: () => {},
  } as unknown as GridApi;
};

const meta: Meta<typeof FilterBuilderPanel> = {
  title: 'Advanced/DataGrid/FilterBuilder/FilterBuilderPanel',
  component: FilterBuilderPanel,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
  argTypes: {
    open: { control: 'boolean', description: 'Panel visibility' },
    columnDefs: { control: false, description: 'AG Grid column definitions used to build filters' },
    onClose: {
      action: 'close',
      description: 'Called when overlay is clicked or close button is pressed',
    },
  },
  decorators: [
    (Story) => (
      <div style={{ minHeight: 480, position: 'relative' }}>
        <Story />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof FilterBuilderPanel>;

export const Default: Story = {
  render: () => {
    const [open, setOpen] = useState(true);
    const gridApi = createMockGridApi();
    return (
      <div>
        <div style={{ padding: 16 }}>
          <button
            type="button"
            onClick={() => setOpen(true)}
            style={{ padding: '6px 12px', fontSize: 13 }}
          >
            Filtre Olusturucuyu Ac
          </button>
        </div>
        <FilterBuilderPanel
          gridApi={gridApi}
          columnDefs={mockColumnDefs}
          open={open}
          onClose={() => setOpen(false)}
        />
      </div>
    );
  },
};

export const Closed: Story = {
  render: () => {
    const [open, setOpen] = useState(false);
    const gridApi = createMockGridApi();
    return (
      <div style={{ padding: 16 }}>
        <button
          type="button"
          onClick={() => setOpen(true)}
          style={{ padding: '6px 12px', fontSize: 13 }}
        >
          Aç
        </button>
        <FilterBuilderPanel
          gridApi={gridApi}
          columnDefs={mockColumnDefs}
          open={open}
          onClose={() => setOpen(false)}
        />
      </div>
    );
  },
};

export const ToolbarButton: Story = {
  render: () => {
    const gridApi = createMockGridApi();
    return (
      <div style={{ padding: 16 }}>
        <FilterBuilderButton gridApi={gridApi} columnDefs={mockColumnDefs} />
      </div>
    );
  },
};

export const WithExistingFilters: Story = {
  render: () => {
    const [open, setOpen] = useState(true);
    const gridApi = createMockGridApi({
      initialModel: {
        name: { filterType: 'text', type: 'contains', filter: 'Acme' },
        salary: { filterType: 'number', type: 'greaterThan', filter: 50000 },
      },
      rowCount: 137,
    });
    return (
      <FilterBuilderPanel
        gridApi={gridApi}
        columnDefs={mockColumnDefs}
        open={open}
        onClose={() => setOpen(false)}
      />
    );
  },
};

export const NoColumns: Story = {
  render: () => {
    const [open, setOpen] = useState(true);
    const gridApi = createMockGridApi();
    return (
      <FilterBuilderPanel
        gridApi={gridApi}
        columnDefs={[]}
        open={open}
        onClose={() => setOpen(false)}
      />
    );
  },
};

export const Interactive: Story = {
  render: function InteractiveStory() {
    const [open, setOpen] = useState(true);
    const gridApi = createMockGridApi();
    return (
      <FilterBuilderPanel
        gridApi={gridApi}
        columnDefs={mockColumnDefs}
        open={open}
        onClose={() => setOpen(false)}
      />
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // Header should render with "Filtre Oluşturucu" title
    const header = await canvas.findByText(/Filtre Oluşturucu/);
    await expect(header).toBeInTheDocument();
    // "Uygula" (Apply) button is rendered but disabled because tree is empty
    const apply = canvas.getByRole('button', { name: /Uygula/ });
    await expect(apply).toBeDisabled();
    // Adding a rule via "Kural" button enables Apply
    const addRule = canvas.getByRole('button', { name: /Kural/ });
    await userEvent.click(addRule);
    // After adding a rule, Apply becomes enabled (not disabled)
    await expect(apply).not.toBeDisabled();
  },
};
