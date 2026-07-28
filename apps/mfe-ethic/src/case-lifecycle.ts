/**
 * ES-301A — the case lifecycle as the UI understands it.
 *
 * <p>Kept out of `ethics-api.ts` deliberately. That module describes transport, and any
 * test that mocks it would take these rules down with it — which is exactly what happened
 * when they lived there: the action area rendered empty because the auto-mock replaced the
 * transition table with `undefined`. These are domain facts, not endpoints.
 *
 * <p>They mirror the server's table so the UI never offers a move that would come back as
 * a conflict. The server remains the authority; this only avoids showing a button whose
 * only possible outcome is an error.
 */

export type CaseStatus = 'NEW' | 'ASSESSING' | 'INVESTIGATING' | 'CLOSED';

export type CaseOutcome =
  | 'SUBSTANTIATED'
  | 'PARTIALLY_SUBSTANTIATED'
  | 'UNSUBSTANTIATED'
  | 'OUT_OF_SCOPE'
  | 'REFERRED'
  | 'WITHDRAWN';

/** Forward only, plus reopening a closed case into assessment — which needs a reason. */
export const NEXT_STATUSES: Record<CaseStatus, CaseStatus[]> = {
  NEW: ['ASSESSING', 'CLOSED'],
  ASSESSING: ['INVESTIGATING', 'CLOSED'],
  INVESTIGATING: ['CLOSED'],
  CLOSED: ['ASSESSING'],
};

export const OUTCOME_OPTIONS: CaseOutcome[] = [
  'SUBSTANTIATED',
  'PARTIALLY_SUBSTANTIATED',
  'UNSUBSTANTIATED',
  'OUT_OF_SCOPE',
  'REFERRED',
  'WITHDRAWN',
];

/** The statuses a case can be in today. These are the ones a handler can choose. */
const CURRENT_STATUS_LABELS: Readonly<Record<string, string>> = Object.freeze({
  NEW: 'Yeni',
  ASSESSING: 'Değerlendirmede',
  INVESTIGATING: 'Soruşturmada',
  CLOSED: 'Sonuçlandırıldı',
});

/**
 * Statuses that no longer exist but are written into the audit trail forever.
 *
 * <p>The vocabulary changed at some point and the ledger is WORM: `IN_REVIEW` was written
 * 45 times between 20 and 26 July and never again, and no live case carries it. It is not
 * a rare edge — it is more than half of every status entry in the trail, so a handler
 * reading a case's history saw raw codes on most of the lines that mattered.
 *
 * <p>Kept **separate** from the current vocabulary rather than folded into it. Mapping
 * `IN_REVIEW` onto `ASSESSING` would be the tempting move, and it would be a claim: that
 * the two meant the same thing. There is no period dictionary or migration note saying so,
 * and an audit record has to be shown with the meaning it was written with — reinterpreting
 * history through today's model is exactly what an immutable ledger exists to prevent.
 *
 * <p>So the label says what it is and marks itself historical. The raw code stays visible
 * in the title attribute for anyone reconciling against the ledger.
 */
const HISTORICAL_STATUS_LABELS: Readonly<Record<string, string>> = Object.freeze({
  IN_REVIEW: 'İncelemede (tarihsel)',
});

export const statusLabel = (status: string) =>
  CURRENT_STATUS_LABELS[status] ?? HISTORICAL_STATUS_LABELS[status] ?? status;

/** Whether this value belongs to a vocabulary the product no longer uses. */
export const isHistoricalStatus = (status: string) =>
  !(status in CURRENT_STATUS_LABELS) && status in HISTORICAL_STATUS_LABELS;

/** Every status the ledger can hold — current and retired. Used by the contract test. */
export const KNOWN_STATUS_VALUES: readonly string[] = Object.freeze([
  ...Object.keys(CURRENT_STATUS_LABELS),
  ...Object.keys(HISTORICAL_STATUS_LABELS),
]);

/** The wording follows the finding: "doğrulanamadı" is a conclusion, "kapsam dışı" is not one. */
export const outcomeLabel = (outcome: string) =>
  ({
    SUBSTANTIATED: 'Doğrulandı',
    PARTIALLY_SUBSTANTIATED: 'Kısmen doğrulandı',
    UNSUBSTANTIATED: 'Doğrulanamadı',
    OUT_OF_SCOPE: 'Kapsam dışı',
    REFERRED: 'Başka mercie aktarıldı',
    WITHDRAWN: 'İhbarcı geri çekti',
  })[outcome] ?? outcome;

