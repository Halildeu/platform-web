import type {
  ApplicationAnswerDto,
  PublicJobQuestionDto,
  RecruiterJobQuestionKind,
} from '../api/application-api';

/**
 * ats#240 C: İK'nın aday cevaplarını okuma modeli — saf, yan etkisiz.
 *
 * Kaynak sıra ve metin CEVAP ANINDAKİ anlık görüntüdür (`questionsSnapshot`), cevap
 * listesi değil: cevaplanmamış isteğe bağlı soru da satır olarak görünür (İK "sormuştum,
 * boş bırakmış" bilgisini görür) ve İK soruyu sonradan düzenlemişse aday ne gördüyse o
 * basılır. Cevap `questionId`/`optionId` ile bağlanır; seçenek ETİKETİ anlık görüntüden
 * çözülür. A'nın tür etiketleri burada tek kaynaktır (RecruiterJobsPanel de buradan okur).
 */
export const QUESTION_KIND_LABELS: Record<RecruiterJobQuestionKind, string> = {
  SHORT_TEXT: 'Kısa metin',
  LONG_TEXT: 'Uzun metin',
  YES_NO: 'Evet / Hayır',
  SINGLE_CHOICE: 'Tek seçim',
};

/** Aday cevap vermemiş (yalnız isteğe bağlı sorularda mümkün; zorunlular önizleme kapısında dolar). */
export const UNANSWERED_ANSWER_LABEL = 'Yanıtlanmadı';

export type ScreeningAnswerRow = {
  questionId: string;
  order: number;
  text: string;
  kind: RecruiterJobQuestionKind;
  required: boolean;
  /** Gösterime hazır cevap; `null` = cevaplanmamış. */
  answer: string | null;
};

const formatAnswer = (
  question: PublicJobQuestionDto,
  answer: ApplicationAnswerDto | undefined,
): string | null => {
  if (!answer) return null;
  switch (question.kind) {
    case 'YES_NO':
      return typeof answer.yes === 'boolean' ? (answer.yes ? 'Evet' : 'Hayır') : null;
    case 'SINGLE_CHOICE': {
      if (!answer.optionId) return null;
      // Anlık görüntü başvuru anında donduğu için seçenek orada OLMALI; yine de yoksa
      // kimliği gizlemek yerine görünür bırakırız — sessiz boşluk "cevap yok" sanılırdı.
      const option = (question.options ?? []).find((o) => o.optionId === answer.optionId);
      return option ? option.label : answer.optionId;
    }
    default:
      return typeof answer.text === 'string' && answer.text.trim() !== '' ? answer.text : null;
  }
};

export const screeningAnswerRows = (
  snapshot: PublicJobQuestionDto[] | null | undefined,
  answers: ApplicationAnswerDto[] | null | undefined,
): ScreeningAnswerRow[] => {
  const byQuestion = new Map((answers ?? []).map((a) => [a.questionId, a] as const));
  return [...(snapshot ?? [])]
    .sort((a, b) => a.order - b.order)
    .map((question) => ({
      questionId: question.questionId,
      order: question.order,
      text: question.text,
      kind: question.kind,
      required: question.required,
      answer: formatAnswer(question, byQuestion.get(question.questionId)),
    }));
};
