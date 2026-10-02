/** Geçersiz ya da eksik tarihin ekrandaki karşılığı. */
export const INVALID_DATE_TEXT = '—';

export type FormatDateOptions = {
  /** `false`: yalnız gün (ör. teklif başlangıcı). Varsayılan: saatli. */
  withTime?: boolean;
  /** Görüşmenin kendi saat dilimi gibi açık bir IANA dilimi. */
  timeZone?: string;
};

/**
 * ATS ekranlarının ortak tarih biçimlemesi (#1193 incelemesi).
 *
 * <p>`new Date('abc')` geçersiz bir tarih üretir ve `Intl.DateTimeFormat.format` onu
 * RangeError ile reddeder; yerel kopyalarda bu, bütün panelin çizimini düşürüyordu.
 * Geçersiz ya da eksik değer "—" olarak yazılır, geçerli değerlerin görünümü aynıdır.
 */
/**
 * Saatsiz takvim gunu (`YYYY-MM-DD`): saat dilimine cevrilmeden gosterilir.
 *
 * <p>Sozlesme `format = "date"`. Degeri yerel saate cevirmek gunu kaydirabilir
 * (UTC+3'te 2026-01-01 → 31 Aralik), bu yuzden gun UTC olarak kurulur. Bicim disi
 * bir deger saatli biçimlemeye duser, gecersiz ya da eksik deger "—" olur.
 */
export const formatCalendarDaySafe = (value: string | null | undefined): string => {
  if (!value) return INVALID_DATE_TEXT;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return formatDateSafe(value);
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  // `Date.UTC` TASAR: 2026-13-45 gecerli bir tarih uretip 2027'de bir gune kayar ve
  // sozlesme disi bir deger sessizce baska bir gun olarak yazilir. Geri okuyup
  // esitligi dogruluyoruz; esitlik bozulursa deger takvim gunu degildir.
  if (
    Number.isNaN(date.getTime()) ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return INVALID_DATE_TEXT;
  }
  return new Intl.DateTimeFormat('tr-TR', { dateStyle: 'medium', timeZone: 'UTC' }).format(date);
};

export const formatDateSafe = (
  value: string | null | undefined,
  { withTime = true, timeZone }: FormatDateOptions = {},
): string => {
  if (!value) return INVALID_DATE_TEXT;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return INVALID_DATE_TEXT;
  return new Intl.DateTimeFormat('tr-TR', {
    dateStyle: 'medium',
    ...(withTime ? { timeStyle: 'short' as const } : {}),
    ...(timeZone ? { timeZone } : {}),
  }).format(date);
};
