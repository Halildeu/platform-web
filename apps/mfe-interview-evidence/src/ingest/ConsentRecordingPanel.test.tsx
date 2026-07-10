import { beforeEach, describe, expect, test } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ConsentRecordingPanel } from './ConsentRecordingPanel';
import { resetDemoIngest } from './demoIngestEngine';

beforeEach(() => resetDemoIngest());

const typeInto = (testId: string, value: string) => {
  const el = screen.getByTestId(testId);
  const input = el.querySelector('input') ?? el;
  fireEvent.change(input, { target: { value } });
};

const selectState = (value: string) => {
  const wrap = screen.getByTestId('consent-state-select');
  const select = wrap.tagName === 'SELECT' ? wrap : (wrap.querySelector('select') ?? wrap);
  fireEvent.change(select, { target: { value } });
};

const pickFile = (name: string, type: string, sizeBytes: number) => {
  const file = new File([new ArrayBuffer(sizeBytes)], name, { type });
  fireEvent.change(screen.getByTestId('upload-file-input'), { target: { files: [file] } });
};

describe('ConsentRecordingPanel (F1/F2 demo akışı)', () => {
  test('açık-rıza UX: ön-seçili durum yok → kaydet düğmesi disabled', () => {
    render(<ConsentRecordingPanel />);
    typeInto('consent-subject-input', 'sub-opak-1');
    expect(screen.getByTestId('consent-save-button')).toBeDisabled();
  });

  test('mutlu yol: GRANTED beyan → yükleme makbuzu → transcribe rozeti', () => {
    render(<ConsentRecordingPanel />);
    typeInto('consent-subject-input', 'sub-opak-1');
    selectState('GRANTED');
    fireEvent.click(screen.getByTestId('consent-save-button'));
    expect(screen.getByTestId('consent-saved')).toHaveTextContent('GRANTED');

    pickFile('gorusme.wav', 'audio/wav', 2048);
    fireEvent.click(screen.getByTestId('upload-button'));
    expect(screen.getByTestId('upload-receipt')).toBeInTheDocument();
    expect(screen.getByText(/defter sırası 1/)).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('transcribe-button'));
    expect(screen.getByTestId('transcribed-badge')).toHaveTextContent(/^Transkript üretildi: tr-/);
    // idempotency UI kilidi: düğme kaybolur
    expect(screen.queryByTestId('transcribe-button')).not.toBeInTheDocument();
  });

  test('rıza-kapısı: DENIED beyanla yükleme hatası görünür, makbuz YOK', () => {
    render(<ConsentRecordingPanel />);
    typeInto('consent-subject-input', 'sub-opak-1');
    selectState('DENIED');
    fireEvent.click(screen.getByTestId('consent-save-button'));

    pickFile('gorusme.wav', 'audio/wav', 2048);
    fireEvent.click(screen.getByTestId('upload-button'));
    expect(screen.getByTestId('ingest-error')).toHaveTextContent(/DENIED/);
    expect(screen.queryByTestId('upload-receipt')).not.toBeInTheDocument();
  });

  test('beyansız yükleme reddi de açık gösterilir (fail-closed)', () => {
    render(<ConsentRecordingPanel />);
    pickFile('gorusme.wav', 'audio/wav', 2048);
    fireEvent.click(screen.getByTestId('upload-button'));
    expect(screen.getByTestId('ingest-error')).toHaveTextContent(/rıza-kapısı/i);
  });
});
