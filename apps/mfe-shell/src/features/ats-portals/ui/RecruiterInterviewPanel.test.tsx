// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import RecruiterInterviewPanel from './RecruiterInterviewPanel';

const apiMocks = vi.hoisted(() => ({
  listRecruiterInterviews: vi.fn(),
  createRecruiterInterview: vi.fn(),
  rescheduleRecruiterInterview: vi.fn(),
  transitionRecruiterInterview: vi.fn(),
  submitInterviewScorecard: vi.fn(),
  createApplicationIdempotencyKey: vi.fn(() => 'web-interview-command-1234'),
}));

vi.mock('../api/application-api', () => ({
  listRecruiterInterviews: apiMocks.listRecruiterInterviews,
  createRecruiterInterview: apiMocks.createRecruiterInterview,
  rescheduleRecruiterInterview: apiMocks.rescheduleRecruiterInterview,
  transitionRecruiterInterview: apiMocks.transitionRecruiterInterview,
  submitInterviewScorecard: apiMocks.submitInterviewScorecard,
  createApplicationIdempotencyKey: apiMocks.createApplicationIdempotencyKey,
}));

const PUBLIC_REF = 'app_abcdefghijklmnopqrstuvwx';
const INTERVIEW = {
  interviewId: 'int_abcdefghijklmnopqrstuvwx',
  applicationPublicRef: PUBLIC_REF,
  jobSlug: 'urun-yoneticisi',
  jobTitle: 'Ürün Yöneticisi',
  candidateName: 'Deniz Sentetik',
  type: 'SCREENING',
  startsAt: '2026-07-20T07:00:00Z',
  endsAt: '2026-07-20T08:00:00Z',
  timeZone: 'Europe/Istanbul',
  mode: 'VIDEO',
  location: 'https://meet.example.test/sentetik',
  status: 'SCHEDULED',
  version: 0,
  participants: [
    { actorRef: 'user:test-recruiter', displayLabel: 'Atanmış İK görüşmecisi', role: 'LEAD' },
  ],
  criteria: [
    {
      key: 'role_problem_solving',
      label: 'İşle ilgili problem çözme',
      question: 'İşle ilgili zor bir problemi nasıl çözdünüz?',
      evidencePrompt: 'Somut iş kanıtını kaydedin.',
    },
  ],
  scorecards: [],
  scheduleHistory: [],
  createdAt: '2026-07-18T10:00:00Z',
  updatedAt: '2026-07-18T10:00:00Z',
};

const renderPanel = () =>
  render(
    <RecruiterInterviewPanel
      publicRef={PUBLIC_REF}
      applicationStatus="INTERVIEW_PENDING"
      canManage
      interviewerActorRef="user:test-recruiter"
      interviewerLabel="Atanmış İK görüşmecisi"
      onApplicationRefresh={vi.fn().mockResolvedValue(undefined)}
    />,
  );

describe('RecruiterInterviewPanel', () => {
  beforeEach(() => {
    apiMocks.listRecruiterInterviews.mockResolvedValue([]);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  describe('server rejections stay visible (#963)', () => {
    // Hata yolu mesajı yazıyor, ardından çağrılan yenileme mesajı siliyordu: İK düğmeye
    // basınca hiçbir şey görmüyordu. Her komut için sunucu gerekçesi ekranda kalmalı.
    const REASON = 'sunucu bu işlemi reddetti: sentetik gerekçe';

    it('keeps the reason after a rejected schedule', async () => {
      apiMocks.createRecruiterInterview.mockRejectedValue(new Error(REASON));
      renderPanel();
      fireEvent.click(await screen.findByRole('button', { name: 'Yeni görüşme planla' }));
      fireEvent.click(screen.getByRole('button', { name: 'Görüşmeyi kalıcı olarak planla' }));

      await waitFor(() => expect(apiMocks.listRecruiterInterviews).toHaveBeenCalledTimes(2));
      expect(await screen.findByRole('alert')).toHaveTextContent(REASON);
    });

    it('keeps the reason after a rejected reschedule', async () => {
      apiMocks.listRecruiterInterviews.mockResolvedValue([INTERVIEW]);
      apiMocks.rescheduleRecruiterInterview.mockRejectedValue(new Error(REASON));
      renderPanel();
      fireEvent.click(await screen.findByRole('button', { name: 'Yeniden planla' }));
      fireEvent.change(screen.getByLabelText('Değişiklik gerekçesi'), {
        target: { value: 'Sentetik yeniden planlama gerekçesi' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Yeni revizyonu kaydet' }));

      await waitFor(() => expect(apiMocks.listRecruiterInterviews).toHaveBeenCalledTimes(2));
      expect(await screen.findByRole('alert')).toHaveTextContent(REASON);
    });

    it('keeps the reason after a rejected completion', async () => {
      apiMocks.listRecruiterInterviews.mockResolvedValue([INTERVIEW]);
      apiMocks.transitionRecruiterInterview.mockRejectedValue(new Error(REASON));
      renderPanel();
      fireEvent.click(await screen.findByRole('button', { name: 'Görüşmeyi tamamla' }));
      fireEvent.change(screen.getByRole('textbox', { name: 'Gerekçe' }), {
        target: { value: 'Sentetik görüşme tamamlandı.' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'İnsan eylemini kaydet' }));

      await waitFor(() => expect(apiMocks.listRecruiterInterviews).toHaveBeenCalledTimes(2));
      expect(await screen.findByRole('alert')).toHaveTextContent(REASON);
    });

    it('keeps the reason after a rejected scorecard', async () => {
      apiMocks.listRecruiterInterviews.mockResolvedValue([INTERVIEW]);
      apiMocks.submitInterviewScorecard.mockRejectedValue(new Error(REASON));
      renderPanel();
      fireEvent.click(await screen.findByRole('button', { name: 'İnsan scorecard’ı doldur' }));
      fireEvent.change(screen.getByLabelText('Kanıt düzeyi (1–4)'), { target: { value: '3' } });
      fireEvent.change(screen.getByLabelText('Somut iş kanıtı'), {
        target: { value: 'Sentetik ve işle ilgili görüşme kanıtı.' },
      });
      fireEvent.change(screen.getByLabelText('Genel gerekçe'), {
        target: { value: 'Sentetik insan görüşme değerlendirmesi gerekçesi.' },
      });
      fireEvent.click(screen.getByLabelText(/Değerlendirme yalnız işle ilgili rubric/i));
      fireEvent.click(screen.getByRole('button', { name: 'Immutable scorecard’ı kaydet' }));

      await waitFor(() => expect(apiMocks.listRecruiterInterviews).toHaveBeenCalledTimes(2));
      expect(await screen.findByRole('alert')).toHaveTextContent(REASON);
    });
  });
});
