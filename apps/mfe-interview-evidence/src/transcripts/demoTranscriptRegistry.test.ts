import { beforeEach, describe, expect, test } from 'vitest';
import {
  getTranscript,
  listTranscripts,
  markErased,
  registerIngestTranscript,
  resetDemoTranscripts,
} from './demoTranscriptRegistry';
import type { ErasureReceipt } from '../dsar/types';

beforeEach(() => resetDemoTranscripts());

const receipt = (dsarKey: string): ErasureReceipt => ({
  dsarKey,
  tombstoneCount: 0,
  deletedContentCount: 1,
  caseTransitioned: false,
});

describe('demoTranscriptRegistry (F-liste kayıt-defteri, 39c-7)', () => {
  test('seed: demo transkript listede + segmentli + silinmemiş', () => {
    const all = listTranscripts();
    expect(all).toHaveLength(1);
    expect(all[0].transcriptKey).toBe('tr-demo-1');
    expect(all[0].origin).toBe('DEMO');
    expect(all[0].segments.length).toBeGreaterThan(0);
    expect(all[0].erasure).toBeNull();
  });

  test('INGEST kaydı: pointer-only etiket + dürüst yer-tutucu segment', () => {
    registerIngestTranscript('tr-abc123', 'ev-abc123');
    const e = getTranscript('tr-abc123');
    expect(e.origin).toBe('INGEST');
    expect(e.label).toBe('Yükleme ev-abc123');
    expect(e.segments).toHaveLength(1);
    expect(e.segments[0].text).toContain('ev-abc123');
    expect(e.segments[0].text).toContain('39d'); // dürüst sınır: gerçek STT 39d'de
    expect(listTranscripts()).toHaveLength(2);
  });

  test('kayıt İDEMPOTENT: aynı anahtar ikinci kez EKLENMEZ ve EZİLMEZ', () => {
    registerIngestTranscript('tr-abc123', 'ev-abc123');
    registerIngestTranscript('tr-abc123', 'ev-farkli'); // transcribe idempotent aynası
    expect(listTranscripts()).toHaveLength(2);
    expect(getTranscript('tr-abc123').label).toBe('Yükleme ev-abc123'); // ezilmedi
  });

  test('zorunlu alanlar: boş anahtar/kanıt ref RED', () => {
    expect(() => registerIngestTranscript(' ', 'ev-1')).toThrow(/anahtarı zorunlu/);
    expect(() => registerIngestTranscript('tr-1', ' ')).toThrow(/Kanıt referansı zorunlu/);
  });

  test('markErased: içerik-düzlemi boşalır, girdi + makbuz denetim için KALIR', () => {
    markErased('tr-demo-1', receipt('dsar-0001'));
    const e = getTranscript('tr-demo-1');
    expect(e.segments).toHaveLength(0); // content-plane silme aynası
    expect(e.erasure?.dsarKey).toBe('dsar-0001');
    expect(listTranscripts()).toHaveLength(1); // listeden DÜŞMEZ (denetim)
  });

  test('silinmişi yeniden silmek YAPISAL RED (tek-seferlik, fail-closed)', () => {
    markErased('tr-demo-1', receipt('dsar-0001'));
    expect(() => markErased('tr-demo-1', receipt('dsar-0002'))).toThrow(/zaten silinmiş/);
  });

  test('bilinmeyen transkript: markErased/getTranscript RED', () => {
    expect(() => markErased('tr-yok', receipt('dsar-0001'))).toThrow(/bulunamadı/);
    expect(() => getTranscript('tr-yok')).toThrow(/bulunamadı/);
  });

  test('liste kopya döner: dışarıdan mutasyon kayıt-defterini BOZMAZ', () => {
    const all = listTranscripts();
    all[0].segments.length = 0;
    expect(getTranscript('tr-demo-1').segments.length).toBeGreaterThan(0);
  });
});
