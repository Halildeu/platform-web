import { beforeEach, describe, expect, test } from 'vitest';
import {
  getConsent,
  putConsent,
  resetDemoIngest,
  transcribeRecording,
  uploadRecording,
} from './demoIngestEngine';

beforeEach(() => resetDemoIngest());

describe('rıza-kapısı (fail-closed)', () => {
  test('beyansız yükleme YAPISAL RED', () => {
    expect(() => uploadRecording('a.wav', 'audio/wav', 1000)).toThrow(/rıza-kapısı/i);
  });

  test('DENIED ve WITHDRAWN yükleme RED; GRANTED kabul', () => {
    putConsent('sub-1', 'DENIED');
    expect(() => uploadRecording('a.wav', 'audio/wav', 1000)).toThrow(/DENIED/);
    putConsent('sub-1', 'WITHDRAWN');
    expect(() => uploadRecording('a.wav', 'audio/wav', 1000)).toThrow(/WITHDRAWN/);
    putConsent('sub-1', 'GRANTED');
    const r = uploadRecording('a.wav', 'audio/wav', 1000);
    expect(r.evidenceId).toMatch(/^ev-[0-9a-f]{8}$/);
    expect(r.ledgerSequence).toBe(1);
  });

  test('GRANTED sonrası GERİ ÇEKME yüklemeyi yeniden kapatır (son beyan geçerli)', () => {
    putConsent('sub-1', 'GRANTED');
    uploadRecording('a.wav', 'audio/wav', 1000);
    putConsent('sub-1', 'WITHDRAWN');
    expect(getConsent()).toBe('WITHDRAWN');
    expect(() => uploadRecording('b.wav', 'audio/wav', 1000)).toThrow(/WITHDRAWN/);
  });

  test('boş subjectRef beyanı reddedilir (opak ref zorunlu)', () => {
    expect(() => putConsent('   ', 'GRANTED')).toThrow(/referansı zorunlu/);
  });
});

describe('yükleme allowlist + makbuz + transcribe', () => {
  beforeEach(() => putConsent('sub-1', 'GRANTED'));

  test('audio/* dışı MIME reddedilir; boyut sınırı uygulanır', () => {
    expect(() => uploadRecording('x.pdf', 'application/pdf', 1000)).toThrow(/allowlist/);
    expect(() => uploadRecording('a.wav', 'audio/wav', 0)).toThrow(/boyut/i);
    expect(() => uploadRecording('a.wav', 'audio/wav', 101 * 1024 * 1024)).toThrow(/boyut/i);
  });

  test('makbuz pointer-only + deterministik; defter sırası artar', () => {
    const r1 = uploadRecording('a.wav', 'audio/wav', 1000);
    const r2 = uploadRecording('b.wav', 'audio/wav', 2000);
    expect(r1.objectKey).not.toBe(r2.objectKey);
    expect(r2.ledgerSequence).toBe(r1.ledgerSequence + 1);
    // aynı dosya-imzası → aynı objectKey (deterministik)
    const r3 = uploadRecording('a.wav', 'audio/wav', 1000);
    expect(r3.objectKey).toBe(r1.objectKey);
  });

  test('transcribe idempotent: aynı objectKey → aynı transcriptKey', () => {
    const r = uploadRecording('a.wav', 'audio/wav', 1000);
    const t1 = transcribeRecording(r.objectKey);
    const t2 = transcribeRecording(r.objectKey);
    expect(t1.transcriptKey).toBe(t2.transcriptKey);
    expect(t1.transcriptKey).toMatch(/^tr-[0-9a-f]{8}$/);
  });
});
