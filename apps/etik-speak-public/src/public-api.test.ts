import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  declareEvidence,
  uploadEvidence,
  type EvidenceDeclaration,
  type EvidenceStatus,
} from './public-api';

const file = () => {
  const value = new File(['sentetik kanıt'], 'yerel-ad-sunucuya-gitmemeli.txt', {
    type: 'text/plain',
    lastModified: 1,
  });
  Object.defineProperty(value, 'arrayBuffer', {
    configurable: true,
    value: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3]).buffer),
  });
  return value;
};

const declaration: EvidenceDeclaration = {
  attachmentId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  state: 'UPLOADING',
  uploadPath: '/api/v1/public/ethics/evidence/uploads',
  uploadCapability: 'capability-with-more-than-thirty-two-characters',
  uploadExpiresAt: '2026-07-18T12:10:00Z',
  idempotentReplay: false,
};

const quarantined: EvidenceStatus = {
  attachmentId: declaration.attachmentId,
  state: 'QUARANTINED',
  mediaType: 'text/plain',
  size: 15,
  failureCode: null,
  createdAt: '2026-07-18T12:00:00Z',
  updatedAt: '2026-07-18T12:01:00Z',
};

describe('Etik Speak public evidence boundary', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('declares only allowlisted metadata and never sends the local filename', async () => {
    vi.stubGlobal('crypto', {
      subtle: {
        digest: vi.fn().mockResolvedValue(new Uint8Array(32).fill(0xab).buffer),
      },
    });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(declaration), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const evidence = file();

    await declareEvidence(evidence, 'stable-operation-key');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/v1/public/ethics/mailbox/attachments');
    expect(init.credentials).toBe('include');
    expect(init.referrerPolicy).toBe('no-referrer');
    expect(init.headers).toMatchObject({ 'Idempotency-Key': 'stable-operation-key' });
    expect(JSON.parse(String(init.body))).toEqual({
      mediaType: 'text/plain',
      size: evidence.size,
      sha256: 'ab'.repeat(32),
    });
    expect(String(init.body)).not.toContain(evidence.name);
  });

  it('uploads to the fixed same-origin path with a one-use header capability', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(quarantined), {
        status: 202,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const evidence = file();

    await uploadEvidence(declaration, evidence);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/v1/public/ethics/evidence/uploads');
    expect(url).not.toContain(declaration.uploadCapability);
    expect(init.credentials).toBe('omit');
    expect(init.referrerPolicy).toBe('no-referrer');
    expect(init.headers).toMatchObject({
      'Content-Type': 'application/octet-stream',
      'X-Etik-Upload-Capability': declaration.uploadCapability,
    });
    expect(init.body).toBe(evidence);
  });

  it('accepts a completed idempotent replay without attempting a second upload', async () => {
    const completedReplay = {
      ...declaration,
      state: 'AVAILABLE' as const,
      uploadCapability: null,
      idempotentReplay: true,
    };
    vi.stubGlobal('crypto', {
      subtle: {
        digest: vi.fn().mockResolvedValue(new Uint8Array(32).fill(0xab).buffer),
      },
    });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(completedReplay), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await declareEvidence(file(), 'stable-operation-key');

    expect(result).toEqual(completedReplay);
    await expect(uploadEvidence(result, file())).rejects.toThrow('yeniden kullanılamaz');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects a server-supplied upload redirect before any network request', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      uploadEvidence({ ...declaration, uploadPath: 'https://attacker.invalid/upload' }, file()),
    ).rejects.toThrow('yükleme hedefi güvenli değil');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
