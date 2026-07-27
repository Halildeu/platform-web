import { describe, expect, it } from 'vitest';
import { readMetadataFilterUrlValue } from '../create-dynamic-module';
import type { FilterDefinition } from '../types';

describe('dynamic report metadata filter deep links', () => {
  it('rehydrates both date-range bounds from explicit URL parameters', () => {
    const definition: FilterDefinition = {
      key: 'dateRange',
      kind: 'date-range',
      urlParam: 'date',
    };
    const search = new URLSearchParams(
      'dateFrom=2026-02-01&dateTo=2026-07-27',
    );

    expect(readMetadataFilterUrlValue(definition, search)).toEqual({
      from: '2026-02-01',
      to: '2026-07-27',
    });
  });

  it('preserves ordinary enum deep-link values', () => {
    const definition: FilterDefinition = {
      key: 'projectId',
      kind: 'enum-select',
      urlParam: 'projectId',
    };

    expect(
      readMetadataFilterUrlValue(
        definition,
        new URLSearchParams('projectId=91'),
      ),
    ).toBe('91');
  });
});
