export type ResumeField =
  | 'fullName'
  | 'email'
  | 'phone'
  | 'city'
  | 'linkedIn'
  | 'portfolio'
  | 'summary'
  | 'experience'
  | 'education'
  | 'skills'
  | 'note';

export type ParsedResume = Partial<Record<ResumeField, string>>;

const INLINE_LABELS: Record<string, ResumeField> = {
  'ad soyad': 'fullName',
  adsoyad: 'fullName',
  name: 'fullName',
  email: 'email',
  'e posta': 'email',
  eposta: 'email',
  telefon: 'phone',
  phone: 'phone',
  sehir: 'city',
  city: 'city',
  linkedin: 'linkedIn',
  portfoy: 'portfolio',
  portfolio: 'portfolio',
};

const SECTION_LABELS: Record<string, ResumeField> = {
  'profesyonel ozet': 'summary',
  ozet: 'summary',
  summary: 'summary',
  'is deneyimi': 'experience',
  deneyim: 'experience',
  experience: 'experience',
  egitim: 'education',
  education: 'education',
  beceriler: 'skills',
  yetenekler: 'skills',
  skills: 'skills',
  not: 'note',
  note: 'note',
};

const normalizeLabel = (value: string) =>
  value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const withTimeout = <T>(promise: Promise<T>, timeoutMs: number): Promise<T> =>
  new Promise((resolve, reject) => {
    const timer = globalThis.setTimeout(() => reject(new Error('PDF_PARSE_TIMEOUT')), timeoutMs);
    promise.then(
      (value) => {
        globalThis.clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        globalThis.clearTimeout(timer);
        reject(error instanceof Error ? error : new Error('PDF_PARSE_FAILED'));
      },
    );
  });

const settleCleanup = async (cleanup: () => Promise<unknown> | unknown) => {
  await withTimeout(Promise.resolve().then(cleanup), 1_000).catch(() => undefined);
};

const findInlineValue = (line: string) => {
  const match = line.match(/^\s*([^:：]{1,40})\s*[:：]\s*(.+?)\s*$/u);
  if (!match) return null;
  const field = INLINE_LABELS[normalizeLabel(match[1])];
  return field ? { field, value: match[2].trim() } : null;
};

export const parseResumeText = (text: string): ParsedResume => {
  const lines = text
    .split(/\r?\n/u)
    .map((line) => line.replace(/\s+/gu, ' ').trim())
    .filter(Boolean);
  const parsed: ParsedResume = {};
  let activeSection: ResumeField | null = null;

  for (const line of lines) {
    const inline = findInlineValue(line);
    if (inline) {
      parsed[inline.field] = inline.value;
      activeSection = null;
      continue;
    }

    const normalized = normalizeLabel(line.replace(/[:：]\s*$/u, ''));
    const section = SECTION_LABELS[normalized];
    if (section) {
      activeSection = section;
      continue;
    }

    if (activeSection) {
      parsed[activeSection] = parsed[activeSection] ? `${parsed[activeSection]}\n${line}` : line;
    }
  }

  const flatText = lines.join('\n');
  if (!parsed.email) {
    parsed.email = flatText.match(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/u)?.[0];
  }
  if (!parsed.phone) {
    parsed.phone = flatText
      .match(/(?:\+?\d[\d ()-]{6,}\d)/gu)
      ?.map((candidate) => candidate.trim())
      .find((candidate) => {
        const digitCount = candidate.replace(/\D/gu, '').length;
        return digitCount >= 10 && digitCount <= 15;
      });
  }

  for (const candidate of flatText.match(/https?:\/\/[^\s]+/gu) ?? []) {
    const cleaned = candidate.replace(/[),.;]+$/u, '');
    if (!parsed.linkedIn && /linkedin\.com/iu.test(cleaned)) parsed.linkedIn = cleaned;
    else if (!parsed.portfolio) parsed.portfolio = cleaned;
  }

  return Object.fromEntries(
    Object.entries(parsed).filter((entry): entry is [ResumeField, string] =>
      Boolean(entry[1]?.trim()),
    ),
  );
};

export const parseResumePdf = async (file: File): Promise<ParsedResume> => {
  const parseDeadline = Date.now() + 15_000;
  const remainingParseTime = (operationLimitMs: number) => {
    const remaining = parseDeadline - Date.now();
    if (remaining <= 0) throw new Error('PDF_PARSE_TIMEOUT');
    return Math.min(operationLimitMs, remaining);
  };
  const [{ getDocument, GlobalWorkerOptions }, workerModule] = await withTimeout(
    Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')]),
    remainingParseTime(5_000),
  );
  GlobalWorkerOptions.workerSrc = workerModule.default;

  const bytes = new Uint8Array(await withTimeout(file.arrayBuffer(), remainingParseTime(3_000)));
  const loadingTask = getDocument({ data: bytes, isEvalSupported: false });
  const pdfDocument = await withTimeout(loadingTask.promise, remainingParseTime(10_000)).catch(
    async (error: unknown) => {
      await settleCleanup(() => loadingTask.destroy());
      throw error;
    },
  );
  const pages: string[] = [];
  let extractedCharacters = 0;

  try {
    if (pdfDocument.numPages > 20) {
      throw new Error('PDF_PAGE_LIMIT_EXCEEDED');
    }
    for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
      const page = await withTimeout(pdfDocument.getPage(pageNumber), remainingParseTime(5_000));
      const lines: string[] = [];
      let currentLine = '';
      const reader = page.streamTextContent().getReader();
      try {
        while (true) {
          const chunk = await withTimeout(reader.read(), remainingParseTime(5_000));
          if (chunk.done) break;
          for (const item of chunk.value.items) {
            if (!('str' in item)) continue;
            const value = item.str.trim();
            extractedCharacters += value.length;
            if (extractedCharacters > 120_000) {
              throw new Error('PDF_TEXT_LIMIT_EXCEEDED');
            }
            if (value) currentLine = currentLine ? `${currentLine} ${value}` : value;
            if (item.hasEOL && currentLine) {
              lines.push(currentLine);
              currentLine = '';
            }
          }
        }
      } finally {
        await settleCleanup(() => reader.cancel());
        try {
          reader.releaseLock();
        } catch {
          // The enclosing document.destroy() remains the fail-closed cleanup.
        }
      }
      if (currentLine) lines.push(currentLine);
      const pageText = lines.join('\n');
      pages.push(pageText);
      page.cleanup();
    }
    return parseResumeText(pages.join('\n'));
  } finally {
    await settleCleanup(() => pdfDocument.destroy());
  }
};
