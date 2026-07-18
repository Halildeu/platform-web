// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import CandidateApplicationPage from './CandidateApplicationPage';

const apiMocks = vi.hoisted(() => ({
  getPublicJob: vi.fn(),
  submitApplication: vi.fn(),
  saveCandidateSession: vi.fn(),
  createApplicationIdempotencyKey: vi.fn(),
  createCandidateAccessToken: vi.fn(),
  createResumeImport: vi.fn(),
  getResumeImport: vi.fn(),
  uploadResumePdf: vi.fn(),
  replaceResumePdf: vi.fn(),
  updateResumeProposal: vi.fn(),
  confirmResumeImport: vi.fn(),
  terminateResumeImport: vi.fn(),
}));

vi.mock('../../features/ats-portals/api/application-api', () => ({
  DEFAULT_APPLICATION_FIELDS: [
    'fullName',
    'email',
    'phone',
    'city',
    'linkedIn',
    'portfolio',
    'summary',
    'experience',
    'education',
    'skills',
    'note',
  ],
  getPublicJob: apiMocks.getPublicJob,
  submitApplication: apiMocks.submitApplication,
  saveCandidateSession: apiMocks.saveCandidateSession,
  createApplicationIdempotencyKey: apiMocks.createApplicationIdempotencyKey,
  createCandidateAccessToken: apiMocks.createCandidateAccessToken,
  createResumeImport: apiMocks.createResumeImport,
  getResumeImport: apiMocks.getResumeImport,
  uploadResumePdf: apiMocks.uploadResumePdf,
  replaceResumePdf: apiMocks.replaceResumePdf,
  updateResumeProposal: apiMocks.updateResumeProposal,
  confirmResumeImport: apiMocks.confirmResumeImport,
  terminateResumeImport: apiMocks.terminateResumeImport,
}));

const JOB = {
  slug: 'urun-yoneticisi',
  title: 'Ürün Yöneticisi',
  team: 'Ürün',
  location: 'İstanbul',
  mode: 'Hibrit',
  employmentType: 'Tam zamanlı',
  summary: 'Sentetik ilan',
  highlights: ['Ürün keşfi'],
  applicationFields: [
    'fullName',
    'email',
    'phone',
    'city',
    'linkedIn',
    'portfolio',
    'summary',
    'experience',
    'education',
    'skills',
    'note',
  ],
  noticeVersion: 'kvkk-application-v1' as const,
};

const RECEIPT = {
  publicRef: 'app_abcdefghijklmnopqrstuvwx',
  candidateAccessToken: 'A'.repeat(43),
  status: 'SUBMITTED',
  version: 0,
  submittedAt: '2026-07-16T10:00:00Z',
  replayed: false,
};

const provenance = {
  page: 1,
  x: 48,
  y: 120,
  width: 220,
  height: 14,
  confidence: 0.96,
  parserVersion: 'pdfbox-resume-v1',
};

const proposals = [
  ['fullName', 'PDF Demo Adayı'],
  ['email', 'pdf.aday@example.test'],
  ['phone', '+90 555 111 22 33'],
  ['city', 'Ankara'],
  ['summary', 'PDF içinden gelen özet'],
  ['experience', 'PDF içinden gelen deneyim'],
  ['education', 'PDF içinden gelen eğitim'],
  ['skills', 'Ürün keşfi, analitik'],
].map(([field, proposedValue]) => ({
  field,
  proposedValue,
  candidateValue: null,
  state: 'UNREVIEWED',
  version: 0,
  provenance,
}));

const CREATED_IMPORT = {
  importId: 'ri_abcdefghijklmnopqrstuvwx',
  jobSlug: JOB.slug,
  state: 'ACTIVE',
  version: 0,
  documentVersion: 0,
  noticeVersion: 'candidate-resume-import-v1',
  noticeAcceptedAt: '2026-07-18T08:00:00Z',
  uploadExpiresAt: '2026-07-18T08:15:00Z',
  firstUploadAt: null,
  expiresAt: null,
  parserVersion: null,
  protectedSuppressed: 0,
  unsupportedOutput: 0,
  createdAt: '2026-07-18T08:00:00Z',
  updatedAt: '2026-07-18T08:00:00Z',
  purgedAt: null,
  proposals: [],
};

const UPLOADED_IMPORT = {
  ...CREATED_IMPORT,
  version: 1,
  documentVersion: 1,
  firstUploadAt: '2026-07-18T08:01:00Z',
  expiresAt: '2026-07-19T08:01:00Z',
  parserVersion: 'pdfbox-resume-v1',
  protectedSuppressed: 1,
  proposals,
};

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/jobs/urun-yoneticisi/apply']}>
      <Routes>
        <Route path="/jobs/:jobSlug/apply" element={<CandidateApplicationPage />} />
      </Routes>
    </MemoryRouter>,
  );

