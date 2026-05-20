import { BellOff, BellRing, Clock, Gauge } from 'lucide-react';
import React, { useCallback, useMemo, useState } from 'react';
import { useAppSelector } from '../../app/store/store.hooks';
import {
  useDeletePreferenceMutation,
  useListPreferencesQuery,
  useMuteChannelMutation,
  useRestoreDefaultsMutation,
  useUpsertPreferenceMutation,
} from '../../features/notifications/api/notify-prefs.api';
import type {
  PreferenceDto,
  PreferenceUpsertBody,
} from '../../features/notifications/api/notify-prefs.types';
import { selectNotifyIdentity } from '../../features/notifications/model/identity.selectors';
import { formatQuietHours } from '../../features/notifications/model/quiet-hours';
import NotificationPreferenceForm from './NotificationPreferenceForm';

/**
 * Subscriber notification preferences page (Faz 23.5 PR3 + Faz 23.6 PR-B1).
 *
 * <p>Faz 23.6 PR-B1 (Codex thread `019e034e` iter-2 absorb):
 * <ul>
 *   <li>Inline form stays as the lightweight "quick add" path —
 *       topic / channel / enabled — with the existing two-stage delete
 *       flow.</li>
 *   <li>The new "Detaylı kural ekle" button and per-row "Düzenle" action
 *       open a {@code FormDrawer}-based rich editor where operators set
 *       quiet hours, daily frequency limits, and the
 *       {@code bypassForCritical} override.</li>
 *   <li>The existing per-row "Açık / Kapalı" toggle preserves
 *       {@code quietHours} / {@code frequencyLimitPerDay} /
 *       {@code bypassForCritical} so a quick mute does not silently drop
 *       configured restrictions.</li>
 *   <li>The new "Kısıtlar" table column surfaces a compact summary
 *       (quiet-hours window, daily limit, bypass-off badge) so operators
 *       can scan rules at a glance.</li>
 * </ul>
 *
 * <p>Bulk operations ("Tümünü email'de sustur", "Varsayılana dön") are
 * intentionally <b>NOT</b> shipped here — they require a backend bulk
 * contract that lives in PR-A.
 */
