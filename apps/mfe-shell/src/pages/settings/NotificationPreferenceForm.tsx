import React, { useEffect, useMemo, useState } from 'react';
import { FormDrawer, InputNumber, TimePicker } from '@mfe/design-system';
import type {
  PreferenceDto,
  PreferenceUpsertBody,
} from '../../features/notifications/api/notify-prefs.types';
import {
  defaultQuietHoursTimezone,
  parseQuietHours,
  serializeQuietHours,
  validateQuietHours,
  type QuietHoursDay,
  type QuietHoursV1,
} from '../../features/notifications/model/quiet-hours';

/**
 * Faz 23.6 PR-B1 — richer notification-preference editor.
 *
 * Codex thread `019e034e` iter-2 absorb:
 *  - non-canonical `quietHours` payloads are preserved verbatim (read-only
 *    inside the editor) so editing an unrelated field can't silently
 *    overwrite a legacy / hand-edited shape;
 *  - `frequencyLimitPerDay`: both `null` and `0` collapse to "Limit yok";
 *    save normalises "no limit" to `0` so the backend's "0 disables"
 *    contract becomes canonical;
 *  - `bypassForCritical` lives under "Gelişmiş ayarlar"; default `true`.
 */

const DAY_OPTIONS: ReadonlyArray<{ value: QuietHoursDay; label: string }> = [
  { value: 'MON', label: 'Pzt' },
  { value: 'TUE', label: 'Sal' },
  { value: 'WED', label: 'Çar' },
  { value: 'THU', label: 'Per' },
  { value: 'FRI', label: 'Cum' },
  { value: 'SAT', label: 'Cmt' },
  { value: 'SUN', label: 'Paz' },
];

const DEFAULT_DAYS: QuietHoursDay[] = ['MON', 'TUE', 'WED', 'THU', 'FRI'];

type QuietHoursMode = 'off' | 'canonical' | 'custom';

interface QuietHoursFormState {
  mode: QuietHoursMode;
  // Always populated for the canonical UI (used as a starting point when
  // the user toggles into canonical mode from off / custom).
  canonical: QuietHoursV1;
  // Preserved when the original payload was a non-canonical shape.
  customRaw: Record<string, unknown> | null;
}

const buildInitialQuietHours = (raw: unknown): QuietHoursFormState => {
  const parsed = parseQuietHours(raw);
  if (parsed.kind === 'canonical') {
    return {
      mode: 'canonical',
      canonical: parsed.value,
      customRaw: null,
    };
  }
  if (parsed.kind === 'custom') {
    return {
      mode: 'custom',
      canonical: defaultCanonicalQuietHours(),
      customRaw: parsed.raw,
    };
  }
  return {
    mode: 'off',
    canonical: defaultCanonicalQuietHours(),
    customRaw: null,
  };
};

const defaultCanonicalQuietHours = (): QuietHoursV1 => ({
  start: '22:00',
  end: '07:00',
  timezone: defaultQuietHoursTimezone(),
  days: [...DEFAULT_DAYS],
});

export interface NotificationPreferenceFormProps {
  open: boolean;
  mode: 'create' | 'edit';
  initialValue?: PreferenceDto;
  submitting: boolean;
  onCancel: () => void;
  onSubmit: (body: PreferenceUpsertBody) => Promise<void>;
}

