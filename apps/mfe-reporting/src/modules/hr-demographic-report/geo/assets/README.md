# Türkiye GeoJSON Asset

## File

`tr-provinces.geo.json` — 81 il (province) polygon FeatureCollection.

## Source

- **Upstream**: https://github.com/cihadturhan/tr-geojson
- **File**: `geo/tr-cities-utf8.json`
- **Derived from**: OpenStreetMap contributor data
- **License**: Open Database License (ODbL) v1.0 — see `LICENSE.txt`

## Structure

```jsonc
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "properties": { "name": "Adana" /* Title-cased Turkish name */ },
      "geometry": { "type": "MultiPolygon", "coordinates": [...] }
    },
    // ... 80 more
  ]
}
```

- **81 features**: full TR plate-code coverage (1..81).
- **properties.name**: Turkish display name, TitleCase with proper diacritics
  (`İstanbul`, `Çankırı`, `Şanlıurfa`, ...).
- **No `properties.code`**: stamped at load time by `normalizeTRGeoJson.ts`
  (`../normalizeTRGeoJson.ts`) using the alias dictionary in `../tr-provinces.ts`.

## Loader contract

The runtime loader (`../useTRMapRegistration.ts`) dynamic-imports this file
as a Vite chunk and passes it through `normalizeTRGeoJson()`, which:

1. Looks up each feature's `properties.name` in `TR_PROVINCE_ALIASES`.
2. Stamps `properties.code = 'TR-XX'` based on the matching plate.
3. Asserts the **81 invariant**: 81 features, 81 unique codes, all of
   `TR-01..TR-81` present. Any drift throws — no silent fallback.

`GeoMap` is then registered with `nameProperty="code"` so adapter output
(`Array<{ name, value, code: 'TR-34' }>`) matches features by ISO code,
not by name (avoids Turkish locale / fuzzy-match brittleness).

## Attribution

Any user-facing surface that renders this map MUST include an attribution
visible near the visualisation:

```tsx
<small className="text-xs opacity-60">
  Harita verisi: ©{' '}
  <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">
    OpenStreetMap katkıcıları
  </a>{' '}
  · ODbL · TR il sınırları © Cihad Turhan
</small>
```

This satisfies ODbL § 4.3 (attribution) for derivative data and OSM
contributor-attribution requirements.

## Modifications log

| Date       | Author | Change                                                                                                           |
| ---------- | ------ | ---------------------------------------------------------------------------------------------------------------- |
| 2026-05-14 | PR-X14 | Imported `tr-cities-utf8.json@master` verbatim. Loader-time `properties.code` stamping added (no file mutation). |

## Update procedure

To bump the GeoJSON (e.g. for boundary corrections):

```bash
curl -sL \
  https://raw.githubusercontent.com/cihadturhan/tr-geojson/master/geo/tr-cities-utf8.json \
  -o apps/mfe-reporting/src/modules/hr-demographic-report/geo/assets/tr-provinces.geo.json

# Verify 81-feature invariant manually:
jq '.features | length' \
  apps/mfe-reporting/src/modules/hr-demographic-report/geo/assets/tr-provinces.geo.json
# Expected: 81

# Run normalizer tests:
pnpm --filter mfe-reporting test geo/__tests__/normalizeTRGeoJson
```

## Why not Natural Earth?

Natural Earth `10m_admin_1_states_provinces` was the first-pass candidate
(public-domain, lower attribution friction). Codex 019e26a9 plan-time
analysis showed `cihadturhan/tr-geojson` is a strict-superset alternative:

- Already-transformed FeatureCollection (no shapefile → mapshaper toolchain
  needed); single 235 KB file.
- 81 features verified; ISO plate-code mapping deterministic via local
  alias dictionary.
- Polygon simplification appropriate for choropleth render scale.

ODbL attribution overhead is one short `<small>` block. Acceptable trade
for asset-prep velocity.
