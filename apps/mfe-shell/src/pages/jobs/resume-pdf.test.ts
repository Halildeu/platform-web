// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

const pdfMocks = vi.hoisted(() => ({
  getDocument: vi.fn(),
  GlobalWorkerOptions: { workerSrc: '' },
}));
vi.mock('pdfjs-dist', () => pdfMocks);
vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({ default: '/pdf.worker.test.mjs' }));

import { parseResumePdf, parseResumeText } from './resume-pdf';

afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe('parseResumeText', () => {
  it('maps labeled contact fields and multiline CV sections without retaining unrelated text', () => {
    expect(
      parseResumeText(`
Ad Soyad: Deniz Yilmaz
E-posta: deniz.yilmaz@example.test
Telefon: +90 555 000 00 00
Sehir: Istanbul
LinkedIn: https://www.linkedin.com/in/deniz-demo
Portfoy: https://portfolio.example.test/deniz
Profesyonel Ozet
Kullanici ihtiyacini urune donusturen urun profesyoneli.
Is Deneyimi
Urun Uzmani - Ornek Teknoloji - 2022-2026
Urun Analisti - Demo Yazilim - 2020-2022
Egitim
Yonetim Bilisim Sistemleri - Ornek Universitesi - 2020
Beceriler
Urun kesfi, kullanici arastirmasi, analitik
Not
Urun odakli ekibinizle calismak istiyorum.
      `),
    ).toEqual({
      fullName: 'Deniz Yilmaz',
      email: 'deniz.yilmaz@example.test',
      phone: '+90 555 000 00 00',
      city: 'Istanbul',
      linkedIn: 'https://www.linkedin.com/in/deniz-demo',
      portfolio: 'https://portfolio.example.test/deniz',
      summary: 'Kullanici ihtiyacini urune donusturen urun profesyoneli.',
      experience:
        'Urun Uzmani - Ornek Teknoloji - 2022-2026\nUrun Analisti - Demo Yazilim - 2020-2022',
      education: 'Yonetim Bilisim Sistemleri - Ornek Universitesi - 2020',
      skills: 'Urun kesfi, kullanici arastirmasi, analitik',
      note: 'Urun odakli ekibinizle calismak istiyorum.',
    });
  });

  it('falls back to common e-mail, phone and URL patterns', () => {
    expect(
      parseResumeText(
        'Demo Candidate\ndemo@example.test\n+90 555 111 22 33\nhttps://linkedin.com/in/demo\nhttps://demo.example.test',
      ),
    ).toMatchObject({
      email: 'demo@example.test',
      phone: '+90 555 111 22 33',
      linkedIn: 'https://linkedin.com/in/demo',
      portfolio: 'https://demo.example.test',
    });
  });

  it('does not mistake an employment date range for a phone number', () => {
    expect(parseResumeText('Demo Candidate\ndemo@example.test\n2022-2026')).not.toHaveProperty(
      'phone',
    );
  });

  it('returns after bounded cleanup when a loaded PDF page and worker stop responding', async () => {
    vi.useFakeTimers();
    const never = new Promise<never>(() => undefined);
    const destroy = vi.fn(() => never);
    pdfMocks.getDocument.mockReturnValueOnce({
      promise: Promise.resolve({
        numPages: 1,
        getPage: vi.fn(() => never),
        destroy,
      }),
      destroy: vi.fn(),
    });
    const file = {
      arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
    } as unknown as File;

    const rejection = expect(parseResumePdf(file)).rejects.toThrow('PDF_PARSE_TIMEOUT');
    await vi.advanceTimersByTimeAsync(5_000);
    await vi.advanceTimersByTimeAsync(1_000);

    await rejection;
    expect(destroy).toHaveBeenCalledOnce();
  });
});
