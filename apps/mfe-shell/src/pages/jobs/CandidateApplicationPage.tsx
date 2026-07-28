import React, { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { KvkkNoticeDisclosure } from '../../features/ats-portals/KvkkNoticeBody';
import { noticeFor } from '../../features/ats-portals/kvkk-notices';
import {
  confirmResumeImport,
  createResumeImport,
  createApplicationIdempotencyKey,
  createCandidateAccessToken,
  DEFAULT_APPLICATION_FIELDS,
  getResumeImport,
  getPublicJob,
  replaceResumePdf,
  saveCandidateSession,
  submitApplication,
  terminateResumeImport,
  updateResumeProposal,
  uploadResumePdf,
  APPLICATION_NOTICE_VERSION,
  RESUME_IMPORT_NOTICE_VERSION,
  type ApplicationFieldKey,
  type ResumeFieldKey,
  RESUME_ONLY_FIELDS,
  APPLICATION_ENTRY_LIMITS,
  type ApplicationEducationEntry,
  type ApplicationExperienceEntry,
  type ApplicationReceiptDto,
  type PublicJobDto,
  type ResumeDraftDto,
  type ResumeImportDto,
  type ResumeProposalDto,
} from '../../features/ats-portals/api/application-api';

/**
 * Tek satırlık metin alanları. `experience` ve `education` BİLİNÇLİ olarak yok:
 * ats#215 ile bu ikisi çoğaltılabilir girdi listesine taşındı (aşağıdaki
 * `experienceEntries`/`educationEntries` state'i). Burada da bırakılsalardı
 * aynı bilginin iki kaynağı olurdu ve hangisinin gönderildiği sessizce
 * ayrışabilirdi. Backend'e giden tek-string alan artık girdilerden türetilir.
 */
type ApplicationValues = {
  fullName: string;
  email: string;
  phone: string;
  city: string;
  linkedIn: string;
  portfolio: string;
  summary: string;
  skills: string;
  languages: string;
  certifications: string;
  note: string;
};

type LocalFileMeta = {
  size: number;
  importedFieldCount: number;
};

type ResumeStatus = 'idle' | 'uploading' | 'reviewing' | 'confirmed';

type ResumeBinding = { importId: string; draftVersion: number };

/**
 * Çatışma alanı `ResumeFieldKey`'dir, `keyof ApplicationValues` değil: CV
 * `experience`/`education` önerebilir, ama bu ikisinin formdaki karşılığı artık
 * bir metin kutusu değil girdi listesidir. Çözüm uygulanırken bu iki alan
 * girdi listesine yazılır (bkz. `applyMergeChoices`).
 */
type MergeConflict = {
  field: ResumeFieldKey;
  manualValue: string;
  resumeValue: string;
  mergedValue: string;
  choice: 'manual' | 'resume' | 'edit' | null;
};

/**
 * Girdi satırı. `rowId` yalnız React listesi ve test seçicileri içindir;
 * gönderim gövdesine ASLA girmez — backend şeması `additionalProperties: false`
 * ve bilinmeyen alan isteği reddettirir. Satır silinebildiği için index'i key
 * olarak kullanmak yanlış satırın DOM düğümünü yeniden kullandırırdı.
 */
type EntryRow<T> = { rowId: string; value: T };

/**
 * #239: alan tipine uygun girdi. `kind` yoksa düz metin (mevcut davranış).
 *
 * `month`/`year` seçimi VERİYİ DÜŞÜRMEDEN uygulanır: CV ayrıştırıcısı serbest
 * metin üretebiliyor ("Eyl 2022"). Böyle bir değeri `type="month"` girdisine
 * koymak tarayıcıda BOŞ gösterir — aday, ayrıştırıcının bulduğu bilgiyi
 * kaybettiğini fark etmez. O yüzden tip yalnız değer BOŞ ya da zaten beklenen
 * biçimdeyken uygulanır; eski serbest metin metin girdisinde kalır ve aday
 * isterse temizleyip seçiciyi kullanır.
 */
type EntryFieldKind = 'text' | 'month' | 'year';

type EntryFieldSpec<T> = {
  key: keyof T & string;
  label: string;
  placeholder: string;
  maxLength: number;
  span?: 'full' | 'half';
  rows?: number;
  kind?: EntryFieldKind;
};

const YEAR_VALUE = /^\d{4}$/u;
/** Yazım sırasında yıl olabilecek girdi: yalnız rakam, en çok 4 hane (boş dahil). */
const YEAR_TYPEABLE = /^\d{0,4}$/u;
/**
 * #242 dilim B: deneyim tarihi YIL ya da YIL-AY olabilir (sunucu sözleşmesi
 * `ats#244` ile buna sabitlendi). Yazım sırasında da yapısal kalmalı:
 * "2", "20", "202", "2022", "2022-", "2022-0", "2022-09" hepsi geçerli ARA
 * durumdur. Bitmiş biçim `MONTH_OR_YEAR_VALUE` ile ayrıca doğrulanır.
 */
const MONTH_OR_YEAR_TYPEABLE = /^\d{0,4}(-\d{0,2})?$/u;
const MONTH_OR_YEAR_VALUE = /^\d{4}(-(0[1-9]|1[0-2]))?$/u;
/** Diploma/işe giriş yılı için makul alt sınır; altı veri hatasıdır. */
const MIN_ENTRY_YEAR = 1950;
/**
 * Üst sınır render anında hesaplanır: sabit yazmak yıl dönümünde sessizce
 * eskir ve 1 Ocak'ta geçerli bir yılı reddetmeye başlardı.
 */
const CURRENT_YEAR = new Date().getFullYear();

/**
 * Değer beklenen biçimdeyse (ya da boşsa) yapısal girdi; değilse metin.
 * Kararı DEĞER verir, spec değil — miras veri hiçbir zaman kaybolmaz.
 */
/**
 * Bitiş < başlangıç olan kayıt. YALNIZ iki taraf da yapısal biçimdeyse
 * denetlenir: miras serbest metni ("Eyl 2022") kıyaslamaya zorlamak yanlış
 * pozitif üretir ve adayı düzeltemeyeceği bir hataya kilitler. Boş bitiş
 * "devam ediyor" demek, hata değil.
 */
/**
 * Dört haneli filtre `0001`'i de geçirir. Makul aralık dışındaki yıl bir
 * beyan değil veri hatasıdır; İK onu düzeltemez, aday düzeltebilir.
 */
const hasImplausibleYear = (...years: Array<string | undefined>): boolean =>
  years.some((raw) => {
    const value = (raw ?? '').trim();
    if (!YEAR_VALUE.test(value)) return false;
    const year = Number(value);
    return year < MIN_ENTRY_YEAR || year > CURRENT_YEAR;
  });

const hasBackwardRange = (start: string, end: string, shape: RegExp): boolean => {
  const a = start.trim();
  const b = end.trim();
  if (!a || !b || !shape.test(a) || !shape.test(b)) return false;
  // #242: kıyas yalnız AYNI hassasiyette. "2019-06 → 2019" ("Haziran 2019'da
  // başladı, 2019 içinde bitti") meşru bir beyandır; sözlüksel kıyas onu ters
  // aralık sanardı. Aynı yanlış pozitifi sunucuda da kapattım (ats#244).
  if (a.length !== b.length) return false;
  return b < a; // aynı uzunlukta sözlüksel sıra kronolojiktir
};

const resolveEntryInputKind = (kind: EntryFieldKind | undefined, value: string): EntryFieldKind => {
  // `type="month"` BIRAKILDI: gün istemiyordu ama YILI da kabul etmiyordu,
  // dolayısıyla yıl-only değer metne düşüyor ve aday serbest metin yazabiliyordu
  // — dilim B'nin kapatmak istediği boşluk tam buydu. Yerine filtreli girdi:
  // yalnız rakam ve tek tire; harf YAZILAMAZ, gün uydurulmaz.
  if (kind === 'month') return MONTH_OR_YEAR_TYPEABLE.test(value) ? 'month' : 'text';
  // YAZARKEN de yıl modunda kalmalı: `^\d{4}$` ile ölçmek "199"u (henüz
  // tamamlanmamış) metne düşürüyordu, filtre kapanıyordu ve sonraki tuşta harf
  // girilebiliyordu. Canlıda ölçüldü: "19a9x" → "199" (filtre çalıştı), ama
  // ondan sonra alan `maxLength=40`, `inputMode` yok. Ölçüt "tamamlanmış yıl"
  // değil, "yıl OLABİLİR": yalnız rakam ve en çok 4 hane. Miras serbest metin
  // ("2016-2020", "Eyl 2022") bu testi geçemez, metin girdisinde kalır.
  if (kind === 'year') return YEAR_TYPEABLE.test(value) ? 'year' : 'text';
  return 'text';
};

export const EXPERIENCE_FIELDS: ReadonlyArray<EntryFieldSpec<ApplicationExperienceEntry>> = [
  {
    key: 'title',
    label: 'Pozisyon',
    placeholder: 'Ürün Uzmanı',
    maxLength: APPLICATION_ENTRY_LIMITS.shortText,
    span: 'half',
  },
  {
    key: 'company',
    label: 'Şirket',
    placeholder: 'Örnek Teknoloji',
    maxLength: APPLICATION_ENTRY_LIMITS.shortText,
    span: 'half',
  },
  {
    key: 'startDate',
    label: 'Başlangıç',
    placeholder: '2022-09 veya 2022',
    maxLength: APPLICATION_ENTRY_LIMITS.dateText,
    span: 'half',
    kind: 'month',
  },
  {
    key: 'endDate',
    // Boş bırakmak "devam ediyor" demektir; ayrı bir kutu eklemek yerine
    // etiketin kendisi söylüyor — alan zaten isteğe bağlı.
    label: 'Bitiş (boşsa devam ediyor)',
    placeholder: '2024-03 veya 2024',
    maxLength: APPLICATION_ENTRY_LIMITS.dateText,
    span: 'half',
    kind: 'month',
  },
  {
    key: 'description',
    label: 'Neler yaptınız?',
    placeholder: 'Sorumluluklarınız ve ölçülebilir sonuçlar',
    maxLength: APPLICATION_ENTRY_LIMITS.longText,
    span: 'full',
    rows: 4,
  },
];

export const EDUCATION_FIELDS: ReadonlyArray<EntryFieldSpec<ApplicationEducationEntry>> = [
  {
    key: 'school',
    label: 'Okul',
    placeholder: 'Örnek Üniversitesi',
    maxLength: APPLICATION_ENTRY_LIMITS.shortText,
    span: 'half',
  },
  {
    key: 'degree',
    label: 'Derece',
    placeholder: 'Lisans',
    maxLength: APPLICATION_ENTRY_LIMITS.shortText,
    span: 'half',
  },
  {
    key: 'field',
    label: 'Bölüm',
    placeholder: 'Yönetim Bilişim Sistemleri',
    maxLength: APPLICATION_ENTRY_LIMITS.shortText,
    // Tam genişlik — hem uzun bölüm adı sığsın diye hem de ızgarayı hizalamak için.
    // Beş yarım alan 2 kolonlu ızgarada tek sayı kalır ve eşleşme kayar; canlı
    // ölçüm satırları şöyle veriyordu:
    //   y=1377 Okul + Derece | y=1455 Bölüm + Başlangıç yılı | y=1533 Bitiş yılı
    // Yani başlangıç yılı Bölüm ile eşleşiyor, bitiş yılı yanı boş kalıyordu.
    // Bölüm tam genişliğe alınınca iki yıl aynı satıra gelir (sahip bildirimi
    // 2026-07-26: birbirini takip eden bilgiler aynı satırda olmalı).
    span: 'full',
  },
  {
    key: 'startYear',
    label: 'Başlangıç yılı',
    placeholder: '2016',
    maxLength: APPLICATION_ENTRY_LIMITS.dateText,
    span: 'half',
    kind: 'year',
  },
  {
    key: 'endYear',
    label: 'Bitiş yılı (boşsa devam ediyor)',
    placeholder: '2020',
    maxLength: APPLICATION_ENTRY_LIMITS.dateText,
    span: 'half',
    kind: 'year',
  },
  {
    key: 'description',
    label: 'Eklemek istediğiniz not',
    placeholder: 'Tez, ortalama, burs — isteğe bağlı',
    maxLength: APPLICATION_ENTRY_LIMITS.longText,
    span: 'full',
    rows: 3,
  },
];

const entryHasContent = (entry: Record<string, string | undefined>): boolean =>
  Object.values(entry).some((value) => (value ?? '').trim().length > 0);

const joinDateSpan = (from?: string, to?: string): string => {
  const start = (from ?? '').trim();
  const end = (to ?? '').trim();
  if (!start && !end) return '';
  if (!start) return end;
  if (!end) return start;
  return `${start} - ${end}`;
};

const joinSegments = (parts: Array<string | undefined>): string =>
  parts
    .map((part) => (part ?? '').trim())
    .filter(Boolean)
    .join(' - ');

const withDescription = (head: string, description?: string): string => {
  const tail = (description ?? '').trim();
  if (!head) return tail;
  if (!tail) return head;
  return `${head}\n${tail}`;
};

/**
 * Girdileri backend'in ürettiği tek-string biçime çevirir.
 *
 * Bu bir AYNA: otorite backend `Submission.effectiveExperience()`'tır ve kaydedilen
 * değer oradan gelir. Burada tekrar edilmesinin tek sebebi ÖNİZLEME: aday
 * "Başvuruyu kontrol et" dediğinde İK'nın göreceği metni görmesi gerekir, ve o metin
 * için sunucuya bir tur atmak formu ağırlaştırırdı. Ayna kaydığında önizleme yalan
 * söyler; bu yüzden biçimin ikisinde de aynı olduğunu doğrulayan test var
 * (`derives the legacy string exactly like the backend does`).
 */
export const deriveExperienceText = (entries: ApplicationExperienceEntry[]): string =>
  entries
    .filter(entryHasContent)
    .map((entry) =>
      withDescription(
        joinSegments([entry.title, entry.company, joinDateSpan(entry.startDate, entry.endDate)]),
        entry.description,
      ),
    )
    .join('\n\n');

/**
 * Gönderilecek girdiler: boş satırlar atılır, değerler kırpılır, boşalan alanlar
 * gövdeden çıkarılır. Aday "satır ekle"ye basıp doldurmadan gönderebilir; o satırı
 * sunucuya taşımak gereksiz. Backend de boş satırı atar — bu süzme onun yerine
 * geçmez, yalnız gövdeyi küçültür ve gönderilen şeyi okunur tutar.
 */
export const submittableEntries = <T extends Record<string, string | undefined>>(
  entries: T[],
): T[] =>
  entries.filter(entryHasContent).map((entry) => {
    const trimmed: Record<string, string> = {};
    Object.entries(entry).forEach(([key, value]) => {
      const text = (value ?? '').trim();
      if (text) trimmed[key] = text;
    });
    return trimmed as T;
  });

/** {@link deriveExperienceText} ile aynı ayna gerekçesi. */
export const deriveEducationText = (entries: ApplicationEducationEntry[]): string =>
  entries
    .filter(entryHasContent)
    .map((entry) =>
      withDescription(
        joinSegments([
          entry.school,
          entry.degree,
          entry.field,
          joinDateSpan(entry.startYear, entry.endYear),
        ]),
        entry.description,
      ),
    )
    .join('\n\n');

type View = 'form' | 'preview' | 'receipt';
type FormStep = 'resume' | 'contact' | 'profile';

/** Forma ait adımlar — göstergeden geri dönülebilen küme. `preview`/`receipt` hariç. */
const FORM_STEP_IDS: ReadonlyArray<FormStep> = ['resume', 'contact', 'profile'];

const FORM_STEPS: ReadonlyArray<{ id: FormStep | 'preview' | 'receipt'; label: string }> = [
  { id: 'resume', label: 'CV' },
  { id: 'contact', label: 'Bilgiler' },
  { id: 'profile', label: 'Deneyim' },
  { id: 'preview', label: 'Kontrol' },
  // "Makbuz" Turkcede para alindi belgesidir; basvuru onayi icin yanlis cagrisim.
  // Adim gonderim SONRASI durumu gosteriyor, o yuzden eylem degil DURUM adlandirmasi.
  { id: 'receipt', label: 'Tamamlandı' },
];

const EMPTY_VALUES: ApplicationValues = {
  fullName: '',
  email: '',
  phone: '',
  city: '',
  linkedIn: '',
  portfolio: '',
  summary: '',
  skills: '',
  languages: '',
  certifications: '',
  note: '',
};

const SYNTHETIC_VALUES: ApplicationValues = {
  fullName: 'Deniz Yılmaz',
  email: 'deniz.yilmaz@example.test',
  phone: '+90 555 000 00 00',
  city: 'İstanbul',
  linkedIn: 'https://www.linkedin.com/in/deniz-yilmaz-demo',
  portfolio: 'https://portfolio.example.test/deniz',
  summary:
    'Kullanıcı ihtiyaçlarını erişilebilir ve ölçülebilir ürün deneyimlerine dönüştüren, ekipler arası çalışmaya odaklı ürün profesyoneli.',
  skills: 'Ürün keşfi, kullanıcı araştırması, analitik, yol haritası, erişilebilirlik',
  languages: 'Türkçe — ana dil, İngilizce — ileri seviye',
  certifications: 'Ürün Yönetimi Sertifikası · Örnek Enstitü · 2024',
  note: 'İlanın kullanıcı odaklı ürün geliştirme yaklaşımıyla özellikle ilgileniyorum.',
};

const SYNTHETIC_EXPERIENCE: ApplicationExperienceEntry[] = [
  {
    title: 'Ürün Uzmanı',
    company: 'Örnek Teknoloji',
    startDate: 'Eyl 2022',
    endDate: 'Devam ediyor',
    description: 'Keşif görüşmeleri, yol haritası ve erişilebilirlik iyileştirmeleri.',
  },
  {
    title: 'Ürün Analisti',
    company: 'Demo Yazılım',
    startDate: '2020',
    endDate: '2022',
    description: 'Kullanım verisi analizi ve raporlama.',
  },
];

const SYNTHETIC_EDUCATION: ApplicationEducationEntry[] = [
  {
    school: 'Örnek Üniversitesi',
    degree: 'Lisans',
    field: 'Yönetim Bilişim Sistemleri',
    startYear: '2016',
    endYear: '2020',
  },
];

/**
 * Metin kutusu olarak doldurulan zorunlu alanlar. `experience`/`education`
 * BURADA DEĞİL: onların zorunluluğu "en az bir dolu girdi" olarak ayrıca
 * denetlenir (bkz. `openPreview`), çünkü backend doğrulaması da tek-string
 * alanın kendisinde değil girdilerden TÜRETİLEN metinde koşar.
 */
const REQUIRED_FIELDS: Array<keyof ApplicationValues> = [
  'fullName',
  'email',
  'phone',
  'city',
  'summary',
  'skills',
];

const inputClassName =
  'min-h-11 w-full rounded-xl border border-border-subtle bg-surface-default px-3.5 py-2.5 text-sm text-text-primary shadow-xs outline-hidden transition placeholder:text-text-subtle focus:border-action-primary focus:ring-2 focus:ring-selection-outline';
const labelClassName = 'text-sm font-semibold text-text-primary';
const sectionClassName =
  'rounded-2xl border border-border-subtle bg-surface-default p-5 shadow-xs sm:p-6';

const FIELD_LABELS: Record<ApplicationFieldKey, string> = {
  fullName: 'Ad soyad',
  email: 'E-posta',
  phone: 'Telefon',
  city: 'Şehir',
  linkedIn: 'LinkedIn',
  portfolio: 'Portföy / kişisel site',
  summary: 'Profesyonel özet',
  experience: 'İş deneyimi',
  education: 'Eğitim',
  skills: 'Beceriler',
  note: 'Ek not',
};

/**
 * Ayrıştırıcı formun taşıdığından fazlasını çıkarır. Etiketi olmayan alan,
 * gözden geçirme listesinde BAŞLIKSIZ kart olarak görünüyordu — canlı ölçümde
 * `languages` ve `certifications` kartları böyle çıktı (bkz. ats#204 v5).
 */
const RESUME_FIELD_LABELS: Record<ResumeFieldKey, string> = {
  ...FIELD_LABELS,
  languages: 'Diller',
  certifications: 'Sertifikalar ve eğitimler',
};

/**
 * Karar durumunun kendisi görünür olmalı. Önceki yüzeyde beş durum da aynı nötr
 * rozeti taşıyordu; kabul edilen, düzenlenen ve reddedilen alan birbirinden
 * ayırt edilemiyordu. Her duruma kendi rengi, simgesi ve kart aksanı verildi.
 */
export const RESUME_DECISION_STYLES = {
  UNREVIEWED: {
    label: 'Karar bekliyor',
    mark: '○',
    // Nötr KALMALI. Ölçüm: `border-strong` = oklch(0.5461 0.2152 262.88), yani
    // doygun marka MAVİSİ — bekleyen kartı hem karar verilmiş gibi gösteriyor
    // hem EDITED'in mavisiyle (hue 259.81) neredeyse aynı okunuyordu.
    // `text-secondary` = oklch(0.4461 0.0263 256.8): gerçek nötr gri.
    badge: 'border-border-subtle text-text-secondary',
    accent: 'bg-text-secondary',
    card: 'border-border-subtle bg-surface-default',
  },
  CONTROL_REQUIRED: {
    label: 'Elle kontrol gerekli',
    mark: '!',
    badge: 'border-state-warning-border bg-state-warning-bg text-state-warning-text',
    accent: 'bg-state-warning-border',
    card: 'border-state-warning-border bg-surface-default',
  },
  ACCEPTED: {
    label: 'Kabul edildi',
    mark: '✓',
    badge: 'border-state-success-border bg-state-success-bg text-state-success-text',
    accent: 'bg-state-success-border',
    card: 'border-state-success-border bg-state-success-bg/40',
  },
  EDITED: {
    label: 'Düzenlendi',
    mark: '✎',
    badge: 'border-state-info-border bg-state-info-bg text-state-info-text',
    accent: 'bg-state-info-border',
    card: 'border-state-info-border bg-state-info-bg/40',
  },
  REJECTED: {
    label: 'Reddedildi',
    mark: '✕',
    // Reddedilen kart, karar BEKLEYEN karttan ayırt edilebilir olmak zorunda.
    // İlk sürümde ikisi de border-border-subtle + bg-border-strong taşıyordu:
    // rozet dışında hiçbir görsel fark yoktu (canlı geri bildirim: "çerçeve
    // rengi değişmiyor"). Dışlama sinyali için danger ailesi kullanılıyor.
    badge: 'border-state-danger-border bg-state-danger-bg text-state-danger-text',
    accent: 'bg-state-danger-border',
    card: 'border-state-danger-border bg-state-danger-bg/40',
  },
} as const;

const DECIDED_RESUME_STATES: readonly string[] = ['ACCEPTED', 'EDITED', 'REJECTED'];

/** Ham yüzde tek başına eylem çağırmıyor; adayın ne yapması gerektiğini söyle. */
const confidenceWording = (confidence: number) => {
  const percent = Math.round(confidence * 100);
  if (percent >= 85) return { text: `Yüksek güven · %${percent}`, warn: false };
  if (percent >= 60) return { text: `Orta güven · %${percent} — gözden geçirin`, warn: false };
  return { text: `Düşük güven · %${percent} — kontrol edin`, warn: true };
};

const humanizeSlug = (slug: string) =>
  slug
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toLocaleUpperCase('tr-TR') + part.slice(1))
    .join(' ');

