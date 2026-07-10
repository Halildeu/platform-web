import { beforeEach, describe, expect, test } from 'vitest';
import {
  getConsent,
  putConsent,
  resetDemoIngest,
  transcribeRecording,
  uploadRecording,
} from './demoIngestEngine';

beforeEach(() => resetDemoIngest());

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);

describe('rıza-kapısı (fail-closed, her işleme adımında yeniden)', () => {
  test('beyansız yükleme YAPISAL RED', () => {
    expect(() => uploadRecording(HASH_A, 'audio/wav', 1000)).toThrow(/rıza-kapısı/i);
  });

  test('DENIED ve WITHDRAWN yükleme RED; GRANTED kabul', () => {
    putConsent('sub-1', 'DENIED');
    expect(() => uploadRecording(HASH_A, 'audio/wav', 1000)).toThrow(/DENIED/);
    putConsent('sub-1', 'WITHDRAWN');
    expect(() => uploadRecording(HASH_A, 'audio/wav', 1000)).toThrow(/WITHDRAWN/);
    putConsent('sub-1', 'GRANTED');
    const r = uploadRecording(HASH_A, 'audio/wav', 1000);
    expect(r.evidenceId).toMatch(/^ev-[0-9a-f]{8}$/);
    expect(r.ledgerSequence).toBe(1);
  });

  test('BLOCKER regresyonu (Codex 019f4b50): GRANTED → upload → WITHDRAWN → transcribe RED', () => {
    putConsent('sub-1', 'GRANTED');
    const r = uploadRecording(HASH_A, 'audio/wav', 1000);
    putConsent('sub-1', 'WITHDRAWN');
    expect(getConsent()).toBe('WITHDRAWN');
    expect(() => transcribeRecording(r.objectKey)).toThrow(/WITHDRAWN.*transkripsiyon/);
    // WITHDRAWN terminal DEĞİL: yeni GRANTED yeni hukuki beyandır → yeniden açılır
    putConsent('sub-1', 'GRANTED');
    expect(transcribeRecording(r.objectKey).transcriptKey).toMatch(/^tr-/);
  });

  test('boş subjectRef beyanı reddedilir (opak ref zorunlu)', () => {
    expect(() => putConsent('   ', 'GRANTED')).toThrow(/referansı zorunlu/);
  });
});

describe('yükleme kimliği + allowlist + idempotent replay', () => {
  beforeEach(() => putConsent('sub-1', 'GRANTED'));

  test('kapalı EXACT-SET allowlist: audio/x-foo RED, kanonik 6 tip kabul', () => {
    expect(() => uploadRecording(HASH_A, 'audio/x-foo', 1000)).toThrow(/allowlist/);
    expect(() => uploadRecording(HASH_A, 'application/pdf', 1000)).toThrow(/allowlist/);
    for (const mime of [
      'audio/wav',
      'audio/mpeg',
      'audio/mp4',
      'audio/webm',
      'video/mp4',
      'video/webm',
    ]) {
      resetDemoIngest();
      putConsent('sub-1', 'GRANTED');
      expect(uploadRecording(HASH_A, mime, 1000).objectKey).toMatch(/^rec-/);
    }
  });

  test('boyut sınırı + boş content-hash reddi', () => {
    expect(() => uploadRecording(HASH_A, 'audio/wav', 0)).toThrow(/boyut/i);
    expect(() => uploadRecording(HASH_A, 'audio/wav', 101 * 1024 * 1024)).toThrow(/boyut/i);
    expect(() => uploadRecording('  ', 'audio/wav', 1000)).toThrow(/hash zorunlu/i);
  });

  test('MAJOR regresyonu (Codex): aynı içerik retry → AYNI makbuz (defter sırası DAHİL)', () => {
    const r1 = uploadRecording(HASH_A, 'audio/wav', 1000);
    const replay = uploadRecording(HASH_A, 'audio/wav', 1000);
    expect(replay).toEqual(r1); // evidenceId + ledgerSequence birebir aynı
    const r2 = uploadRecording(HASH_B, 'audio/wav', 1000);
    expect(r2.objectKey).not.toBe(r1.objectKey);
    expect(r2.ledgerSequence).toBe(r1.ledgerSequence + 1);
  });

  test('kimlik İÇERİKTEN türetilir — farklı içerik (hash) aynı ad/boyutta bile ayrışır', () => {
    // Aynı boyut, farklı hash → farklı makbuz (dosya adı hiç anahtara girmiyor)
    const r1 = uploadRecording(HASH_A, 'audio/wav', 1000);
    const r2 = uploadRecording(HASH_B, 'audio/wav', 1000);
    expect(r1.evidenceId).not.toBe(r2.evidenceId);
  });

  test('transcribe idempotent: aynı objectKey → aynı transcriptKey', () => {
    const r = uploadRecording(HASH_A, 'audio/wav', 1000);
    const t1 = transcribeRecording(r.objectKey);
    const t2 = transcribeRecording(r.objectKey);
    expect(t1.transcriptKey).toBe(t2.transcriptKey);
    expect(t1.transcriptKey).toMatch(/^tr-[0-9a-f]{8}$/);
  });
});
