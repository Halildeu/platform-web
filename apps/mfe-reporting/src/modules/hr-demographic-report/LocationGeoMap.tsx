/**
 * LocationGeoMap — HR İkamet Şehri choropleth visualisation.
 *
 * Replaces the prior `<PieChart data={locationDistribution} />` widget
 * with a TR provinces map (`@mfe/x-charts` GeoMap) + a bubble overlay
 * for the top 5 yoğun ikamet illeri, a `DetailDrawer` for per-province
 * drill-down (aggregate-only — live row drill stays PR-X15 scope), an
 * `Alert` surface for unmatched API labels (no silent data loss), and
 * an inline data-quality badge for the `Belirtilmemiş` outlier.
 *
 * Architecture (Codex 019e26a9 plan-time iter-3 AGREE):
 *   - All TR geo data + helpers live under `geo/` (app-owned, NOT
 *     @mfe/x-charts).
 *   - `useTRMapRegistration` hook drives `ensureGeoMapRegistered('TR', ...)`
 *     before render; `ready` / `error` states gate the GeoMap mount.
 *   - `adaptLocationToGeoMap` is a pure adapter — same inputs → same
 *     outputs. Test surface is `__tests__/location-to-geomap.test.ts`.
 *   - Click handlers: region branch uses `event.datum.code`; bubble
 *     overlay branch reads `event.datum.category` (the adapter stamps
 *     the TR-XX code there) — Codex iter-2 #2 fix.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { GeoMap, KPICard as XKPICard, type GeoOverlay } from '@mfe/x-charts';
import { Alert } from '@mfe/design-system';
import { DetailDrawer } from '@mfe/design-system';
import { useTRMapRegistration } from './geo/useTRMapRegistration';
import {
  adaptLocationToGeoMap,
  buildTRNameMap,
  type LocationDistributionItem,
} from './utils/location-to-geomap';
import { getProvinceByCode } from './geo/tr-provinces';

const VISUAL_MAP_COLORS = ['#dbeafe', '#93c5fd', '#3b82f6', '#1d4ed8', '#1e3a8a'];

export interface LocationGeoMapProps {
  /** Raw API distribution: `Array<{ label, value }>`. */
  data: ReadonlyArray<LocationDistributionItem>;
  /** Optional title override. Defaults to "İkamet Şehri". */
  title?: string;
  /** Optional description shown in the GeoMap subtitle. */
  description?: string;
  /**
   * Optional click pass-through. Fired with the resolved TR-XX code
   * (or `null` for region clicks that didn't match a known province).
   * Consumers can use this to navigate to a filtered grid view in
   * follow-up PR-X15.
   */
  onProvinceSelect?: (code: string | null) => void;
}

/**
 * Localised number formatter — matches the dashboard's locale.
 * Falls back to `String(n)` on environments without `Intl`.
 */
const fmt = (n: number): string => {
  try {
    return new Intl.NumberFormat('tr-TR').format(n);
  } catch {
    return String(n);
  }
};

/**
 * Build attribution-aware base path for the "detaylı liste" link
 * shown inside the drawer. Codex 019e26a9 iter-3 guardrail #6 — do
 * not hardcode `/admin/reports/...`; derive from current location.
 */
const buildReportsBasePath = (): string => {
  if (typeof window === 'undefined') return '/admin/reports';
  return window.location.pathname.startsWith('/admin/reports') ? '/admin/reports' : '/reports';
};

const NAME_MAP = buildTRNameMap();

