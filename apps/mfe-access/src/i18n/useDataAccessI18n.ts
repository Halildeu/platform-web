import React from 'react';
import { useI18nManager, type I18nManager as ShellI18nManager } from 'mfe_shell/i18n';
import {
  dataAccessDictionaries,
  DATA_ACCESS_FALLBACK_LOCALE,
  SUPPORTED_DATA_ACCESS_LOCALES,
  type DataAccessLocale,
} from './dataAccess';

const isSupportedLocale = (value: string | undefined): value is DataAccessLocale =>
  typeof value === 'string' && (SUPPORTED_DATA_ACCESS_LOCALES as readonly string[]).includes(value);

const interpolate = (template: string, params?: Record<string, unknown>): string => {
  if (!params) return template;
  let out = template;
  for (const [key, value] of Object.entries(params)) {
    out = out.replace(new RegExp(`\\{${key}\\}`, 'g'), String(value));
  }
  return out;
};

/**
 * useDataAccessI18n — local i18n hook for the Veri Erişimi panel.
 *
 * Why local: the shared @mfe/i18n-dicts package only ships tr/en/de/es
 * locales, but this panel must support tr/en/ar/ru per spec. Adding ar/ru
 * to i18n-dicts is a cross-package change deferred to a separate PR. Until
 * then, the panel keeps its own dictionary; the shell's I18nManager is
 * still used for locale signal so language switches propagate.
 */
export const useDataAccessI18n = () => {
  let contextManager: ShellI18nManager | null = null;
  try {
    contextManager = useI18nManager();
  } catch {
    contextManager = null;
  }

  const resolveLocale = React.useCallback((): DataAccessLocale => {
    if (!contextManager) return DATA_ACCESS_FALLBACK_LOCALE;
    const current = contextManager.getLocale();
    return isSupportedLocale(current) ? current : DATA_ACCESS_FALLBACK_LOCALE;
  }, [contextManager]);

  const [locale, setLocale] = React.useState<DataAccessLocale>(() => resolveLocale());

  React.useEffect(() => {
    if (!contextManager) return;
    setLocale(resolveLocale());
    const unsubscribe = contextManager.addLocaleChangeListener(() => {
      setLocale(resolveLocale());
    });
    return () => {
      unsubscribe?.();
    };
  }, [contextManager, resolveLocale]);

  const t = React.useCallback(
    (key: string, params?: Record<string, unknown>): string => {
      const dict = dataAccessDictionaries[locale];
      const fallback = dataAccessDictionaries[DATA_ACCESS_FALLBACK_LOCALE];
      const template = dict[key] ?? fallback[key] ?? key;
      return interpolate(template, params);
    },
    [locale],
  );

  return { t, locale, ready: true } as const;
};

export type DataAccessI18n = ReturnType<typeof useDataAccessI18n>;