const NotificationPreferencesPage: React.FC = () => {
  const identity = useAppSelector(selectNotifyIdentity);
  const isReady = identity !== null;
  const queryArg = identity ?? { orgId: '', subscriberId: '' };

  const listQuery = useListPreferencesQuery(queryArg, { skip: !isReady });
  const [upsert, upsertStatus] = useUpsertPreferenceMutation();
  const [deletePref, deleteStatus] = useDeletePreferenceMutation();
  const [restoreDefaults, restoreStatus] = useRestoreDefaultsMutation();
  const [muteChannel, muteChannelStatus] = useMuteChannelMutation();

  const [editorOpen, setEditorOpen] = useState(false);
  const [editorTarget, setEditorTarget] = useState<PreferenceDto | null>(null);
  // Faz 23.6 PR-C1: two-stage confirm for destructive restore-defaults
  // (Codex thread `019e0387` decision). The operator must click twice to
  // hard-delete every row; deletedCount feeds a one-shot toast/banner so
  // the action is observable without clicking into the audit surface.
  const [restoreConfirmArmed, setRestoreConfirmArmed] = useState(false);
  const [restoreFeedback, setRestoreFeedback] = useState<
    { kind: 'success'; deletedCount: number } | { kind: 'error'; message: string } | null
  >(null);
  // Faz 23.6 PR-C2: channel-mute action — pick a channel, two-stage
  // confirm (because it both deletes existing rules and writes new
  // ones), surface deletedOverrideCount + shadowDenyCount so the
  // operator knows exactly what changed.
  const [muteChannelArmed, setMuteChannelArmed] = useState<string | null>(null);
  const [muteChannelFeedback, setMuteChannelFeedback] = useState<
    | { kind: 'success'; channel: string; deletedOverrideCount: number; shadowDenyCount: number }
    | { kind: 'error'; message: string }
    | null
  >(null);

  const handleRestoreDefaults = useCallback(async () => {
    if (!identity) return;
    setRestoreFeedback(null);
    try {
      const result = await restoreDefaults(identity).unwrap();
      setRestoreFeedback({ kind: 'success', deletedCount: result.deletedCount ?? 0 });
    } catch (err) {
      setRestoreFeedback({
        kind: 'error',
        message: extractRestoreError(err),
      });
    } finally {
      setRestoreConfirmArmed(false);
    }
  }, [identity, restoreDefaults]);

  const handleMuteChannel = useCallback(
    async (channel: string) => {
      if (!identity) return;
      setMuteChannelFeedback(null);
      try {
        const result = await muteChannel({ ...identity, channel }).unwrap();
        setMuteChannelFeedback({
          kind: 'success',
          channel: result.channel,
          deletedOverrideCount: result.deletedOverrideCount ?? 0,
          shadowDenyCount: result.shadowDenyCount ?? 0,
        });
      } catch (err) {
        setMuteChannelFeedback({
          kind: 'error',
          message: extractMuteChannelError(err),
        });
      } finally {
        setMuteChannelArmed(null);
      }
    },
    [identity, muteChannel],
  );

  const openCreateDrawer = useCallback(() => {
    setEditorTarget(null);
    setEditorOpen(true);
  }, []);

  const openEditDrawer = useCallback((row: PreferenceDto) => {
    setEditorTarget(row);
    setEditorOpen(true);
  }, []);

  const closeDrawer = useCallback(() => {
    setEditorOpen(false);
    setEditorTarget(null);
  }, []);

  const handleDrawerSubmit = useCallback(
    async (body: PreferenceUpsertBody) => {
      if (!identity) throw new Error('identity unresolved');
      await upsert({ ...identity, ...body }).unwrap();
      closeDrawer();
    },
    [identity, upsert, closeDrawer],
  );

  if (!isReady) {
    return (
      <section className="p-6 max-w-4xl mx-auto">
        <h1 className="text-xl font-semibold">Bildirim Tercihleri</h1>
        <p className="mt-2 text-zinc-600">Önce oturum açın.</p>
      </section>
    );
  }

  if (listQuery.isError) {
    const status = (listQuery.error as { status?: number }).status;
    return (
      <section className="p-6 max-w-4xl mx-auto">
        <h1 className="text-xl font-semibold">Bildirim Tercihleri</h1>
        <p className="mt-2 text-amber-700">
          {status === 503
            ? 'Bildirim tercihi özelliği bu ortamda kapalı.'
            : 'Tercihler yüklenemedi. Daha sonra tekrar deneyin.'}
        </p>
      </section>
    );
  }

  return (
    <section className="p-6 max-w-4xl mx-auto">
      <header className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold">Bildirim Tercihleri</h1>
        <span className="text-xs text-zinc-500">{listQuery.data?.length ?? 0} kural</span>
      </header>
      <p className="mt-1 text-sm text-zinc-600">
        Hangi konularda hangi kanallardan bildirim almak istediğinizi buradan yönetebilirsiniz. Boş
        kural varsayılan olarak izinlidir.
      </p>

      {/* Faz 23.6 PR-C1 + PR-C2: bulk action bar — restore-defaults
          (destructive two-stage confirm) and per-channel mute (also
          two-stage; backend writes a wildcard deny + shadows topic-wide
          allows so the channel actually mutes). */}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        {!restoreConfirmArmed ? (
          <button
            type="button"
            onClick={() => setRestoreConfirmArmed(true)}
            disabled={
              listQuery.isLoading || restoreStatus.isLoading || (listQuery.data?.length ?? 0) === 0
            }
            data-testid="pref-restore-defaults-arm"
            className="text-xs text-rose-700 hover:underline disabled:opacity-50"
          >
            Tüm kuralları sıfırla (varsayılana dön)
          </button>
        ) : (
          <span
            className="inline-flex items-center gap-2 text-xs"
            data-testid="pref-restore-defaults-confirm-row"
          >
            <span className="text-zinc-700">Tüm tercih kuralları silinecek. Emin misiniz?</span>
            <button
              type="button"
              onClick={() => void handleRestoreDefaults()}
              disabled={restoreStatus.isLoading}
              data-testid="pref-restore-defaults-confirm"
              className="text-rose-700 underline disabled:opacity-50"
            >
              {restoreStatus.isLoading ? 'Siliniyor…' : 'Onayla'}
            </button>
            <button
              type="button"
              onClick={() => setRestoreConfirmArmed(false)}
              disabled={restoreStatus.isLoading}
              data-testid="pref-restore-defaults-cancel"
              className="text-zinc-500 hover:underline disabled:opacity-50"
            >
              Vazgeç
            </button>
          </span>
        )}

        {/* Mute channel action — pick channel + 2-stage confirm */}
        <span className="inline-flex items-center gap-2 text-xs">
          {muteChannelArmed === null ? (
            <>
              <label htmlFor="pref-mute-channel-select" className="text-zinc-600">
                Tüm bir kanalı sustur:
              </label>
              <select
                id="pref-mute-channel-select"
                data-testid="pref-mute-channel-select"
                onChange={(e) => {
                  const channel = e.target.value;
                  if (channel) setMuteChannelArmed(channel);
                  e.target.value = '';
                }}
                disabled={muteChannelStatus.isLoading || listQuery.isLoading}
                className="rounded border border-zinc-200 px-1.5 py-0.5 text-xs"
              >
                <option value="">Kanal seçin…</option>
                <option value="email">Email</option>
                <option value="sms">SMS</option>
                <option value="slack">Slack</option>
                <option value="webhook">Webhook</option>
                <option value="in-app">Uygulama içi</option>
              </select>
            </>
          ) : (
            <span data-testid="pref-mute-channel-confirm-row">
              <span className="text-zinc-700">
                <strong>{muteChannelArmed}</strong> kanalı için tüm bildirimler susturulacak. Mevcut
                kurallar yeniden yazılacak. Emin misiniz?
              </span>{' '}
              <button
                type="button"
                onClick={() => void handleMuteChannel(muteChannelArmed)}
                disabled={muteChannelStatus.isLoading}
                data-testid="pref-mute-channel-confirm"
                className="text-rose-700 underline disabled:opacity-50"
              >
                {muteChannelStatus.isLoading ? 'Susturuluyor…' : 'Onayla'}
              </button>{' '}
              <button
                type="button"
                onClick={() => setMuteChannelArmed(null)}
                disabled={muteChannelStatus.isLoading}
                data-testid="pref-mute-channel-cancel"
                className="text-zinc-500 hover:underline disabled:opacity-50"
              >
                Vazgeç
              </button>
            </span>
          )}
        </span>
      </div>

      {muteChannelFeedback?.kind === 'success' && (
        <div
          role="status"
          data-testid="pref-mute-channel-success"
          className="mt-3 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800"
        >
          <strong>{muteChannelFeedback.channel}</strong> kanalı susturuldu.{' '}
          {muteChannelFeedback.deletedOverrideCount > 0 ||
          muteChannelFeedback.shadowDenyCount > 0 ? (
            <>
              {muteChannelFeedback.deletedOverrideCount > 0 && (
                <>
                  {muteChannelFeedback.deletedOverrideCount} mevcut kural silindi
                  {muteChannelFeedback.shadowDenyCount > 0 ? '; ' : '. '}
                </>
              )}
              {muteChannelFeedback.shadowDenyCount > 0 && (
                <>
                  {muteChannelFeedback.shadowDenyCount} konu için bu kanal ayrıca kapatıldı (diğer
                  kanallar etkilenmedi).
                </>
              )}
            </>
          ) : (
            'Hiç başka kural yoktu; sadece varsayılan deny eklendi.'
          )}
        </div>
      )}
      {muteChannelFeedback?.kind === 'error' && (
        <div
          role="alert"
          data-testid="pref-mute-channel-error"
          className="mt-3 rounded border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800"
        >
          {muteChannelFeedback.message}
        </div>
      )}

      {restoreFeedback?.kind === 'success' && (
        <div
          role="status"
          data-testid="pref-restore-defaults-success"
          className="mt-3 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800"
        >
          {restoreFeedback.deletedCount > 0
            ? `${restoreFeedback.deletedCount} kural silindi. Varsayılan davranışa döndünüz.`
            : 'Silinecek kural yoktu. Zaten varsayılan davranıştaydınız.'}
        </div>
      )}
      {restoreFeedback?.kind === 'error' && (
        <div
          role="alert"
          data-testid="pref-restore-defaults-error"
          className="mt-3 rounded border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800"
        >
          {restoreFeedback.message}
        </div>
      )}

      {/* Inline new-row form (lightweight) */}
      <QuickAddPreferenceForm
        identity={identity}
        onSubmit={(body) => upsert({ ...identity, ...body }).unwrap()}
        submitting={upsertStatus.isLoading}
        onOpenDetailedDrawer={openCreateDrawer}
      />

      {/* Existing rows */}
      <PreferenceTable
        rows={listQuery.data ?? []}
        loading={listQuery.isLoading}
        onToggle={async (row) =>
          // Faz 23.6 absorb — quick toggle preserves rich fields so the
          // backend round-trips quietHours / frequencyLimitPerDay /
          // bypassForCritical instead of silently resetting them.
          upsert({
            ...identity,
            topicKey: row.topicKey,
            channel: row.channel,
            enabled: !row.enabled,
            quietHours: row.quietHours,
            frequencyLimitPerDay: row.frequencyLimitPerDay,
            bypassForCritical: row.bypassForCritical,
          }).unwrap()
        }
        onDelete={(id) => deletePref({ ...identity, id }).unwrap()}
        onEdit={openEditDrawer}
        deleting={deleteStatus.isLoading}
      />

      <NotificationPreferenceForm
        open={editorOpen}
        mode={editorTarget ? 'edit' : 'create'}
        initialValue={editorTarget ?? undefined}
        submitting={upsertStatus.isLoading}
        onCancel={closeDrawer}
        onSubmit={handleDrawerSubmit}
      />
    </section>
  );
};

