import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseAccessFile } from './App';
import {
  EVIDENCE_STATES,
  declareEvidence,
  listEvidence,
  uploadEvidence,
  type EvidenceDeclaration,
  type EvidenceState,
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

describe('Etik Speak evidence state vocabulary', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // An unknown state is not a cosmetic problem here: validation rejects the
  // record and the whole attachment disappears from the reporter's list. The
  // states most likely to be missing are exactly the terminal failures — the
  // ones a reporter most needs to see.
  const terminalFailures: EvidenceState[] = [
    'MALICIOUS_QUARANTINED',
    'REJECTED_INTEGRITY',
    'REJECTED_POLICY',
    'SANITIZE_FAILED',
    'UPLOAD_CAPABILITY_EXPIRED',
  ];

  it.each(terminalFailures)('keeps a %s attachment in the reporter list', async (state) => {
    const payload: EvidenceStatus = {
      attachmentId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      state,
      mediaType: 'text/plain',
      size: 68,
      failureCode: 'EVIDENCE_MALWARE_DETECTED',
      createdAt: '2026-07-26T14:35:41Z',
      updatedAt: '2026-07-26T14:37:58Z',
    };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify([payload]), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );
    await expect(listEvidence()).resolves.toEqual([payload]);
  });

  it('recognizes every state the custody service can emit', () => {
    // Kept in lockstep with EvidenceAttachment in ethics-service. Narrowing
    // this list silently hides attachments rather than failing loudly.
    expect([...EVIDENCE_STATES].sort()).toEqual(
      [
        'AVAILABLE',
        'DECLARED',
        'DERIVATIVE_READY',
        'EXPIRED_UNBOUND',
        'INTEGRITY_VERIFIED',
        'MALICIOUS_QUARANTINED',
        'ORIGINAL_SEALED',
        'QUARANTINED',
        'REJECTED_INTEGRITY',
        'REJECTED_POLICY',
        'SANITIZE_FAILED',
        'SANITIZING',
        'SCANNING',
        'SCAN_PENDING',
        'UPLOADING',
        'UPLOAD_CAPABILITY_EXPIRED',
      ].sort(),
    );
    expect(EVIDENCE_STATES).not.toContain('REJECTED' as EvidenceState);
  });
});

describe('Etik Speak access file round trip', () => {
  // The success screen writes this exact shape; the follow screen must read it
  // back. Handing the reporter a file and then asking them to retype it is the
  // defect this closes.
  const written = (id: string, secret: string) =>
    `Etik Speak erişim bilgisi\nReceipt: ${id}\nAccess secret: ${secret}\n`;

  it('reads back the file the success screen produced', () => {
    // Shaped like the real thing, but not a live value: an access secret is the
    // only key to a reporter's mailbox and must never enter version control.
    const id = '00000000-0000-4000-8000-000000000000';
    const secret = 'ornek-erisim-sirri-yalnizca-test-icin-kullanilir';
    expect(parseAccessFile(written(id, secret))).toEqual({
      receiptId: id,
      accessSecret: secret,
    });
  });

  it('tolerates Windows line endings and stray spacing', () => {
    expect(
      parseAccessFile('Etik Speak erişim bilgisi\r\n Receipt :  abc \r\nAccess secret:  xyz \r\n'),
    ).toEqual({ receiptId: 'abc', accessSecret: 'xyz' });
  });

  it('refuses a file that is not an access file rather than guessing', () => {
    expect(parseAccessFile('sadece rastgele bir metin')).toBeNull();
    expect(parseAccessFile('Receipt: yalnizca-numara')).toBeNull();
  });
});