export const NotificationPreferenceForm: React.FC<NotificationPreferenceFormProps> = ({
  open,
  mode,
  initialValue,
  submitting,
  onCancel,
  onSubmit,
}) => {
  const [topicKey, setTopicKey] = useState('');
  const [channel, setChannel] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [quietHours, setQuietHours] = useState<QuietHoursFormState>(buildInitialQuietHours(null));
  const [frequencyNoLimit, setFrequencyNoLimit] = useState(true);
  const [frequencyValue, setFrequencyValue] = useState<number | null>(null);
  const [bypassCritical, setBypassCritical] = useState(true);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Reset form state whenever the drawer reopens or the editing target changes.
  useEffect(() => {
    if (!open) return;
    setSubmitError(null);
    if (initialValue) {
      setTopicKey(initialValue.topicKey ?? '');
      setChannel(initialValue.channel ?? '');
      setEnabled(initialValue.enabled);
      setQuietHours(buildInitialQuietHours(initialValue.quietHours));
      const hasLimit =
        initialValue.frequencyLimitPerDay !== null &&
        initialValue.frequencyLimitPerDay !== undefined &&
        initialValue.frequencyLimitPerDay > 0;
      setFrequencyNoLimit(!hasLimit);
      setFrequencyValue(hasLimit ? initialValue.frequencyLimitPerDay : null);
      setBypassCritical(initialValue.bypassForCritical);
    } else {
      setTopicKey('');
      setChannel('');
      setEnabled(true);
      setQuietHours(buildInitialQuietHours(null));
      setFrequencyNoLimit(true);
      setFrequencyValue(null);
      setBypassCritical(true);
    }
  }, [open, initialValue]);

  const quietHoursError = useMemo<string | null>(() => {
    if (quietHours.mode !== 'canonical') return null;
    return validateQuietHours(quietHours.canonical);
  }, [quietHours]);

  const frequencyError = useMemo<string | null>(() => {
    if (frequencyNoLimit) return null;
    if (frequencyValue === null || frequencyValue === undefined) {
      return 'Bir sayı girin veya "Limit yok" seçin.';
    }
    if (!Number.isInteger(frequencyValue) || frequencyValue < 1) {
      return 'En az 1 olmalıdır.';
    }
    return null;
  }, [frequencyNoLimit, frequencyValue]);

  const formInvalid = quietHoursError !== null || frequencyError !== null;

  const submit = async () => {
    if (formInvalid || submitting) return;
    setSubmitError(null);
    const body: PreferenceUpsertBody = {
      topicKey: topicKey.trim().length > 0 ? topicKey.trim() : null,
      channel: channel.trim().length > 0 ? channel.trim() : null,
      enabled,
      quietHours: resolveQuietHoursForSubmit(quietHours),
      frequencyLimitPerDay: frequencyNoLimit ? 0 : (frequencyValue ?? 0),
      bypassForCritical: bypassCritical,
    };
    try {
      await onSubmit(body);
    } catch (err) {
      setSubmitError(extractErrorMessage(err));
    }
  };

  return (
    <FormDrawer
      open={open}
      onClose={onCancel}
      title={mode === 'edit' ? 'Bildirim kuralını düzenle' : 'Yeni bildirim kuralı'}
      subtitle="Konu, kanal, sessiz saatler ve teslim limitlerini düzenleyin"
      size="md"
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            data-testid="pref-form-cancel"
          >
            İptal
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={formInvalid || submitting}
            data-testid="pref-form-save"
          >
            {submitting ? 'Kaydediliyor…' : 'Kaydet'}
          </button>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <label style={fieldLabelStyle}>
          Konu (boş = tüm konular)
          <input
            type="text"
            value={topicKey}
            onChange={(e) => setTopicKey(e.target.value)}
            placeholder="örn. report.export.ready"
            data-testid="pref-form-topic"
            style={textInputStyle}
          />
        </label>

        <label style={fieldLabelStyle}>
          Kanal (boş = tüm kanallar)
          <input
            type="text"
            value={channel}
            onChange={(e) => setChannel(e.target.value)}
            placeholder="örn. email"
            data-testid="pref-form-channel"
            style={textInputStyle}
          />
        </label>

        <label
          style={{ ...fieldLabelStyle, flexDirection: 'row', alignItems: 'center', gap: '0.5rem' }}
        >
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            data-testid="pref-form-enabled"
          />
          <span>Etkin</span>
        </label>

        {/* Quiet hours section */}
        <fieldset style={fieldsetStyle}>
          <legend style={legendStyle}>Sessiz saatler</legend>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <input
              type="checkbox"
              checked={quietHours.mode === 'canonical'}
              onChange={(e) =>
                setQuietHours((prev) =>
                  e.target.checked
                    ? { ...prev, mode: 'canonical' }
                    : { ...prev, mode: prev.customRaw ? 'custom' : 'off' },
                )
              }
              data-testid="pref-form-quiet-toggle"
            />
            <span>Sessiz saat aktif</span>
          </label>

          {quietHours.mode === 'custom' && (
            <p
              role="note"
              data-testid="pref-form-quiet-custom-note"
              style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}
            >
              Bu kural için özel (canonical olmayan) sessiz saat tanımı bulundu. Kayıt değişmeyecek;
              düzenlemek için "Sessiz saat aktif" kutusunu işaretleyin.
            </p>
          )}

          {quietHours.mode === 'canonical' && (
            <div style={{ display: 'grid', gap: '0.5rem' }}>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end' }}>
                <label style={fieldLabelStyle}>
                  Başlangıç
                  <TimePicker
                    value={quietHours.canonical.start}
                    onValueChange={(value) =>
                      setQuietHours((prev) => ({
                        ...prev,
                        canonical: { ...prev.canonical, start: value ?? '' },
                      }))
                    }
                    data-testid="pref-form-quiet-start"
                  />
                </label>
                <label style={fieldLabelStyle}>
                  Bitiş
                  <TimePicker
                    value={quietHours.canonical.end}
                    onValueChange={(value) =>
                      setQuietHours((prev) => ({
                        ...prev,
                        canonical: { ...prev.canonical, end: value ?? '' },
                      }))
                    }
                    data-testid="pref-form-quiet-end"
                  />
                </label>
              </div>
              <label style={fieldLabelStyle}>
                Saat dilimi
                <input
                  type="text"
                  value={quietHours.canonical.timezone}
                  onChange={(e) =>
                    setQuietHours((prev) => ({
                      ...prev,
                      canonical: { ...prev.canonical, timezone: e.target.value },
                    }))
                  }
                  placeholder="Europe/Istanbul"
                  data-testid="pref-form-quiet-tz"
                  style={textInputStyle}
                />
              </label>
              <fieldset style={{ ...fieldsetStyle, padding: '0.25rem 0.5rem' }}>
                <legend style={{ fontSize: '0.75rem' }}>Geçerli günler</legend>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                  {DAY_OPTIONS.map((option) => {
                    const checked = quietHours.canonical.days.includes(option.value);
                    return (
                      <label
                        key={option.value}
                        style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) =>
                            setQuietHours((prev) => ({
                              ...prev,
                              canonical: {
                                ...prev.canonical,
                                days: e.target.checked
                                  ? Array.from(new Set([...prev.canonical.days, option.value]))
                                  : prev.canonical.days.filter((d) => d !== option.value),
                              },
                            }))
                          }
                          data-testid={`pref-form-quiet-day-${option.value}`}
                        />
                        <span>{option.label}</span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
              {quietHoursError && (
                <p
                  role="alert"
                  data-testid="pref-form-quiet-error"
                  style={{ color: 'var(--state-danger-text, #b91c1c)', fontSize: '0.8rem' }}
                >
                  {quietHoursError}
                </p>
              )}
            </div>
          )}
        </fieldset>

        {/* Frequency limit section */}
        <fieldset style={fieldsetStyle}>
          <legend style={legendStyle}>Günlük teslim limiti</legend>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <input
              type="checkbox"
              checked={frequencyNoLimit}
              onChange={(e) => setFrequencyNoLimit(e.target.checked)}
              data-testid="pref-form-freq-no-limit"
            />
            <span>Limit yok</span>
          </label>
          {!frequencyNoLimit && (
            <label style={fieldLabelStyle}>
              Günde en fazla
              <InputNumber
                value={frequencyValue}
                onChange={(value) => setFrequencyValue(value)}
                min={1}
                step={1}
                precision={0}
                data-testid="pref-form-freq-value"
              />
            </label>
          )}
          {frequencyError && (
            <p
              role="alert"
              data-testid="pref-form-freq-error"
              style={{ color: 'var(--state-danger-text, #b91c1c)', fontSize: '0.8rem' }}
            >
              {frequencyError}
            </p>
          )}
        </fieldset>

        {/* Advanced section */}
        <details>
          <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Gelişmiş ayarlar</summary>
          <div style={{ marginTop: '0.5rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input
                type="checkbox"
                checked={bypassCritical}
                onChange={(e) => setBypassCritical(e.target.checked)}
                data-testid="pref-form-bypass"
              />
              <span>Kritik bildirimleri her zaman gönder (önerilen)</span>
            </label>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginTop: '0.25rem' }}>
              Kapatırsanız, severity=critical olan bildirimler de bu kuralın kısıtlarına tabi olur.
            </p>
          </div>
        </details>

        {submitError && (
          <p
            role="alert"
            data-testid="pref-form-submit-error"
            style={{ color: 'var(--state-danger-text, #b91c1c)', fontSize: '0.85rem' }}
          >
            {submitError}
          </p>
        )}
      </div>
    </FormDrawer>
  );
};

const resolveQuietHoursForSubmit = (state: QuietHoursFormState): Record<string, unknown> | null => {
  if (state.mode === 'off') return null;
  if (state.mode === 'custom') return state.customRaw;
  return serializeQuietHours(state.canonical);
};

const extractErrorMessage = (err: unknown): string => {
  if (err && typeof err === 'object' && 'data' in err) {
    const data = (err as { data: unknown }).data;
    if (data && typeof data === 'object' && 'message' in data) {
      const msg = (data as { message: unknown }).message;
      if (typeof msg === 'string') return msg;
    }
  }
  if (err instanceof Error) return err.message;
  return 'Kural kaydedilemedi.';
};

const fieldLabelStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.25rem',
  fontSize: '0.85rem',
  color: 'var(--text-primary, #1f2937)',
};

const textInputStyle: React.CSSProperties = {
  border: '1px solid var(--border-subtle, #d4d4d8)',
  borderRadius: 4,
  padding: '0.25rem 0.5rem',
  fontSize: '0.85rem',
};

const fieldsetStyle: React.CSSProperties = {
  border: '1px solid var(--border-subtle, #d4d4d8)',
  borderRadius: 4,
  padding: '0.5rem 0.75rem',
  display: 'flex',
  flexDirection: 'column',
  gap: '0.5rem',
};

const legendStyle: React.CSSProperties = {
  fontSize: '0.85rem',
  fontWeight: 600,
  padding: '0 0.25rem',
};

export default NotificationPreferenceForm;
