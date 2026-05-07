import { BellOff, BellRing, Clock, Gauge } from 'lucide-react';
import React, { useCallback, useMemo, useState } from 'react';
import { useAppSelector } from '../../app/store/store.hooks';
import {
  useDeletePreferenceMutation,
  useListPreferencesQuery,
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

  const [editorOpen, setEditorOpen] = useState(false);
  const [editorTarget, setEditorTarget] = useState<PreferenceDto | null>(null);

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
    return <p className="mt-6 text-sm text-zinc-500">Yükleniyor…</p>;
  }
  if (sorted.length === 0) {
    return (
      <p className="mt-6 text-sm text-zinc-600">
        Henüz tanımlı bir kural yok. Yukarıdan ekleyebilirsiniz.
      </p>
    );
  }

  return (
    <table className="mt-6 w-full text-sm">
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

export default NotificationPreferencesPage;
