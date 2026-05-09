// @vitest-environment jsdom
/**
 * PR-FE-12 absorb iter-2 (Codex thread 019e0df3 #4): focused tests
 * for HierarchicalScopePicker. Covers:
 *
 *   1. Empty state — no companies + no orphans + no unknowns →
 *      "boş" mesajı render.
 *   2. Company grouping — selected company with children renders
 *      tree with sub-headers and child × buttons.
 *   3. Orphan bucket — child whose parentCompanyId is null OR not
 *      in the renderable companies surfaces as orphan.
 *   4. Unknown company placeholder — company id assigned but
 *      missing from master-data → placeholder node with × button.
 *   5. Per-node remove fires the matching setter (auto-save invariant
 *      preserved at the integration level: setSelected* → state
 *      observer → POST in UserDetailDrawer).
 *   6. Per-company remove does NOT cascade — children remain
 *      assigned (orphan bucket catches them).
 */

import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import HierarchicalScopePicker from '../HierarchicalScopePicker';
import type { ScopeEntity } from '../HierarchicalScopePicker';

const t = (key: string, params?: Record<string, unknown>): string => {
  if (!params) return key;
  return `${key}|${Object.entries(params)
    .map(([k, v]) => `${k}=${v}`)
    .join(',')}`;
};

const baseProps = {
  companies: [] as ScopeEntity[],
  projects: [] as ScopeEntity[],
  warehouses: [] as ScopeEntity[],
  branches: [] as ScopeEntity[],
  selectedCompanyIds: [] as number[],
  selectedProjectIds: [] as number[],
  selectedWarehouseIds: [] as number[],
  selectedBranchIds: [] as number[],
  setSelectedCompanyIds: vi.fn(),
  setSelectedProjectIds: vi.fn(),
  setSelectedWarehouseIds: vi.fn(),
  setSelectedBranchIds: vi.fn(),
  setDirty: vi.fn(),
  canEdit: true,
  t,
};

