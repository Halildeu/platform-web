import React, { useCallback, useMemo, useState } from 'react';
import { useAppSelector } from '../../app/store/store.hooks';
import {
  useDeletePreferenceMutation,
  useListPreferencesQuery,
  useUpsertPreferenceMutation,
} from '../../features/notifications/api/notify-prefs.api';
import type { PreferenceDto } from '../../features/notifications/api/notify-prefs.types';
import { selectNotifyIdentity } from '../../features/notifications/model/identity.selectors';

/**
 * Subscriber notification preferences page (Faz 23.5 PR3).
 *
 * <p>Lets the signed-in user inspect and edit which notification topics
 * and channels they receive. Backend contract: see
 * {@code notification-orchestrator} {@code PreferenceController}
 * (Faz 23.5 PR2). Identity flows from the existing notify selector
 * ({@code selectNotifyIdentity}) → RTK Query headers; the same auth
 * cookie that drives the inbox surface drives the prefs surface.
 *
 * <h3>UX scope (v1 minimal)</h3>
 *
 * <ul>
 *   <li>Lists existing rows in a single table.</li>
 *   <li>Per-row "Etkin" toggle that PUT-upserts back to the same
 *       composite key — instant feedback because the cache LIST tag is
 *       invalidated.</li>
 *   <li>Per-row delete button (revert to default-allow for that
 *       (topic, channel) tuple).</li>
 *   <li>Inline form to add a new rule: topicKey + channel +
 *       enabled. Quiet hours / frequency limit / bypass-for-critical
 *       are deferred to a richer editor in Faz 23.6+.</li>
 * </ul>
 *
 * <p>Disabled-state and 503 ("preferences feature off") handling are
 * surfaced as plain inline messages — not as toasts — so a screen
 * reader can find them without rerouting through the global toast
 * channel.
 */
const NotificationPreferencesPage: React.FC = () => {
  const identity = useAppSelector(selectNotifyIdentity);
  const isReady = identity !== null;
  const queryArg = identity ?? { orgId: '', subscriberId: '' };

  const listQuery = useListPreferencesQuery(queryArg, { skip: !isReady });
  const [upsert, upsertStatus] = useUpsertPreferenceMutation();
  const [deletePref, deleteStatus] = useDeletePreferenceMutation();

  if (!isReady) {
    return (
      <section className="p-6 max-w-4xl mx-auto">
        <h1 className="text-xl font-semibold">Bildirim Tercihleri</h1>
        <p className="mt-2 text-zinc-600">Önce oturum açın.</p>
      </section>
    );
  }

  if (listQuery.isError) {
    // 503 (preferences feature disabled) is the most common
    // not-network error for this surface; surface a clear message.
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

      {/* Inline new-row form */}
      <NewPreferenceForm
        identity={identity}
        onSubmit={(body) => upsert({ ...identity, ...body }).unwrap()}
        submitting={upsertStatus.isLoading}
      />

      {/* Existing rows */}
      <PreferenceTable
        rows={listQuery.data ?? []}
        loading={listQuery.isLoading}
        onToggle={async (row) =>
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
        deleting={deleteStatus.isLoading}
      />
    </section>
  );
};

interface NewPreferenceFormProps {
  identity: { orgId: string; subscriberId: string };
  onSubmit: (body: {
    topicKey: string | null;
    channel: string | null;
    enabled: boolean;
  }) => Promise<unknown>;
  submitting: boolean;
}

const NewPreferenceForm: React.FC<NewPreferenceFormProps> = ({ onSubmit, submitting }) => {
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
  deleting: boolean;
}

const PreferenceTable: React.FC<PreferenceTableProps> = ({
  rows,
  loading,
  onToggle,
  onDelete,
  deleting,
}) => {
  // Codex iter P2 absorb: two-stage delete confirm — first click on
  // "Sil" arms the row; a second click on "Onayla" performs the
  // delete. Prevents accidental removal of mute rules (which would
  // re-enable notifications). The pending state is local to the table
  // so navigating away resets it.
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
                <button
                  type="button"
                  onClick={() => setPendingDeleteId(row.id)}
                  aria-label={`${row.id} numaralı kuralı sil`}
                  className="text-xs text-rose-700 hover:underline"
                >
                  Sil
                </button>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
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
