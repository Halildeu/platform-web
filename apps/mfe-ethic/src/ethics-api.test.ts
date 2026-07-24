import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '@mfe/shared-http';
import { downloadCaseEvidence, listCaseEvidence } from './ethics-api';

vi.mock('@mfe/shared-http', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
  },
}));

const availableEvidence = {
  attachmentId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  state: 'AVAILABLE',
  mediaType: 'image/png',
  size: 2048,
  createdAt: '2026-07-18T12:04:00Z',
  derivativeAvailable: true,
};

describe('Etik Speak manager evidence API', () => {
  beforeEach(() => {
    vi.mocked(api.get).mockReset();
  });

  it('validates the staff-safe evidence projection', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ data: [availableEvidence] });

    await expect(listCaseEvidence('case / 1')).resolves.toEqual([availableEvidence]);
    expect(api.get).toHaveBeenCalledWith('/v1/ethics/cases/case%20%2F%201/attachments');
  });

  it('fails closed when availability and state disagree', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({
      data: [{ ...availableEvidence, state: 'SCANNING', derivativeAvailable: true }],
    });

    await expect(listCaseEvidence('case-1')).rejects.toThrow('sözleşmesi geçersiz');
  });

  it('requests only the derivative endpoint as binary', async () => {
    const body = new Uint8Array([1, 2, 3]).buffer;
    vi.mocked(api.get).mockResolvedValueOnce({ data: body });

    await expect(downloadCaseEvidence('case / 1', 'attachment / 1')).resolves.toBe(body);
    expect(api.get).toHaveBeenCalledWith(
      '/v1/ethics/cases/case%20%2F%201/attachments/attachment%20%2F%201/derivative',
      { responseType: 'arraybuffer' },
    );
    expect(vi.mocked(api.get).mock.calls[0]?.[0]).not.toContain('original');
  });
});
