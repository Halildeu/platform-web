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

export const statusLabel = (status: string) =>
  ({
    NEW: 'Yeni',
    ASSESSING: 'Değerlendirmede',
    INVESTIGATING: 'Soruşturmada',
    CLOSED: 'Sonuçlandırıldı',
  })[status] ?? status;

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