interface QuickAddPreferenceFormProps {
  identity: { orgId: string; subscriberId: string };
  onSubmit: (body: PreferenceUpsertBody) => Promise<unknown>;
  submitting: boolean;
  onOpenDetailedDrawer: () => void;
}

const QuickAddPreferenceForm: React.FC<QuickAddPreferenceFormProps> = ({
  onSubmit,
  submitting,
  onOpenDetailedDrawer,
}) => {
  const [topicKey, setTopicKey] = useState('');
  const [channel, setChannel] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);
      try {
        await onSubmit({
          topicKey: topicKey.trim() || null,
          channel: channel.trim() || null,
          enabled,
        });
        setTopicKey('');
        setChannel('');
        setEnabled(true);
      } catch (err) {
        setError(extractErrorMessage(err));
      }
    },
    [onSubmit, topicKey, channel, enabled],
  );

  return (
    <form onSubmit={handleSubmit} className="mt-4 grid gap-2 grid-cols-12 items-end">
      <label className="col-span-5 text-xs">
        Konu (boş = tüm konular)
        <input
          type="text"
          value={topicKey}
          onChange={(e) => setTopicKey(e.target.value)}
          placeholder="örn. report.export.ready"
          className="mt-1 block w-full border rounded px-2 py-1 text-sm"
        />
      </label>
      <label className="col-span-3 text-xs">
        Kanal (boş = tüm kanallar)
        <input
          type="text"
          value={channel}
          onChange={(e) => setChannel(e.target.value)}
          placeholder="örn. email"
          className="mt-1 block w-full border rounded px-2 py-1 text-sm"
        />
      </label>
      <label className="col-span-2 text-xs flex items-center gap-2 mt-5">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        Etkin
      </label>
      <button
        type="submit"
        disabled={submitting}
        className="col-span-2 mt-5 px-3 py-1.5 text-sm bg-zinc-900 text-white rounded disabled:opacity-50"
      >
        {submitting ? 'Kaydediliyor…' : 'Kuralı kaydet'}
      </button>
      <button
        type="button"
        onClick={onOpenDetailedDrawer}
        className="col-span-12 text-xs text-blue-700 hover:underline text-left"
        data-testid="pref-quick-open-detailed"
      >
        Detaylı kural ekle (sessiz saat, günlük limit, kritik bypass) →
      </button>
      {error && (
        <p role="alert" className="col-span-12 text-xs text-rose-600">
          {error}
        </p>
      )}
    </form>
  );
};

