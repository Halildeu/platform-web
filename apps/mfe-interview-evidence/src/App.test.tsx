import { beforeEach, describe, expect, test } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import App from './App';
import { resetDemoDsar } from './dsar/demoDsarEngine';
import { resetDemoIngest } from './ingest/demoIngestEngine';
import { resetDemoEngine } from './review/demoReviewEngine';
import { resetDemoTranscripts } from './transcripts/demoTranscriptRegistry';

beforeEach(() => {
  resetDemoDsar();
  resetDemoIngest();
  resetDemoEngine();
  resetDemoTranscripts();
});

const typeInto = (testId: string, value: string) => {
  const el = screen.getByTestId(testId);
  const input = el.querySelector('input') ?? el;
  fireEvent.change(input, { target: { value } });
};

const selectConsentState = (value: string) => {
  const wrap = screen.getByTestId('consent-state-select');
  const select = wrap.tagName === 'SELECT' ? wrap : (wrap.querySelector('select') ?? wrap);
  fireEvent.change(select, { target: { value } });
};

/** F1/F2 mutlu yol: GRANTED beyan → yükleme → transcribe; üretilen anahtarı döner. */
async function grantUploadTranscribe(): Promise<string> {
  typeInto('consent-subject-input', 'sub-opak-app');
  selectConsentState('GRANTED');
  fireEvent.click(screen.getByTestId('consent-save-button'));
  const file = new File(['demo-ses-baytlari'], 'gorusme.wav', { type: 'audio/wav' });
  fireEvent.change(screen.getByTestId('upload-file-input'), { target: { files: [file] } });
  fireEvent.click(screen.getByTestId('upload-button'));
  await waitFor(() => expect(screen.getByTestId('upload-receipt')).toBeInTheDocument());
  fireEvent.click(screen.getByTestId('transcribe-button'));
  await waitFor(() => expect(screen.getByTestId('transcribed-badge')).toBeInTheDocument());
  const badgeText = screen.getByTestId('transcribed-badge').textContent ?? '';
  const key = badgeText.replace(/^.*Transkript üretildi:\s*/, '').trim();
  expect(key).toMatch(/^tr-/);
  return key;
}

const eraseSelectedTranscript = () => {
  typeInto('dsar-subject-input', 'sub-opak-9');
  typeInto('dsar-reason-input', 'r-kvkk-m11');
  fireEvent.click(screen.getByTestId('dsar-receive-button'));
  fireEvent.click(screen.getByTestId('dsar-erase-button')); // 1. tik: uyarı
  fireEvent.click(screen.getByTestId('dsar-erase-button')); // 2. tik: yürüt
};

describe('InterviewEvidenceApp', () => {
  test('baslik + demo-veri siniri rozeti + F-liste + F3 segment listesini render eder', () => {
    render(<App />);

    // Urun basligi
    expect(screen.getByText('Mülakat Kanıt Platformu')).toBeInTheDocument();

    // ATS-0016 durust sinir: demo-veri rozeti gorunur
    expect(screen.getByText(/Demo veri/)).toBeInTheDocument();

    // F-liste: demo transkript listede ve secili (39c-7)
    expect(screen.getByTestId('transcript-list')).toBeInTheDocument();
    expect(screen.getByTestId('transcript-select-tr-demo-1')).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    // design-system'den turetilmis Segment View mount oldu (demo segmentler)
    expect(screen.getByTestId('segment-list')).toBeInTheDocument();
    expect(screen.getByTestId('segment-0')).toBeInTheDocument();
  });

  test('F10 silme: iki-adimli onay sonrasi ICERIK YUZEYLERI kaldirilir + makbuz karti gelir; liste denetim icin KALIR', () => {
    render(<App />);
    // once icerik yuzeyleri var
    expect(screen.getByTestId('segment-list')).toBeInTheDocument();
    expect(screen.getByTestId('review-workspace')).toBeInTheDocument();

    eraseSelectedTranscript();

    // icerik yuzeyleri KALKTI (kanonik davranis) — makbuz karti geldi
    expect(screen.queryByTestId('segment-list')).not.toBeInTheDocument();
    expect(screen.queryByTestId('review-workspace')).not.toBeInTheDocument();
    expect(screen.queryByTestId('dsar-panel')).not.toBeInTheDocument();
    expect(screen.getByTestId('erasure-receipt')).toBeInTheDocument();
    expect(screen.getByText(/WORM defteri silinmez/)).toBeInTheDocument();

    // riza paneli (bu dar silme kapsami DISINDA) KALIR
    expect(screen.getByTestId('consent-recording-panel')).toBeInTheDocument();

    // 39c-7: silinen girdi listeden DUSMEZ — SILINDI rozetiyle denetim icin kalir
    expect(screen.getByTestId('transcript-list')).toBeInTheDocument();
    expect(screen.getByTestId('transcript-erased-tr-demo-1')).toHaveTextContent('SİLİNDİ');
  });

  test('39c-7 F-liste baglama: yuklemeden uretilen transkript listeye duser, OTOMATIK secilir, yuzeyler ONA baglanir', async () => {
    render(<App />);
    const key = await grantUploadTranscribe();

    // listeye dustu + otomatik secildi (urun akisi: inceleme hattina akis)
    expect(screen.getByTestId(`transcript-select-${key}`)).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('transcript-select-tr-demo-1')).toHaveAttribute(
      'aria-pressed',
      'false',
    );

    // F3 secili transkriptin segmentini gosterir (durust yer-tutucu; gercek STT 39d)
    expect(screen.getByText(/39d canlı STT hattında/)).toBeInTheDocument();

    // F4 kanit-baglama: ayni iddia INGEST transkriptinde SUPPORTED...
    typeInto('claim-input', 'yer tutucu kanıt transkript');
    fireEvent.click(screen.getByTestId('cite-button'));
    expect(screen.getByText('DESTEKLENİYOR')).toBeInTheDocument();

    // ...demo transkripte gecince AYNI iddia NOT_SUPPORTED (baglama kaniti)
    fireEvent.click(screen.getByTestId('transcript-select-tr-demo-1'));
    typeInto('claim-input', 'yer tutucu kanıt transkript');
    fireEvent.click(screen.getByTestId('cite-button'));
    expect(screen.getByText('DESTEKLENMİYOR')).toBeInTheDocument();
  });

  test('39c-7 transkript-BASINA silme: demo silinir, yukleme transkripti TAM CALISIR kalir', async () => {
    render(<App />);
    const key = await grantUploadTranscribe();

    // demo transkripti sec ve sil
    fireEvent.click(screen.getByTestId('transcript-select-tr-demo-1'));
    eraseSelectedTranscript();
    expect(screen.getByTestId('erasure-receipt')).toBeInTheDocument();
    expect(screen.getByTestId('transcript-erased-tr-demo-1')).toBeInTheDocument();

    // diger transkript ETKILENMEZ: secilince tam icerik yuzeyleri acilir
    fireEvent.click(screen.getByTestId(`transcript-select-${key}`));
    expect(screen.queryByTestId('erasure-receipt')).not.toBeInTheDocument();
    expect(screen.getByTestId('segment-list')).toBeInTheDocument();
    expect(screen.getByTestId('review-workspace')).toBeInTheDocument();
    expect(screen.getByTestId('dsar-panel')).toBeInTheDocument();
    expect(screen.queryByTestId(`transcript-erased-${key}`)).not.toBeInTheDocument();
  });
});
