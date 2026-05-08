// Migrated from `node:test` to vitest (Wave 1 housekeeping).
// The previous Node test runner imports failed at vitest collect
// time because Vite cannot bundle Node built-ins from the test
// environment, so this suite was effectively dead code in CI even
// though the file shape suggested it was running.
import { describe, test, expect } from 'vitest';
import type { GridVariant } from '@mfe/shared-types';
import { toggleVariantDefault } from '../toggle-variant-default';

const buildVariant = (overrides: Partial<GridVariant>): GridVariant => ({
  id: 'variant-1',
  gridId: 'grid',
  name: 'Test',
  isDefault: false,
  isGlobal: false,
  isGlobalDefault: false,
  isUserDefault: false,
  isUserSelected: false,
  state: { columnState: [] },
  schemaVersion: 1,
  isCompatible: true,
  sortOrder: 0,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
});

describe('toggleVariantDefault', () => {
  test('kişisel varyant için updateVariant çağırır', async () => {
    const variant = buildVariant({ isGlobal: false });
    const calls: string[] = [];

    const updated = await toggleVariantDefault(variant, true, {
      updateVariant: async (payload) => {
        calls.push(`updateVariant:${JSON.stringify(payload)}`);
        return buildVariant({ ...variant, ...payload, isDefault: payload.isDefault ?? false });
      },
      updatePreference: async (payload) => {
        calls.push(`updatePreference:${JSON.stringify(payload)}`);
        return buildVariant({ ...variant, isUserDefault: Boolean(payload.isDefault) });
      },
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatch(/^updateVariant:/);
    expect(updated.isDefault).toBe(true);
  });

  test('global varyant için preference servisini çağırır', async () => {
    const variant = buildVariant({ isGlobal: true });
    const calls: string[] = [];

    const updated = await toggleVariantDefault(variant, true, {
      updateVariant: async (payload) => {
        calls.push(`updateVariant:${JSON.stringify(payload)}`);
        return buildVariant({ ...variant, ...payload, isDefault: payload.isDefault ?? false });
      },
      updatePreference: async (payload) => {
        calls.push(`updatePreference:${JSON.stringify(payload)}`);
        return buildVariant({ ...variant, isUserDefault: Boolean(payload.isDefault) });
      },
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatch(/^updatePreference:/);
    expect(updated.isUserDefault).toBe(true);
  });

  test('kişisel varyantta updateVariant hatasını yukarı fırlatır', async () => {
    const variant = buildVariant({ isGlobal: false });
    const error = new Error('update failed');

    await expect(
      toggleVariantDefault(variant, true, {
        updateVariant: async () => {
          throw error;
        },
        updatePreference: async () => buildVariant(variant),
      }),
    ).rejects.toThrow(error);
  });
});
