import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import App from './App';
import { acknowledgementDraft } from './case-lifecycle';
import * as api from './ethics-api';

vi.mock('./ethics-api');
const summary: api.EthicsCaseSummary = {
  id: '11111111-1111-1111-1111-111111111111',
  status: 'NEW',
  legacyAssignmentLabel: null,
  version: 0,
  createdAt: '2026-07-18T12:00:00Z',
  updatedAt: '2026-07-18T12:00:00Z',
  acknowledgedAt: null,
  outcome: null,
  closedAt: null,
  subject: 'Sentetik bildirim',
  category: 'WORKPLACE_CONDUCT',
  mode: 'ANONYMOUS',
  participantCount: 0,
};
const detail: api.EthicsCaseDetail = {
  ...summary,
  // The detail always has a report behind it, so these narrow to non-null here.
  mode: 'ANONYMOUS',
  category: 'WORKPLACE_CONDUCT',
  subject: 'Sentetik bildirim',
  description: 'Sentetik anlatım',
  messages: [],
};
const scanningEvidence = {
  attachmentId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  state: 'SCANNING' as const,
  mediaType: 'image/png',
  size: null,
  createdAt: '2026-07-18T12:03:00Z',
  derivativeAvailable: false,
};
const availableEvidence = {
  attachmentId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  state: 'AVAILABLE' as const,
  mediaType: 'image/png',
  size: 2048,
  createdAt: '2026-07-18T12:04:00Z',
  derivativeAvailable: true,
};