interface PreferenceTableProps {
  rows: PreferenceDto[];
  loading: boolean;
  onToggle: (row: PreferenceDto) => Promise<unknown>;
  onDelete: (id: number) => Promise<unknown>;
  onEdit: (row: PreferenceDto) => void;
  deleting: boolean;
}

const PreferenceTable: React.FC<PreferenceTableProps> = ({
  rows,
  loading,
  onToggle,
  onDelete,
  onEdit,
  deleting,
}) => {
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);
  const sorted = useMemo(
    () =>
      [...rows].sort((a, b) =>
        a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0,
      ),
    [rows],
  );

  if (loading) {
    return (
      <p className="mt-6 text-sm text-zinc-500" data-testid="notification-preferences-loading">
        Yükleniyor…
      </p>
    );
  }
  if (sorted.length === 0) {
    return (
      <p className="mt-6 text-sm text-zinc-600" data-testid="notification-preferences-empty">
        Henüz tanımlı bir kural yok. Yukarıdan ekleyebilirsiniz.
      </p>
    );
  }

  return (
    <table className="mt-6 w-full text-sm" data-testid="notification-preferences-table">
      <thead>
        <tr className="text-left text-xs text-zinc-500 border-b">
          <th className="py-2">Konu</th>
          <th className="py-2">Kanal</th>
          <th className="py-2">Etkin</th>
          <th className="py-2">Kısıtlar</th>
          <th className="py-2">Güncelleme</th>
          <th className="py-2 text-right">İşlem</th>
        </tr>
      </thead>
      <tbody>
        {sorted.map((row) => (
          <tr key={row.id} className="border-b">
            <td className="py-2">
              {row.topicKey ?? <em className="text-zinc-500">tüm konular</em>}
            </td>
            <td className="py-2">
              {row.channel ?? <em className="text-zinc-500">tüm kanallar</em>}
            </td>
            <td className="py-2">
              <button
                type="button"
                onClick={() => void onToggle(row)}
                aria-label={
                  row.enabled
                    ? `${row.topicKey ?? 'Tüm konular'} ${row.channel ?? 'tüm kanallar'} kuralını kapat`
                    : `${row.topicKey ?? 'Tüm konular'} ${row.channel ?? 'tüm kanallar'} kuralını aç`
                }
                className={`px-2 py-0.5 rounded text-xs ${
                  row.enabled ? 'bg-emerald-100 text-emerald-800' : 'bg-zinc-200 text-zinc-700'
                }`}
              >
                {row.enabled ? 'Açık' : 'Kapalı'}
              </button>
            </td>
            <td className="py-2 text-xs">
              <ConstraintsCell row={row} />
            </td>
            <td className="py-2 text-zinc-500 text-xs">{formatTimestamp(row.updatedAt)}</td>
            <td className="py-2 text-right">
              {pendingDeleteId === row.id ? (
                <span className="inline-flex items-center gap-2 text-xs">
                  <span className="text-zinc-600">Emin misiniz?</span>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await onDelete(row.id);
                      } finally {
                        setPendingDeleteId(null);
                      }
                    }}
                    disabled={deleting}
                    aria-label={`${row.id} numaralı kuralı silme işlemini onayla`}
                    className="text-rose-700 underline disabled:opacity-50"
                  >
                    Onayla
                  </button>
                  <button
                    type="button"
                    onClick={() => setPendingDeleteId(null)}
                    aria-label="silmekten vazgeç"
                    className="text-zinc-500 hover:underline"
                  >
                    Vazgeç
                  </button>
                </span>
              ) : (
                <span className="inline-flex items-center gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => onEdit(row)}
                    aria-label={`${row.id} numaralı kuralı düzenle`}
                    data-testid={`pref-row-edit-${row.id}`}
                    className="text-blue-700 hover:underline"
                  >
                    Düzenle
                  </button>
                  <button
                    type="button"
                    onClick={() => setPendingDeleteId(row.id)}
                    aria-label={`${row.id} numaralı kuralı sil`}
                    className="text-rose-700 hover:underline"
                  >
                    Sil
                  </button>
                </span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};

const ConstraintsCell: React.FC<{ row: PreferenceDto }> = ({ row }) => {
  const summary = formatQuietHours(row.quietHours);
  const hasQuietHours = summary !== '—';
  const hasFrequency =
    row.frequencyLimitPerDay !== null &&
    row.frequencyLimitPerDay !== undefined &&
    row.frequencyLimitPerDay > 0;
  const bypassOff = row.bypassForCritical === false;
  if (!hasQuietHours && !hasFrequency && !bypassOff) {
    return <span className="text-zinc-400">—</span>;
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      {hasQuietHours && (
        <span className="inline-flex items-center gap-1" data-testid="pref-row-badge-quiet">
          <Clock size={12} aria-hidden="true" />
          {summary}
        </span>
      )}
      {hasFrequency && (
        <span className="inline-flex items-center gap-1" data-testid="pref-row-badge-freq">
          <Gauge size={12} aria-hidden="true" />
          Günde {row.frequencyLimitPerDay}'e kadar
        </span>
      )}
      {bypassOff && (
        <span
          className="inline-flex items-center gap-1 text-amber-700"
          data-testid="pref-row-badge-bypass-off"
          aria-label="Kritik bypass kapalı"
        >
          <BellOff size={12} aria-hidden="true" />
          Kritik bypass kapalı
        </span>
      )}
      {!bypassOff && hasQuietHours && (
        <span
          className="inline-flex items-center gap-1 text-zinc-400"
          aria-label="Kritik bypass açık"
          title="Kritik bildirimler bu kuralın kısıtlarını bypass eder."
        >
          <BellRing size={12} aria-hidden="true" />
        </span>
      )}
    </span>
  );
};

const formatTimestamp = (iso: string): string => {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return '—';
  return new Date(ms).toLocaleString('tr-TR');
};

const extractErrorMessage = (err: unknown): string => {
  if (err && typeof err === 'object' && 'data' in err) {
    const data = (err as { data: unknown }).data;
    if (data && typeof data === 'object' && 'message' in data) {
      const msg = (data as { message: unknown }).message;
      if (typeof msg === 'string') return msg;
    }
  }
  return 'Kural kaydedilemedi.';
};

const extractRestoreError = (err: unknown): string => {
  if (err && typeof err === 'object' && 'status' in err) {
    const status = (err as { status?: number }).status;
    if (status === 503) {
      return 'Bildirim tercihi özelliği bu ortamda kapalı.';
    }
    if (status === 403) {
      return 'Bu organizasyon için tercih sıfırlama yetkiniz yok.';
    }
    if (status === 401) {
      return 'Oturum doğrulanamadı. Yeniden giriş yapın.';
    }
  }
  return 'Tercihler sıfırlanamadı. Lütfen tekrar deneyin.';
};

/**
 * Faz 23.6 PR-C2 — Codex thread `019e03d1` REVISE iter-2 absorb:
 * mute-channel error mapping must speak the channel-mute domain
 * language, not the restore-defaults one. 400 (unknown channel) is
 * a real user-correctable error here (the dispatcher's allow-list
 * may have changed), so it gets its own copy instead of falling
 * through to the generic fallback.
 */
const extractMuteChannelError = (err: unknown): string => {
  if (err && typeof err === 'object' && 'status' in err) {
    const status = (err as { status?: number }).status;
    if (status === 400) {
      return 'Seçilen kanal tanınmıyor. Kanal listesini yenileyip tekrar deneyin.';
    }
    if (status === 503) {
      return 'Bildirim tercihi özelliği bu ortamda kapalı.';
    }
    if (status === 403) {
      return 'Bu organizasyon / abone için kanal susturma yetkiniz yok.';
    }
    if (status === 401) {
      return 'Oturum doğrulanamadı. Yeniden giriş yapın.';
    }
  }
  return 'Kanal susturulamadı. Lütfen tekrar deneyin.';
};

export default NotificationPreferencesPage;