export const LocationGeoMap: React.FC<LocationGeoMapProps> = ({
  data,
  title = 'İkamet Şehri',
  description,
  onProvinceSelect,
}) => {
  const { ready, error } = useTRMapRegistration();

  const adapter = useMemo(() => adaptLocationToGeoMap(data), [data]);

  const [selectedCode, setSelectedCode] = useState<string | null>(null);

  const handleDataPointClick = useCallback(
    (event: { datum: Record<string, unknown> }) => {
      const datum = event.datum;
      const kind = datum?.kind;
      let code: string | null = null;
      if (kind === 'region') {
        const regionCode = datum.code;
        code = typeof regionCode === 'string' ? regionCode : null;
      } else if (kind === 'overlay' && datum.overlayType === 'bubble') {
        // Codex 019e26a9 iter-2 #2: bubble overlay click payload doesn't
        // include `code`; the adapter stamped it on `category`.
        const categoryCode = datum.category;
        code = typeof categoryCode === 'string' ? categoryCode : null;
      }
      setSelectedCode(code);
      onProvinceSelect?.(code);
    },
    [onProvinceSelect],
  );

  const overlays = useMemo<GeoOverlay[] | undefined>(() => {
    return adapter.bubbleOverlay ? [adapter.bubbleOverlay] : undefined;
  }, [adapter.bubbleOverlay]);

  const provinceDetail = selectedCode ? adapter.provinceDetails[selectedCode] : null;
  const selectedProvince = selectedCode ? getProvinceByCode(selectedCode) : null;

  // Error state — registration failure surfaces inline so dashboard
  // never renders a half-broken map.
  if (error) {
    return (
      <Alert variant="error" title="Harita yüklenemedi">
        {error.message}
      </Alert>
    );
  }

  // Loading state — `ready` false until lazy chunk + normalize finish.
  if (!ready) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex h-64 items-center justify-center text-sm opacity-60"
      >
        Harita yükleniyor…
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Data-quality badge — Belirtilmemiş outlier kept out of the
          map domain (would dominate the visualMap scale) but surfaced
          so consumers see the missing-data signal. */}
      {adapter.unspecifiedCount > 0 && (
        <div className="flex gap-3">
          <XKPICard
            title="İkamet Eksik"
            value={fmt(adapter.unspecifiedCount)}
            subtitle="Veri kalitesi metriği — haritada gösterilmez"
          />
        </div>
      )}

      <GeoMap
        mapName="TR"
        nameProperty="code"
        data={adapter.mapData.map((d) => ({
          name: d.code,
          value: d.value,
          code: d.code,
        }))}
        nameMap={NAME_MAP}
        visualMap={{
          min: 0,
          max: adapter.visualMax,
          colors: VISUAL_MAP_COLORS,
          text: ['Yüksek', 'Düşük'],
          position: 'bottom',
        }}
        overlays={overlays}
        title={title}
        description={description}
        onDataPointClick={handleDataPointClick}
        size="lg"
      />

      {/* Unmatched labels — Codex iter-2 #5: production drift surfaces
          visibly so silent data loss doesn't happen. */}
      {adapter.unmatchedLabels.length > 0 && (
        <Alert variant="info" title="Haritalanamayan etiketler">
          <div className="text-xs">
            {adapter.unmatchedLabels.length} etiket alias dictionary'sinde eşleşmedi:{' '}
            {adapter.unmatchedLabels
              .slice(0, 5)
              .map((l) => `${l.label} (${fmt(l.value)})`)
              .join(', ')}
            {adapter.unmatchedLabels.length > 5 &&
              ` ve ${adapter.unmatchedLabels.length - 5} diğer`}
          </div>
        </Alert>
      )}

      {/* Attribution — ODbL § 4.3 (OSM derivative data). */}
      <small className="text-xs opacity-60">
        Harita verisi: ©{' '}
        <a
          href="https://www.openstreetmap.org/copyright"
          target="_blank"
          rel="noopener noreferrer"
          className="underline"
        >
          OpenStreetMap katkıcıları
        </a>{' '}
        · ODbL · TR il sınırları © Cihad Turhan
      </small>

      {/* Drill-down drawer — aggregate-only.
          Live grid drill-down lives in PR-X15. */}
      <DetailDrawer
        open={!!selectedCode && !!provinceDetail}
        onClose={() => setSelectedCode(null)}
        title={selectedProvince?.name ?? selectedCode ?? 'İl detayı'}
        subtitle={
          selectedProvince ? `${selectedProvince.code} · ${selectedProvince.region}` : undefined
        }
        size="md"
      >
        {selectedCode && provinceDetail && (
          <div className="flex flex-col gap-4 p-4">
            <div>
              <div className="text-xs opacity-60">Toplam personel</div>
              <div className="text-2xl font-semibold">
                {fmt(provinceDetail.sourceLabels.reduce((s, l) => s + l.value, 0))}
              </div>
            </div>

            {provinceDetail.sourceLabels.length > 1 && (
              <div>
                <div className="mb-1 text-xs opacity-60">Kaynak etiketler</div>
                <ul className="space-y-1 text-sm">
                  {provinceDetail.sourceLabels.map((l) => (
                    <li key={l.label} className="flex justify-between gap-4">
                      <span>{l.label}</span>
                      <span className="font-mono">{fmt(l.value)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {selectedProvince && (
              <div className="text-xs opacity-60">
                Plaka: {selectedProvince.plate} · Bölge: {selectedProvince.region}
              </div>
            )}

            <a
              href={`${buildReportsBasePath()}/hr-demografik-yapi?location=${encodeURIComponent(
                selectedProvince?.name ?? '',
              )}`}
              className="mt-2 inline-flex items-center text-sm underline"
            >
              Detaylı personel listesi →
            </a>
            <div className="text-xs opacity-50">
              (Live row drill-down PR-X15 scope'unda — şu an aggregate breakdown gösteriliyor.)
            </div>
          </div>
        )}
      </DetailDrawer>
    </div>
  );
};
