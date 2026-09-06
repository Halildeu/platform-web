import { describe, expect, it } from 'vitest';
import { screeningAnswerRows, UNANSWERED_ANSWER_LABEL } from './screening-answers';
import type { PublicJobQuestionDto } from '../api/application-api';

// ats#240 C: İK okuma modeli. Sıra ve metin ANLIK GÖRÜNTÜDEN, cevap KİMLİKTEN.
const SNAPSHOT: PublicJobQuestionDto[] = [
  {
    questionId: 'q_NOTE000000000000',
    order: 3,
    text: 'Eklemek istediğiniz bir şey var mı?',
    kind: 'LONG_TEXT',
    required: false,
  },
  {
    questionId: 'q_MODE000000000000',
    order: 1,
    text: 'Hangi çalışma biçimini tercih edersiniz?',
    kind: 'SINGLE_CHOICE',
    required: true,
    options: [
      { optionId: 'qo_OFFICE000000', label: 'Ofis' },
      { optionId: 'qo_REMOTE000000', label: 'Uzaktan' },
    ],
  },
  {
    questionId: 'q_RELOC00000000000',
    order: 2,
    text: 'Taşınmaya açık mısınız?',
    kind: 'YES_NO',
    required: true,
  },
];

describe('screeningAnswerRows', () => {
  it('orders by the snapshot, resolves option labels by id and maps yes/no', () => {
    const rows = screeningAnswerRows(SNAPSHOT, [
      { questionId: 'q_MODE000000000000', optionId: 'qo_REMOTE000000' },
      { questionId: 'q_RELOC00000000000', yes: false },
    ]);
    expect(rows.map((r) => r.questionId)).toEqual([
      'q_MODE000000000000',
      'q_RELOC00000000000',
      'q_NOTE000000000000',
    ]);
    expect(rows[0]).toMatchObject({
      text: 'Hangi çalışma biçimini tercih edersiniz?',
      answer: 'Uzaktan',
      required: true,
    });
    expect(rows[1].answer).toBe('Hayır');
    // Cevaplanmamış isteğe bağlı soru da satırdır — İK "sormuştum, boş bırakmış" görür.
    expect(rows[2]).toMatchObject({ kind: 'LONG_TEXT', required: false, answer: null });
    expect(UNANSWERED_ANSWER_LABEL).toBe('Yanıtlanmadı');
  });

  it('keeps the raw option id visible when the snapshot has no such option', () => {
    const rows = screeningAnswerRows(SNAPSHOT, [
      { questionId: 'q_MODE000000000000', optionId: 'qo_GONE00000000' },
    ]);
    expect(rows[0].answer).toBe('qo_GONE00000000');
  });

  it('treats a missing or empty snapshot as no questions, whatever the answers say', () => {
    expect(screeningAnswerRows(undefined, [{ questionId: 'q_X', text: 'x' }])).toEqual([]);
    expect(screeningAnswerRows([], undefined)).toEqual([]);
    // Boş metin cevap sayılmaz.
    expect(
      screeningAnswerRows(SNAPSHOT.slice(0, 1), [
        { questionId: 'q_NOTE000000000000', text: '   ' },
      ])[0].answer,
    ).toBeNull();
  });
});
