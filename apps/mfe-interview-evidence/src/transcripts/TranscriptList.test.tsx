import { describe, expect, test, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { TranscriptList } from './TranscriptList';
import type { TranscriptEntry } from './types';

const entries: TranscriptEntry[] = [
  {
    transcriptKey: 'tr-demo-1',
    label: 'Demo görüşme (S1/S2)',
    origin: 'DEMO',
    segments: [],
    erasure: null,
  },
  {
    transcriptKey: 'tr-abc',
    label: 'Yükleme ev-abc',
    origin: 'INGEST',
    segments: [],
    erasure: {
      dsarKey: 'dsar-0001',
      tombstoneCount: 0,
      deletedContentCount: 1,
      caseTransitioned: false,
    },
  },
];

describe('TranscriptList (F-liste seçim yüzeyi, 39c-7)', () => {
  test('girdileri etiket + anahtar + köken rozetiyle listeler; seçili aria-pressed', () => {
    render(<TranscriptList transcripts={entries} selectedKey="tr-demo-1" onSelect={() => {}} />);
    expect(screen.getByTestId('transcript-list-panel')).toHaveStyle({
      gridTemplateColumns: 'minmax(0, 1fr)',
      minWidth: 0,
      width: '100%',
    });
    expect(screen.getByTestId('transcript-list')).toBeInTheDocument();
    expect(screen.getByTestId('transcript-select-tr-demo-1')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByTestId('transcript-select-tr-abc')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('transcript-select-tr-demo-1')).toHaveStyle({
      minWidth: 0,
      maxWidth: '100%',
      height: 'auto',
      minHeight: '2.25rem',
      paddingBlock: '0.5rem',
      whiteSpace: 'normal',
      overflowWrap: 'anywhere',
    });
    expect(screen.getByText('Demo')).toBeInTheDocument();
    expect(screen.getByText('Yükleme')).toBeInTheDocument();
  });

  test('silinmiş girdi listeden DÜŞMEZ: SİLİNDİ rozetiyle görünür ve hâlâ seçilebilir', () => {
    const onSelect = vi.fn();
    render(<TranscriptList transcripts={entries} selectedKey="tr-demo-1" onSelect={onSelect} />);
    expect(screen.getByTestId('transcript-erased-tr-abc')).toHaveTextContent('SİLİNDİ');
    fireEvent.click(screen.getByTestId('transcript-select-tr-abc'));
    expect(onSelect).toHaveBeenCalledWith('tr-abc');
  });
});