export const transitionLabel = (to: string) =>
  ({
    ASSESSING: 'Değerlendirmeye al',
    INVESTIGATING: 'Soruşturmaya al',
    CLOSED: 'Sonuçlandır',
  })[to] ?? to;

const DAY_MS = 24 * 60 * 60 * 1000;

/** EU 2019/1937 art. 9(1)(b): acknowledge receipt within seven days. */
export const ACKNOWLEDGEMENT_DEADLINE_DAYS = 7;

/**
 * How the seven-day clock stands on this case.
 *
 * <p>It is surfaced because it is the one deadline a manager can still act on — once it
 * has run, nothing later in the case puts it back. `acknowledgedAt` is stamped server-side
 * by the first reporter-visible reply, so the only way to stop this counting is to write
 * to the person.
 */
export function acknowledgementState(
  item: { createdAt: string; acknowledgedAt?: string | null },
  now: number = Date.now(),
): { overdue: boolean; known: boolean; text: string } {
  const created = Date.parse(item.createdAt);
  // A frontend deployed ahead of the service receives no `acknowledgedAt` at all. Absent
  // is not null: null means nobody has replied yet, absent means we cannot tell — and a
  // deadline computed from a missing date would still read as a compliance statement.
  if (item.acknowledgedAt === undefined || Number.isNaN(created)) {
    return { overdue: false, known: false, text: 'Alındı teyidi durumu okunamadı' };
  }
  if (item.acknowledgedAt) {
    const acknowledged = Date.parse(item.acknowledgedAt);
    if (Number.isNaN(acknowledged)) {
      return { overdue: false, known: false, text: 'Alındı teyidi durumu okunamadı' };
    }
    const days = Math.floor((acknowledged - created) / DAY_MS);
    return { overdue: false, known: true, text: `Alındı teyidi ${days} gün içinde verildi` };
  }
  const elapsed = Math.floor((now - created) / DAY_MS);
  const overdue = elapsed >= ACKNOWLEDGEMENT_DEADLINE_DAYS;
  return {
    overdue,
    known: true,
    text: overdue
      ? `Alındı teyidi verilmedi — ${elapsed} gün geçti (yasal süre ${ACKNOWLEDGEMENT_DEADLINE_DAYS} gün)`
      : `Alındı teyidi bekliyor — ${ACKNOWLEDGEMENT_DEADLINE_DAYS - elapsed} gün kaldı`,
  };
}

/**
 * ES-203/C — the participant role vocabulary. This mirrors the CHECK
 * constraint on `ethics_case_participants.role`; a value outside it is
 * refused by the server. It lives here rather than in `ethics-api.ts` for
 * the same reason NEXT_STATUSES does: it is a domain rule, and a test that
 * mocks the transport module must not erase the vocabulary with it.
 */
export const PARTICIPANT_ROLES = ['triager', 'handler', 'evidence_approver'] as const;
export type ParticipantRole = (typeof PARTICIPANT_ROLES)[number];

export const participantRoleLabel = (role: string) =>
  ({
    triager: 'Triyaj',
    handler: 'Vaka sorumlusu',
    evidence_approver: 'Kanıt onaylayıcı',
  })[role] ?? role;

/**
 * The category words the reporter actually chose.
 *
 * <p>These mirror the public intake form option-for-option, deliberately. The person
 * filing picked "Taciz / ayrımcılık" from a list; a handler who reads "HARASSMENT_
 * DISCRIMINATION", or a differently-worded translation of it, is reading a second
 * description of the same choice and has to trust that the two agree.
 *
 * <p>Mirrors {@code EthicsDtos.ReportCategory}. An unknown value renders as itself
 * rather than as a guess — a category the server added and this bundle has not learned
 * should look unfamiliar, not be quietly relabelled.
 */
export const categoryLabel = (category: string | null) =>
  category === null
    ? null
    : ({
        WORKPLACE_CONDUCT: 'İş yeri davranışı',
        FRAUD_CORRUPTION: 'Usulsüzlük / yolsuzluk',
        HARASSMENT_DISCRIMINATION: 'Taciz / ayrımcılık',
        OTHER: 'Diğer',
      })[category] ?? category;

/**
 * Whether the reporter can be reached at all.
 *
 * <p>This is not decoration. An anonymous report has no channel back to the person who
 * filed it, so "ask them for detail" is not a move the handler has — and the seven-day
 * acknowledgement can only be met through the mailbox they hold a code for. Showing it
 * on the row means that constraint is known before the case is opened.
 */
export const isAnonymous = (mode: string | null) => mode === 'ANONYMOUS';

