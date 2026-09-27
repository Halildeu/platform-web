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
