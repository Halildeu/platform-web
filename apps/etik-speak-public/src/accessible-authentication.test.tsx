import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import App from './App';
import * as api from './public-api';

vi.mock('./public-api');

/**
 * Faz 35 ES-307 — the reporter must never have to transcribe their own secret (#958).
 *
 * <p>WCAG 2.2 adds 3.3.8 Accessible Authentication: a login step must not depend on the user
 * recalling or re-typing something, unless an alternative exists. The alternative this form
 * relies on is paste, and the secret it protects is 43 random characters. Blocking paste —
 * a one-line `onPaste` handler somebody adds believing it is a security measure — would put
 * a whistleblower in the position of hand-copying that string correctly, on a phone,
 * possibly under time pressure. It also buys nothing: an attacker holding the secret can
 * type it.
 *
 * <h2>Why `autocomplete="off"` stays</h2>
 *
 * <p>It looks like an accessibility smell and is a deliberate privacy decision. Letting the
 * browser or a password manager remember this value leaves the key to an anonymous report
 * on the device — which may be shared, managed, or examined. 3.3.8 is met through paste,
 * which costs the reporter nothing and leaves nothing behind. Written down here so the next
 * reader does not "fix" it.
 */
describe('erişim sırrı — erişilebilir kimlik doğrulama (3.3.8)', () => {
  beforeEach(() => {
    vi.mocked(api.fetchIntakeOptions).mockResolvedValue(['ANONYMOUS']);
    vi.mocked(api.openMailbox).mockResolvedValue({ expiresAt: '2026-08-01T00:00:00Z' });
    vi.mocked(api.getMailbox).mockResolvedValue({ status: 'NEW', messages: [] });
  });

  test('bildirim numarası ve erişim sırrı yapıştırılabilir', async () => {
    render(<App />);
    await userEvent.click(screen.getByRole('button', { name: 'Bildirimi takip et' }));

    const receipt = await screen.findByLabelText(/Bildirim numarası/i);
    const secret = await screen.findByLabelText(/Erişim sırrı/i);

    // Panoyu kullanan gerçek yol: elle yazmak değil, yapıştırmak.
    await userEvent.click(receipt);
    await userEvent.paste('11111111-1111-1111-1111-111111111111');
    await userEvent.click(secret);
    await userEvent.paste('kirk-uc-karakterlik-rastgele-eris-sirri-xyz');

    expect((receipt as HTMLInputElement).value).toBe('11111111-1111-1111-1111-111111111111');
    expect((secret as HTMLInputElement).value).toBe('kirk-uc-karakterlik-rastgele-eris-sirri-xyz');
  });

  // `autocomplete="off"` bilinçli: tarayıcının anonim bir ihbarın anahtarını cihazda
  // hatırlaması, paylaşılan ya da denetlenen bir cihazda ihbarcıya pahalıya gelir.
  // 3.3.8 yapıştırma ile karşılanıyor; bu satır bir eksiklik değil, tercih.
  test('sır alanı tarayıcıya hatırlatılmaz', async () => {
    render(<App />);
    await userEvent.click(screen.getByRole('button', { name: 'Bildirimi takip et' }));
    const secret = await screen.findByLabelText(/Erişim sırrı/i);
    expect(secret).toHaveAttribute('autocomplete', 'off');
  });
});