const reachPreview = async () => {
  await screen.findByRole('heading', { name: 'Ürün Yöneticisi' });
  fireEvent.click(screen.getByTestId('fill-synthetic-resume'));
  fireEvent.click(screen.getByRole('button', { name: 'Başvuruyu önizle' }));
  expect(screen.getByTestId('candidate-application-preview')).toBeVisible();
};

const selectPdf = async () => {
  await screen.findByRole('heading', { name: 'Ürün Yöneticisi' });
  fireEvent.click(screen.getByLabelText(/CV içe aktarma aydınlatmasını okudum/i));
  const pdf = new File(['%PDF synthetic'], 'ornek-cv.pdf', { type: 'application/pdf' });
  fireEvent.change(screen.getByTestId('candidate-resume'), { target: { files: [pdf] } });
  await screen.findByTestId('candidate-resume-review');
  return pdf;
};

describe('CandidateApplicationPage', () => {
  beforeEach(() => {
    apiMocks.getPublicJob.mockResolvedValue(JOB);
    apiMocks.submitApplication.mockResolvedValue(RECEIPT);
    apiMocks.saveCandidateSession.mockReturnValue(true);
    apiMocks.createApplicationIdempotencyKey.mockReturnValue('web-idempotency-123456');
    apiMocks.createCandidateAccessToken.mockReturnValue('A'.repeat(43));
    apiMocks.createResumeImport.mockResolvedValue(CREATED_IMPORT);
    apiMocks.getResumeImport.mockResolvedValue(UPLOADED_IMPORT);
    apiMocks.uploadResumePdf.mockResolvedValue({ resumeImport: UPLOADED_IMPORT, inFlight: false });
    apiMocks.replaceResumePdf.mockImplementation(async (current) => ({
      ...current,
      version: current.version + 1,
      documentVersion: current.documentVersion + 1,
      proposals: [],
    }));
    apiMocks.updateResumeProposal.mockImplementation(
      async (current, field, state, _access, editedValue) => ({
        ...current,
        version: current.version + 1,
        proposals: current.proposals.map((proposal) =>
          proposal.field === field
            ? {
                ...proposal,
                state,
                candidateValue: state === 'EDITED' ? editedValue : null,
                version: proposal.version + 1,
              }
            : proposal,
        ),
      }),
    );
    apiMocks.confirmResumeImport.mockResolvedValue({
      resumeImport: { ...UPLOADED_IMPORT, state: 'CONFIRMED', version: 10, proposals: [] },
      draft: {
        draftId: '11111111-1111-1111-1111-111111111111',
        importId: CREATED_IMPORT.importId,
        version: 0,
        fields: Object.fromEntries(
          proposals.map((proposal) => [proposal.field, proposal.proposedValue]),
        ),
        createdAt: '2026-07-18T08:02:00Z',
      },
    });
    apiMocks.terminateResumeImport.mockResolvedValue({ ...UPLOADED_IMPORT, state: 'REJECT_ALL' });
    vi.stubGlobal('scrollTo', vi.fn());
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('submits the editable form to the persistent API and stores tracking only after success', async () => {
    renderPage();
    await reachPreview();
    screen.getAllByRole('checkbox').forEach((checkbox) => fireEvent.click(checkbox));
    fireEvent.click(screen.getByRole('button', { name: 'Başvuruyu gönder' }));

    expect(await screen.findByRole('heading', { name: 'Başvurunuz kaydedildi' })).toBeVisible();
    expect(screen.getByTestId('candidate-receipt-id')).toHaveTextContent(RECEIPT.publicRef);
    expect(apiMocks.submitApplication).toHaveBeenCalledWith(
      'urun-yoneticisi',
      'web-idempotency-123456',
      'A'.repeat(43),
      expect.objectContaining({
        email: 'deniz.yilmaz@example.test',
        skills: expect.arrayContaining(['Ürün keşfi', 'erişilebilirlik']),
        noticeVersion: 'kvkk-application-v1',
        accuracyConfirmedAt: expect.any(String),
      }),
      undefined,
    );
    expect(apiMocks.saveCandidateSession).toHaveBeenCalledWith(RECEIPT);
  });

  it('does not show a receipt when the backend rejects submission', async () => {
    apiMocks.submitApplication.mockRejectedValueOnce(new Error('rate limited'));
    renderPage();
    await reachPreview();
    screen.getAllByRole('checkbox').forEach((checkbox) => fireEvent.click(checkbox));
    fireEvent.click(screen.getByRole('button', { name: 'Başvuruyu gönder' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('rate limited');
    expect(screen.queryByTestId('candidate-application-receipt')).not.toBeInTheDocument();
    expect(apiMocks.saveCandidateSession).not.toHaveBeenCalled();
  });

  it('keeps PDF proposals out of the form until every field decision and explicit confirmation', async () => {
    renderPage();
    const pdf = await selectPdf();

    expect(apiMocks.createResumeImport).toHaveBeenCalledWith(
      JOB.slug,
      'web-idempotency-123456',
      'A'.repeat(43),
      expect.any(String),
      undefined,
    );
    expect(apiMocks.uploadResumePdf).toHaveBeenCalledWith(
      CREATED_IMPORT,
      pdf,
      'web-idempotency-123456',
      'A'.repeat(43),
    );
    expect(screen.getByTestId('candidate-fullName')).toHaveValue('');
    expect(screen.getByTestId('candidate-resume-review')).not.toHaveTextContent('ornek-cv.pdf');

    fireEvent.click(screen.getByRole('button', { name: 'Güvenli önerileri kabul et' }));
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /Seçtiğim alanları forma aktar \(8\)/ }),
      ).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole('button', { name: /Seçtiğim alanları forma aktar/ }));

    expect(await screen.findByTestId('candidate-resume-meta')).toHaveTextContent(
      '8 alan forma aktarıldı',
    );
    expect(screen.getByTestId('candidate-fullName')).toHaveValue('PDF Demo Adayı');
    expect(screen.getByTestId('candidate-email')).toHaveValue('pdf.aday@example.test');
  });

  it('requires an explicit choice instead of overwriting a non-empty manual field', async () => {
    renderPage();
    await screen.findByRole('heading', { name: 'Ürün Yöneticisi' });
    fireEvent.change(screen.getByTestId('candidate-fullName'), {
      target: { value: 'Elle Yazılan Aday' },
    });
    await selectPdf();
    fireEvent.click(screen.getByRole('button', { name: 'Güvenli önerileri kabul et' }));
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /Seçtiğim alanları forma aktar \(8\)/ }),
      ).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole('button', { name: /Seçtiğim alanları forma aktar/ }));

    expect(await screen.findByTestId('resume-merge-conflicts')).toHaveTextContent(
      'Elle Yazılan Aday',
    );
    expect(screen.getByTestId('candidate-fullName')).toHaveValue('Elle Yazılan Aday');
    fireEvent.click(screen.getByLabelText(/CV değerini kullan:/i));
    fireEvent.click(screen.getByRole('button', { name: 'Seçimleri forma uygula' }));
    expect(screen.getByTestId('candidate-fullName')).toHaveValue('PDF Demo Adayı');
  });

  it('lets the candidate combine and edit a manual value with a CV proposal', async () => {
    renderPage();
    await screen.findByRole('heading', { name: 'Ürün Yöneticisi' });
    fireEvent.change(screen.getByTestId('candidate-fullName'), {
      target: { value: 'Elle Yazılan Aday' },
    });
    await selectPdf();
    fireEvent.click(screen.getByRole('button', { name: 'Güvenli önerileri kabul et' }));
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /Seçtiğim alanları forma aktar \(8\)/ }),
      ).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole('button', { name: /Seçtiğim alanları forma aktar/ }));
    await screen.findByTestId('resume-merge-conflicts');

    fireEvent.click(screen.getByLabelText('Birleştirip düzenle'));
    fireEvent.change(screen.getByLabelText('Birleşik değer'), {
      target: { value: 'Adayın birleştirip doğruladığı ad' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Seçimleri forma uygula' }));
    expect(screen.getByTestId('candidate-fullName')).toHaveValue(
      'Adayın birleştirip doğruladığı ad',
    );
  });

  it('reloads and visibly presents the current proposal state after a stale-version conflict', async () => {
    apiMocks.updateResumeProposal.mockRejectedValueOnce(new Error('VERSION_CONFLICT'));
    renderPage();
    await selectPdf();
    fireEvent.click(screen.getAllByRole('button', { name: 'Öneriyi kabul et' })[0]);

    expect(await screen.findByRole('alert')).toHaveTextContent('Güncel kararlar yüklendi');
    expect(apiMocks.getResumeImport).toHaveBeenCalledWith(CREATED_IMPORT.importId, 'A'.repeat(43));
    expect(screen.getByTestId('candidate-resume-review')).toBeVisible();
  });

  it('keeps the manual form enabled while the PDF backend is still processing', async () => {
    let resolveUpload: (value: unknown) => void = () => undefined;
    apiMocks.uploadResumePdf.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveUpload = resolve;
      }),
    );
    renderPage();
    await screen.findByRole('heading', { name: 'Ürün Yöneticisi' });
    fireEvent.click(screen.getByLabelText(/CV içe aktarma aydınlatmasını okudum/i));
    fireEvent.change(screen.getByTestId('candidate-resume'), {
      target: { files: [new File(['%PDF'], 'yavas.pdf', { type: 'application/pdf' })] },
    });

    expect(await screen.findByTestId('candidate-resume-parsing')).toBeVisible();
    expect(screen.getByTestId('candidate-fullName')).toBeEnabled();
    fireEvent.change(screen.getByTestId('candidate-fullName'), { target: { value: 'Form Açık' } });
    expect(screen.getByTestId('candidate-fullName')).toHaveValue('Form Açık');

    await act(async () => {
      resolveUpload({ resumeImport: UPLOADED_IMPORT, inFlight: false });
    });
    expect(await screen.findByTestId('candidate-resume-review')).toBeVisible();
  });

  it('focuses a backend PDF error and leaves manual application available', async () => {
    apiMocks.uploadResumePdf.mockRejectedValueOnce(new Error('UNSUPPORTED_IN_GATE'));
    renderPage();
    await screen.findByRole('heading', { name: 'Ürün Yöneticisi' });
    fireEvent.click(screen.getByLabelText(/CV içe aktarma aydınlatmasını okudum/i));
    fireEvent.change(screen.getByTestId('candidate-resume'), {
      target: { files: [new File(['%PDF'], 'gercek.pdf', { type: 'application/pdf' })] },
    });
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('UNSUPPORTED_IN_GATE');
    expect(alert).toHaveFocus();
    expect(screen.getByTestId('candidate-fullName')).toBeEnabled();
  });

  it('requires low-confidence fields to be edited or rejected, never accepted unchanged', async () => {
    apiMocks.uploadResumePdf.mockResolvedValueOnce({
      resumeImport: {
        ...UPLOADED_IMPORT,
        proposals: [
          {
            ...proposals[0],
            state: 'CONTROL_REQUIRED',
            provenance: { ...provenance, confidence: 0.41 },
          },
        ],
      },
      inFlight: false,
    });
    renderPage();
    await selectPdf();
    expect(screen.getByText('Elle kontrol gerekli')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Öneriyi kabul et' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Seçtiğim alanları forma aktar/ })).toBeDisabled();
  });

  it('terminates and purges all transient proposals after explicit reject-all confirmation', async () => {
    renderPage();
    await selectPdf();
    fireEvent.click(screen.getByRole('button', { name: 'Tümünü reddet' }));
    expect(screen.getByRole('alertdialog')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Evet, tümünü reddet' }));
    await waitFor(() => expect(apiMocks.terminateResumeImport).toHaveBeenCalled());
    expect(screen.queryByTestId('candidate-resume-review')).not.toBeInTheDocument();
    expect(screen.getByTestId('candidate-fullName')).toBeEnabled();
  });

  it('blocks preview when required fields are missing', async () => {
    renderPage();
    await screen.findByRole('heading', { name: 'Ürün Yöneticisi' });
    fireEvent.click(screen.getByRole('button', { name: 'Başvuruyu önizle' }));
    expect(screen.getByRole('alert')).toHaveTextContent('yıldızlı alanları doldurun');
  });

  it('blocks real candidate PII while the test environment G0 gate is active', async () => {
    renderPage();
    await screen.findByRole('heading', { name: 'Ürün Yöneticisi' });
    fireEvent.click(screen.getByTestId('fill-synthetic-resume'));
    fireEvent.change(screen.getByLabelText(/E-posta/i), {
      target: { value: 'gercek.aday@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Başvuruyu önizle' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Yalnız .test uzantılı sentetik e-posta');
    expect(apiMocks.submitApplication).not.toHaveBeenCalled();
  });

  it('shows a service error and keeps persistent submission disabled if the job cannot load', async () => {
    apiMocks.getPublicJob.mockRejectedValueOnce(new Error('ilan yok'));
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent('ilan yok');
    fireEvent.click(screen.getByTestId('fill-synthetic-resume'));
    fireEvent.click(screen.getByRole('button', { name: 'Başvuruyu önizle' }));
    screen.getAllByRole('checkbox').forEach((checkbox) => fireEvent.click(checkbox));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Başvuruyu gönder' })).toBeDisabled(),
    );
  });
});
