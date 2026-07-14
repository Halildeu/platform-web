# Token Pipeline — Sahiplik Kontrati

## Iki Pipeline

### Runtime Tokens (tokens:build:theme)

- **Komut:** `npm run tokens:build:theme`
- **Script:** `scripts/theme/generate-theme-css.mjs`
- **Girdi:** `design-tokens/figma.tokens.json`
- **Cikti:**
  - `apps/mfe-shell/src/styles/theme.css` — exact-owned runtime CSS custom properties
  - `apps/mfe-shell/src/styles/generated-theme-inline.css` — exact-owned Tailwind utility registry
  - `apps/mfe-shell/src/styles/component-theme.generated.css` — exact-owned component runtime token degerleri
  - `design-tokens/generated/theme-contract.json` — Theme contract manifest
  - `design-tokens/generated/token-types.ts` — exact-owned TypeScript token isimleri
- **Curated extension:** `theme.extensions.css` ve `theme-inline.extensions.css` normal lint/format kapsamindadir; generator bu dosyalari okur ve ownership cakismasini denetler, fakat hicbir zaman yazmaz.
- **Rol:** ThemeProvider runtime styling — CSS custom properties (`data-theme`, `data-radius`, `data-density`, `data-elevation`, `data-motion` attribute'lari ile axis bazli selector'lar uretir). Token Bridge blogu ile component-level alias'lar da dahil.
- **Ne zaman calisir:**
  - CI: `.github/workflows/web-test-gate.yml` icindeki required `token-drift-required` job'inda `pnpm run tokens:drift`
  - `--check`, bes generated artifact'i byte-exact karsilastirir; curated shadow ve import sirasi ihlalinde de fail eder
- **Sahip:** Design System team

### Design-time Tokens (tokens:build)

- **Komut:** `npm run tokens:build`
- **Script:** `scripts/tokens/build-tokens.mjs`
- **Girdi:** `packages/design-system/src/tokens/` altindaki `.ts` kaynak dosyalar (color.ts, spacing.ts, radius.ts, typography.ts, motion.ts, zIndex.ts, elevation.ts, opacity.ts, density.ts, focusRing.ts, semantic.ts)
- **Cikti:** `packages/design-system/src/tokens/build/` dizinine:
  - `tokens.json` — Tum token'lar kategoriye gore JSON
  - `tokens.css` — CSS custom properties (:root blogu)
  - `token-types.ts` — TypeScript union type'lar (her token kategorisi icin)
  - `docs.json` — Design Lab token viewer icin dokumanasyon verisi
- **Rol:** Design Lab, documentation, type safety, Figma export
- **Ne zaman calisir:**
  - CI: `.github/workflows/web-test-gate.yml` icindeki required `token-drift-required` zincirinde exact `--check`
- **Sahip:** Design System team

## Validation Gate

- **Komut:** `npm run tokens:validate`
- **Script:** `scripts/tokens/validate-tokens.mjs`
- **Ne kontrol eder:**
  - Duplicate token name tespiti (export seviyesinde ve leaf-level cross-file)
  - Color dosyalarinda gecersiz renk degeri kontrolu (hex, rgb, rgba, hsl, hsla, CSS var, named color)
  - Spacing/size dosyalarinda gecersiz boyut degeri kontrolu (px, rem, em, vb.)
  - Undefined veya bos referans kontrolu
- **CI'da nerede:** `.github/workflows/web-test-gate.yml` — required `token-drift-required` icindeki `Token source validation` adimi
- **Fail olursa:** Workflow-required aggregator basarisiz olur (exit code 1 doner). `main` repository-level ruleset pinning ayrica #908 ile izlenir.

## Release Iliskisi

- Token degisikligi -> design-system minor/patch release gerektirir
- `tokens:build` ciktisi `dist/`'e dahil mi? **Evet** — `src/tokens/build/` dizini `src/` altinda oldugundan ve `package.json`'daki `files` alani `"src"` icerdiginden, publish edilen pakete dahildir
- `tokens:build:theme` ciktisi nerede tuketiliyor? Production ve CSSOM harness ayni exact sirayi kullanir: `tailwindcss` → `generated-theme-inline.css` → `theme-inline.extensions.css` → `theme.css` → `theme.extensions.css` → `component-theme.generated.css`. Her curated katman kendi generated counterpart'indan sonra yuklenir; cross-layer identity cakismasi yasaktir. Identity, ordered at-rule ancestry + normalized selector + property olarak tanimlidir; ayni property'nin farkli selector altindaki scoped kullanimi ayri bir curated identity'dir. Bu izin serbest yazim anlami tasimaz: curated dosyalarin tamamı reviewed ledger digest'ine baglidir, dolayisiyla daha spesifik selector dahil her ek/deger degisikligi ledger guncellemesi ve yeniden review olmadan `--check` kapisini gecemez. ThemeProvider, `DesignSystemProvider` uzerinden CSS custom property'lerini `data-*` attribute'lari ile uygular.

## Akis Diyagrami

```
Token source (figma.tokens.json)
  └── tokens:build:theme
      ├── exact generated: theme.css + generated-theme-inline.css + component-theme.generated.css + contract/types
      ├── validated curated: theme.extensions.css + theme-inline.extensions.css (never written)
      └── mfe-shell → ThemeProvider → Runtime

Token source (.ts dosyalari: color, spacing, radius, typography, motion, zIndex, elevation, opacity, density, focusRing, semantic)
  ├── tokens:build → tokens.json + tokens.css + token-types.ts + docs.json → Design Lab + Types + Figma export
  └── tokens:validate → web-test-gate token-drift-required (duplicate/gecersiz deger/undefined ref kontrolu)
```

## Sorumluluklar

| Aksiyon                                 | Sorumlu                                                 | Ne zaman                 |
| --------------------------------------- | ------------------------------------------------------- | ------------------------ |
| Token ekleme/degistirme (.ts kaynaklar) | Design System team                                      | Feature branch           |
| figma.tokens.json guncelleme            | Design System team                                      | Figma sync sonrasi       |
| tokens:validate calistirma              | CI (otomatik, web-test-gate.yml / token-drift-required) | Her PR ve main push      |
| tokens:build exact kontrolu             | CI (otomatik, web-test-gate.yml / token-drift-required) | Her PR ve main push      |
| tokens:build:theme kontrolu             | CI (otomatik, web-test-gate.yml / token-drift-required) | Her PR ve main push      |
| Ownership + exact drift kontrolu        | CI (otomatik, web-test-gate-required zinciri)           | Her PR ve main push      |
| Release notu yazma                      | Design System team                                      | Her token degisikliginde |
