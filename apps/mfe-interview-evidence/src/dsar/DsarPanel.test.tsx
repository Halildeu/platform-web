import { beforeEach, describe, expect, test, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { DsarPanel } from './DsarPanel';
import { resetDemoDsar } from './demoDsarEngine';

beforeEach(() => resetDemoDsar());

const typeInto = (testId: string, value: string) => {
  const el = screen.getByTestId(testId);
  const input = el.querySelector('input') ?? el;
  fireEvent.change(input, { target: { value } });
};

const intake = () => {
  typeInto('dsar-subject-input', 'sub-opak-9');
  typeInto('dsar-reason-input', 'r-kvkk-m11');
  fireEvent.click(screen.getByTestId('dsar-receive-button'));
};

describe('DsarPanel (F10 demo akışı)', () => {
  test('intake: alanlar boşken kaydet disabled; kayıt sonrası dsarKey rozeti', () => {
    render(<DsarPanel transcriptKey="tr-demo-1" onErased={() => {}} />);
    expect(screen.getByTestId('dsar-receive-button')).toBeDisabled();
    intake();
    expect(screen.getByTestId('dsar-key-badge')).toBeInTheDocument();
    expect(screen.getByTestId('dsar-key')).toHaveTextContent(/^dsar-\d{4}$/);
  });

  test('İKİ-ADIMLI yıkıcı onay: İLK tık YÜRÜTMEZ (uyarı açılır), ikinci tık yürütür', () => {
    const onErased = vi.fn();
    render(<DsarPanel transcriptKey="tr-demo-1" onErased={onErased} />);
    intake();

    // ilk tık: yalnız uyarı — silme YOK
    fireEvent.click(screen.getByTestId('dsar-erase-button'));
    expect(screen.getByTestId('dsar-erase-warning')).toBeInTheDocument();
    expect(onErased).not.toHaveBeenCalled();

    // ikinci tık: yürütür — makbuz dar kapsamla döner
    fireEvent.click(screen.getByTestId('dsar-erase-button'));
    expect(onErased).toHaveBeenCalledTimes(1);
    expect(onErased.mock.calls[0][0]).toMatchObject({
      tombstoneCount: 0,
      deletedContentCount: 1,
      caseTransitioned: false,
    });
  });
});
