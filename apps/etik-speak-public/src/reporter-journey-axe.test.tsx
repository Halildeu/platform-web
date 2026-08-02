import axe from 'axe-core';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import App from './App';
import * as api from './public-api';

vi.mock('./public-api');

/**
 * Faz 35 ES-307 — the reporter's journey, scanned (#958).
 *
 * <h2>What this proves, and what it does not</h2>
 *
 * <p>This runs axe in jsdom, which has no layout engine. Colour contrast (1.4.3), target
 * size (2.5.8) and anything that depends on rendered geometry <b>cannot</b> be evaluated
 * here and are switched off rather than left to report a hollow pass — a green run that
 * silently skipped half the criteria would be worse than no run, because it reads as
 * coverage. Those belong to a browser-driven pass and are still open on #958.
 *
 * <p>What it does prove is the part that breaks most often and is cheapest to catch early:
 * form fields without accessible names, controls without roles, headings out of order,
 * ARIA references pointing at nothing, duplicate ids. Every one of those is invisible to a
 * sighted developer clicking through and decisive for someone using a screen reader.
 *
 * <p>Scanned at each step of the journey rather than on the landing page alone. A reporter
 * does not stop at the first screen, and the screens that carry the real work — the intake
 * form, the receipt, the mailbox — are the ones a landing-page-only scan never sees.
 */

/** Rules jsdom cannot judge. Listed explicitly so the gap is visible, not implied. */
const NEEDS_A_REAL_BROWSER = ['color-contrast', 'target-size'];

async function scan(label: string) {
  const results = await axe.run(document.body, {
    resultTypes: ['violations'],
    rules: Object.fromEntries(NEEDS_A_REAL_BROWSER.map((id) => [id, { enabled: false }])),
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
  });
  const readable = results.violations.map(
    (v) => `${label} · ${v.id} (${v.impact}): ${v.help} — ${v.nodes.length} düğüm`,
  );
  expect(readable, `${label} adımında erişilebilirlik ihlali`).toEqual([]);
}

describe('ihbarcı yolculuğu — axe (jsdom)', () => {
  beforeEach(() => {
    vi.mocked(api.fetchIntakeOptions).mockResolvedValue(['ANONYMOUS']);
    vi.mocked(api.newAccessSecret).mockReturnValue('sentetik-eris-sirri-test-icin-kullanilir');
    vi.mocked(api.createReport).mockResolvedValue({
      receiptId: '11111111-1111-1111-1111-111111111111',
      accessSecret: 'sentetik-eris-sirri-test-icin-kullanilir',
      createdAt: '2026-07-28T10:00:00Z',
      mailboxPath: '/mailbox',
      idempotentReplay: false,
    });
    vi.mocked(api.openMailbox).mockResolvedValue({ expiresAt: '2026-08-01T00:00:00Z' });
    vi.mocked(api.getMailbox).mockResolvedValue({ status: 'NEW', messages: [] });
    vi.mocked(api.listEvidence).mockResolvedValue([]);
  });

  test('giriş ekranı', async () => {
    render(<App />);
    await scan('giriş');
  });

  test('bildirim formu', async () => {
    render(<App />);
    await userEvent.click(screen.getByRole('button', { name: 'Yeni bildirim yap' }));
    await scan('bildirim formu');
  });

  test('takip girişi — erişim sırrı alanı', async () => {
    render(<App />);
    await userEvent.click(screen.getByRole('button', { name: 'Bildirimi takip et' }));
    await scan('takip girişi');
  });

  test('posta kutusu', async () => {
    render(<App />);
    await userEvent.click(screen.getByRole('button', { name: 'Bildirimi takip et' }));
    await userEvent.click(screen.getByRole('button', { name: 'Güvenli mailbox aç' }));
    await scan('posta kutusu');
  });
});
