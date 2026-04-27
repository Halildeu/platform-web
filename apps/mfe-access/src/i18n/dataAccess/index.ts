import tr from './tr';
import en from './en';
import ar from './ar';
import ru from './ru';

export type DataAccessLocale = 'tr' | 'en' | 'ar' | 'ru';

export const SUPPORTED_DATA_ACCESS_LOCALES: readonly DataAccessLocale[] = [
  'tr',
  'en',
  'ar',
  'ru',
] as const;

export const dataAccessDictionaries: Record<DataAccessLocale, Record<string, string>> = {
  tr,
  en,
  ar,
  ru,
};

export const DATA_ACCESS_FALLBACK_LOCALE: DataAccessLocale = 'en';