const formatBytes = (value: number) => {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
};

const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

const isValidPhone = (value: string) => value.replace(/\D/g, '').length >= 7;

const isValidOptionalHttpUrl = (value: string) => {
  if (!value.trim()) return true;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
};

const CandidateApplicationPage = () => {
  const { publicHandle, jobSlug = 'urun-yoneticisi' } = useParams();
  const jobsBase = publicHandle ? `/careers/${encodeURIComponent(publicHandle)}/jobs` : '/jobs';
  const [job, setJob] = useState<PublicJobDto | null>(null);
  const [jobError, setJobError] = useState('');
  const [values, setValues] = useState<ApplicationValues>(EMPTY_VALUES);
  const rowIdRef = useRef(0);
  const nextRowId = () => {
    rowIdRef.current += 1;
    return `r${rowIdRef.current}`;
  };
  const toRows = <T,>(entries: T[]): Array<EntryRow<T>> =>
    entries.map((value) => ({ rowId: nextRowId(), value }));
  // Form ilk açıldığında birer boş satır durur: aday "ekle"ye basmadan yazmaya
  // başlayabilsin. Boş satır gönderilmez (hem burada süzülür hem backend atar).
  const [experienceRows, setExperienceRows] = useState<Array<EntryRow<ApplicationExperienceEntry>>>(
    () => [{ rowId: 'r0', value: {} }],
  );
  const [educationRows, setEducationRows] = useState<Array<EntryRow<ApplicationEducationEntry>>>(
    () => [{ rowId: 'r0e', value: {} }],
  );
  const experienceEntries = experienceRows.map((row) => row.value);
  const educationEntries = educationRows.map((row) => row.value);
  const derivedExperience = deriveExperienceText(experienceEntries);
  const derivedEducation = deriveEducationText(educationEntries);
  const [view, setView] = useState<View>('form');
  /**
   * #1048: `formStep` artık bölüm GİZLEMİYOR — üç bölüm (CV / İletişim /
   * Deneyim) aynı sayfada aşağı doğru akıyor. Aralarında işlevsel bir kapı
   * yoktu: aday CV yüklemeden de bilgilerini girebilir, CV önerileri
   * aşağıdaki alanları besler. Aşama gizlemek, kullanıcıya sebepsiz bir
   * sıra dayatıyordu.
   *
   * State KALDIRILMADI çünkü 11 çağrı yerinin niyeti hâlâ geçerli: "adayı
   * iletişim bölümüne götür". Artık bunu gizleyerek değil KAYDIRARAK yapıyor.
   * Gerçek kapılar (`preview` açık onayı, `receipt` gönderim sonrası durumu)
   * ayrı `view` state'inde ve olduğu gibi duruyor.
   */
  const [formStep, setFormStep] = useState<FormStep>('resume');
  const resumeSectionRef = useRef<HTMLDivElement | null>(null);
  const contactSectionRef = useRef<HTMLDivElement | null>(null);
  const profileSectionRef = useRef<HTMLDivElement | null>(null);
  /** İlk render'da kaydırma YOK: sayfa açılışında zıplamak istemiyoruz. */
  const stepScrollArmed = useRef(false);
  const [fileMeta, setFileMeta] = useState<LocalFileMeta | null>(null);
  const [fileError, setFileError] = useState('');
  const [resumeStatus, setResumeStatus] = useState<ResumeStatus>('idle');
  const [resumeNoticeAccepted, setResumeNoticeAccepted] = useState(false);
  const [resumeNoticeAcceptedAt, setResumeNoticeAcceptedAt] = useState('');
  const [resumeImport, setResumeImport] = useState<ResumeImportDto | null>(null);
  const [resumeBinding, setResumeBinding] = useState<ResumeBinding | null>(null);
  const [resumeEdits, setResumeEdits] = useState<Partial<Record<ResumeFieldKey, string>>>({});
  const [resumeBusyField, setResumeBusyField] = useState<ResumeFieldKey | 'all' | null>(null);
  const [replaceRequested, setReplaceRequested] = useState(false);
  const [showRejectAllConfirm, setShowRejectAllConfirm] = useState(false);
  const [mergeConflicts, setMergeConflicts] = useState<MergeConflict[]>([]);
  const [formError, setFormError] = useState('');
  const [noticeAccepted, setNoticeAccepted] = useState(false);
  const [noticeAcceptedAt, setNoticeAcceptedAt] = useState('');
  const [accuracyConfirmed, setAccuracyConfirmed] = useState(false);
  const [accuracyConfirmedAt, setAccuracyConfirmedAt] = useState('');
  const [receipt, setReceipt] = useState<ApplicationReceiptDto | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [candidateSessionSaved, setCandidateSessionSaved] = useState(false);
  const [credentialCopied, setCredentialCopied] = useState(false);
  const [credentialDownloaded, setCredentialDownloaded] = useState(false);
  const idempotencyKeyRef = useRef(createApplicationIdempotencyKey());
  const resumeCreateKeyRef = useRef(createApplicationIdempotencyKey());
  const candidateAccessTokenRef = useRef(createCandidateAccessToken());
  const resumeRequestIdRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileErrorRef = useRef<HTMLParagraphElement>(null);
  const previewHeadingRef = useRef<HTMLHeadingElement>(null);
  const receiptHeadingRef = useRef<HTMLHeadingElement>(null);
  /**
   * Aydınlatma metinleri. Kiracı, kariyer sayfasının yol parametresidir.
   *
   * FAIL-CLOSED: metin yoksa `null` döner ve o onay kutusu GÖSTERİLMEZ (gönderim de
   * kapalı kalır, çünkü `noticeAccepted` hiç true olamaz). Kusurun kendisi buydu:
   * sistem yalnız sürüm kimliği taşıyor, "okudum" beyanı alıyor ve o beyanı kalıcı
   * kaydediyordu. Metni olmayan bir sürüm için onay toplanamaz.
   */
  const applicationNotice = noticeFor(job?.noticeVersion ?? APPLICATION_NOTICE_VERSION, publicHandle);
  const resumeNotice = noticeFor(RESUME_IMPORT_NOTICE_VERSION, publicHandle);
  const noticeHref = publicHandle
    ? `/careers/${encodeURIComponent(publicHandle)}/jobs/aydinlatma`
    : '/jobs/aydinlatma';
  const enabledFields = job?.applicationFields ?? DEFAULT_APPLICATION_FIELDS;
  /**
   * İlan bazlı alan açma/kapatma yalnız backend `applicationFields` listesinin
   * ifade edebildiği alanlar için işler. `languages`/`certifications` o listede
   * yok: ats#215 ile forma eklendiler ama ilan DTO'sunun alan kümesi (backend
   * `ApplicationField` enum'ı) onları taşımıyor. Bu yüzden her ilanda görünürler
   * — ikisi de isteğe bağlı olduğu için kapalı bir ilanda aday zorlanmaz. İlan
   * bazlı kapatma istenirse backend enum'ının genişletilmesi gerekir (ayrı iş).
   */
  const isFieldEnabled = (field: keyof ApplicationValues): boolean =>
    field === 'languages' ||
    field === 'certifications' ||
    enabledFields.some((enabled) => enabled === field);

  useEffect(() => {
    const heading = view === 'preview' ? previewHeadingRef.current : receiptHeadingRef.current;
    if (!heading) return undefined;
    const timer = window.setTimeout(() => heading.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [view]);

  useEffect(() => {
    let cancelled = false;
    setJob(null);
    setJobError('');
    void getPublicJob(jobSlug, publicHandle)
      .then((loaded) => {
        if (!cancelled) setJob(loaded);
      })
      .catch((loadError: unknown) => {
        if (!cancelled) {
          setJobError(loadError instanceof Error ? loadError.message : 'İlan yüklenemedi.');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [jobSlug, publicHandle]);

  const updateValue =
    (
      field: keyof ApplicationValues,
    ): React.ChangeEventHandler<HTMLInputElement | HTMLTextAreaElement> =>
    (event) => {
      setValues((current) => ({ ...current, [field]: event.target.value }));
      setFormError('');
      setSubmitError('');
    };

  /**
   * Girdi listesi düzenleyicileri. Üçü de aynı kalıbı izler ve state'i kopyalayarak
   * değiştirir; satır kimliği korunur, yalnız değeri değişir.
   */
  const updateEntryField =
    <T,>(
      setRows: React.Dispatch<React.SetStateAction<Array<EntryRow<T>>>>,
      index: number,
      key: keyof T & string,
    ): React.ChangeEventHandler<HTMLInputElement | HTMLTextAreaElement> =>
    (event) => {
      const nextValue = event.target.value;
      setRows((current) =>
        current.map((row, rowIndex) =>
          rowIndex === index ? { ...row, value: { ...row.value, [key]: nextValue } } : row,
        ),
      );
      setFormError('');
      setSubmitError('');
    };

  const addEntryRow = <T,>(
    setRows: React.Dispatch<React.SetStateAction<Array<EntryRow<T>>>>,
  ): void => {
    setRows((current) =>
      // Üst sınır backend ile aynı: aşan satır sunucuda 400 döndürürdü, o yüzden
      // düğme burada sessizce çalışmak yerine hiç eklemez (düğme de gizlenir).
      current.length >= APPLICATION_ENTRY_LIMITS.maxEntries
        ? current
        : [...current, { rowId: nextRowId(), value: {} as T }],
    );
    setFormError('');
  };

  const removeEntryRow = <T,>(
    setRows: React.Dispatch<React.SetStateAction<Array<EntryRow<T>>>>,
    index: number,
  ): void => {
    setRows((current) =>
      // Son satır silinmez, boşaltılır: liste tamamen boşalırsa aday yazacak yer
      // bulamaz ve "satır ekle"yi bulmak zorunda kalır.
      current.length <= 1
        ? [{ rowId: nextRowId(), value: {} as T }]
        : current.filter((_, rowIndex) => rowIndex !== index),
    );
    setFormError('');
  };

  const applySyntheticResume = () => {
    setValues(SYNTHETIC_VALUES);
    setExperienceRows(toRows(SYNTHETIC_EXPERIENCE));
    setEducationRows(toRows(SYNTHETIC_EDUCATION));
    setFormError('');
    setFormStep('contact');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  useEffect(() => {
    if (!fileError || !fileErrorRef.current) return;
    fileErrorRef.current.focus();
  }, [fileError]);

  const waitForResumeProposals = async (current: ResumeImportDto): Promise<ResumeImportDto> => {
    if (current.proposals.length > 0) return current;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, 500));
      const next = await getResumeImport(current.importId, candidateAccessTokenRef.current);
      if (next.proposals.length > 0 || next.state !== 'ACTIVE') return next;
    }
    throw new Error(
      'PDF işleme beklenenden uzun sürdü. Formu elle doldurabilir veya tekrar deneyebilirsiniz.',
    );
  };

  const handleFileChange: React.ChangeEventHandler<HTMLInputElement> = async (event) => {
    const requestId = ++resumeRequestIdRef.current;
    const file = event.target.files?.[0];
    setFileError('');
    setFileMeta(null);
    if (!file) return;

    const hasPdfExtension = file.name.toLowerCase().endsWith('.pdf');
    const hasAllowedPdfMime = file.type === '' || file.type === 'application/pdf';
    const looksLikePdf = hasPdfExtension && hasAllowedPdfMime;
    if (!looksLikePdf) {
      setFileError('Yalnız PDF dosyası seçebilirsiniz.');
      event.target.value = '';
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setFileError('PDF dosyası en fazla 10 MB olabilir.');
      event.target.value = '';
      return;
    }

    if (!resumeNoticeAccepted || !resumeNoticeAcceptedAt) {
      setFileError('PDF yüklemeden önce CV içe aktarma aydınlatmasını okuyup onaylayın.');
      event.target.value = '';
      return;
    }

    setResumeStatus('uploading');
    try {
      let active = resumeImport;
      if (!active || active.state !== 'ACTIVE') {
        active = await createResumeImport(
          jobSlug,
          resumeCreateKeyRef.current,
          candidateAccessTokenRef.current,
          resumeNoticeAcceptedAt,
          publicHandle,
        );
      } else if (replaceRequested && active.documentVersion > 0) {
        active = await replaceResumePdf(active, candidateAccessTokenRef.current);
      }
      const uploadKey = createApplicationIdempotencyKey();
      const uploaded = await uploadResumePdf(
        active,
        file,
        uploadKey,
        candidateAccessTokenRef.current,
      );
      const reviewed = uploaded.inFlight
        ? await waitForResumeProposals(uploaded.resumeImport)
        : uploaded.resumeImport;
      if (requestId !== resumeRequestIdRef.current) return;
      if (reviewed.proposals.length === 0) {
        setFileError(
          'Bu PDF’den önerilebilecek form alanı bulunamadı. Metin içeren başka bir PDF seçin veya alanları elle doldurun.',
        );
        setResumeStatus('idle');
        return;
      }
      setResumeImport(reviewed);
      setResumeEdits(
        Object.fromEntries(
          reviewed.proposals.map((proposal) => [
            proposal.field,
            proposal.candidateValue ?? proposal.proposedValue,
          ]),
        ),
      );
      setFileMeta({ size: file.size, importedFieldCount: 0 });
      setResumeStatus('reviewing');
      setResumeBinding(null);
      setMergeConflicts([]);
      setFormError('');
      setSubmitError('');
    } catch (uploadError) {
      if (requestId !== resumeRequestIdRef.current) return;
      setFileError(
        uploadError instanceof Error
          ? uploadError.message
          : 'PDF güvenli biçimde işlenemedi. Farklı bir PDF seçin veya alanları elle doldurun.',
      );
      setResumeStatus('idle');
    } finally {
      event.target.value = '';
      setReplaceRequested(false);
    }
  };

  const discardResume = async (terminalState: 'CANCELLED' | 'REJECT_ALL') => {
    resumeRequestIdRef.current += 1;
    setFileError('');
    setResumeBusyField('all');
    try {
      if (resumeImport?.state === 'ACTIVE') {
        await terminateResumeImport(resumeImport, candidateAccessTokenRef.current, terminalState);
      }
      setResumeImport(null);
      setResumeBinding(null);
      setResumeEdits({});
      setMergeConflicts([]);
      setFileMeta(null);
      setResumeStatus('idle');
      setShowRejectAllConfirm(false);
      resumeCreateKeyRef.current = createApplicationIdempotencyKey();
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (terminateError) {
      setFileError(
        terminateError instanceof Error ? terminateError.message : 'CV işlemi sonlandırılamadı.',
      );
    } finally {
      setResumeBusyField(null);
    }
  };

  const recoverResumeVersionConflict = async (importId: string, message: string) => {
    try {
      const latest = await getResumeImport(importId, candidateAccessTokenRef.current);
      setResumeImport(latest);
      setResumeEdits(
        Object.fromEntries(
          latest.proposals.map((proposal) => [
            proposal.field,
            proposal.candidateValue ?? proposal.proposedValue,
          ]),
        ),
      );
      setFileError(message);
    } catch {
      setFileError(
        'CV alan sürümü değişti ve güncel durum yüklenemedi. Formu elle doldurabilirsiniz.',
      );
    }
  };

  const decideResumeField = async (
    proposal: ResumeProposalDto,
    state: 'ACCEPTED' | 'EDITED' | 'REJECTED',
  ) => {
    if (!resumeImport || resumeBusyField) return;
    const editedValue = resumeEdits[proposal.field]?.trim();
    if (state === 'EDITED' && !editedValue) {
      setFileError(`${RESUME_FIELD_LABELS[proposal.field]} için düzenlenmiş değer boş olamaz.`);
      return;
    }
    setFileError('');
    setResumeBusyField(proposal.field);
    try {
      const updated = await updateResumeProposal(
        resumeImport,
        proposal.field,
        state,
        candidateAccessTokenRef.current,
        editedValue,
      );
      setResumeImport(updated);
    } catch (fieldError) {
      if (fieldError instanceof Error && fieldError.message.includes('VERSION_CONFLICT')) {
        await recoverResumeVersionConflict(
          resumeImport.importId,
          'CV alanları başka bir istekte değişti. Güncel kararlar yüklendi; seçiminizi yeniden kontrol edin.',
        );
      } else {
        setFileError(
          fieldError instanceof Error ? fieldError.message : 'Alan kararı kaydedilemedi.',
        );
      }
    } finally {
      setResumeBusyField(null);
    }
  };

  const acceptAllSafeProposals = async () => {
    if (!resumeImport || resumeBusyField) return;
    setFileError('');
    setResumeBusyField('all');
    let current = resumeImport;
    try {
      for (const proposal of current.proposals) {
        if (proposal.state !== 'UNREVIEWED') continue;
        current = await updateResumeProposal(
          current,
          proposal.field,
          'ACCEPTED',
          candidateAccessTokenRef.current,
        );
        setResumeImport(current);
      }
    } catch (fieldError) {
      if (fieldError instanceof Error && fieldError.message.includes('VERSION_CONFLICT')) {
        await recoverResumeVersionConflict(
          current.importId,
          'CV alanları başka bir istekte değişti. Güncel kararlar yüklendi; kalan alanları yeniden kontrol edin.',
        );
      } else {
        setFileError(
          fieldError instanceof Error ? fieldError.message : 'Alan kararları kaydedilemedi.',
        );
      }
    } finally {
      setResumeBusyField(null);
    }
  };

  /**
   * #218: ayrıştırıcının verdiği tarih METNİ ("2019 - 2023", "Eyl 2022 - Devam
   * ediyor") formun iki ayrı alanına bölünür. Ayırıcı yoksa bölmek yerine metin
   * OLDUĞU GİBİ başlangıç alanına yazılmaz — tek parça tarihi "başlangıç" diye
   * göstermek yanlış veri olur. O durumda açıklamaya eklenir: aday görür ve
   * düzeltir, ama hiçbir bilgi kaybolmaz.
   */
  const splitDateRange = (dateText: string): { start: string; end: string; leftover: string } => {
    const raw = dateText.trim();
    if (!raw) return { start: '', end: '', leftover: '' };
    const parts = raw.split(/\s*[-–—]\s*/u);
    if (parts.length === 2 && parts[0].trim() && parts[1].trim()) {
      return { start: parts[0].trim(), end: parts[1].trim(), leftover: '' };
    }
    return { start: '', end: '', leftover: raw };
  };

  const applyDraftToForm = (draft: ResumeDraftDto) => {
    let imported = 0;
    const conflicts: MergeConflict[] = [];
    const next = { ...values };
    let nextExperience: Array<EntryRow<ApplicationExperienceEntry>> | null = null;
    let nextEducation: Array<EntryRow<ApplicationEducationEntry>> | null = null;

    Object.entries(draft.fields).forEach(([rawField, rawValue]) => {
      const field = rawField as ResumeFieldKey;
      const resumeValue = rawValue?.trim() ?? '';
      if (!resumeValue) return;

      // Deneyim ve eğitim girdi listesi. #218'den beri ayrıştırıcı bölümü KAYITLARA
      // gruplayıp yayınlıyor; varsa her kayıt AYRI KART olur. Yoksa (eski backend,
      // ya da gruplama güvenilir değil) gelen metin ilk kaydın açıklaması olur —
      // bugünkü davranış fallback kalır, bilgi kaybolmaz.
      if (field === 'experience' || field === 'education') {
        const current = field === 'experience' ? derivedExperience : derivedEducation;
        if (!current.trim() || current === resumeValue) {
          const grouped = draft.entries?.[field] ?? [];
          if (grouped.length > 0) {
            if (field === 'experience') {
              nextExperience = grouped.map((entry) => {
                const { start, end, leftover } = splitDateRange(entry.dateText);
                const description = [leftover, entry.description]
                  .filter((part) => part.trim())
                  .join('\n');
                return {
                  rowId: nextRowId(),
                  value: {
                    ...(entry.title.trim() ? { title: entry.title.trim() } : {}),
                    ...(entry.subtitle.trim() ? { company: entry.subtitle.trim() } : {}),
                    ...(start ? { startDate: start } : {}),
                    ...(end ? { endDate: end } : {}),
                    ...(description ? { description } : {}),
                  },
                };
              });
            } else {
              nextEducation = grouped.map((entry) => {
                const { start, end, leftover } = splitDateRange(entry.dateText);
                const description = [leftover, entry.description]
                  .filter((part) => part.trim())
                  .join('\n');
                return {
                  rowId: nextRowId(),
                  value: {
                    ...(entry.title.trim() ? { school: entry.title.trim() } : {}),
                    ...(entry.subtitle.trim() ? { field: entry.subtitle.trim() } : {}),
                    ...(start ? { startYear: start } : {}),
                    ...(end ? { endYear: end } : {}),
                    ...(description ? { description } : {}),
                  },
                };
              });
            }
            imported += 1;
            return;
          }
          if (field === 'experience') {
            nextExperience = [{ rowId: nextRowId(), value: { description: resumeValue } }];
          } else {
            nextEducation = [{ rowId: nextRowId(), value: { description: resumeValue } }];
          }
          imported += 1;
        } else {
          conflicts.push({
            field,
            manualValue: current,
            resumeValue,
            mergedValue: `${current}\n${resumeValue}`,
            choice: null,
          });
        }
        return;
      }

      if (!(field in next)) return;
      const formField = field as keyof ApplicationValues;
      if (!values[formField].trim() || values[formField] === resumeValue) {
        next[formField] = resumeValue;
        imported += 1;
      } else {
        conflicts.push({
          field: formField,
          manualValue: values[formField],
          resumeValue,
          mergedValue: `${values[formField]}\n${resumeValue}`,
          choice: null,
        });
      }
    });

    setValues(next);
    if (nextExperience) setExperienceRows(nextExperience);
    if (nextEducation) setEducationRows(nextEducation);
    setMergeConflicts(conflicts);
    setFileMeta((current) => (current ? { ...current, importedFieldCount: imported } : current));
    return conflicts.length;
  };

  const confirmReviewedResume = async () => {
    if (!resumeImport || resumeBusyField) return;
    setFileError('');
    setResumeBusyField('all');
    try {
      const confirmed = await confirmResumeImport(resumeImport, candidateAccessTokenRef.current);
      setResumeImport(confirmed.resumeImport);
      setResumeBinding({
        importId: confirmed.draft.importId,
        draftVersion: confirmed.draft.version,
      });
      const conflictCount = applyDraftToForm(confirmed.draft);
      setResumeStatus('confirmed');
      if (conflictCount === 0) {
        setFormStep('contact');
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    } catch (confirmError) {
      if (confirmError instanceof Error && confirmError.message.includes('VERSION_CONFLICT')) {
        await recoverResumeVersionConflict(
          resumeImport.importId,
          'CV alanları başka bir istekte değişti. Güncel kararlar yüklendi; aktarmadan önce yeniden kontrol edin.',
        );
      } else {
        setFileError(
          confirmError instanceof Error ? confirmError.message : 'CV alanları forma aktarılamadı.',
        );
      }
    } finally {
      setResumeBusyField(null);
    }
  };

  const applyMergeChoices = () => {
    if (mergeConflicts.some((conflict) => conflict.choice === null)) return;
    setValues((current) => {
      const next = { ...current };
      mergeConflicts.forEach((conflict) => {
        // Girdi listesine bağlı iki alan aşağıda ayrıca uygulanır.
        if (conflict.field === 'experience' || conflict.field === 'education') return;
        const field = conflict.field as keyof ApplicationValues;
        if (!(field in next)) return;
        if (conflict.choice === 'resume') next[field] = conflict.resumeValue;
        if (conflict.choice === 'edit') next[field] = conflict.mergedValue;
      });
      return next;
    });

    // Deneyim/eğitim çatışmasında "CV'yi kullan" tek girdiye iner; "ikisini birleştir"
    // adayın yazdığı satırları KORUR ve CV metnini yeni bir satır olarak ekler —
    // birleştirilmiş metni tek satıra ezmek adayın yapılandırdığı bilgiyi düzleştirirdi.
    mergeConflicts.forEach((conflict) => {
      if (conflict.field === 'experience') {
        if (conflict.choice === 'resume') {
          setExperienceRows([{ rowId: nextRowId(), value: { description: conflict.resumeValue } }]);
        } else if (conflict.choice === 'edit') {
          setExperienceRows((current) => [
            ...current,
            { rowId: nextRowId(), value: { description: conflict.resumeValue } },
          ]);
        }
      }
      if (conflict.field === 'education') {
        if (conflict.choice === 'resume') {
          setEducationRows([{ rowId: nextRowId(), value: { description: conflict.resumeValue } }]);
        } else if (conflict.choice === 'edit') {
          setEducationRows((current) => [
            ...current,
            { rowId: nextRowId(), value: { description: conflict.resumeValue } },
          ]);
        }
      }
    });
    const imported = mergeConflicts.filter((conflict) =>
      ['resume', 'edit'].includes(conflict.choice ?? ''),
    ).length;
    setFileMeta((current) =>
      current ? { ...current, importedFieldCount: current.importedFieldCount + imported } : current,
    );
    setMergeConflicts([]);
    setFormStep('contact');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  /**
   * #1048: artık bir KAPI değil, kaydırma. Tek sayfada aday alanları istediği
   * sırada doldurabilir; "deneyim bölümüne inmek için iletişimi tamamla"
   * demek düşmanca olurdu. Zorunlu-alan doğrulaması tek gerçek kapıda
   * (`openPreview`) duruyor — iki yerde tutmak drift üretirdi.
   */
  const openProfileStep = () => {
    setFormError('');
    setFormStep('profile');
  };

  const openPreview: React.FormEventHandler<HTMLFormElement> = (event) => {
    event.preventDefault();
    if (resumeStatus === 'uploading') {
      setFormError(
        'PDF işlenirken formu doldurabilirsiniz; önizleme için işlemin tamamlanmasını bekleyin veya CV işlemini iptal edin.',
      );
      return;
    }
    if (mergeConflicts.length > 0) {
      setFormError('Önizlemeden önce dolu alanlarla CV önerileri arasındaki seçimleri tamamlayın.');
      return;
    }
    const missing = REQUIRED_FIELDS.some((field) => values[field].trim().length === 0);
    if (missing) {
      setFormError('Önizlemeye geçmek için yıldızlı alanları doldurun.');
      return;
    }
    // #239: bitiş < başlangıç sessizce gönderilmemeli — İK bunu veri hatası
    // olarak değil adayın beyanı olarak okur.
    const backwardExperience = experienceRows.some((row) =>
      hasBackwardRange(row.value.startDate ?? '', row.value.endDate ?? '', MONTH_OR_YEAR_VALUE),
    );
    const backwardEducation = educationRows.some((row) =>
      hasBackwardRange(row.value.startYear ?? '', row.value.endYear ?? '', YEAR_VALUE),
    );
    if (backwardExperience || backwardEducation) {
      setFormError('Bitiş tarihi başlangıçtan önce olamaz; ilgili kaydı düzeltin.');
      return;
    }
    if (
      educationRows.some((row) => hasImplausibleYear(row.value.startYear, row.value.endYear))
    ) {
      setFormError(`Eğitim yılı ${MIN_ENTRY_YEAR} ile ${CURRENT_YEAR} arasında olmalı.`);
      return;
    }
    // Deneyim/eğitim zorunluluğu TÜRETİLMİŞ metin üzerinde denetlenir; backend
    // doğrulaması da (`between(effectiveExperience(), 1, 8000)`) aynı değere bakar.
    // Satır sayısına bakmak yanıltıcı olurdu: boş satır sayılırdı.
    if (!derivedExperience.trim()) {
      setFormError('En az bir iş deneyimi girdisi doldurun.');
      return;
    }
    if (!derivedEducation.trim()) {
      setFormError('En az bir eğitim girdisi doldurun.');
      return;
    }
    if (!isValidEmail(values.email)) {
      setFormError('Geçerli bir e-posta adresi girin.');
      return;
    }
    // Sentetik-yalnız (.test e-posta) kısıtı BİLEREK burada uygulanmaz.
    // Aday verisi politikası ortam-parametriktir ve tek otoritesi backend'dir
    // (ats.candidate-data.mode/environment; prod'da real-allowed boot'u düşürür —
    // Halildeu/ats#200). Kuralın burada kopyalanması iki-kaynak/drift üretirdi:
    // frontend "kapalı" derken backend açık olabilir ya da tersi. Backend
    // reddederse gerekçesi submitApplication hatasıyla aynen kullanıcıya gösterilir.
    // Client-side kontrol zaten güvenlik sağlamaz (bypass edilebilir); yalnız UX'tir.
    if (!isValidPhone(values.phone)) {
      setFormError('Geçerli bir telefon numarası girin.');
      return;
    }
    if (!isValidOptionalHttpUrl(values.linkedIn) || !isValidOptionalHttpUrl(values.portfolio)) {
      setFormError('LinkedIn ve portföy adresleri http:// veya https:// ile başlamalıdır.');
      return;
    }
    setFormError('');
    setView('preview');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const createPersistentReceipt = async () => {
    if (
      !job ||
      !noticeAccepted ||
      !noticeAcceptedAt ||
      !accuracyConfirmed ||
      !accuracyConfirmedAt ||
      submitting
    )
      return;
    setSubmitting(true);
    setSubmitError('');
    try {
      const saved = await submitApplication(
        jobSlug,
        idempotencyKeyRef.current,
        candidateAccessTokenRef.current,
        {
          fullName: values.fullName,
          email: values.email,
          phone: values.phone,
          city: values.city,
          linkedIn: isFieldEnabled('linkedIn') ? values.linkedIn || undefined : undefined,
          portfolio: isFieldEnabled('portfolio') ? values.portfolio || undefined : undefined,
          summary: values.summary,
          // #215 B: eski tek-string alanlar GÖNDERİLMEZ. Backend bunları
          // girdilerden türetir; ikisini birlikte göndermek hangisinin
          // kazandığını belirsiz bırakır ve iki kaynak yaratırdı.
          experienceEntries: submittableEntries(experienceEntries),
          educationEntries: submittableEntries(educationEntries),
          skills: values.skills
            .split(',')
            .map((skill) => skill.trim())
            .filter(Boolean),
          languages: values.languages.trim() || undefined,
          certifications: values.certifications.trim() || undefined,
          note: isFieldEnabled('note') ? values.note || undefined : undefined,
          noticeVersion: job.noticeVersion,
          noticeAcceptedAt,
          accuracyConfirmedAt,
          ...(resumeBinding
            ? {
                resumeImportId: resumeBinding.importId,
                resumeDraftVersion: resumeBinding.draftVersion,
              }
            : {}),
        },
        publicHandle,
      );
      setReceipt(saved);
      setCandidateSessionSaved(saveCandidateSession(saved));
      setView('receipt');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (submissionError) {
      setSubmitError(
        submissionError instanceof Error ? submissionError.message : 'Başvuru gönderilemedi.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  /**
   * Önizlemeden forma dönüş. Onaylar SIFIRLANIR ve idempotency anahtarı yenilenir:
   * KVKK aydınlatması ve doğruluk beyanı ÖNİZLENEN veriye verilmiştir; aday geri
   * dönüp veriyi değiştirdikten sonra o beyanı taşımak, onaylanmamış içeriği
   * onaylanmış gibi göndermek olurdu. Anahtar da yenilenir çünkü gövde değişti.
   */
  const editApplication = (target: FormStep = 'profile') => {
    setNoticeAccepted(false);
    setNoticeAcceptedAt('');
    setAccuracyConfirmed(false);
    setAccuracyConfirmedAt('');
    setSubmitError('');
    idempotencyKeyRef.current = createApplicationIdempotencyKey();
    setView('form');
    setFormStep(target);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  /**
   * Üstteki ilerleme göstergesinden doğrudan adım değiştirme (sahip talebi
   * 2026-07-26: "istediğim adıma direk dönebileyim, üstte gösterdiği ilerleme
   * alanını bunun için kullanabiliriz").
   *
   * Ölçülen sorun: profil adımında sayfa 2763px, ekran 998px ve tek geri düğmesi
   * y=2317'de — iki ekrandan fazla aşağıda. Çoğaltılabilir kartlar (ats#215 B)
   * sayfayı uzattığı için bunu ben kötüleştirdim. Gösterge sayfanın en üstünde,
   * her adımda aynı yerde: doğru yer orası.
   *
   * YALNIZ tamamlanmış adımlar tıklanır. İleri atlama açılmadı: sonraki adıma
   * geçiş zorunlu-alan doğrulamasına tabidir ve tıklanabilir gösterip sessizce
   * hiçbir şey yapmamak, olmayan bir yol varmış gibi görünmekten daha kötüdür.
   * Makbuz görünümünde hiçbir adım tıklanmaz — başvuru gönderilmiştir.
   */
  const goToStep = (target: FormStep) => {
    setFormError('');
    if (view === 'preview') {
      editApplication(target);
      return;
    }
    setFormStep(target);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const resetDemo = () => {
    resumeRequestIdRef.current += 1;
    setValues(EMPTY_VALUES);
    setExperienceRows([{ rowId: nextRowId(), value: {} }]);
    setEducationRows([{ rowId: nextRowId(), value: {} }]);
    setFileMeta(null);
    setFileError('');
    setResumeStatus('idle');
    setResumeNoticeAccepted(false);
    setResumeNoticeAcceptedAt('');
    setResumeImport(null);
    setResumeBinding(null);
    setResumeEdits({});
    setResumeBusyField(null);
    setReplaceRequested(false);
    setShowRejectAllConfirm(false);
    setMergeConflicts([]);
    setFormError('');
    setNoticeAccepted(false);
    setAccuracyConfirmed(false);
    setAccuracyConfirmedAt('');
    setNoticeAcceptedAt('');
    setReceipt(null);
    setSubmitError('');
    setCandidateSessionSaved(false);
    setCredentialCopied(false);
    setCredentialDownloaded(false);
    idempotencyKeyRef.current = createApplicationIdempotencyKey();
    resumeCreateKeyRef.current = createApplicationIdempotencyKey();
    candidateAccessTokenRef.current = createCandidateAccessToken();
    setView('form');
    setFormStep('resume');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  /**
   * Pano API'si her ortamda yok (güvenli olmayan köken, izin reddi, eski
   * tarayıcı). Düğme yalnız API varsa çizilir; yoksa aday iki alanı elle
   * seçip kopyalayabilir — kopyalama KOLAYLIK, tek teslim yolu değil.
   */
  const copySupported =
    typeof navigator !== 'undefined' && typeof navigator.clipboard?.writeText === 'function';

  const copyTrackingCredential = async () => {
    if (!receipt?.candidateAccessToken) return;
    try {
      await navigator.clipboard.writeText(
        `Başvuru referansı: ${receipt.publicRef}\nTakip anahtarı: ${receipt.candidateAccessToken}`,
      );
      setCredentialCopied(true);
    } catch {
      // Kopyalama başarısızsa değerler ekranda duruyor; sessiz kal.
      setCredentialCopied(false);
    }
  };

  /**
   * #228: adaya SAKLANABİLİR bir nesne verir. Pano uçucudur — sonraki kopyalama
   * üzerine yazar, pano API'si her ortamda yok, ve sekme kapanınca
   * `sessionStorage` uçtuğu için aday panoya aldığını bir yere yapıştırmamışsa
   * erişimi kalıcı olarak gider. Dosya, adayın kendi bilgisayarında kalır.
   *
   * Sunucuya HİÇ gitmez: `Blob` + object URL tamamen istemcide üretilir, yani
   * anahtar ağa çıkmaz. Dosya adı referansı taşır — aday birden fazla başvuru
   * yapabildiği için (bkz. #226) hangisi olduğu ayırt edilebilmeli.
   */
  const downloadTrackingCredential = () => {
    if (!receipt?.candidateAccessToken) return;
    const lines = [
      'Açık Kariyer — başvuru takip bilgileri',
      '',
      `İlan: ${job?.title ?? jobSlug}`,
      `Başvuru referansı: ${receipt.publicRef}`,
      `Takip anahtarı: ${receipt.candidateAccessToken}`,
      `Gönderim: ${receipt.submittedAt}`,
      '',
      'Bu iki bilgiyi birlikte girerek başvurunuzun durumunu izleyebilirsiniz:',
      `${window.location.origin}/candidate`,
      '',
      'Takip anahtarı başvurunuza erişim sağlar; kimseyle paylaşmayın.',
      'Anahtar güvenlik gereği yeniden gösterilemez.',
      '',
    ];
    const url = URL.createObjectURL(
      new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' }),
    );
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `basvuru-${receipt.publicRef}.txt`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    // Object URL serbest bırakılmazsa sekme kapanana kadar bellekte kalır.
    URL.revokeObjectURL(url);
    setCredentialDownloaded(true);
  };

  const renderField = (
    field: keyof ApplicationValues,
    label: string,
    options?: {
      type?: React.HTMLInputTypeAttribute;
      placeholder?: string;
      required?: boolean;
      autoComplete?: string;
    },
  ) => (
    <div className="flex flex-col gap-2">
      <label className={labelClassName} htmlFor={`candidate-${field}`}>
        {label} {options?.required ? <span className="text-danger">*</span> : null}
      </label>
      <input
        id={`candidate-${field}`}
        data-testid={`candidate-${field}`}
        className={inputClassName}
        type={options?.type ?? 'text'}
        value={values[field]}
        onChange={updateValue(field)}
        placeholder={options?.placeholder}
        required={options?.required}
        autoComplete={options?.autoComplete}
      />
    </div>
  );

  const renderTextArea = (
    field: keyof ApplicationValues,
    label: string,
    placeholder: string,
    required = false,
    rows = 4,
  ) => (
    <div className="flex flex-col gap-2">
      <label className={labelClassName} htmlFor={`candidate-${field}`}>
        {label} {required ? <span className="text-danger">*</span> : null}
      </label>
      <textarea
        id={`candidate-${field}`}
        data-testid={`candidate-${field}`}
        className={inputClassName}
        value={values[field]}
        onChange={updateValue(field)}
        placeholder={placeholder}
        required={required}
        rows={rows}
      />
    </div>
  );

  /**
   * Önizleme, İK'nın göreceği metni gösterir. Deneyim/eğitim satırları girdilerden
   * TÜRETİLMİŞ metni basar — çünkü kaydedilecek olan o. Girdileri tek tek listelemek
   * daha şık görünürdü ama adaya kaydedilenden farklı bir şey göstermiş olurduk.
   */
  /**
   * Çoğaltılabilir girdi listesi. LinkedIn ve kariyer.net'te olduğu gibi her kayıt
   * kendi kartında durur; "ekle" yeni boş kart açar, "kaldır" o kartı siler.
   *
   * `packages/x-form-builder`'daki `RepeatableFieldGroup` BİLİNÇLİ olarak kullanılmadı:
   * o bileşen `FieldRegistryContext` içinde çalışır ve kendi input bileşenlerini
   * getirir — bu herkese açık başvuru sayfasında hem sağlayıcı zincirini hem paket
   * ağırlığını taşımak gerekirdi, hem de görsel dili sayfanın geri kalanından ayrışırdı.
   * Burada sayfanın kendi `inputClassName`'i kullanılıyor.
   */
  const renderEntryList = <T extends Record<string, string | undefined>>(
    name: 'experience' | 'education',
    legend: string,
    hint: string,
    addLabel: string,
    itemNoun: string,
    specs: ReadonlyArray<EntryFieldSpec<T>>,
    rows: Array<EntryRow<T>>,
    setRows: React.Dispatch<React.SetStateAction<Array<EntryRow<T>>>>,
  ) => (
    <fieldset className="flex flex-col gap-3" data-testid={`candidate-${name}-entries`}>
      <legend className={labelClassName}>
        {legend} <span className="text-danger">*</span>
      </legend>
      <p className="text-xs leading-5 text-text-secondary">{hint}</p>
      <ol className="flex flex-col gap-3">
        {rows.map((row, index) => (
          <li
            key={row.rowId}
            className="rounded-xl border border-border-subtle bg-surface-subtle p-4"
            data-testid={`candidate-${name}-entry-${index}`}
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-xs font-bold uppercase tracking-wider text-text-secondary">
                {index + 1}. {itemNoun}
              </p>
              <button
                type="button"
                onClick={() => removeEntryRow(setRows, index)}
                data-testid={`candidate-${name}-remove-${index}`}
                className="inline-flex min-h-9 items-center rounded-lg border border-border-subtle bg-surface-default px-3 text-xs font-bold text-text-secondary hover:text-state-danger-text focus:outline-hidden focus:ring-2 focus:ring-selection-outline"
              >
                Kaldır
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {specs.map((spec) => {
                const inputId = `candidate-${name}-${index}-${spec.key}`;
                const currentValue = row.value[spec.key] ?? '';
                return (
                  <div
                    key={spec.key}
                    className={`flex flex-col gap-1.5 ${spec.span === 'full' ? 'sm:col-span-2' : ''}`}
                  >
                    <label className="text-xs font-semibold text-text-secondary" htmlFor={inputId}>
                      {spec.label}
                    </label>
                    {spec.rows ? (
                      <textarea
                        id={inputId}
                        data-testid={inputId}
                        className={inputClassName}
                        value={currentValue}
                        onChange={updateEntryField(setRows, index, spec.key)}
                        placeholder={spec.placeholder}
                        maxLength={spec.maxLength}
                        rows={spec.rows}
                      />
                    ) : (
                      (() => {
                        const resolved = resolveEntryInputKind(spec.kind, currentValue);
                        // Yıl alanı BİLEREK `type="number"` DEĞİL: sayı girdisi
                        // artırma oklarıyla geliyor (yıl için anlamsız) ve
                        // denetimli değerde biçime uymayan girdiyi sessizce
                        // boşaltıyor — ayrıştırıcıdan gelen değer kaybolurdu.
                        // Bunun yerine rakam filtresi: harf zaten YAZILAMAZ.
                        const typed =
                          resolved === 'month'
                            ? {
                                inputMode: 'numeric' as const,
                                pattern: '\\d{4}(-(0[1-9]|1[0-2]))?',
                                maxLength: 7,
                              }
                            : resolved === 'year'
                              ? {
                                  inputMode: 'numeric' as const,
                                  pattern: '\\d{4}',
                                  maxLength: 4,
                                }
                              : { maxLength: spec.maxLength };
                        const onFieldChange = updateEntryField(setRows, index, spec.key);
                        return (
                          <input
                            id={inputId}
                            data-testid={inputId}
                            className={inputClassName}
                            value={currentValue}
                            onChange={
                              resolved === 'year'
                                ? (event) => {
                                    event.target.value = event.target.value
                                      .replace(/\D/gu, '')
                                      .slice(0, 4);
                                    onFieldChange(event);
                                  }
                                : resolved === 'month'
                                  ? (event) => {
                                      // Rakam + EN FAZLA bir tire; "2022-09"a
                                      // kadar serbest yazılır, harf giremez.
                                      const digits = event.target.value.replace(/[^\d]/gu, '');
                                      event.target.value =
                                        digits.length <= 4
                                          ? digits
                                          : `${digits.slice(0, 4)}-${digits.slice(4, 6)}`;
                                      onFieldChange(event);
                                    }
                                  : onFieldChange
                            }
                            placeholder={spec.placeholder}
                            {...typed}
                          />
                        );
                      })()
                    )}
                  </div>
                );
              })}
            </div>
          </li>
        ))}
      </ol>
      {rows.length < APPLICATION_ENTRY_LIMITS.maxEntries ? (
        <button
          type="button"
          onClick={() => addEntryRow(setRows)}
          data-testid={`candidate-${name}-add`}
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border-subtle bg-surface-default px-4 text-sm font-bold text-action-primary hover:bg-surface-subtle focus:outline-hidden focus:ring-2 focus:ring-selection-outline sm:w-auto"
        >
          <span aria-hidden="true">+</span> {addLabel}
        </button>
      ) : (
        <p className="text-xs font-semibold text-text-secondary">
          En fazla {APPLICATION_ENTRY_LIMITS.maxEntries} girdi ekleyebilirsiniz.
        </p>
      )}
    </fieldset>
  );

  const allPreviewRows: Array<[keyof ApplicationValues | 'experience' | 'education', string, string]> =
    [
      ['fullName', 'Ad soyad', values.fullName],
      ['email', 'E-posta', values.email],
      ['phone', 'Telefon', values.phone],
      ['city', 'Şehir', values.city],
      ['linkedIn', 'LinkedIn', values.linkedIn || 'Eklenmedi'],
      ['portfolio', 'Portföy', values.portfolio || 'Eklenmedi'],
      ['summary', 'Profesyonel özet', values.summary],
      ['experience', 'Deneyim', derivedExperience],
      ['education', 'Eğitim', derivedEducation],
      ['skills', 'Beceriler', values.skills],
      ['languages', 'Diller', values.languages || 'Eklenmedi'],
      ['certifications', 'Sertifikalar ve eğitimler', values.certifications || 'Eklenmedi'],
      ['note', 'Ek not', values.note || 'Eklenmedi'],
    ];
  const previewRows = allPreviewRows.filter(([field]) =>
    // Deneyim/eğitim ilan alan listesinde her zaman var ve artık forma girdi olarak
    // giriyor; ikisi de `ApplicationValues` anahtarı olmadığı için ayrıca geçirilir.
    field === 'experience' || field === 'education' ? true : isFieldEnabled(field),
  );
  const resumeProposals = resumeImport?.proposals ?? [];
  const allResumeProposalsReviewed =
    resumeProposals.length > 0 &&
    resumeProposals.every((proposal) =>
      ['ACCEPTED', 'EDITED', 'REJECTED'].includes(proposal.state),
    );
  const selectedResumeFields = resumeProposals.filter((proposal) =>
    ['ACCEPTED', 'EDITED'].includes(proposal.state),
  ).length;
  const resumeDecidedFields = resumeProposals.filter((proposal) =>
    DECIDED_RESUME_STATES.includes(proposal.state),
  ).length;
  const resumeTally = {
    ACCEPTED: resumeProposals.filter((proposal) => proposal.state === 'ACCEPTED').length,
    EDITED: resumeProposals.filter((proposal) => proposal.state === 'EDITED').length,
    REJECTED: resumeProposals.filter((proposal) => proposal.state === 'REJECTED').length,
    PENDING: resumeProposals.length - resumeDecidedFields,
  };
  useEffect(() => {
    if (!stepScrollArmed.current) {
      stepScrollArmed.current = true;
      return;
    }
    if (view !== 'form') return;
    // Üç ayrı ref: tek bir nesnede toplamak her render'da yeni kimlik üretir
    // ve etkiyi formStep değişimine değil HER render'a bağlardı.
    const target =
      formStep === 'resume'
        ? resumeSectionRef
        : formStep === 'contact'
          ? contactSectionRef
          : profileSectionRef;
    // `?.` iki kez: jsdom `scrollIntoView` UYGULAMIYOR. Korumasız çağrı test
    // ortamında TypeError atıyordu ve etkiden sonraki akışı kesiyordu — CV
    // aktarım testi tam bunu yakaladı. Üretimde de doğru: kaydırma bir
    // kolaylıktır, yokluğunda akış durmamalı.
    target.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  }, [formStep, view]);

  const currentStepId: FormStep | 'preview' | 'receipt' = view === 'form' ? formStep : view;
  const currentStepIndex = FORM_STEPS.findIndex((step) => step.id === currentStepId);

  return (
    <main
      className="min-h-screen bg-surface-subtle text-text-primary"
      data-testid="candidate-application-page"
    >
      <div className="border-b border-border-subtle bg-surface-default">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link
            to={jobsBase}
            className="flex items-center gap-3"
            aria-label="Açık Kariyer ilan listesi"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-action-primary text-sm font-bold text-action-primary-text">
              A
            </span>
            <span>
              <span className="block text-sm font-bold">Açık Kariyer</span>
              <span className="block text-xs text-text-secondary">Aday başvuru merkezi</span>
            </span>
          </Link>
          <nav className="flex items-center gap-2" aria-label="Aday başvuru alanı">
            <Link
              to="/candidate"
              className="inline-flex min-h-10 items-center rounded-xl border border-border-subtle bg-surface-default px-3 py-2 text-xs font-bold text-text-primary hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 sm:text-sm"
            >
              Aday Alanım
            </Link>
            <span className="hidden rounded-full border border-border-subtle bg-surface-subtle px-3 py-1.5 text-xs font-semibold text-text-secondary sm:inline-flex">
              Güvenli form önizlemesi
            </span>
          </nav>
        </div>
      </div>

      <div className="mx-auto grid max-w-5xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_260px] lg:py-10">
        <div className="min-w-0">
          <section className="mb-6 overflow-hidden rounded-3xl bg-text-primary px-5 py-7 text-white shadow-lg sm:px-8 sm:py-9">
            <div className="mb-4 inline-flex rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/90">
              {job?.team ?? 'Açık Pozisyon'}
            </div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-4xl">
              {(job?.title ?? humanizeSlug(jobSlug)) || 'İlan yükleniyor'}
            </h1>
            <div className="mt-4 flex flex-wrap gap-2 text-sm text-white/80">
              <span>{job?.location ?? 'Yükleniyor'}</span>
              <span aria-hidden="true">•</span>
              <span>{job?.mode ?? '—'}</span>
              <span aria-hidden="true">•</span>
              <span>{job?.employmentType ?? '—'}</span>
            </div>
            <p className="mt-5 max-w-2xl text-sm leading-6 text-white/80 sm:text-base">
              Başvurunuzu kendi hızınızda hazırlayın. Örnek alanları kontrol edin, istediğiniz
              bilgiyi değiştirin ve göndermeden önce tamamını önizleyin.
            </p>
          </section>

          {jobError ? (
            <p
              role="alert"
              className="mb-6 rounded-xl border border-state-danger-border bg-state-danger-bg px-4 py-3 text-sm font-semibold text-state-danger-text"
            >
              İlan servisine ulaşılamadı: {jobError}
            </p>
          ) : null}

          <nav
            aria-label="Başvuru adımları"
            className="mb-6 rounded-2xl border border-border-subtle bg-surface-default p-3 shadow-xs"
          >
            <ol className="grid grid-cols-5 gap-1">
              {FORM_STEPS.map((step, index) => {
                const completed = currentStepIndex > index;
                const current = currentStepIndex === index;
                const target = FORM_STEP_IDS.find((id) => id === step.id);
                // #1048: form bölümleri artık aynı sayfada; "tamamlanmış adım"
                // kavramı kalktı. Gösterge bir içindekiler listesi: form
                // bölümlerine HER ZAMAN atlanabilir (gönderim sonrası hariç).
                // Kontrol/Tamamlandı gerçek kapılar olduğu için durum kalır.
                const navigable = view !== 'receipt' && target !== undefined;
                const mark = (
                  <span
                    className={`mx-auto flex h-8 w-8 items-center justify-center rounded-full border text-xs font-bold ${
                      completed || current
                        ? 'border-action-primary bg-action-primary text-action-primary-text'
                        : 'border-border-subtle bg-surface-muted text-text-secondary'
                    }`}
                    aria-hidden="true"
                  >
                    {completed ? '✓' : index + 1}
                  </span>
                );
                const label = (
                  <span
                    className={`mt-1 block truncate text-[10px] font-semibold sm:text-xs ${
                      current ? 'text-text-primary' : 'text-text-secondary'
                    } ${navigable ? 'underline decoration-dotted underline-offset-2' : ''}`}
                  >
                    {step.label}
                  </span>
                );
                return (
                  <li key={step.id} className="min-w-0 text-center">
                    {navigable ? (
                      <button
                        type="button"
                        onClick={() => goToStep(target)}
                        data-testid={`candidate-step-back-${step.id}`}
                        // Erişilebilir ad açık yazılır: "CV" tek başına nereye
                        // gittiğini söylemez. Adım numarası da girer — adımın
                        // altındaki "CV adımına dön" düğmesiyle ADI ÇAKIŞIYORDU ve
                        // ekran okuyucu kullanıcısı ikisini ayırt edemezdi (mevcut
                        // üç test bu çakışmayı "Found multiple elements" ile yakaladı).
                        aria-label={`${step.label} bölümüne git`}
                        className="block w-full rounded-lg px-1 py-0.5 hover:bg-surface-subtle focus:outline-hidden focus:ring-2 focus:ring-selection-outline"
                      >
                        {mark}
                        {label}
                      </button>
                    ) : (
                      <div aria-current={current ? 'step' : undefined}>
                        {mark}
                        {label}
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          </nav>

          {view === 'form' ? (
            <form className="flex flex-col gap-5" onSubmit={openPreview} noValidate>
              {(
                <div ref={resumeSectionRef}>
                  <section className={sectionClassName} aria-labelledby="resume-heading">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wider text-action-primary">
                          Hızlı başlangıç
                        </p>
                        <h2 id="resume-heading" className="mt-1 text-xl font-bold">
                          CV’nizle başlayın
                        </h2>
                        <p className="mt-2 max-w-xl text-sm leading-6 text-text-secondary">
                          PDF güvenli serviste geçici olarak işlenir. Hiçbir alan kendiliğinden
                          forma yazılmaz: her öneriyi kabul eder, düzenler veya reddedersiniz. Ham
                          PDF ve dosya adı kalıcı kayda alınmaz.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={applySyntheticResume}
                        data-testid="fill-synthetic-resume"
                        className="shrink-0 rounded-xl border border-action-primary px-4 py-2.5 text-sm font-semibold text-action-primary hover:bg-action-primary/5"
                      >
                        Örnek CV ile doldur
                      </button>
                    </div>

                    <div className="mt-5 rounded-2xl border border-dashed border-border-strong bg-surface-subtle p-4 sm:p-5">
                      <label
                        className="flex items-start gap-3 text-sm leading-6"
                        htmlFor="resume-import-notice"
                      >
                        <input
                          id="resume-import-notice"
                          type="checkbox"
                          checked={resumeNoticeAccepted}
                          disabled={Boolean(resumeImport)}
                          onChange={(event) => {
                            setResumeNoticeAccepted(event.target.checked);
                            setResumeNoticeAcceptedAt(
                              event.target.checked ? new Date().toISOString() : '',
                            );
                            setFileError('');
                          }}
                          className="mt-1 h-4 w-4 shrink-0"
                        />
                        <span>
                          {/* Beyan metni aynen korunur — gerekçe başvuru onayındaki
                              yorumda. Okunabilir metin aşağıya eklenir. */}
                          CV içe aktarma aydınlatmasını okudum. Test ortamında yalnız sentetik veri
                          kullanacağımı; PDF’nin güvenlik taraması ve alan çıkarımı için geçici
                          olarak işleneceğini, ham dosyanın saklanmayacağını ve yalnız seçtiğim
                          alanların taslağa aktarılacağını anladım.
                          <span className="sr-only"> Sürüm: {RESUME_IMPORT_NOTICE_VERSION}</span>
                        </span>
                      </label>
                      {resumeNotice ? (
                        <KvkkNoticeDisclosure notice={resumeNotice} permanentHref={noticeHref} />
                      ) : null}

                      {resumeStatus !== 'confirmed' ? (
                        <div className="mt-4 border-t border-border-subtle pt-4">
                          <label
                            className={`flex flex-col items-center gap-2 text-center ${
                              resumeNoticeAccepted &&
                              resumeStatus !== 'uploading' &&
                              (!resumeImport?.documentVersion || replaceRequested)
                                ? 'cursor-pointer'
                                : 'cursor-not-allowed opacity-60'
                            }`}
                            htmlFor="candidate-resume"
                          >
                            <span className="text-sm font-bold">
                              {replaceRequested ? 'Yeni PDF özgeçmiş seçin' : 'PDF özgeçmiş seçin'}
                            </span>
                            <span className="text-xs text-text-secondary">
                              En fazla 10 MB · yalnız PDF
                            </span>
                          </label>
                          <input
                            ref={fileInputRef}
                            id="candidate-resume"
                            data-testid="candidate-resume"
                            type="file"
                            accept="application/pdf,.pdf"
                            onChange={handleFileChange}
                            disabled={
                              !resumeNoticeAccepted ||
                              resumeStatus === 'uploading' ||
                              Boolean(resumeImport?.documentVersion && !replaceRequested)
                            }
                            className="mx-auto mt-3 block max-w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-action-primary file:px-4 file:py-2 file:font-semibold file:text-action-primary-text disabled:opacity-60"
                            aria-describedby="candidate-resume-boundary candidate-resume-error"
                          />
                        </div>
                      ) : null}
                      <p
                        id="candidate-resume-boundary"
                        className="mt-3 text-center text-xs text-text-secondary"
                      >
                        Test ortamında gerçek kişisel veri kullanmayın. Form, PDF işlenirken de elle
                        doldurulabilir; işleme hatası manuel başvuruyu engellemez.
                      </p>
                      {resumeStatus === 'uploading' ? (
                        <p
                          role="status"
                          aria-live="polite"
                          data-testid="candidate-resume-parsing"
                          className="mt-4 text-center text-sm font-semibold text-action-primary"
                        >
                          PDF güvenlik kontrolünden geçiriliyor ve alan önerileri hazırlanıyor…
                          Formu bu sırada elle doldurmaya devam edebilirsiniz.
                        </p>
                      ) : null}
                      {fileError ? (
                        <p
                          ref={fileErrorRef}
                          id="candidate-resume-error"
                          role="alert"
                          aria-live="assertive"
                          tabIndex={-1}
                          className="mt-3 rounded-xl border border-state-danger-border bg-state-danger-bg px-3 py-2 text-sm font-medium text-state-danger-text outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                        >
                          {fileError}
                        </p>
                      ) : null}

                      {resumeStatus === 'reviewing' && resumeImport ? (
                        <div className="mt-5" data-testid="candidate-resume-review">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <h3 className="text-base font-bold">CV alanlarını kontrol edin</h3>
                              <p className="mt-1 text-xs text-text-secondary">
                                {resumeProposals.length} öneri · korunan{' '}
                                {resumeImport.protectedSuppressed} çıktı aktarılmadı · dosya adı ve
                                ham PDF saklanmadı
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => void acceptAllSafeProposals()}
                              disabled={Boolean(resumeBusyField)}
                              className="rounded-xl border border-action-primary px-3 py-2 text-xs font-bold text-action-primary disabled:opacity-50"
                            >
                              Güvenli önerileri kabul et
                            </button>
                          </div>

                          {/* Devam kapısı her alanda karar ister; kaç alanın kaldığı görünmezse
                              aday pasif "Forma aktar" düğmesinin nedenini anlamıyordu. */}
                          <div
                            className="mt-3 rounded-xl border border-border-subtle bg-surface-subtle px-4 py-3"
                            data-testid="resume-review-progress"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="text-xs font-bold">
                                {resumeProposals.length} alandan {resumeDecidedFields} tanesi karara
                                bağlandı
                              </p>
                              <p className="text-xs text-text-secondary">
                                {resumeTally.PENDING > 0
                                  ? `${resumeTally.PENDING} alan bekliyor`
                                  : 'Tüm alanlar karara bağlandı'}
                              </p>
                            </div>
                            <div
                              className="mt-2 h-2 overflow-hidden rounded-full bg-surface-muted"
                              role="progressbar"
                              aria-valuemin={0}
                              aria-valuemax={resumeProposals.length}
                              aria-valuenow={resumeDecidedFields}
                              aria-label="Karara bağlanan CV alanı sayısı"
                            >
                              <div
                                className="h-full rounded-full bg-action-primary transition-[width]"
                                style={{
                                  width: `${
                                    resumeProposals.length === 0
                                      ? 0
                                      : (resumeDecidedFields / resumeProposals.length) * 100
                                  }%`,
                                }}
                              />
                            </div>
                            <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-secondary">
                              <li>
                                <span aria-hidden="true">
                                  {RESUME_DECISION_STYLES.ACCEPTED.mark}
                                </span>{' '}
                                {resumeTally.ACCEPTED} kabul
                              </li>
                              <li>
                                <span aria-hidden="true">{RESUME_DECISION_STYLES.EDITED.mark}</span>{' '}
                                {resumeTally.EDITED} düzenlendi
                              </li>
                              <li>
                                <span aria-hidden="true">
                                  {RESUME_DECISION_STYLES.REJECTED.mark}
                                </span>{' '}
                                {resumeTally.REJECTED} reddedildi
                              </li>
                              <li>
                                <span aria-hidden="true">
                                  {RESUME_DECISION_STYLES.UNREVIEWED.mark}
                                </span>{' '}
                                {resumeTally.PENDING} bekliyor
                              </li>
                            </ul>
                          </div>

                          <ul className="mt-4 flex flex-col gap-3" aria-label="CV alan önerileri">
                            {resumeProposals.map((proposal) => {
                              const needsControl = proposal.state === 'CONTROL_REQUIRED';
                              const savedValue = proposal.candidateValue ?? proposal.proposedValue;
                              const editedValue = resumeEdits[proposal.field] ?? savedValue;
                              const isBusy =
                                resumeBusyField === proposal.field || resumeBusyField === 'all';
                              const style =
                                RESUME_DECISION_STYLES[
                                  proposal.state as keyof typeof RESUME_DECISION_STYLES
                                ] ?? RESUME_DECISION_STYLES.UNREVIEWED;
                              const isRejected = proposal.state === 'REJECTED';
                              const isResumeOnly = RESUME_ONLY_FIELDS.includes(proposal.field);
                              const confidence = confidenceWording(proposal.provenance.confidence);
                              return (
                                <li
                                  key={proposal.field}
                                  className={`flex overflow-hidden rounded-xl border ${style.card}`}
                                  data-testid={`resume-proposal-${proposal.field}`}
                                  data-decision={proposal.state}
                                >
                                  {/* Karar rengi kartın kenarında; listeyi tararken tek bakışta
                                      hangi alanın ne olduğu görünür. */}
                                  <span
                                    aria-hidden="true"
                                    className={`w-1.5 shrink-0 ${style.accent}`}
                                  />
                                  <div className="min-w-0 flex-1 p-4">
                                    <div className="flex flex-wrap items-start justify-between gap-2">
                                      <div>
                                        <h4 className="text-sm font-bold">
                                          {RESUME_FIELD_LABELS[proposal.field]}
                                        </h4>
                                        <p
                                          className={`mt-1 text-xs ${
                                            confidence.warn
                                              ? 'font-semibold text-state-warning-text'
                                              : 'text-text-secondary'
                                          }`}
                                        >
                                          Sayfa {proposal.provenance.page} · {confidence.text}
                                        </p>
                                        {/* Formda karşılığı olmayan alan kabul edilince sessizce
                                            düşüyordu; aday aktarıldığını sanıyordu. */}
                                        {isResumeOnly ? (
                                          <p className="mt-1 text-xs text-text-secondary">
                                            Bu bilgi CV’nizde kaldı; başvuru formunda ayrı bir alanı
                                            yok, bu yüzden forma aktarılmaz.
                                          </p>
                                        ) : null}
                                      </div>
                                      <span
                                        className={`rounded-full border px-2.5 py-1 text-xs font-bold ${style.badge}`}
                                        data-testid={`resume-proposal-state-${proposal.field}`}
                                      >
                                        <span aria-hidden="true">{style.mark}</span> {style.label}
                                      </span>
                                    </div>

                                    {isRejected ? (
                                      <p className="mt-3 rounded-lg border border-border-subtle px-3 py-2 text-xs font-semibold text-text-secondary">
                                        Bu alan forma aktarılmayacak. Fikrinizi değiştirirseniz
                                        aşağıdan kabul edebilir veya düzenleyebilirsiniz.
                                      </p>
                                    ) : null}
                                    {/* Reddedilen alanda da içerik erişilebilir kalır: kapatmak
                                        "düzenle"ye geçişi çıkmaza sokuyordu. Kararın kendisi kart
                                        tonu, rozet ve basılı buton ile zaten okunuyor. */}
                                    <div className={isRejected ? 'opacity-60' : undefined}>
                                      <p className="mt-3 whitespace-pre-wrap break-words rounded-lg bg-surface-subtle px-3 py-2 text-sm">
                                        {proposal.proposedValue}
                                      </p>
                                      <label
                                        className="mt-3 block text-xs font-bold"
                                        htmlFor={`resume-edit-${proposal.field}`}
                                      >
                                        Aday tarafından düzenlenebilir değer
                                      </label>
                                      <textarea
                                        id={`resume-edit-${proposal.field}`}
                                        value={editedValue}
                                        onChange={(event) =>
                                          setResumeEdits((current) => ({
                                            ...current,
                                            [proposal.field]: event.target.value,
                                          }))
                                        }
                                        rows={
                                          proposal.field === 'experience' ||
                                          proposal.field === 'education'
                                            ? 3
                                            : 2
                                        }
                                        disabled={isBusy}
                                        className={`${inputClassName} mt-1`}
                                      />
                                    </div>
                                    {needsControl ? (
                                      <p className="mt-2 text-xs font-semibold text-state-warning-text">
                                        Bu alan düşük güven nedeniyle aynen kabul edilemez;
                                        düzenleyin veya reddedin.
                                      </p>
                                    ) : null}
                                    {/* Seçili karar butonun üzerinde kilitli durur (aria-pressed +
                                        dolu stil); önceki hâlde üç buton karar sonrası da aynı
                                        görünüyordu. */}
                                    <div className="mt-3 flex flex-wrap gap-2">
                                      {!needsControl ? (
                                        <button
                                          type="button"
                                          onClick={() =>
                                            void decideResumeField(proposal, 'ACCEPTED')
                                          }
                                          disabled={isBusy}
                                          aria-pressed={proposal.state === 'ACCEPTED'}
                                          className={`rounded-lg px-3 py-2 text-xs font-bold disabled:opacity-50 ${
                                            proposal.state === 'ACCEPTED'
                                              ? 'bg-action-primary text-action-primary-text ring-2 ring-focus-ring'
                                              : 'border border-action-primary text-action-primary'
                                          }`}
                                        >
                                          {proposal.state === 'ACCEPTED' ? (
                                            <span aria-hidden="true">✓ </span>
                                          ) : null}
                                          Öneriyi kabul et
                                        </button>
                                      ) : null}
                                      <button
                                        type="button"
                                        onClick={() => void decideResumeField(proposal, 'EDITED')}
                                        disabled={isBusy || !editedValue.trim()}
                                        aria-pressed={proposal.state === 'EDITED'}
                                        className={`rounded-lg px-3 py-2 text-xs font-bold disabled:opacity-50 ${
                                          proposal.state === 'EDITED'
                                            ? 'bg-action-primary text-action-primary-text ring-2 ring-focus-ring'
                                            : 'border border-action-primary text-action-primary'
                                        }`}
                                      >
                                        {proposal.state === 'EDITED' ? (
                                          <span aria-hidden="true">✎ </span>
                                        ) : null}
                                        Düzenlediğimi kaydet
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => void decideResumeField(proposal, 'REJECTED')}
                                        disabled={isBusy}
                                        aria-pressed={isRejected}
                                        className={`rounded-lg px-3 py-2 text-xs font-bold disabled:opacity-50 ${
                                          isRejected
                                            ? 'bg-text-primary text-white ring-2 ring-focus-ring'
                                            : 'border border-border-strong'
                                        }`}
                                      >
                                        {isRejected ? <span aria-hidden="true">✕ </span> : null}
                                        Reddet
                                      </button>
                                    </div>
                                  </div>
                                </li>
                              );
                            })}
                          </ul>

                          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                            <button
                              type="button"
                              onClick={() => void confirmReviewedResume()}
                              disabled={
                                !allResumeProposalsReviewed ||
                                selectedResumeFields === 0 ||
                                Boolean(resumeBusyField)
                              }
                              className="min-h-11 flex-1 rounded-xl bg-action-primary px-4 py-2 text-sm font-bold text-action-primary-text disabled:cursor-not-allowed disabled:opacity-45"
                            >
                              Seçtiğim alanları forma aktar ({selectedResumeFields})
                            </button>
                            <button
                              type="button"
                              onClick={() => setReplaceRequested(true)}
                              disabled={Boolean(resumeBusyField)}
                              className="rounded-xl border border-border-strong px-4 py-2 text-sm font-bold disabled:opacity-50"
                            >
                              PDF’yi değiştir
                            </button>
                            <button
                              type="button"
                              onClick={() => setShowRejectAllConfirm(true)}
                              disabled={Boolean(resumeBusyField)}
                              className="rounded-xl border border-border-strong px-4 py-2 text-sm font-bold disabled:opacity-50"
                            >
                              Tümünü reddet
                            </button>
                          </div>
                          {/* Pasif düğmenin nedeni tek cümlede ve sayıyla söylenir; iki ayrı
                              kapı (karar eksik / hiç alan seçilmemiş) ayrı ayrı açıklanır. */}
                          {!allResumeProposalsReviewed ? (
                            <p className="mt-2 text-xs font-semibold text-state-warning-text">
                              {resumeTally.PENDING} alan için henüz karar vermediniz. Forma
                              aktarmadan önce her alanı kabul edin, düzenleyin veya reddedin.
                            </p>
                          ) : selectedResumeFields === 0 ? (
                            <p className="mt-2 text-xs font-semibold text-state-warning-text">
                              Tüm alanları reddettiniz; aktarılacak bilgi kalmadı. En az bir alanı
                              kabul edin veya formu elle doldurmaya devam edin.
                            </p>
                          ) : (
                            <p className="mt-2 text-xs text-text-secondary">
                              {selectedResumeFields} alan forma aktarılacak,{' '}
                              {resumeTally.REJECTED} alan aktarılmayacak.
                            </p>
                          )}
                        </div>
                      ) : null}

                      {showRejectAllConfirm ? (
                        <div
                          role="alertdialog"
                          aria-labelledby="reject-all-title"
                          className="mt-4 rounded-xl border border-state-warning-border bg-state-warning-bg p-4"
                        >
                          <h3 id="reject-all-title" className="text-sm font-bold">
                            Tüm CV önerileri reddedilsin mi?
                          </h3>
                          <p className="mt-1 text-sm text-text-secondary">
                            Geçici öneriler silinir; formu elle doldurmaya devam edebilirsiniz.
                          </p>
                          <div className="mt-3 flex gap-2">
                            <button
                              type="button"
                              onClick={() => void discardResume('REJECT_ALL')}
                              className="rounded-lg bg-text-primary px-3 py-2 text-xs font-bold text-white"
                            >
                              Evet, tümünü reddet
                            </button>
                            <button
                              type="button"
                              onClick={() => setShowRejectAllConfirm(false)}
                              className="rounded-lg border border-border-strong px-3 py-2 text-xs font-bold"
                            >
                              Vazgeç
                            </button>
                          </div>
                        </div>
                      ) : null}

                      {resumeStatus === 'confirmed' && fileMeta ? (
                        <div
                          role="status"
                          aria-live="polite"
                          data-testid="candidate-resume-meta"
                          className="mt-4 rounded-xl border border-state-success-border bg-state-success-bg px-4 py-3 text-sm font-medium text-state-success-text"
                        >
                          CV kararları kaydedildi; {fileMeta.importedFieldCount} alan forma
                          aktarıldı · {formatBytes(fileMeta.size)} geçici işlendi · dosya adı ve ham
                          PDF tutulmadı.
                        </div>
                      ) : null}

                      {mergeConflicts.length > 0 ? (
                        <div
                          className="mt-4 rounded-xl border border-state-warning-border bg-state-warning-bg p-4"
                          data-testid="resume-merge-conflicts"
                        >
                          <h3 className="text-sm font-bold">
                            Dolu alanlar için hangi değer kullanılsın?
                          </h3>
                          <p className="mt-1 text-xs text-text-secondary">
                            Mevcut bilgileriniz sessizce değiştirilmez.
                          </p>
                          <ul className="mt-3 flex flex-col gap-4">
                            {mergeConflicts.map((conflict, index) => (
                              <li
                                key={conflict.field}
                                className="rounded-lg bg-surface-default p-3"
                              >
                                <p className="text-sm font-bold">{FIELD_LABELS[conflict.field]}</p>
                                <label className="mt-2 flex items-start gap-2 text-sm">
                                  <input
                                    type="radio"
                                    name={`merge-${conflict.field}`}
                                    checked={conflict.choice === 'manual'}
                                    onChange={() =>
                                      setMergeConflicts((current) =>
                                        current.map((item, itemIndex) =>
                                          itemIndex === index
                                            ? { ...item, choice: 'manual' }
                                            : item,
                                        ),
                                      )
                                    }
                                  />
                                  <span>
                                    <strong>Mevcut değeri koru:</strong> {conflict.manualValue}
                                  </span>
                                </label>
                                <label className="mt-2 flex items-start gap-2 text-sm">
                                  <input
                                    type="radio"
                                    name={`merge-${conflict.field}`}
                                    checked={conflict.choice === 'resume'}
                                    onChange={() =>
                                      setMergeConflicts((current) =>
                                        current.map((item, itemIndex) =>
                                          itemIndex === index
                                            ? { ...item, choice: 'resume' }
                                            : item,
                                        ),
                                      )
                                    }
                                  />
                                  <span>
                                    <strong>CV değerini kullan:</strong> {conflict.resumeValue}
                                  </span>
                                </label>
                                <label className="mt-2 flex items-start gap-2 text-sm">
                                  <input
                                    type="radio"
                                    name={`merge-${conflict.field}`}
                                    checked={conflict.choice === 'edit'}
                                    onChange={() =>
                                      setMergeConflicts((current) =>
                                        current.map((item, itemIndex) =>
                                          itemIndex === index ? { ...item, choice: 'edit' } : item,
                                        ),
                                      )
                                    }
                                  />
                                  <span>
                                    <strong>Birleştirip düzenle</strong>
                                  </span>
                                </label>
                                {conflict.choice === 'edit' ? (
                                  <div className="mt-2">
                                    <label
                                      className="text-xs font-bold"
                                      htmlFor={`merge-edit-${conflict.field}`}
                                    >
                                      Birleşik değer
                                    </label>
                                    <textarea
                                      id={`merge-edit-${conflict.field}`}
                                      value={conflict.mergedValue}
                                      onChange={(event) =>
                                        setMergeConflicts((current) =>
                                          current.map((item, itemIndex) =>
                                            itemIndex === index
                                              ? { ...item, mergedValue: event.target.value }
                                              : item,
                                          ),
                                        )
                                      }
                                      rows={3}
                                      className={`${inputClassName} mt-1`}
                                    />
                                  </div>
                                ) : null}
                              </li>
                            ))}
                          </ul>
                          <button
                            type="button"
                            onClick={applyMergeChoices}
                            disabled={mergeConflicts.some((conflict) => conflict.choice === null)}
                            className="mt-4 rounded-xl bg-action-primary px-4 py-2 text-sm font-bold text-action-primary-text disabled:opacity-45"
                          >
                            Seçimleri forma uygula
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </section>
                  <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <Link
                      to={jobsBase}
                      className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border-subtle bg-surface-default px-4 text-sm font-bold text-text-primary"
                    >
                      İlana geri dön
                    </Link>
                    <button
                      type="button"
                      onClick={() => {
                        setFormError('');
                        setFormStep('contact');
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                      className="inline-flex min-h-11 items-center justify-center rounded-xl bg-action-primary px-5 text-sm font-bold text-action-primary-text"
                    >
                      {resumeBinding ? 'İletişim bilgilerime geç' : 'CV olmadan devam et'}
                    </button>
                  </div>
                </div>
              )}

              {(
                <div ref={contactSectionRef}>
                  <section className={sectionClassName} aria-labelledby="contact-heading">
                    <div className="mb-5">
                      <p className="text-xs font-bold uppercase tracking-wider text-action-primary">
                        Aday bilgileri
                      </p>
                      <h2 id="contact-heading" className="mt-1 text-xl font-bold">
                        Size nasıl ulaşalım?
                      </h2>
                      <p className="mt-2 text-sm leading-6 text-text-secondary">
                        CV’den gelen alanları kontrol edin; her bilgiyi göndermeden önce
                        değiştirebilirsiniz.
                      </p>
                      {/* #1048: CV aktarım özeti artık YALNIZ CV bölümünde. Adım
                          adım tasarımda CV bölümü gizlendiği için burada bir
                          kopyası vardı; tek sayfada aynı `data-testid` iki kez
                          render ediliyordu (test "Found multiple elements" ile
                          yakaladı) ve aday aynı bilgiyi iki kez okuyordu. */}
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      {renderField('fullName', 'Ad soyad', {
                        required: true,
                        autoComplete: 'name',
                      })}
                      {renderField('email', 'E-posta', {
                        type: 'email',
                        required: true,
                        autoComplete: 'email',
                      })}
                      {renderField('phone', 'Telefon', {
                        type: 'tel',
                        required: true,
                        autoComplete: 'tel',
                      })}
                      {renderField('city', 'Şehir', {
                        required: true,
                        autoComplete: 'address-level2',
                      })}
                      {isFieldEnabled('linkedIn')
                        ? renderField('linkedIn', 'LinkedIn', {
                            type: 'url',
                            placeholder: 'https://linkedin.com/in/...',
                          })
                        : null}
                      {isFieldEnabled('portfolio')
                        ? renderField('portfolio', 'Portföy / kişisel site', {
                            type: 'url',
                            placeholder: 'https://...',
                          })
                        : null}
                    </div>
                  </section>
                  {/* #1048: formError TEK yerde — gönderim eyleminin yanında.
                      Adım adım tasarımda her adımın kendi kopyası vardı; tek
                      sayfada aynı mesaj tekrarlanıyordu. */}
                  <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <button
                      type="button"
                      onClick={() => {
                        setFormError('');
                        setFormStep('resume');
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                      className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border-subtle bg-surface-default px-4 text-sm font-bold text-text-primary"
                    >
                      CV adımına dön
                    </button>
                    <button
                      type="button"
                      onClick={openProfileStep}
                      className="inline-flex min-h-11 items-center justify-center rounded-xl bg-action-primary px-5 text-sm font-bold text-action-primary-text"
                    >
                      Deneyim bilgilerime geç
                    </button>
                  </div>
                </div>
              )}

              {(
                <div ref={profileSectionRef}>
                  <section className={sectionClassName} aria-labelledby="profile-heading">
                    <div className="mb-5">
                      <p className="text-xs font-bold uppercase tracking-wider text-action-primary">
                        Deneyim ve profil
                      </p>
                      <h2 id="profile-heading" className="mt-1 text-xl font-bold">
                        Deneyiminizi anlatın
                      </h2>
                      <p className="mt-2 text-sm leading-6 text-text-secondary">
                        Kısa, işle ilgili ve doğrulayabildiğiniz bilgileri girin. Sonraki adımda
                        başvurunun tamamını göreceksiniz.
                      </p>
                    </div>
                    <div className="flex flex-col gap-4">
                      {renderTextArea(
                        'summary',
                        'Profesyonel özet',
                        'Kendinizi birkaç cümleyle anlatın',
                        true,
                        4,
                      )}
                      {renderEntryList<ApplicationExperienceEntry>(
                        'experience',
                        'İş deneyimi',
                        'Her pozisyon için bir kart. En yeniden başlayarak ekleyin; boş bıraktığınız kartlar gönderilmez.',
                        'Deneyim ekle',
                        'pozisyon',
                        EXPERIENCE_FIELDS,
                        experienceRows,
                        setExperienceRows,
                      )}
                      {renderEntryList<ApplicationEducationEntry>(
                        'education',
                        'Eğitim',
                        'Her okul için bir kart.',
                        'Eğitim ekle',
                        'okul',
                        EDUCATION_FIELDS,
                        educationRows,
                        setEducationRows,
                      )}
                      {renderTextArea('skills', 'Beceriler', 'Virgülle ayırabilirsiniz', true, 3)}
                      {renderTextArea(
                        'languages',
                        'Diller',
                        'Türkçe — ana dil, İngilizce — ileri seviye',
                        false,
                        2,
                      )}
                      {renderTextArea(
                        'certifications',
                        'Sertifikalar ve eğitimler',
                        'Sertifika · Kurum · Yıl',
                        false,
                        3,
                      )}
                      {isFieldEnabled('note')
                        ? renderTextArea(
                            'note',
                            'Bu role neden başvuruyorsunuz?',
                            'İsteğe bağlı kısa not',
                            false,
                            4,
                          )
                        : null}
                    </div>
                  </section>
                  {formError ? (
                    <p
                      role="alert"
                      className="rounded-xl border border-state-danger-border bg-state-danger-bg px-4 py-3 text-sm font-semibold text-state-danger-text"
                    >
                      {formError}
                    </p>
                  ) : null}
                  <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <button
                      type="button"
                      onClick={() => {
                        setFormError('');
                        setFormStep('contact');
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                      className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border-subtle bg-surface-default px-4 text-sm font-bold text-text-primary"
                    >
                      İletişim bilgilerime dön
                    </button>
                    <button
                      type="submit"
                      disabled={resumeStatus === 'uploading' || mergeConflicts.length > 0}
                      className="inline-flex min-h-12 items-center justify-center rounded-xl bg-action-primary px-5 py-3 text-sm font-bold text-action-primary-text shadow-sm hover:opacity-90 focus:outline-hidden focus:ring-2 focus:ring-selection-outline focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      Başvuruyu kontrol et
                    </button>
                  </div>
                </div>
              )}
            </form>
          ) : null}

          {view === 'preview' ? (
            <section
              className={sectionClassName}
              data-testid="candidate-application-preview"
              aria-labelledby="preview-heading"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-action-primary">
                    Göndermeden önce
                  </p>
                  <h2
                    ref={previewHeadingRef}
                    id="preview-heading"
                    className="mt-1 text-2xl font-bold outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                    tabIndex={-1}
                  >
                    Başvuru önizlemesi
                  </h2>
                  <p className="mt-2 text-sm text-text-secondary">
                    Her alanı kontrol edin; gerekirse forma dönüp düzenleyin.
                  </p>
                </div>
                <button
                  type="button"
                  // Doğrudan `editApplication` verilmez: React tıklama olayını ilk
                  // argüman olarak geçirir ve hedef adım bir MouseEvent olurdu.
                  onClick={() => editApplication('profile')}
                  className="rounded-xl border border-border-strong px-4 py-2 text-sm font-semibold hover:bg-surface-subtle"
                >
                  Bilgileri düzenle
                </button>
              </div>

              <dl className="mt-6 divide-y divide-border-subtle rounded-2xl border border-border-subtle">
                {previewRows.map(([field, label, value]) => (
                  <div
                    key={field}
                    className="grid gap-1 px-4 py-3 sm:grid-cols-[180px_minmax(0,1fr)] sm:gap-4"
                  >
                    <dt className="text-xs font-bold uppercase tracking-wide text-text-secondary">
                      {label}
                    </dt>
                    <dd className="whitespace-pre-wrap break-words text-sm text-text-primary">
                      {value}
                    </dd>
                  </div>
                ))}
                <div className="grid gap-1 px-4 py-3 sm:grid-cols-[180px_minmax(0,1fr)] sm:gap-4">
                  <dt className="text-xs font-bold uppercase tracking-wide text-text-secondary">
                    PDF
                  </dt>
                  <dd className="text-sm text-text-primary">
                    {resumeBinding && fileMeta
                      ? `${fileMeta.importedFieldCount} aday kontrollü alan aktarıldı · ham PDF ve dosya adı başvuruyla gönderilmez`
                      : 'Eklenmedi'}
                  </dd>
                </div>
              </dl>

              <div className="mt-6 flex flex-col gap-3 rounded-2xl bg-surface-subtle p-4">
                {/* FAIL-CLOSED: metin yayımlanmadıysa onay kutusu HİÇ RENDER EDİLMEZ.
                    Yalnız açılır bölümü gizlemek yetmiyordu — kutu duruyor, aday
                    işaretliyor ve beyan kaydediliyordu; kusurun kendisi buydu.
                    `noticeAccepted` hiç true olamadığı için gönderim de kapalı kalır. */}
                {!applicationNotice ? (
                  <p
                    role="alert"
                    className="rounded-xl border border-state-danger-border bg-state-danger-bg px-4 py-3 text-sm font-semibold text-state-danger-text"
                  >
                    Bu kariyer sayfası için yayımlanmış bir aydınlatma metni bulunmuyor. Metin
                    yayımlanmadan başvuru onayı toplanamaz ve başvuru gönderilemez.
                  </p>
                ) : (
                <label
                  className="flex items-start gap-3 text-sm leading-6"
                  htmlFor="candidate-notice-accepted"
                >
                  <input
                    id="candidate-notice-accepted"
                    type="checkbox"
                    checked={noticeAccepted}
                    onChange={(event) => {
                      setNoticeAccepted(event.target.checked);
                      setNoticeAcceptedAt(event.target.checked ? new Date().toISOString() : '');
                      if (!event.target.checked) {
                        setAccuracyConfirmed(false);
                        setAccuracyConfirmedAt('');
                      }
                      setSubmitError('');
                    }}
                    className="mt-1 h-4 w-4"
                  />
                  <span>
                    {/* BEYAN METNİ AYNEN KORUNUR. Bu cümle `kvkk-application-v1`
                        sürümü altında kaydedilen beyandır; sözcüklerini değiştirip
                        sürümü aynı bırakmak, tek sürüm altında iki farklı beyan
                        kaydetmek olurdu (parserVersion ile aynı provenance kuralı).
                        Metnin okunabilir hâli aşağıya EKLENİR, beyan değişmez. */}
                    KVKK başvuru aydınlatma metnini okudum; bu test ortamında yalnız sentetik veri
                    kullanacağımı ve doğruladığım form alanlarının başvuru amacıyla kaydedileceğini
                    anladım. <span className="sr-only">Sürüm: {job?.noticeVersion}</span>
                  </span>
                </label>
                )}
                {/* Metin onayın YANINDA durur: "okudum" beyanı ancak okunabilir bir
                    metnin yanında anlam taşır. Daha önce yalnız sürüm kimliği vardı. */}
                {applicationNotice ? (
                  <KvkkNoticeDisclosure notice={applicationNotice} permanentHref={noticeHref} />
                ) : null}
                <label
                  className="flex items-start gap-3 text-sm leading-6"
                  htmlFor="candidate-accuracy-confirmed"
                >
                  <input
                    id="candidate-accuracy-confirmed"
                    type="checkbox"
                    checked={accuracyConfirmed}
                    onChange={(event) => {
                      setAccuracyConfirmed(event.target.checked);
                      setAccuracyConfirmedAt(event.target.checked ? new Date().toISOString() : '');
                    }}
                    className="mt-1 h-4 w-4"
                  />
                  <span>
                    Önizlemedeki bilgileri kontrol ettim ve bu ilana başvuru olarak gönderilmesini
                    onaylıyorum.
                  </span>
                </label>
              </div>

              <button
                type="button"
                data-testid="create-application-receipt"
                onClick={() => void createPersistentReceipt()}
                disabled={
                  !job ||
                  !noticeAccepted ||
                  !noticeAcceptedAt ||
                  !accuracyConfirmed ||
                  !accuracyConfirmedAt ||
                  submitting
                }
                className="mt-5 min-h-12 w-full rounded-xl bg-action-primary px-5 py-3 text-sm font-bold text-action-primary-text shadow-sm disabled:cursor-not-allowed disabled:opacity-45"
              >
                {submitting ? 'Başvuru kaydediliyor…' : 'Başvuruyu gönder'}
              </button>
              {submitError ? (
                <p
                  role="alert"
                  className="mt-3 rounded-xl border border-state-danger-border bg-state-danger-bg px-4 py-3 text-sm font-semibold text-state-danger-text"
                >
                  Başvuru gönderilemedi: {submitError}
                </p>
              ) : null}
              <p className="mt-3 text-center text-xs text-text-secondary">
                Form alanları kalıcı test başvurusu olarak kaydedilir. Ham PDF ve geçici öneriler
                kalıcı başvuruya eklenmez.
              </p>
            </section>
          ) : null}

          {view === 'receipt' ? (
            <section
              className={`${sectionClassName} text-center`}
              data-testid="candidate-application-receipt"
              aria-labelledby="receipt-heading"
            >
              <div
                className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-state-success-border bg-state-success-bg text-lg font-bold text-state-success-text"
                aria-hidden="true"
              >
                ✓
              </div>
              <p className="mt-5 text-xs font-bold uppercase tracking-wider text-text-primary">
                Kalıcı test başvurusu
              </p>
              <h2
                ref={receiptHeadingRef}
                id="receipt-heading"
                className="mt-2 text-2xl font-bold outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                tabIndex={-1}
              >
                Başvurunuz kaydedildi
              </h2>
              <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-text-secondary">
                {values.fullName} için başvuru güvenli servise kaydedildi. İK çalışma alanında
                görünür ve durum değişikliklerini Aday Alanım’dan takip edebilirsiniz.
              </p>
              {fileMeta ? (
                <p className="mx-auto mt-3 max-w-xl rounded-xl border border-state-info-border bg-state-info-bg px-4 py-3 text-sm leading-6 text-text-primary">
                  PDF’nin ham içeriği başvuruya eklenmedi; yalnız kontrol edip seçtiğiniz ve son
                  formda doğruladığınız alanlar kaydedildi.
                </p>
              ) : null}
              {/* Erişim kimliği İKİ parçadır ve ikisi de adaya verilmek ZORUNDA.
                  Referans tek başına yetmez — durum sorgusu hem referansı hem
                  anahtar digest'ini ister (yanlış referans ile yanlış anahtar
                  ayırt edilemez; numara deneyerek başvuru avlamayı engeller).
                  Anahtar daha önce üretilip kullanılıp adaya HİÇ gösterilmeden
                  atılıyordu: sekme kapanınca başvuru kalıcı olarak erişilemez
                  hâle geliyordu. Teslim etmek boşluğun asıl çözümü. */}
              <div className="mx-auto mt-5 max-w-xl space-y-3 text-left">
                <div className="rounded-xl border border-border-subtle bg-surface-subtle p-4">
                  <span className="block text-xs font-semibold text-text-secondary">
                    Başvuru referansı
                  </span>
                  <strong
                    className="mt-1 block break-all font-mono text-lg"
                    data-testid="candidate-receipt-id"
                  >
                    {receipt?.publicRef}
                  </strong>
                </div>
                <div className="rounded-xl border border-state-warning-border bg-state-warning-bg p-4">
                  <span className="block text-xs font-semibold text-text-primary">
                    Takip anahtarı — bu ekranda bir kez gösterilir
                  </span>
                  <strong
                    className="mt-1 block break-all font-mono text-sm"
                    data-testid="candidate-receipt-access-token"
                  >
                    {receipt?.candidateAccessToken}
                  </strong>
                  <p className="mt-2 text-sm leading-6 text-text-primary">
                    Bu iki bilgiyi saklayın. Sekmeyi kapattıktan sonra, başka bir cihazdan veya
                    tarayıcıdan başvurunuzu izlemek için ikisi birlikte gerekir. Anahtarınızı
                    kimseyle paylaşmayın; başvurunuza erişim sağlar.
                  </p>
                  {/* İndirme ÖNCE gelir: kalıcı olan o. Pano uçucudur ve pano
                      API'si yoksa hiç çizilmez; indirme her ortamda çalışır. */}
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <button
                      type="button"
                      onClick={downloadTrackingCredential}
                      data-testid="candidate-receipt-download"
                      className="min-h-11 rounded-xl bg-action-primary px-4 py-2 text-sm font-bold text-action-primary-text"
                    >
                      Takip bilgilerini indir
                    </button>
                    {copySupported ? (
                      <button
                        type="button"
                        onClick={() => void copyTrackingCredential()}
                        data-testid="candidate-receipt-copy"
                        className="min-h-11 rounded-xl border border-border-strong bg-surface-default px-4 py-2 text-sm font-bold text-text-primary"
                      >
                        Referans ve anahtarı kopyala
                      </button>
                    ) : null}
                  </div>
                  {credentialDownloaded ? (
                    <p role="status" className="mt-2 text-sm font-semibold text-text-primary">
                      Takip bilgileri <strong>basvuru-{receipt?.publicRef}.txt</strong> olarak
                      indirildi.
                    </p>
                  ) : null}
                  {credentialCopied ? (
                    <p role="status" className="mt-2 text-sm font-semibold text-text-primary">
                      Referans ve takip anahtarı panoya kopyalandı.
                    </p>
                  ) : null}
                </div>
              </div>
              <div
                className={`mt-6 rounded-xl border p-4 text-left text-sm leading-6 text-text-primary ${
                  candidateSessionSaved
                    ? 'border-state-success-border bg-state-success-bg'
                    : 'border-state-warning-border bg-state-warning-bg'
                }`}
              >
                {candidateSessionSaved
                  ? 'Bu sekmede oturum açık kaldığı sürece Aday Alanım’dan doğrudan izleyebilirsiniz. Sekme kapanırsa yukarıdaki referans ve anahtarla yeniden girebilirsiniz.'
                  : 'Başvuru kaydedildi ancak tarayıcı takip anahtarını oturumda saklayamadı. Yukarıdaki referans ve anahtarı not edin; Aday Alanım’dan onlarla girebilirsiniz.'}
              </div>
              <Link
                to="/candidate"
                className="mt-6 inline-flex min-h-11 items-center justify-center rounded-xl bg-action-primary px-5 py-3 text-sm font-bold text-action-primary-text"
              >
                Aday Alanım’da durumu gör
              </Link>
              <button
                type="button"
                onClick={resetDemo}
                className="ml-0 mt-3 rounded-xl border border-action-primary px-5 py-3 text-sm font-bold text-action-primary hover:bg-action-primary/5 sm:ml-3 sm:mt-6"
              >
                Yeni başvuru formu
              </button>
            </section>
          ) : null}
        </div>

        <aside
          className="flex flex-col gap-4 lg:sticky lg:top-6 lg:self-start"
          aria-label="Başvuru yardımı"
        >
          <section className={sectionClassName}>
            <h2 className="text-base font-bold">Başvurunuz sizde</h2>
            <ul className="mt-4 flex flex-col gap-3 text-sm leading-5 text-text-secondary">
              <li>• Formdaki bütün özgeçmiş alanlarını değiştirebilirsiniz.</li>
              <li>• CV önerileri yalnız alan bazlı kararınızdan sonra forma geçer.</li>
              <li>• PDF ve dosya adı kalıcı kayda alınmaz.</li>
              <li>• Testte gerçek kişisel veri kullanmayın.</li>
              <li>• Oturum açmanız gerekmez.</li>
            </ul>
          </section>
          <section className="rounded-2xl border border-state-info-border bg-state-info-bg p-5 text-sm leading-6 text-text-primary">
            <h2 className="font-bold">Yardıma mı ihtiyacınız var?</h2>
            <p className="mt-2">
              Formdaki bütün alanlara klavyeyle ulaşabilirsiniz. Zorunlu alanlar yıldızla
              işaretlidir.
            </p>
          </section>
        </aside>
      </div>
    </main>
  );
};

export default CandidateApplicationPage;
