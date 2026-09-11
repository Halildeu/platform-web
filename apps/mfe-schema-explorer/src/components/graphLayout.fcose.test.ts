import { describe, expect, it } from 'vitest';
import cytoscape from 'cytoscape';
import fcose from 'cytoscape-fcose';
import { countOverlaps, initialPositions, layoutOptions, resolveOverlaps } from './graphLayout';

cytoscape.use(fcose);

/**
 * The option sets must run on the real fcose package (gitops#3650, Codex 01a08f35):
 * quality 'draft' + randomize:false made fcose 2.2 throw on the domain map, which the
 * component silently turned into the grid fallback.
 */
describe('graphLayout on the installed fcose', () => {
  const build = (withDomain: boolean) => {
    const cy = cytoscape({ headless: true, styleEnabled: false });
    if (withDomain) cy.add({ data: { id: 'ACCRUL', type: 'domain', label: 'ACCRUL' } });
    const parent = withDomain ? { parent: 'ACCRUL' } : {};
    cy.add([
      { data: { id: 'VOUCHER_ROW', type: 'table', label: 'VOUCHER_ROW', ...parent } },
      { data: { id: 'VOUCHER', type: 'table', label: 'VOUCHER', ...parent } },
      { data: { id: 'ACCOUNT', type: 'table', label: 'ACCOUNT', ...parent } },
      { data: { id: 'e1', source: 'VOUCHER_ROW', target: 'VOUCHER' } },
      { data: { id: 'e2', source: 'VOUCHER_ROW', target: 'ACCOUNT' } },
    ]);
    return cy;
  };

  it('runs the domain-map options on a compound graph without throwing', () => {
    const cy = build(true);
    expect(() => cy.layout({ ...layoutOptions('domain', null), animate: false } as any).run()).not.toThrow();
    for (const n of cy.nodes('[type="table"]')) {
      expect(Number.isFinite(n.position('x')) && Number.isFinite(n.position('y'))).toBe(true);
    }
  });

  it('runs the neighbourhood options from the deterministic start, keeps the centre pinned and ends separated', () => {
    const cy = build(false);
    const tables = cy.nodes('[type="table"]');
    const starts = initialPositions(tables.map(n => n.id()), 'VOUCHER_ROW');
    tables.forEach(n => { n.position(starts.get(n.id())!); });
    expect(() => cy.layout({ ...layoutOptions('neighborhood', 'VOUCHER_ROW'), animate: false } as any).run()).not.toThrow();
    expect(cy.getElementById('VOUCHER_ROW').position()).toEqual({ x: 0, y: 0 });
    const boxes = tables.map(n => ({ id: n.id(), ...n.boundingBox({ includeLabels: false }) }));
    const shifts = resolveOverlaps(boxes, 'VOUCHER_ROW');
    tables.forEach(n => { const s = shifts.get(n.id())!; if (s.x || s.y) n.shift(s); });
    expect(countOverlaps(tables.map(n => n.boundingBox({ includeLabels: false })))).toBe(0);
    expect(cy.getElementById('VOUCHER_ROW').position()).toEqual({ x: 0, y: 0 });
  });
});
