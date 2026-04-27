/**
 * Build the scopeRef JSON array string per ADR-0008 explicit-scope encoder
 * contract: backend expects a JSON string holding a single-element array
 * (e.g. '["1001"]'). The encoder hashes scopeKind + scopeRef into the
 * OpenFGA object id, so the encoding must match the backend exactly —
 * keep the identifiers as strings (not numbers) and avoid extra whitespace.
 */
export const buildScopeRef = (refs: string[]): string => JSON.stringify(refs);

export const parseScopeRef = (raw: string): string[] => {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map((value) => String(value)) : [];
  } catch {
    return [];
  }
};