/**
 * What a handler narrows the list by.
 *
 * <p>The two booleans are not "more filters" — they are the two questions triage exists
 * to answer. `unattended` finds the reports nobody has picked up; `overdue` finds the
 * ones whose seven-day acknowledgement has run. Everything else on this screen can wait;
 * those two are how a case goes wrong without anyone choosing it.
 */
export interface CaseFilter {
  query: string;
  status: string;
  category: string;
  unattended: boolean;
  overdue: boolean;
}

export const EMPTY_CASE_FILTER: CaseFilter = Object.freeze({
  query: '',
  status: '',
  category: '',
  unattended: false,
  overdue: false,
});

export const isFilterActive = (filter: CaseFilter) =>
  filter.query.trim() !== '' ||
  filter.status !== '' ||
  filter.category !== '' ||
  filter.unattended ||
  filter.overdue;

/**
 * Narrow a loaded list. Filtering happens here rather than on the server because the whole
 * list already arrived — 138 cases is 6 KB — so a round trip per keystroke would buy
 * nothing and cost the authorization work the list endpoint has to redo each time.
 *
 * <p>A case with no readable subject survives every text query. It is malformed, which is
 * a reason to look at it; dropping it because it has no text to match would hide exactly
 * the record that needs attention.
 */
export function filterCases<
  T extends {
    subject: string | null;
    status: string;
    category: string | null;
    participantCount: number;
    createdAt: string;
    acknowledgedAt?: string | null;
  },
>(items: readonly T[], filter: CaseFilter, now: number = Date.now()): T[] {
  const needle = filter.query.trim().toLocaleLowerCase('tr');
  return items.filter((item) => {
    if (needle && item.subject !== null && !item.subject.toLocaleLowerCase('tr').includes(needle))
      return false;
    if (filter.status && item.status !== filter.status) return false;
    if (filter.category && item.category !== filter.category) return false;
    if (filter.unattended && item.participantCount !== 0) return false;
    if (filter.overdue && !acknowledgementState(item, now).overdue) return false;
    return true;
  });
}

/** The categories the intake form offers, in the order it offers them. */
export const CASE_CATEGORIES = [
  'WORKPLACE_CONDUCT',
  'FRAUD_CORRUPTION',
  'HARASSMENT_DISCRIMINATION',
  'OTHER',
] as const;

/** The lifecycle statuses, in the order a case moves through them. */
export const CASE_STATUSES: readonly CaseStatus[] = ['NEW', 'ASSESSING', 'INVESTIGATING', 'CLOSED'];

/**
 * A ready acknowledgement, for the handler to read and change before it goes.
 *
 * <p>The seven-day acknowledgement is an obligation, and on the live cell 132 of 164 cases
 * never received one. The obligation was not the hard part — writing the paragraph each
 * time was. This removes that and nothing else.
 *
 * <p>It prepares; it does not send. An acknowledgement is a statement to a person who took
 * a risk to file, and a template posted without anyone reading it is worse than a late
 * reply written by hand: it looks like an answer and answers nothing. The handler still
 * presses send, and can rewrite every word first.
 *
 * <p>What the wording does and does not do is deliberate. It confirms receipt and names the
 * reference, because that is what the reporter cannot otherwise verify. It says where
 * updates will appear, because an anonymous reporter has no channel back and would
 * otherwise wait for a message that can never arrive. It promises no outcome and no date —
 * a case that later closes as unsubstantiated must not read as a broken promise, and
 * nothing on this screen can commit to a schedule the investigation does not control.
 */
export function acknowledgementDraft(caseId: string, filedAt: string): string {
  const filed = Date.parse(filedAt);
  const filedText = Number.isNaN(filed)
    ? null
    : new Date(filed).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
  return [
    'Merhaba,',
    '',
    filedText
      ? `${filedText} tarihinde ilettiğiniz bildirim tarafımıza ulaştı ve kayda alındı.`
      : 'İlettiğiniz bildirim tarafımıza ulaştı ve kayda alındı.',
    `Bildirim numaranız: #${caseId.slice(0, 8).toUpperCase()}`,
    '',
    'Bildiriminiz yetkili ekip tarafından inceleniyor. İnceleme sürerken size bu posta',
    'kutusundan yazacağız; buraya elinizdeki erişim bilgileriyle istediğiniz zaman',
    'girip durumu görebilir ve bize yazabilirsiniz.',
    '',
    'Eklemek istediğiniz bilgi ya da belge olursa aynı yerden iletebilirsiniz.',
    '',
    'Bildiriminiz için teşekkür ederiz.',
  ].join('\n');
}