describe('HierarchicalScopePicker', () => {
  it('renders empty state when nothing assigned and no orphans', () => {
    render(<HierarchicalScopePicker {...baseProps} />);
    expect(screen.getByTestId('hier-empty')).toBeTruthy();
    expect(screen.queryByTestId('hier-scope-tree')).toBeNull();
  });

  it('groups assigned children under their parent company', () => {
    const companies: ScopeEntity[] = [{ id: 7, code: 'MB', name: 'Mikrolink Bilişim' }];
    const projects: ScopeEntity[] = [
      { id: 42, code: 'P-002', name: 'Mikrolink ERP', parentCompanyId: 7 },
      { id: 43, code: 'P-003', name: 'Mikrolink Cloud', parentCompanyId: 7 },
    ];

    render(
      <HierarchicalScopePicker
        {...baseProps}
        companies={companies}
        projects={projects}
        selectedCompanyIds={[7]}
        selectedProjectIds={[42, 43]}
      />,
    );

    expect(screen.getByTestId('hier-company-7')).toBeTruthy();
    expect(screen.getByTestId('hier-project-42')).toBeTruthy();
    expect(screen.getByTestId('hier-project-43')).toBeTruthy();
    // No orphan section because both children have a renderable parent.
    expect(screen.queryByTestId('hier-orphan-section')).toBeNull();
  });

  it('moves children with no parent or non-renderable parent into the orphan bucket', () => {
    // Company 7 is selected AND renderable; Company 99 is selected
    // but missing from master-data. Project 42 belongs to 7 (good),
    // project 50 to 99 (orphan: parent not renderable), project
    // 51 has parentCompanyId=null (orphan: no parent at all).
    const companies: ScopeEntity[] = [{ id: 7, code: 'MB', name: 'Mikrolink' }];
    const projects: ScopeEntity[] = [
      { id: 42, name: 'P-Good', parentCompanyId: 7 },
      { id: 50, name: 'P-OrphanParentMissing', parentCompanyId: 99 },
      { id: 51, name: 'P-OrphanNoParent', parentCompanyId: null },
    ];

    render(
      <HierarchicalScopePicker
        {...baseProps}
        companies={companies}
        projects={projects}
        selectedCompanyIds={[7, 99]}
        selectedProjectIds={[42, 50, 51]}
      />,
    );

    // Project 42 under company 7
    expect(screen.getByTestId('hier-company-7')).toBeTruthy();
    expect(screen.getByTestId('hier-project-42')).toBeTruthy();

    // Orphans
    expect(screen.getByTestId('hier-orphan-section')).toBeTruthy();
    expect(screen.getByTestId('hier-project-50')).toBeTruthy();
    expect(screen.getByTestId('hier-project-51')).toBeTruthy();

    // Unknown placeholder for company 99
    expect(screen.getByTestId('hier-unknown-companies')).toBeTruthy();
    expect(screen.getByTestId('hier-unknown-company-99')).toBeTruthy();
  });

  it('clicking a child × calls the matching setter (auto-save trigger)', () => {
    const setSelectedProjectIds = vi.fn();
    const setDirty = vi.fn();
    const companies: ScopeEntity[] = [{ id: 7, name: 'MB' }];
    const projects: ScopeEntity[] = [{ id: 42, name: 'P-1', parentCompanyId: 7 }];
    render(
      <HierarchicalScopePicker
        {...baseProps}
        companies={companies}
        projects={projects}
        selectedCompanyIds={[7]}
        selectedProjectIds={[42]}
        setSelectedProjectIds={setSelectedProjectIds}
        setDirty={setDirty}
      />,
    );
    fireEvent.click(screen.getByTestId('hier-project-remove-42'));
    expect(setSelectedProjectIds).toHaveBeenCalledTimes(1);
    expect(setDirty).toHaveBeenCalledWith(true);
    // Setter receives a function — apply it to verify the new state is
    // [42] minus the removed id, i.e. empty.
    const fn = setSelectedProjectIds.mock.calls[0][0] as (prev: number[]) => number[];
    expect(fn([42])).toEqual([]);
  });

  it('clicking a company × removes ONLY the company; children become orphans', () => {
    const setSelectedCompanyIds = vi.fn();
    const setSelectedProjectIds = vi.fn();
    const companies: ScopeEntity[] = [{ id: 7, name: 'MB' }];
    const projects: ScopeEntity[] = [{ id: 42, name: 'P-1', parentCompanyId: 7 }];
    render(
      <HierarchicalScopePicker
        {...baseProps}
        companies={companies}
        projects={projects}
        selectedCompanyIds={[7]}
        selectedProjectIds={[42]}
        setSelectedCompanyIds={setSelectedCompanyIds}
        setSelectedProjectIds={setSelectedProjectIds}
      />,
    );
    fireEvent.click(screen.getByTestId('hier-company-remove-7'));

    expect(setSelectedCompanyIds).toHaveBeenCalledTimes(1);
    // No-cascade decision: project setter MUST NOT be called as a
    // side effect of company removal.
    expect(setSelectedProjectIds).not.toHaveBeenCalled();
  });

  it('hides remove buttons when canEdit is false', () => {
    const companies: ScopeEntity[] = [{ id: 7, name: 'MB' }];
    const projects: ScopeEntity[] = [{ id: 42, name: 'P-1', parentCompanyId: 7 }];
    render(
      <HierarchicalScopePicker
        {...baseProps}
        canEdit={false}
        companies={companies}
        projects={projects}
        selectedCompanyIds={[7]}
        selectedProjectIds={[42]}
      />,
    );
    expect(screen.queryByTestId('hier-company-remove-7')).toBeNull();
    expect(screen.queryByTestId('hier-project-remove-42')).toBeNull();
    // Nodes still visible (read-only):
    expect(screen.getByTestId('hier-company-7')).toBeTruthy();
    expect(screen.getByTestId('hier-project-42')).toBeTruthy();
  });

  it('PR-FE-12 absorb iter-2 #1: children of master-data-missing parent surface in orphan bucket', () => {
    // Pre-fix: child whose parentCompanyId === selected-but-missing
    // company would have been hidden (parent set "had" the id, child
    // not orphan, but no parent node existed to render it).
    const projects: ScopeEntity[] = [{ id: 50, name: 'Hidden Pre-Fix', parentCompanyId: 99 }];
    render(
      <HierarchicalScopePicker
        {...baseProps}
        companies={[]} // master-data fetch returned empty (transient)
        projects={projects}
        selectedCompanyIds={[99]}
        selectedProjectIds={[50]}
      />,
    );
    // The project must still be visible (orphan bucket).
    expect(screen.getByTestId('hier-orphan-section')).toBeTruthy();
    expect(screen.getByTestId('hier-project-50')).toBeTruthy();
    // The company must surface as unknown placeholder (not silently
    // dropped).
    expect(screen.getByTestId('hier-unknown-company-99')).toBeTruthy();
  });
});
