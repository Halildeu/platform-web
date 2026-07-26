import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  STANDALONE_APP_TARGETS,
  navigateIfStandaloneApp,
  resolveStandaloneAppTarget,
} from './standalone-apps';

const withAssignSpy = (run: (assign: ReturnType<typeof vi.fn>) => void) => {
  const assign = vi.fn();
  const original = window.location;
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...original, assign },
  });
  try {
    run(assign);
  } finally {
    Object.defineProperty(window, 'location', { configurable: true, value: original });
  }
};

describe('standalone (edge-served) apps', () => {
  afterEach(() => vi.restoreAllMocks());

  it('maps the shell path to the edge target with a trailing slash', () => {
    expect(resolveStandaloneAppTarget('/ethic')).toBe('/ethic/');
    expect(STANDALONE_APP_TARGETS['/ethic']).toBe('/ethic/');
  });

  it('ignores query and hash when matching', () => {
    expect(resolveStandaloneAppTarget('/ethic?tab=cases')).toBe('/ethic/');
    expect(resolveStandaloneAppTarget('/ethic#latest')).toBe('/ethic/');
  });

  it('leaves ordinary shell routes to the SPA router', () => {
    expect(resolveStandaloneAppTarget('/home')).toBeUndefined();
    expect(resolveStandaloneAppTarget('/admin/meetings')).toBeUndefined();
    expect(resolveStandaloneAppTarget(undefined)).toBeUndefined();
    // Alt yol kabuk route'u olarak kalır: eşleme tam yol üzerinden yapılır.
    expect(resolveStandaloneAppTarget('/ethical-review')).toBeUndefined();
  });

  it('performs a full-page navigation and reports that it handled the path', () => {
    withAssignSpy((assign) => {
      expect(navigateIfStandaloneApp('/ethic')).toBe(true);
      expect(assign).toHaveBeenCalledWith('/ethic/');
    });
  });

  it('does not touch the location for shell routes', () => {
    withAssignSpy((assign) => {
      expect(navigateIfStandaloneApp('/home')).toBe(false);
      expect(assign).not.toHaveBeenCalled();
    });
  });
});
