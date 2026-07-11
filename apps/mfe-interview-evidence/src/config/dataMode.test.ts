import { afterEach, describe, expect, test, vi } from 'vitest';
import { resolveDataMode, resolveLiveInterviewId } from './dataMode';

type EnvBag = Record<string, string | undefined>;
const g = globalThis as { __env__?: EnvBag };

afterEach(() => {
  delete g.__env__;
  vi.unstubAllEnvs();
});

describe('resolveDataMode — runtime policy + fail-closed parse', () => {
  test('hiçbir kaynak yoksa default demo (güvenli default)', () => {
    expect(resolveDataMode()).toEqual({ kind: 'ok', mode: 'demo' });
  });

  test('window.__env__ live → live (runtime kanal)', () => {
    g.__env__ = { INTERVIEW_EVIDENCE_DATA_MODE: 'live' };
    expect(resolveDataMode()).toEqual({ kind: 'ok', mode: 'live' });
  });

  test('window.__env__ import.meta.env üzerine ÖNCELİKLİ (runtime > build)', () => {
    vi.stubEnv('VITE_INTERVIEW_EVIDENCE_DATA_MODE', 'live');
    g.__env__ = { INTERVIEW_EVIDENCE_DATA_MODE: 'demo' };
    expect(resolveDataMode()).toEqual({ kind: 'ok', mode: 'demo' });
  });

  test('build-time VITE_ fallback çalışır', () => {
    vi.stubEnv('VITE_INTERVIEW_EVIDENCE_DATA_MODE', 'live');
    expect(resolveDataMode()).toEqual({ kind: 'ok', mode: 'live' });
  });

  test('büyük/karışık harf normalize edilir', () => {
    g.__env__ = { INTERVIEW_EVIDENCE_DATA_MODE: 'LIVE' };
    expect(resolveDataMode()).toEqual({ kind: 'ok', mode: 'live' });
  });

  test('TANIMLI-geçersiz değer sessizce demoya DÜŞMEZ → config-error (fail-closed)', () => {
    g.__env__ = { INTERVIEW_EVIDENCE_DATA_MODE: 'lvie' };
    const r = resolveDataMode();
    expect(r.kind).toBe('config-error');
    if (r.kind === 'config-error') expect(r.reason).toContain('lvie');
  });

  test('boş string default demo sayılır (tanımsızla eş)', () => {
    g.__env__ = { INTERVIEW_EVIDENCE_DATA_MODE: '  ' };
    expect(resolveDataMode()).toEqual({ kind: 'ok', mode: 'demo' });
  });
});

describe('resolveLiveInterviewId', () => {
  test('yapılandırılmamışsa null (live modda fail-closed config-error yüzeyine gider)', () => {
    expect(resolveLiveInterviewId()).toBeNull();
  });

  test('window.__env__ değeri döner (id uygulama kodunda hardcode edilmez)', () => {
    g.__env__ = { INTERVIEW_EVIDENCE_INTERVIEW_ID: 'iv-smoke-1' };
    expect(resolveLiveInterviewId()).toBe('iv-smoke-1');
  });
});
