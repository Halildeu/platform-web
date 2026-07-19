import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import App from './App';
import * as api from './ethics-api';

vi.mock('./ethics-api');
const summary = {
  id: '11111111-1111-1111-1111-111111111111',
  status: 'NEW',
  assignedTo: null,
  version: 0,
  createdAt: '2026-07-18T12:00:00Z',
  updatedAt: '2026-07-18T12:00:00Z',
};
const detail = {
  ...summary,
  mode: 'ANONYMOUS',
  category: 'WORKPLACE_CONDUCT',
  subject: 'Sentetik bildirim',
  description: 'Sentetik anlatım',
  messages: [],
};

describe('Etik Speak manager MFE', () => {
  beforeEach(() => {
    vi.mocked(api.listCases).mockResolvedValue([summary]);
    vi.mocked(api.getCase).mockResolvedValue(detail);
    vi.mocked(api.updateCase).mockResolvedValue(summary);
    vi.mocked(api.replyToReporter).mockResolvedValue({
      id: 'm1',
      authorType: 'STAFF',
      visibility: 'REPORTER_VISIBLE',
      body: 'Yanıt',
      createdAt: '2026-07-18T12:01:00Z',
    });
    vi.mocked(api.addInternalNote).mockResolvedValue({
      id: 'm2',
      authorType: 'STAFF',
      visibility: 'INTERNAL',
      body: 'İç not',
      createdAt: '2026-07-18T12:02:00Z',
    });
  });
  test('authorized case list and detail render', async () => {
    render(<App />);
    expect(await screen.findByRole('button', { name: /#11111111/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /#11111111/ }));
    expect(await screen.findByRole('heading', { name: 'Sentetik bildirim' })).toBeInTheDocument();
    expect(screen.getByText('Sentetik anlatım')).toBeInTheDocument();
  });
  test('staff reply owns a stable operation key in the UI', async () => {
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: /#11111111/ }));
    await userEvent.type(await screen.findByLabelText("Reporter'a güvenli yanıt"), 'Güvenli yanıt');
    await userEvent.click(screen.getByRole('button', { name: 'Yanıtı gönder' }));
    await waitFor(() =>
      expect(api.replyToReporter).toHaveBeenCalledWith(
        summary.id,
        'Güvenli yanıt',
        expect.any(String),
      ),
    );
  });
  test('assignment and internal note are explicit staff operations', async () => {
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: /#11111111/ }));
    await userEvent.type(screen.getByLabelText('Yetkili ataması'), 'team:ethics');
    await userEvent.click(screen.getByRole('button', { name: 'Atamayı kaydet' }));
    await waitFor(() =>
      expect(api.updateCase).toHaveBeenCalledWith(summary.id, 0, { assignedTo: 'team:ethics' }),
    );
    await userEvent.type(screen.getByLabelText('Yetkili ekip notu'), 'Reporter görmemeli');
    await userEvent.click(screen.getByRole('button', { name: 'İç notu kaydet' }));
    await waitFor(() =>
      expect(api.addInternalNote).toHaveBeenCalledWith(
        summary.id,
        'Reporter görmemeli',
        expect.any(String),
      ),
    );
  });
  test('authorization loss removes previously rendered sensitive case data', async () => {
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: /#11111111/ }));
    expect(await screen.findByText('Sentetik anlatım')).toBeInTheDocument();
    vi.mocked(api.listCases).mockRejectedValueOnce({ response: { status: 401 } });
    await userEvent.click(screen.getByRole('button', { name: 'Yenile' }));
    await waitFor(() => expect(screen.queryByText('Sentetik anlatım')).not.toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /#11111111/ })).not.toBeInTheDocument();
  });
  test('object-level 404 deny removes previously rendered sensitive case data', async () => {
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: /#11111111/ }));
    expect(await screen.findByText('Sentetik anlatım')).toBeInTheDocument();
    vi.mocked(api.listCases).mockRejectedValueOnce({ response: { status: 404 } });
    await userEvent.click(screen.getByRole('button', { name: 'Yenile' }));
    await waitFor(() => expect(screen.queryByText('Sentetik anlatım')).not.toBeInTheDocument());
    expect(screen.getByRole('alert')).toHaveTextContent(/bulunamadı.*yetkisi/i);
  });
  test('late case response cannot replace the most recently selected case', async () => {
    const second = {
      ...summary,
      id: '22222222-2222-2222-2222-222222222222',
      subject: 'İkinci sentetik vaka',
    };
    vi.mocked(api.listCases).mockResolvedValueOnce([summary, second]);
    let resolveFirst!: (value: typeof detail) => void;
    let resolveSecond!: (value: typeof detail) => void;
    const firstRequest = new Promise<typeof detail>((resolve) => (resolveFirst = resolve));
    const secondRequest = new Promise<typeof detail>((resolve) => (resolveSecond = resolve));
    vi.mocked(api.getCase).mockImplementation((id) =>
      id === summary.id ? firstRequest : secondRequest,
    );
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: /#11111111/ }));
    await userEvent.click(screen.getByRole('button', { name: /#22222222/ }));
    resolveSecond({ ...detail, ...second });
    expect(
      await screen.findByRole('heading', { name: 'İkinci sentetik vaka' }),
    ).toBeInTheDocument();
    resolveFirst(detail);
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'Sentetik bildirim' })).not.toBeInTheDocument(),
    );
  });
});
