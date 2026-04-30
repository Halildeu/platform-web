// @vitest-environment jsdom
//
// Codex 019dde93 iter-48 — drawer-target guard contract.
//
// Locks the rules that the cell/row double-click handler in GridShell
// uses to decide whether opening the entity drawer is appropriate.
// Each case targets a specific failure mode the guard must defend
// against. Pure-function tests; no ag-grid imports.

import { describe, expect, it } from 'vitest';
import { isDrawerOpenSafeTarget } from '../drawer-target';

const dataCell = (extra: Record<string, unknown> = {}) => ({
  column: { getColId: () => 'name' },
  colDef: {},
  node: {},
  event: { target: document.createElement('div') },
  ...extra,
});

describe('isDrawerOpenSafeTarget', () => {
  it('1. allows a normal data cell', () => {
    expect(isDrawerOpenSafeTarget(dataCell())).toBe(true);
  });

  it('2. blocks ag-grid selection column', () => {
    expect(
      isDrawerOpenSafeTarget(dataCell({ column: { getColId: () => 'ag-Grid-SelectionColumn' } })),
    ).toBe(false);
  });

  it('3. blocks canonical action columns by colId', () => {
    for (const colId of ['actions', 'userActions', 'roleActions', 'rowActions']) {
      expect(isDrawerOpenSafeTarget(dataCell({ column: { getColId: () => colId } }))).toBe(false);
    }
  });

  it('4. blocks columns marked suppressDrawerOpenOnDoubleClick', () => {
    expect(
      isDrawerOpenSafeTarget(dataCell({ colDef: { suppressDrawerOpenOnDoubleClick: true } })),
    ).toBe(false);
  });

  it('5. blocks group rows', () => {
    expect(isDrawerOpenSafeTarget(dataCell({ node: { group: true } }))).toBe(false);
  });

  it('6. blocks footer rows', () => {
    expect(isDrawerOpenSafeTarget(dataCell({ node: { footer: true } }))).toBe(false);
  });

  it('7. blocks pinned rows', () => {
    expect(isDrawerOpenSafeTarget(dataCell({ node: { rowPinned: 'top' } }))).toBe(false);
  });

  it('8. blocks checkbox-selection cells', () => {
    expect(isDrawerOpenSafeTarget(dataCell({ colDef: { checkboxSelection: true } }))).toBe(false);
  });

  it('9. blocks editable cells', () => {
    expect(isDrawerOpenSafeTarget(dataCell({ colDef: { editable: true } }))).toBe(false);
  });

  it('10. blocks interactive DOM targets — button', () => {
    const btn = document.createElement('button');
    expect(isDrawerOpenSafeTarget(dataCell({ event: { target: btn } }))).toBe(false);
  });

  it('11. blocks interactive DOM targets — anchor', () => {
    const a = document.createElement('a');
    expect(isDrawerOpenSafeTarget(dataCell({ event: { target: a } }))).toBe(false);
  });

  it('12. blocks interactive DOM targets — input/select/textarea', () => {
    for (const tag of ['input', 'select', 'textarea']) {
      const el = document.createElement(tag);
      expect(isDrawerOpenSafeTarget(dataCell({ event: { target: el } }))).toBe(false);
    }
  });

  it('13. blocks interactive DOM targets — [role="button"], [role="menuitem"]', () => {
    for (const role of ['button', 'menuitem', 'link', 'checkbox']) {
      const el = document.createElement('div');
      el.setAttribute('role', role);
      expect(isDrawerOpenSafeTarget(dataCell({ event: { target: el } }))).toBe(false);
    }
  });

  it('14. blocks targets nested INSIDE an interactive element (closest walk)', () => {
    const btn = document.createElement('button');
    const span = document.createElement('span');
    btn.appendChild(span);
    expect(isDrawerOpenSafeTarget(dataCell({ event: { target: span } }))).toBe(false);
  });

  it('15. blocks contenteditable targets', () => {
    const el = document.createElement('div');
    el.setAttribute('contenteditable', 'true');
    expect(isDrawerOpenSafeTarget(dataCell({ event: { target: el } }))).toBe(false);
  });

  it('16. allows plain span/div data target', () => {
    const span = document.createElement('span');
    span.textContent = 'D35 Admin Persona';
    expect(isDrawerOpenSafeTarget(dataCell({ event: { target: span } }))).toBe(true);
  });

  it('17. handles missing event/column/colDef/node fields gracefully', () => {
    expect(isDrawerOpenSafeTarget({})).toBe(true);
    expect(isDrawerOpenSafeTarget({ event: null })).toBe(true);
    expect(isDrawerOpenSafeTarget({ column: null })).toBe(true);
    expect(isDrawerOpenSafeTarget({ colDef: null })).toBe(true);
    expect(isDrawerOpenSafeTarget({ node: null })).toBe(true);
  });
});