describe('Etik Speak manager MFE', () => {
  beforeEach(() => {
    vi.mocked(api.listCases).mockResolvedValue([summary]);
    vi.mocked(api.getCase).mockResolvedValue(detail);
    vi.mocked(api.listCaseEvidence).mockResolvedValue([]);
    // ES-213 (#3375). vi.mock auto-mocks the whole module, so these answer undefined
    // unless stubbed — and the panels read .length on the result. In production the API
    // client validates the shape and throws, so undefined can never reach state there;
    // this is purely the auto-mock's shape.
    vi.mocked(api.listCaseSanctions).mockResolvedValue([]);
    vi.mocked(api.listRetaliationChecks).mockResolvedValue([]);
    // The two constants are not functions, and vi.mock empties the array and hollows out
    // the Set. Left alone, AUTOMATIC_ESCALATIONS.has() answers undefined and every
    // assertion about the escalation floor passes for the wrong reason — which is how the
    // rule went dormant in the first place, so it is restored explicitly here.
    vi.spyOn(api, 'VIOLATION_CATEGORIES', 'get').mockReturnValue([
      { code: 'PUBLIC_OFFICIAL_BRIBERY', label: 'Kamu görevlisine rüşvet' },
      { code: 'EXPENSE_IRREGULARITY', label: 'Masraf/harcama usulsüzlüğü' },
    ]);
    vi.spyOn(api, 'AUTOMATIC_ESCALATIONS', 'get')
      .mockReturnValue(new Set(['PUBLIC_OFFICIAL_BRIBERY']));
    // bandForScore is auto-mocked too, so it has been answering undefined all along: the
    // derived-band line reads "Puan 1–40 aralığında olmalı" in every test that has ever
    // rendered the sanction form. Restored to the real mapping so assertions about the
    // band mean something.
    vi.mocked(api.bandForScore).mockImplementation((score: number) =>
      score >= 1 && score <= 10 ? 'HAFIF'
        : score >= 11 && score <= 20 ? 'ORTA'
          : score >= 21 && score <= 30 ? 'AGIR'
            : score >= 31 && score <= 40 ? 'COK_AGIR' : null);
    vi.mocked(api.downloadCaseEvidence).mockResolvedValue(new Uint8Array([1, 2, 3]).buffer);
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
    vi.mocked(api.listCaseParticipants).mockResolvedValue([]);
    vi.mocked(api.listCaseTimeline).mockResolvedValue([]);
    vi.mocked(api.listAssignableStaff).mockResolvedValue([
      { handle: 'v1.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA1', displayName: 'Ayşe Yılmaz' },
      { handle: 'v1.BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB2', displayName: 'Ayşe Yılmaz' },
    ]);
    vi.mocked(api.addCaseParticipant).mockResolvedValue(undefined);
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn().mockReturnValue('blob:synthetic-derivative'),
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: vi.fn(),
    });
  });
  test('authorized case list and detail render', async () => {
    render(<App />);
    expect(await screen.findByRole('button', { name: /#11111111/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /#11111111/ }));
    expect(await screen.findByRole('heading', { name: 'Sentetik bildirim' })).toBeInTheDocument();
    expect(screen.getByText('Sentetik anlatım')).toBeInTheDocument();
    expect(api.listCaseEvidence).toHaveBeenCalledWith(summary.id);
  });
  // A triage list has to answer "which of these first?" without opening any of them.
  // The row used to carry an id fragment, a status and a timestamp — enough to tell
  // cases apart, not enough to choose between them. These assert the four things that
  // change what a handler does, because a row that renders them and a row that renders
  // them *for the right case* are different, and only the second one is useful.
  test('the row says what the case is and what constrains it', async () => {
    const overdue = {
      ...summary,
      id: '33333333-3333-3333-3333-333333333333',
      subject: 'Depoda gece vardiyası baskısı',
      category: 'HARASSMENT_DISCRIMINATION',
      mode: 'ANONYMOUS',
      participantCount: 0,
      // Filed well past the seven-day acknowledgement window, never acknowledged.
      createdAt: new Date(Date.now() - 20 * 86_400_000).toISOString(),
      acknowledgedAt: null,
    };
    vi.mocked(api.listCases).mockResolvedValueOnce([overdue]);
    render(<App />);

    const row = await screen.findByRole('button', { name: /Depoda gece vardiyası baskısı/ });

    // The reporter picked this wording on the intake form; the handler reads the same words.
    expect(within(row).getByText('Taciz / ayrımcılık')).toBeInTheDocument();
    // No channel back to the reporter — it changes what the handler can do next.
    expect(within(row).getByText('Anonim')).toBeInTheDocument();
    // Nobody is on it. This is how a report goes unworked without anyone deciding so.
    expect(within(row).getByText('Sahipsiz')).toBeInTheDocument();
    expect(within(row).getByText('Teyit süresi geçti')).toBeInTheDocument();
    // Still addressable by id: that is how a case is referred to off this screen.
    expect(within(row).getByText(/33333333/i)).toBeInTheDocument();
  });

  test('a case that is owned and acknowledged carries neither warning', async () => {
    const healthy = {
      ...summary,
      id: '44444444-4444-4444-4444-444444444444',
      subject: 'Tedarikçi hediyesi bildirimi',
      participantCount: 2,
      createdAt: new Date(Date.now() - 20 * 86_400_000).toISOString(),
      acknowledgedAt: new Date(Date.now() - 19 * 86_400_000).toISOString(),
    };
    vi.mocked(api.listCases).mockResolvedValueOnce([healthy]);
    render(<App />);

    const row = await screen.findByRole('button', { name: /Tedarikçi hediyesi/ });

    expect(within(row).queryByText('Sahipsiz')).not.toBeInTheDocument();
    expect(within(row).queryByText('Teyit süresi geçti')).not.toBeInTheDocument();
  });

  // A malformed case — one with no report row behind it — is exactly the case that needs
  // attention. Rendering nothing for its subject would drop it off the list silently.
  test('a case with no readable subject still appears', async () => {
    vi.mocked(api.listCases).mockResolvedValueOnce([
      { ...summary, subject: null, category: null, mode: null },
    ]);
    render(<App />);

    expect(await screen.findByRole('button', { name: /Konu okunamadı/ })).toBeInTheDocument();
  });

  // The stylesheet pins the detail pane so a long case list can be scrolled without
  // losing sight of the case that was just opened. That rule keys off this class, and
  // a class that quietly stops being applied leaves no trace: the markup still renders,
  // the tests still pass, and the pane silently scrolls away again.
  test('the detail pane stays addressable by the rule that pins it', async () => {
    const { container } = render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: /#11111111/ }));
    await screen.findByRole('heading', { name: 'Sentetik bildirim' });

    const pane = container.querySelector('.ethics-detail-pane');
    expect(pane).not.toBeNull();
    expect(pane).toContainElement(screen.getByRole('heading', { name: 'Sentetik bildirim' }));
    // Pinning only works against a scrolling sibling, so the list must stay outside it.
    expect(pane).not.toContainElement(screen.getByRole('button', { name: /#11111111/ }));
  });
  test('only an available sanitized derivative can be downloaded', async () => {
    vi.mocked(api.listCaseEvidence).mockResolvedValueOnce([scanningEvidence, availableEvidence]);
    const anchorClick = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);

    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: /#11111111/ }));

    expect(await screen.findByText('Zararlı içerik taranıyor')).toBeInTheDocument();
    expect(screen.getByText('Güvenli türev hazır')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Güvenli türevi indir' })).toHaveLength(1);

    await userEvent.click(screen.getByRole('button', { name: 'Güvenli türevi indir' }));

    await waitFor(() =>
      expect(api.downloadCaseEvidence).toHaveBeenCalledWith(
        summary.id,
        availableEvidence.attachmentId,
      ),
    );
    expect(URL.createObjectURL).toHaveBeenCalledOnce();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:synthetic-derivative');
    expect(anchorClick).toHaveBeenCalledOnce();
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
  test('assignment goes through a case-scoped handle — no free-text label, no subject', async () => {
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: /#11111111/ }));

    // The retired free-text path must not come back: a label the authorization
    // plane cannot check is how `assigned_to` accumulated junk like `jbjb`.
    expect(screen.queryByLabelText('Yetkili ataması')).not.toBeInTheDocument();

    // Two colleagues share a name; the handle-derived short code keeps them
    // two visibly different choices.
    const picker = await screen.findByLabelText('Kişi ata');
    const options = within(picker).getAllByRole('option', { name: /Ayşe Yılmaz/ });
    expect(options).toHaveLength(2);
    expect(options[0].textContent).not.toEqual(options[1].textContent);

    await userEvent.selectOptions(picker, 'v1.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA1');
    await userEvent.selectOptions(screen.getByLabelText('Rol'), 'handler');
    await userEvent.click(screen.getByRole('button', { name: 'Davaya ekle' }));
    await waitFor(() =>
      expect(api.addCaseParticipant).toHaveBeenCalledWith(
        summary.id,
        'v1.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA1',
        'handler',
      ),
    );
  });
  test('a participant whose name cannot be resolved right now stays visible', async () => {
    vi.mocked(api.listCaseParticipants).mockResolvedValue([
      {
        handle: 'v1.CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC3',
        displayName: null,
        role: 'handler',
        addedAt: '2026-07-18T12:05:00Z',
      },
    ]);
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: /#11111111/ }));
    expect(await screen.findByText('Ad şu anda çözülemiyor')).toBeInTheDocument();
    const list = screen.getByRole('list', { name: 'Davadaki kişiler' });
    expect(within(list).getByText(/Vaka sorumlusu/)).toBeInTheDocument();
  });
  test('when the staff directory is down, assignment is visibly closed — not an empty team', async () => {
    vi.mocked(api.listAssignableStaff).mockRejectedValue(
      Object.assign(new Error('unavailable'), { response: { status: 503 } }),
    );
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: /#11111111/ }));
    expect(await screen.findByTestId('staff-directory-down')).toBeInTheDocument();
    expect(screen.queryByLabelText('Kişi ata')).not.toBeInTheDocument();
  });
  test('internal note is an explicit staff operation', async () => {
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: /#11111111/ }));
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
  test('late list response cannot repopulate state after authorization purge', async () => {
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: /#11111111/ }));
    expect(await screen.findByText('Sentetik anlatım')).toBeInTheDocument();
    let resolveOldList!: (value: (typeof summary)[]) => void;
    vi.mocked(api.listCases)
      .mockImplementationOnce(() => new Promise((resolve) => (resolveOldList = resolve)))
      .mockRejectedValueOnce({ response: { status: 401 } });
    await userEvent.click(screen.getByRole('button', { name: 'Yenile' }));
    await userEvent.click(screen.getByRole('button', { name: 'Yenile' }));
    await waitFor(() => expect(screen.queryByText('Sentetik anlatım')).not.toBeInTheDocument());
    resolveOldList([summary]);
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /#11111111/ })).not.toBeInTheDocument(),
    );
  });
  test('late post-write detail cannot repopulate state after authorization purge', async () => {
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: /#11111111/ }));
    let resolveOldDetail!: (value: typeof detail) => void;
    vi.mocked(api.getCase).mockImplementationOnce(
      () => new Promise((resolve) => (resolveOldDetail = resolve)),
    );
    await userEvent.type(screen.getByLabelText("Reporter'a güvenli yanıt"), 'Güvenli yanıt');
    await userEvent.click(screen.getByRole('button', { name: 'Yanıtı gönder' }));
    await waitFor(() => expect(api.replyToReporter).toHaveBeenCalled());
    vi.mocked(api.listCases).mockRejectedValueOnce({ response: { status: 403 } });
    await userEvent.click(screen.getByRole('button', { name: 'Yenile' }));
    await waitFor(() => expect(screen.queryByText('Sentetik anlatım')).not.toBeInTheDocument());
    resolveOldDetail(detail);
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'Sentetik bildirim' })).not.toBeInTheDocument(),
    );
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
  test('attachment authorization loss also purges the protected case surface', async () => {
    vi.mocked(api.listCaseEvidence).mockRejectedValueOnce({ response: { status: 404 } });
    render(<App />);

    await userEvent.click(await screen.findByRole('button', { name: /#11111111/ }));

    await waitFor(() => expect(screen.queryByText('Sentetik anlatım')).not.toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /#11111111/ })).not.toBeInTheDocument();
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
    // Only the two fields that differ: spreading the summary would widen `mode` back to
    // nullable, and the detail always has a report behind it.
    resolveSecond({ ...detail, id: second.id, subject: second.subject });
    expect(
      await screen.findByRole('heading', { name: 'İkinci sentetik vaka' }),
    ).toBeInTheDocument();
    resolveFirst(detail);
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'Sentetik bildirim' })).not.toBeInTheDocument(),
    );
  });

  // ES-301A — lifecycle. The server enumerates which moves exist and refuses the rest;
  // these check the UI does not offer what would come back as a conflict, and does not
  // send a closure the server will reject for having no finding.

  test('yalnız sunucunun kabul edeceği geçişler sunulur', async () => {
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: /#11111111/ }));
    expect(await screen.findByRole('button', { name: 'Değerlendirmeye al' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sonuçlandır' })).toBeInTheDocument();
    // NEW -> INVESTIGATING is not a legal move, so there must be no button for it.
    expect(screen.queryByRole('button', { name: 'Soruşturmaya al' })).not.toBeInTheDocument();
  });

  test('kapanış sonuç seçimi ister ve sonucu gönderir', async () => {
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: /#11111111/ }));
    await userEvent.click(await screen.findByRole('button', { name: 'Sonuçlandır' }));

    await userEvent.selectOptions(screen.getByLabelText('Sonuç'), 'OUT_OF_SCOPE');

    // ES-301B: the server refuses a closure that tells the reporter nothing, so the UI
    // cannot offer one either — the button stays out of reach until there is a message.
    expect(screen.getByRole('button', { name: 'Sonucu kaydet ve kapat' })).toBeDisabled();
    await userEvent.type(
      screen.getByLabelText('İhbarcıya iletilecek kapanış mesajı'),
      'Bildiriminiz kapsam dışında kaldı.',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Sonucu kaydet ve kapat' }));

    await waitFor(() =>
      expect(api.updateCase).toHaveBeenCalledWith(summary.id, 0, {
        status: 'CLOSED',
        outcome: 'OUT_OF_SCOPE',
        closingMessage: 'Bildiriminiz kapsam dışında kaldı.',
      }),
    );
  });

  test('yeniden açma gerekçesiz gönderilemez', async () => {
    const closed = {
      ...detail,
      status: 'CLOSED',
      outcome: 'UNSUBSTANTIATED',
      closedAt: '2026-07-19T09:00:00Z',
      acknowledgedAt: '2026-07-18T18:00:00Z',
    };
    vi.mocked(api.listCases).mockResolvedValue([closed]);
    vi.mocked(api.getCase).mockResolvedValue(closed);
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: /#11111111/ }));
    await userEvent.click(await screen.findByRole('button', { name: 'Yeniden aç' }));

    expect(screen.getByRole('button', { name: 'Davayı yeniden aç' })).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Yeniden açma gerekçesi'), 'Yeni tanık beyanı');
    await userEvent.click(screen.getByRole('button', { name: 'Davayı yeniden aç' }));

    await waitFor(() =>
      expect(api.updateCase).toHaveBeenCalledWith(closed.id, 0, {
        status: 'ASSESSING',
        reason: 'Yeni tanık beyanı',
      }),
    );
  });

  /**
   * The seven-day acknowledgement deadline is the one a manager can still act on. A case
   * nobody has replied to for longer than that has to say so where the case is read, not
   * in a report someone runs monthly.
   */
  test('teyit edilmemiş ve süresi geçmiş dava uyarı olarak görünür', async () => {
    const stale = {
      ...detail,
      createdAt: new Date(Date.now() - 9 * 24 * 60 * 60 * 1000).toISOString(),
      acknowledgedAt: null,
    };
    vi.mocked(api.listCases).mockResolvedValue([stale]);
    vi.mocked(api.getCase).mockResolvedValue(stale);
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: /#11111111/ }));

    const state = await screen.findByTestId('acknowledgement-state');
    expect(state).toHaveAttribute('data-overdue', 'true');
    expect(state).toHaveTextContent('9 gün geçti');
    expect(state).toHaveAttribute('role', 'alert');
  });

  /** A frontend deployed ahead of the service must not print a deadline it cannot compute. */
  test('sunucu teyit alanını göndermiyorsa süre uydurulmaz', async () => {
    const legacy = { ...detail };
    delete (legacy as { acknowledgedAt?: string | null }).acknowledgedAt;
    vi.mocked(api.listCases).mockResolvedValue([legacy as api.EthicsCaseSummary]);
    vi.mocked(api.getCase).mockResolvedValue(legacy as api.EthicsCaseDetail);
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: /#11111111/ }));

    const state = await screen.findByTestId('acknowledgement-state');
    expect(state).toHaveTextContent('okunamadı');
    expect(state).not.toHaveTextContent('NaN');
    expect(state).toHaveAttribute('data-overdue', 'false');
  });

  test('teyit verilmişse geçen süre gösterilir, uyarı verilmez', async () => {
    const acknowledged = {
      ...detail,
      createdAt: '2026-07-18T12:00:00Z',
      acknowledgedAt: '2026-07-20T12:00:00Z',
    };
    vi.mocked(api.listCases).mockResolvedValue([acknowledged]);
    vi.mocked(api.getCase).mockResolvedValue(acknowledged);
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: /#11111111/ }));

    const state = await screen.findByTestId('acknowledgement-state');
    expect(state).toHaveAttribute('data-overdue', 'false');
    expect(state).toHaveTextContent('2 gün içinde verildi');
  });

  // 138 vakalık bir listede rozetleri görmek taramaya yarar; "sadece sahipsizleri göster"
  // diyememek işi yarım bırakır. Asıl riskli olan filtrenin kendisi değil: bir uyum
  // aracında açık kalmış bir filtre vakaları sessizce gizler ve gizlenen vaka, kimsenin
  // bakmadığı ihbardır. Sayaç ve "süzmeyi kaldır" o yüzden sözleşme.
  test('sahipsiz süzgeci yalnız kimsenin bakmadığı vakaları bırakır', async () => {
    const owned = { ...summary, id: '55555555-5555-5555-5555-555555555555', subject: 'Sahipli vaka', participantCount: 2 };
    const orphan = { ...summary, id: '66666666-6666-6666-6666-666666666666', subject: 'Sahipsiz vaka', participantCount: 0 };
    vi.mocked(api.listCases).mockResolvedValueOnce([owned, orphan]);
    render(<App />);
    await screen.findByRole('button', { name: /Sahipli vaka/ });

    await userEvent.click(screen.getByRole('checkbox', { name: 'Sahipsiz' }));

    expect(screen.queryByRole('button', { name: /Sahipli vaka/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sahipsiz vaka/ })).toBeInTheDocument();
  });

  test('süzgeç açıkken kaç vakanın gizlendiği yazar ve tek tıkla geri alınır', async () => {
    const owned = { ...summary, id: '77777777-7777-7777-7777-777777777777', subject: 'Sahipli vaka', participantCount: 2 };
    const orphan = { ...summary, id: '88888888-8888-8888-8888-888888888888', subject: 'Sahipsiz vaka', participantCount: 0 };
    vi.mocked(api.listCases).mockResolvedValueOnce([owned, orphan]);
    render(<App />);
    await screen.findByRole('button', { name: /Sahipli vaka/ });
    await userEvent.click(screen.getByRole('checkbox', { name: 'Sahipsiz' }));

    // Süzülmüş liste tam liste gibi görünmemeli.
    const summaryLine = screen.getByRole('status');
    expect(summaryLine).toHaveTextContent('1 / 2 vaka gösteriliyor');

    await userEvent.click(screen.getByRole('button', { name: 'Süzmeyi kaldır' }));
    expect(screen.getByRole('button', { name: /Sahipli vaka/ })).toBeInTheDocument();
  });

  // Konusu okunamayan vaka bozuktur — yani tam da bakılması gereken kayıt. Metin
  // aramasının onu düşürmesi, dikkat isteyen kaydı gizlemek olurdu.
  test('konusu okunamayan vaka metin aramasında düşmez', async () => {
    const named = { ...summary, id: '99999999-9999-9999-9999-999999999999', subject: 'Depo bildirimi' };
    const broken = { ...summary, id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', subject: null };
    vi.mocked(api.listCases).mockResolvedValueOnce([named, broken]);
    render(<App />);
    await screen.findByRole('button', { name: /Depo bildirimi/ });

    await userEvent.type(screen.getByLabelText('Konu ara'), 'kesinlikle-eslesmeyen-metin');

    expect(screen.queryByRole('button', { name: /Depo bildirimi/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Konu okunamadı/ })).toBeInTheDocument();
  });

  // Canlı hücrede 164 vakanın 132'si yedi günlük teyidi hiç almadı. Zorlayıcı olan
  // yükümlülük değil, her seferinde paragrafı yazmaktı. Bu düğme onu kaldırır — ve
  // BAŞKA HİÇBİR ŞEYİ. Teyit, bildirmek için risk almış bir insana yapılan beyandır;
  // kimsenin okumadan yolladığı bir şablon, elle yazılmış geç bir yanıttan kötüdür:
  // cevap gibi görünür, hiçbir şey cevaplamaz.
  test('teyit düğmesi metni hazırlar ve GÖNDERMEZ', async () => {
    vi.mocked(api.getCase).mockResolvedValue({ ...detail, acknowledgedAt: null });
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: /#11111111/ }));

    // Yalnız bu etkileşim sayılsın: mock dosya boyunca paylaşılıyor ve önceki testlerin
    // çağrıları iddiayı yanlış sebeple düşürür.
    vi.mocked(api.replyToReporter).mockClear();
    await userEvent.click(await screen.findByRole('button', { name: 'Alındı teyidi hazırla' }));

    const box = screen.getByLabelText("Reporter'a güvenli yanıt");
    expect((box as HTMLTextAreaElement).value).toContain('kayda alındı');
    // Asıl sözleşme: hazırlamak göndermek değildir.
    expect(api.replyToReporter).not.toHaveBeenCalled();
  });

  test('hazırlanan metin düzenlenebilir', async () => {
    vi.mocked(api.getCase).mockResolvedValue({ ...detail, acknowledgedAt: null });
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: /#11111111/ }));
    await userEvent.click(await screen.findByRole('button', { name: 'Alındı teyidi hazırla' }));

    const box = screen.getByLabelText("Reporter'a güvenli yanıt");
    await userEvent.clear(box);
    await userEvent.type(box, 'Kendi cümlem');
    expect(box).toHaveValue('Kendi cümlem');
  });

  // Teyit verilmiş bir vakada düğme gürültüdür ve aynı paragrafı ikinci kez göndermeye
  // davet eder.
  test('teyit verilmiş vakada düğme görünmez', async () => {
    vi.mocked(api.getCase).mockResolvedValue({
      ...detail,
      acknowledgedAt: '2026-07-19T09:00:00Z',
    });
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: /#11111111/ }));
    await screen.findByRole('heading', { name: 'Sentetik bildirim' });

    expect(screen.queryByRole('button', { name: 'Alındı teyidi hazırla' })).not.toBeInTheDocument();
  });

  // Metin sonuç ya da tarih vaat etmemeli: sonradan "asılsız" kapanan bir vaka, verilmiş
  // bir sözün bozulması gibi okunmamalı.
  test('taslak sonuç ya da tarih vaat etmez', () => {
    const draft = acknowledgementDraft('11111111-1111-1111-1111-111111111111', '2026-07-18T12:00:00Z');
    expect(draft).toContain('#11111111');
    expect(draft).toContain('posta');
    for (const promise of ['sonuçland', 'gün içinde', 'hafta içinde', 'garanti', 'kesinlikle']) {
      expect(draft.toLocaleLowerCase('tr')).not.toContain(promise);
    }
  });

  // Vakanın geçmişi zaten yazılıyordu; okunamıyordu. Devralan biri "bunu kim, ne zaman
  // taşımış" sorusunu soramıyordu.
  test('vaka geçmişi sunucunun verdiği sırayla okunur', async () => {
    vi.mocked(api.listCaseTimeline).mockResolvedValue([
      {
        occurredAt: '2026-07-18T12:00:00Z',
        event: 'ethics.report.created',
        actorHandle: null,
        actorDisplayName: null,
        detail: null,
      },
      {
        occurredAt: '2026-07-19T08:30:00Z',
        event: 'ethics.case.updated',
        actorHandle: 'v1.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA1',
        actorDisplayName: 'Ayşe Yılmaz',
        detail: 'INVESTIGATING',
      },
    ]);
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: /#11111111/ }));

    const history = await screen.findByRole('list', { name: 'Vaka geçmişi' });
    const rows = within(history).getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    // Sunucu eskiden yeniye veriyor; burada yeniden sıralamak bozuk bir defteri sessizce
    // onarmak olurdu.
    expect(rows[0]).toHaveTextContent('İhbar alındı');
    expect(rows[1]).toHaveTextContent('Ayşe Yılmaz');
  });

  // Aktörü çözülemeyen satırın sessiz kalması, denetim izinin sessizce fakirleşmesiydi:
  // okuyan "kimse dokunmamış" diye anlıyordu. Artık servis söylerse ekran da söylüyor.
  test('aktörü çözülemeyen satır bunu söyler, sessiz kalmaz', async () => {
    vi.mocked(api.listCaseTimeline).mockResolvedValue([
      {
        occurredAt: '2026-07-19T08:30:00Z',
        event: 'ethics.case.updated',
        actorHandle: null,
        actorDisplayName: null,
        detail: 'CLOSED',
        actorState: 'UNRESOLVED',
      },
    ]);
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: /#11111111/ }));

    const history = await screen.findByRole('list', { name: 'Vaka geçmişi' });
    expect(within(history).getByText('Aktör şu anda çözülemiyor')).toBeInTheDocument();
  });

  // NONE gerçekten "aktör yoktu" demek — anonim ihbar, boru hattı adımı. Oraya
  // "çözülemiyor" yazmak, hiç aktörü olmamış bir olay için alarm üretmek olurdu.
  test('aktörü olmayan satır uyarı üretmez', async () => {
    vi.mocked(api.listCaseTimeline).mockResolvedValue([
      {
        occurredAt: '2026-07-18T12:00:00Z',
        event: 'ethics.report.created',
        actorHandle: null,
        actorDisplayName: null,
        detail: null,
        actorState: 'NONE',
      },
    ]);
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: /#11111111/ }));

    const history = await screen.findByRole('list', { name: 'Vaka geçmişi' });
    expect(within(history).getByText('İhbar alındı')).toBeInTheDocument();
    expect(within(history).queryByText('Aktör şu anda çözülemiyor')).not.toBeInTheDocument();
  });

  // Bu paket, alanı henüz göndermeyen bir servisle konuşabilir — bugün tam tersi oldu ve
  // ekran, var olmayan bir endpoint'e 403 aldı. Alan yoksa hiçbir şey iddia edilmez.
  test('alanı göndermeyen servisle konuşurken hiçbir şey iddia edilmez', async () => {
    vi.mocked(api.listCaseTimeline).mockResolvedValue([
      {
        occurredAt: '2026-07-18T12:00:00Z',
        event: 'ethics.report.created',
        actorHandle: null,
        actorDisplayName: null,
        detail: null,
      },
    ]);
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: /#11111111/ }));

    const history = await screen.findByRole('list', { name: 'Vaka geçmişi' });
    expect(within(history).getByText('İhbar alındı')).toBeInTheDocument();
    expect(within(history).queryByText('Aktör şu anda çözülemiyor')).not.toBeInTheDocument();
  });

  // ASIL SÖZLEŞME: okunamayan geçmiş, boş geçmiş gibi görünmemeli. "Bu vakaya hiçbir şey
  // olmamış" bir kanıdır ve devralan kişi ona göre karar verir; başarısız bir istekle
  // ulaşılabilir olmamalı.
  test('geçmiş okunamıyorsa bu açıkça söylenir, boş liste gösterilmez', async () => {
    vi.mocked(api.listCaseTimeline).mockRejectedValue({ response: { status: 503 } });
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: /#11111111/ }));

    const alert = await screen.findByTestId('timeline-unavailable');
    expect(alert).toHaveTextContent('boş olduğu anlamına gelmez');
    expect(screen.queryByRole('list', { name: 'Vaka geçmişi' })).not.toBeInTheDocument();
    expect(screen.queryByText('Bu vaka için kayıtlı olay yok.')).not.toBeInTheDocument();
  });

  test('gerçekten boş geçmiş, okunamayan geçmişten farklı görünür', async () => {
    vi.mocked(api.listCaseTimeline).mockResolvedValue([]);
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: /#11111111/ }));
    await screen.findByRole('heading', { name: 'Vaka geçmişi' });

    expect(screen.getByText('Bu vaka için kayıtlı olay yok.')).toBeInTheDocument();
    expect(screen.queryByTestId('timeline-unavailable')).not.toBeInTheDocument();
  });

  // Aktörü null gelen satır "kimse yoktu" da olabilir "artık çözülmüyor" da; yanıt ikisini
  // ayırmıyor. O yüzden bu ekran hiçbirini iddia etmez — kimseyi adlandırmaz.
  test('aktörü çözülemeyen satır başkasının adını taşımaz', async () => {
    vi.mocked(api.listCaseTimeline).mockResolvedValue([
      {
        occurredAt: '2026-07-18T12:00:00Z',
        event: 'ethics.report.created',
        actorHandle: null,
        actorDisplayName: null,
        detail: null,
      },
    ]);
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: /#11111111/ }));

    const history = await screen.findByRole('list', { name: 'Vaka geçmişi' });
    expect(within(history).getByRole('listitem')).toHaveTextContent('İhbar alındı');
    expect(within(history).queryByText('Ayşe Yılmaz')).not.toBeInTheDocument();
  });
  it('bir kategori otomatik listedeyse bandı ÇOK AĞIR\'a sabitler ve gerekçe ister', async () => {
    const closed: api.EthicsCaseDetail = { ...detail, status: 'CLOSED', closedAt: '2026-08-01T09:00:00Z' };
    vi.mocked(api.listCases).mockResolvedValue([{ ...summary, status: 'CLOSED' }]);
    vi.mocked(api.getCase).mockResolvedValue(closed);
    vi.mocked(api.recordSanction).mockResolvedValue({
      id: 's1', violationCategory: 'PUBLIC_OFFICIAL_BRIBERY', severityScore: 6,
      severityBand: 'COK_AGIR', escalationReason: 'cetvel', sanctionType: 'TERMINATION',
      decidedAt: '2026-08-01T10:00:00Z', appliedAt: null, verificationNote: null,
      appealState: 'NONE',
    });

    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: /Sentetik bildirim/ }));
    const form = await screen.findByTestId('sanction-form');

    // Düşük puan: cetvel HAFİF derdi. Kategori otomatik listede olduğu için form ÇOK AĞIR
    // demeli — "kullanıcı doğru bandı seçer" varsayımı bu kuralın işlemediği hâlin ta kendisi.
    await userEvent.selectOptions(within(form).getByLabelText('İhlal kategorisi'), 'PUBLIC_OFFICIAL_BRIBERY');
    await userEvent.type(within(form).getByLabelText(/Ağırlık puanı/), '6');
    await userEvent.selectOptions(within(form).getByLabelText('Yaptırım türü'), 'TERMINATION');

    expect(screen.getByTestId('derived-band')).toHaveTextContent('otomatik yükseltme listesi');

    // Puan bandın altında kaldığı için gerekçe zorunlu: iki kural birlikte işler.
    const submit = within(form).getByRole('button', { name: 'Yaptırımı kaydet' });
    expect(submit).toBeDisabled();

    await userEvent.type(within(form).getByLabelText(/yükseltme gerekçesi/), 'Kamu görevlisine rüşvet.');
    expect(submit).toBeEnabled();
    await userEvent.click(submit);

    expect(vi.mocked(api.recordSanction)).toHaveBeenCalledWith(closed.id, expect.objectContaining({
      violationCategory: 'PUBLIC_OFFICIAL_BRIBERY',
      severityBand: 'COK_AGIR',
    }));
  });

});
