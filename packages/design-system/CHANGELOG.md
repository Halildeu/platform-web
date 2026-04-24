## [1.0.0] - 2026-03-24

### Features

- feat(design-system): coverage boost — 260 tests for enterprise, internal, form (5df3714)
- feat(design-system): Sprint 4-5 — story decorators, scorecard dashboard (f7d5cb0)
- feat(design-system): Sprint 1-3 quality push — play functions, @example, CI gates (4d1a418)
- feat(design-system): quality scorecard push — avg 84, 158/158 A-grade, 7209 tests (af0567b)
- feat: TW4 native — space-y/x → flex flex-col gap (452 → 0) (201d88a)
- feat: Tailwind CSS 3.4 → 4.2.2 migration (v2 — @config approach) (87e3795)
- feat: Tailwind CSS 3.4 → 4.2.2 migration (7ec1078)
- feat: Design Lab deep page-specific tests — 257 tests (was 189) (0cedc70)
- feat: full platform hardening — 20 features activated (7af3092)
- feat: Vite 8 + Vitest 4 upgrade, browser/visual tests, Quality Dashboard (b75aff6)
- feat: 100% deep browser test coverage — 855 tests, 0 shallow (895a586)
- feat: deepen browser tests for 30 more components (2→8 tests each) (8bd24fc)
- feat: deepen browser+visual tests for 15 critical components (a5b63ed)
- feat: complete browser+visual test coverage — 98 browser, 97 visual files (921850b)
- feat: browser+visual tests expanded to 43 components (87 test files) (610bec0)
- feat: expand browser+visual tests to 23 components + quality tracking (ddd061a)
- feat: browser + visual regression tests for 13 core components (4ae04f9)
- feat: activate all Vitest 4 + Vite 8 new capabilities (f0052c7)
- feat: Vite 5→8.0.1, Vitest 1.6→4.1.0 — CJS warning eliminated (0458d2d)
- feat(wave-3): Quality Gates Hardening — 9 deliverables, all gates green (b745647)
- feat(wave-2): Token Platform + Design Sync — DTCG pipeline, Code Connect, drift detection (26dd5d1)

### Bug Fixes

- fix(tw4): migrate @theme to @theme inline for runtime token resolution (c7377d0)
- fix: ESLint cleanup, build fix, dark mode shell integration (23fee87)
- fix: revert smart quote changes in string literals (d0e1054)
- fix: remove 92 Unicode smart quotes across 27 files (f2cc550)
- fix: dark mode tokens — add bridge-compatible aliases (73f4803)
- fix: TW4 native — transition-transform → individual properties (185a7f5)
- fix: final TW4 bare utility cleanup — backdrop-blur → backdrop-blur-sm (6a5efa4)
- fix: bare 'rounded' → 'rounded-sm' (TW4 removed bare rounded) (d19f651)
- fix: remove @layer theme wrapper — ensure runtime token override (3b35efb)
- fix: TW4 token override — @layer specificity bug (6f568f0)
- fix: TW4 final migration — gradient rename + flex-shrink + compat cleanup (5c5639e)
- fix: TW4 compatibility layer — dark mode + v3 defaults restored (9f56f6c)
- fix: TW4 renamed utilities — 589 occurrences across 247 files (763d7d7)
- fix: add 11 missing color tokens to TW4 @theme (5c95813)
- fix: TW4 @theme — replace 'initial' with var(--token, fallback) (935211e)
- fix: TW4 @theme circular reference — visual regression root cause (50002b8)
- fix: observability infra health + variant-service JWT issuer (51811ad)
- fix: pre-Tailwind-v4 migration prep — verify EXIT 0 (55f4f76)
- fix: e2e tests resilient in permitAll mode — 56 pass, 0 fail (1ce5f4f)
- fix: component API lint 0 violations, all quality gates pass (92aa29d)
- fix: AG Grid 35 → reverted to 34.3.1, perf gate threshold relaxed (c4822f9)
- fix: all 98 browser tests pass — 853/853 green (ae8dde9)
- fix: browser test API migration — vitest-browser-react correct pattern (3f6c8c6)
- fix: quality gate cleanup — perf threshold, inventory, API lint exclusions (ae1c2d6)
- fix: AvatarGroup preview crash + MobileStepper availability (9b2b85c)

### Chores

- chore: gitignore coverage output (aa52796)
- chore: major dependency updates — Node 22, ESLint 10, webpack-cli 7 (5fd6958)
- chore: minor/patch dependency updates (edb11a2)

### Other

- revert: Tailwind CSS 4.2.2 → 3.4.18 (visual regression) (6fd2dae)


---

# Changelog

All notable changes to `@mfe/design-system` will be documented in this file.

This project adheres to [Semantic Versioning](https://semver.org/).

## [1.1.0](https://github.com/Halildeu/platform-web/compare/design-system-v1.0.0...design-system-v1.1.0) (2026-04-24)


### Features

* 73/73 all checks pass — zero warnings, zero failures ([067b602](https://github.com/Halildeu/platform-web/commit/067b602380bcaa3d8b75c1babbb0186b6f213ee2))
* **charts:** migrate design-system charts from AG Charts to ECharts ([02a1cff](https://github.com/Halildeu/platform-web/commit/02a1cff543ce8692d083e4a01c800cee232ecccb))
* **data-grid:** add Status Bar, Pivot Mode, Range Selection ([743082e](https://github.com/Halildeu/platform-web/commit/743082e2452f8daaaca37c633a1c8aca34cde000))
* **data-grid:** column aggregation via context menu + group footer ([0850275](https://github.com/Halildeu/platform-web/commit/0850275423e6c4a9d338b9832da671ce5b395593))
* **data-grid:** custom context menu with filter-by-value and row pin ([4e14d73](https://github.com/Halildeu/platform-web/commit/4e14d73f161a05c8a6eb24954230578a1602e80e))
* **data-grid:** Custom Filter Builder with AND/OR nested groups ([f7bd0b8](https://github.com/Halildeu/platform-web/commit/f7bd0b87a9b15c0b12012ead35aab49da5d5d3a5))
* **data-grid:** quick group toggle dropdown in toolbar ([61858dc](https://github.com/Halildeu/platform-web/commit/61858dc4adfc17f5c2b4959a6d2872825b5c1144))
* **data-grid:** re-enable Advanced Filter Builder ([28db4a7](https://github.com/Halildeu/platform-web/commit/28db4a70e5b64e0093cd304e5100745c1c5dfa5e))
* **data-grid:** register Find, RowNumbers, PinnedRow, Sparklines ([50c6c71](https://github.com/Halildeu/platform-web/commit/50c6c71ad14c4a64ec961ea2944622a868703eb7))
* **data-grid:** register MasterDetail, RichSelect, HighlightChanges, GridState ([cb4f7a9](https://github.com/Halildeu/platform-web/commit/cb4f7a9315ca8f32f158e12d70f8539a85ad2522))
* **data-grid:** register RowGrouping modules for drag-to-group panel ([55f132e](https://github.com/Halildeu/platform-web/commit/55f132e123e69eb1e292f6780213ae4f9cdfcc28))
* **data-grid:** restore row group panel (drag-to-group area) ([4800b5c](https://github.com/Halildeu/platform-web/commit/4800b5c3c0bdc9e429fcf842525b41213a8957fd))
* **data-grid:** save paginationPageSize in variant state ([5657c1f](https://github.com/Halildeu/platform-web/commit/5657c1f45d67a3dd10174242966463b77bacad1e))
* **data-grid:** server-side row grouping support ([0ca20c8](https://github.com/Halildeu/platform-web/commit/0ca20c87f37dc23b3b9329d969b9c610d80c6958))
* **design-lab:** component dependency graph with static analysis ([7ad9049](https://github.com/Halildeu/platform-web/commit/7ad9049b28c77d263d68f295822c028462a9c3b6))
* **design-lab:** quality wave2 — coverage, docs portal, RTL, mutation, bundle budget ([#307](https://github.com/Halildeu/platform-web/issues/307)) ([7ac780e](https://github.com/Halildeu/platform-web/commit/7ac780effacf0a3d448c640e8002644f6e47d2c8))
* **design-lab:** sidebar v2 — world-class component navigation ([c383cc7](https://github.com/Halildeu/platform-web/commit/c383cc7c9539ea10f8d053c9d4693271ef8607e2))
* **design-system:** add 11 world-class components — Grid, Progress, Result, TreeSelect, SpeedDial, BottomNav ([4f7a3c9](https://github.com/Halildeu/platform-web/commit/4f7a3c9771f672c8b56a700a9c3aee6fb13a008e))
* **design-system:** add design-system-doctor + remove 139 fake edge tests ([a17ecd4](https://github.com/Halildeu/platform-web/commit/a17ecd4c61ba2bf0df928d0ecbfd65f1b33ca398))
* **design-system:** add GroupedCardGallery component ([db787a0](https://github.com/Halildeu/platform-web/commit/db787a0a80ef23eeaf96a856365f0605b0f308b4))
* **design-system:** add GroupedCardGallery component ([622f321](https://github.com/Halildeu/platform-web/commit/622f321103da98f204176c704433842aeefd8e32))
* **design-system:** add theme-axis-hardcodes doctor check ([f685d40](https://github.com/Halildeu/platform-web/commit/f685d40ff8c3f00e2b3f162d6cc9b26905257c45))
* **design-system:** best-in-class theme component rewrite ([#147](https://github.com/Halildeu/platform-web/issues/147)) ([e6f9590](https://github.com/Halildeu/platform-web/commit/e6f95909d87f1dcf62a1cd0c4dcbfd7866cbbf61))
* **design-system:** CI pipeline hardening + dynamic doc metrics ([a746550](https://github.com/Halildeu/platform-web/commit/a74655039ae006c9bb32337a6ab5255f49102937))
* **design-system:** close test coverage gap — 32 contract + 70 depth tests ([d12ccad](https://github.com/Halildeu/platform-web/commit/d12ccad8f97b116879267b043daeaad4a1dcbe29))
* **design-system:** close test coverage gap — 32 contract + 70 depth tests ([c6f0c81](https://github.com/Halildeu/platform-web/commit/c6f0c811ab2c5e0271c8a78a7b03df469f413842))
* **design-system:** column-system migration, UsersGrid skeleton, reporting improvements ([727c302](https://github.com/Halildeu/platform-web/commit/727c302db5cb291bb27aaacf9b63ef136175176e))
* **design-system:** design-system-doctor + quality foundation cleanup ([7a16b2f](https://github.com/Halildeu/platform-web/commit/7a16b2f073583ac8f202a8f98cd8513e1b178ccd))
* **design-system:** migrate column-system to @mfe/design-system, refactor UsersGrid ([e5ca294](https://github.com/Halildeu/platform-web/commit/e5ca294f19e26ef80a6823aea86999be1a3ba01b))
* **design-system:** PageHeader subtitle hover reveal ([9da2a87](https://github.com/Halildeu/platform-web/commit/9da2a87f41ce80109a345297416224b4850eae67))
* **design-system:** shell layout migration — sidebar, header, primitives ([047a2d0](https://github.com/Halildeu/platform-web/commit/047a2d0703511a1f46a2f33105ba196bc5c8cee4))
* **design-system:** shell layout migration — sidebar, header, primitives ([a83d8e3](https://github.com/Halildeu/platform-web/commit/a83d8e3f2810133e22110a19bbca883dcc381c6f))
* **design-system:** theme-axis token integration — 514→0 hardcodes ([b380ed8](https://github.com/Halildeu/platform-web/commit/b380ed83c61dfada9041d2e0f3d6ac92c907b677))
* **design-system:** theme-axis token integration — 514→0 hardcodes ([ed9b52b](https://github.com/Halildeu/platform-web/commit/ed9b52b73c695fcb8a335a67abb8420ca9d50606))
* Figma round-trip sync — complete bidirectional token pipeline ([358d673](https://github.com/Halildeu/platform-web/commit/358d67329d0951eb3296e565d4e96836f3d4fa4f))
* **filter-builder:** bulk paste button on all value inputs ([13d1091](https://github.com/Halildeu/platform-web/commit/13d10917c1366688bc365879040921a8b1994c49))
* **filter-builder:** bulk paste from Excel for set and text filters ([ddd62d3](https://github.com/Halildeu/platform-web/commit/ddd62d3e2b2f946c74eb985aaf8c8d31806aa3b3))
* **filter-builder:** chip-based value display with individual delete ([60d377c](https://github.com/Halildeu/platform-web/commit/60d377c94b918f6af7390b872bb3ae7e5a3734c3))
* **filter-builder:** clear visual hierarchy for nested groups ([d400bc2](https://github.com/Halildeu/platform-web/commit/d400bc287b84fc2ce7635a35e6bae9bb1e55aca3))
* **filter-builder:** empty start + clickable AND/OR connectors ([f0ee8cc](https://github.com/Halildeu/platform-web/commit/f0ee8cc34f56d907fd9860e5a51a3f943beadcfc))
* **filter-builder:** indent/outdent/move controls for conditions ([bffd09b](https://github.com/Halildeu/platform-web/commit/bffd09b5e793ce3da32a9cbe1ac82ba174a58252))
* **filter-builder:** independent combinators — each AND/OR toggles separately ([d235a48](https://github.com/Halildeu/platform-web/commit/d235a4897f63231af78b9602e39351165e39183e))
* **grid-variants:** global variant cache TTL + change notification ([03b4df7](https://github.com/Halildeu/platform-web/commit/03b4df72661fedf0af12c1b57649ca8c8193ab38))
* **grid:** enable global variant permissions in dev mode ([beaf30c](https://github.com/Halildeu/platform-web/commit/beaf30cbfffa801e479b847b4fdb0715bac69209))
* **grid:** in-app download progress, custom pagination, UI polish ([460e2ed](https://github.com/Halildeu/platform-web/commit/460e2ed49e99fd5e373a32ee32cfdac99a2f2763))
* **grid:** move data mode selector to footer, add footerStartSlot ([6494776](https://github.com/Halildeu/platform-web/commit/649477628661d57f7822ecd5c52b2649c17bafe5))
* **grid:** simplify export — 6 buttons → 2 (Excel + CSV) ([4b21b4d](https://github.com/Halildeu/platform-web/commit/4b21b4db9a0b2286d4b3c8bab78ad37b68a91dd7))
* **grid:** VariantIntegration Design Lab showcase + doc entry ([dd01b3e](https://github.com/Halildeu/platform-web/commit/dd01b3eea2a08ec9de22dca8b93d54c64827e304))
* **grid:** VariantIntegration showcase with seed data ([a782592](https://github.com/Halildeu/platform-web/commit/a782592adb86bc89c99046abe8040f8262355e9b))
* **grid:** wire onServerExport through EntityGridTemplate, remove Streaming CSV button ([ae98a73](https://github.com/Halildeu/platform-web/commit/ae98a73a61c39ea22eadc8e59632e6d0a1211c7a))
* KPI subquery filter, department dropdown, AG Charts fix, shell header, DS composable refactor ([#145](https://github.com/Halildeu/platform-web/issues/145)) ([2076d26](https://github.com/Halildeu/platform-web/commit/2076d2686ea8db338b10f67c60904934b418940c))
* multi-agent git coordination — worktree isolation + guard system ([11641ba](https://github.com/Halildeu/platform-web/commit/11641baf072253d14aefe4c993a1af73ad2b5d73))
* multi-agent git coordination — worktree isolation + guard system ([#290](https://github.com/Halildeu/platform-web/issues/290)) ([11641ba](https://github.com/Halildeu/platform-web/commit/11641baf072253d14aefe4c993a1af73ad2b5d73))
* **quality:** M1 Test Depth Sprint — 16 D/F component contract tests ([6772c12](https://github.com/Halildeu/platform-web/commit/6772c12479e5d28a9efb5258e695a023a688a0fc))
* **quality:** M2 stories — ShellHeader, ShellSidebar, column-system ([1fbd2b0](https://github.com/Halildeu/platform-web/commit/1fbd2b0dac5b72f39298a74560537c3d1d7e1c2f))
* **quality:** M3-M5 — CI scorecard workflow, 17 stories, quality gate escalation ([e430919](https://github.com/Halildeu/platform-web/commit/e4309195d1743154ae497f92265d1728a2d85e29))
* **reporting:** compensation analytics, periodic reports, variant fix ([da4bb01](https://github.com/Halildeu/platform-web/commit/da4bb018f01791cb42244a08a28b4b8b05d0c3f3))
* **reporting:** full interactive cross-filtering for compensation dashboard ([2aac841](https://github.com/Halildeu/platform-web/commit/2aac8418e3f33b23d1adf4bbf9bbbcf95241471b))
* **reporting:** full interactive cross-filtering for compensation dashboard ([e9574e7](https://github.com/Halildeu/platform-web/commit/e9574e700432961de5c90ba7f252d201309ed113))
* **reporting:** universal report skeleton + reporting sidebar + tooltip fix ([01c7d7e](https://github.com/Halildeu/platform-web/commit/01c7d7e35560ebee94f4871a52153a54adf8ce34))
* schema-explorer MFE, service-health improvements, MF shared config updates ([d09a0ed](https://github.com/Halildeu/platform-web/commit/d09a0ed7e5e4b9500ba849b4ea7963873e88f9b6))
* **schema-explorer:** SchemaLens — multi-schema support, nav styling, docker integration ([#124](https://github.com/Halildeu/platform-web/issues/124)) ([11d3837](https://github.com/Halildeu/platform-web/commit/11d38372d0036190a4b703fed20f4a50b3f60c3c))
* **schema-service:** add /lookup endpoint for FK ID→name resolution ([ef2004b](https://github.com/Halildeu/platform-web/commit/ef2004b940855c3bd1271e15101ce74d81a98eba))
* **ssrm:** full frontend support for aggregation, pivot, pagination, row selection ([16076b8](https://github.com/Halildeu/platform-web/commit/16076b8060bf9dd4e2b659617abc36b7a66796d2))
* STORY-0318 Zanzibar auth + Quality Sprint M1/M2 + dark-mode fix ([c7ed69d](https://github.com/Halildeu/platform-web/commit/c7ed69d539e7758b01d00cd917bdc6ea3f0d519d))
* **ui:** HoverDescription component, unified pagination, page header refinements ([60f4bf1](https://github.com/Halildeu/platform-web/commit/60f4bf1ca192e92ee65d2575ca9d26c5dcc275b5))
* **ui:** HoverDescription, unified pagination, page header ([3023c99](https://github.com/Halildeu/platform-web/commit/3023c99d2ee4f327cce94bd061a88d435decd873))
* **user-service:** multiSearch param for bulk filter values ([985e976](https://github.com/Halildeu/platform-web/commit/985e97648aa22ae5573736fe8edcc9aa25a5d1a9))
* Vite migration, design system overhaul & advanced data grid ([2aba273](https://github.com/Halildeu/platform-web/commit/2aba273ef87d79c61e40d53bf628c0dbd1f7b9bc))
* **vite-poc:** React mounts successfully under Vite 8! 🎉 ([13fa981](https://github.com/Halildeu/platform-web/commit/13fa981769544219745f5fcadba372d8987b3eec))


### Bug Fixes

* **access:** UX polish — i18n, layout, label truncation ([ad8acfa](https://github.com/Halildeu/platform-web/commit/ad8acfa3ba9aefb9e82401e00f1dc29ed60a1060))
* **ag-grid:** inject license key via DefinePlugin in mfe-users + design-system webpack ([97febc6](https://github.com/Halildeu/platform-web/commit/97febc6578d0c123baac7e95f96752245640c9f9))
* browser tests — 99/99 pass, 861 tests, 0 fail ([ae2fb50](https://github.com/Halildeu/platform-web/commit/ae2fb5014b35c2e1f12a92bb48f05907a863f61e))
* **build:** resolve all frontend build errors ([5b80ec0](https://github.com/Halildeu/platform-web/commit/5b80ec04e184c39585d57b0ba0b8079ec006e3a2))
* **catalog:** empty previewStates for non-visual components ([3c2e2fe](https://github.com/Halildeu/platform-web/commit/3c2e2fe9cac6b9d6c8809081202ae9bb750f61bd))
* **charts:** resolve AreaChart conflict markers left in merge commit ([0962443](https://github.com/Halildeu/platform-web/commit/09624438cb8c56c4ce04789303fe26465948e8a8))
* **ci:** JSDOM mocks for unit tests, suppress Netty CVEs ([99fb2c6](https://github.com/Halildeu/platform-web/commit/99fb2c6cf5438190161e05fc9b171cb8eec8bdbe))
* **column-system:** update transformer tests for valueFormatter in set filters ([ae880d7](https://github.com/Halildeu/platform-web/commit/ae880d7fc5e382ddbcd0fb3aed3cfbd1eaa765c2))
* **data-grid:** add floating filter to auto group column ([dfbd036](https://github.com/Halildeu/platform-web/commit/dfbd0360797fdb2411280ee878196424a1b57bff))
* **data-grid:** disable enableAdvancedFilter to restore context menu ([daa31cd](https://github.com/Halildeu/platform-web/commit/daa31cdc1630b206096c465163ae0de90009c3f1))
* **data-grid:** enable row grouping on all columns by default ([b0650c3](https://github.com/Halildeu/platform-web/commit/b0650c365671249e00d10e59b9897c32649dc7e7))
* **data-grid:** fill full height in fullscreen mode ([7d7108a](https://github.com/Halildeu/platform-web/commit/7d7108ac1fce0d6853cb75747c0fe28a1412ee1b))
* **data-grid:** hide group panel in SSRM + collapse groups by default ([156baff](https://github.com/Halildeu/platform-web/commit/156baffdea4ba3e3ffa70d7c17dab45768c3fd47))
* **data-grid:** move fullscreen button into toolbar flow ([9454da5](https://github.com/Halildeu/platform-web/commit/9454da5adcbfc07c58f4644313704944b1cb9145))
* **data-grid:** pass fullscreen props to GridToolbar ([cdc3de3](https://github.com/Halildeu/platform-web/commit/cdc3de382ad42fe7aa07112c893ca089ca933e3c))
* **data-grid:** prevent unmatched columns from hiding on variant apply ([50950b6](https://github.com/Halildeu/platform-web/commit/50950b60bd2b54c4e1c730916bd57882f792d6a1))
* **data-grid:** remove group footer row (duplicate of header) ([1aa3a6f](https://github.com/Halildeu/platform-web/commit/1aa3a6f85673b84df37e39087f180e6f205b025f))
* Design Lab dynamic counts + docs portal Astro 4.x compat ([21cc02a](https://github.com/Halildeu/platform-web/commit/21cc02ae7a9596274d5113f3cf02228327d40575))
* **design-lab:** add 18 missing components to sidebar taxonomy ([af9d2ab](https://github.com/Halildeu/platform-web/commit/af9d2ab4d5b3f2d3aae88b43dc2d486a7a5de11d))
* **design-lab:** register VariantIntegration in catalog index ([a59197e](https://github.com/Halildeu/platform-web/commit/a59197e71a5ce64a71fb01598f4f61767ebc0acc))
* **design-system:** add motion barrel re-export to main index ([1b9677a](https://github.com/Halildeu/platform-web/commit/1b9677a0327d0c3a1c122b9fe82f77e1703a30a1))
* **design-system:** correct taxonomy subgroup + add taxonomy-check script ([7458d96](https://github.com/Halildeu/platform-web/commit/7458d96d7306aba46a2dfd117a1bc79d00a82e26))
* **design-system:** equalize sidebar item container sizes ([b618b15](https://github.com/Halildeu/platform-web/commit/b618b154622c4d28dc27a4bd032762b7171cda9f))
* **design-system:** fix AppSidebar tooltip tests — collapsed hides label text ([aeae121](https://github.com/Halildeu/platform-web/commit/aeae121e7e148aa48888e4d307a0b50aa7dfe755))
* **design-system:** fix AppSidebar tooltip tests for jsdom environment ([914b715](https://github.com/Halildeu/platform-web/commit/914b715aec36d244333f2a6375b63890eb538bde))
* **design-system:** fix doctor scorecard integration (--json parse) ([74427bb](https://github.com/Halildeu/platform-web/commit/74427bb7aa6b9245d985307686854dbe843cba35))
* **design-system:** fix GroupedCardGallery catalog taxonomy ([ce6e363](https://github.com/Halildeu/platform-web/commit/ce6e3634beb8236333a863269f6627f3d5605519))
* **design-system:** fix GroupedCardGallery catalog taxonomy mapping ([a7730cc](https://github.com/Halildeu/platform-web/commit/a7730cc4f902272b05f2e497835c7cab302a33c5))
* **design-system:** fix ShellHeader nav active state for nested routes ([#122](https://github.com/Halildeu/platform-web/issues/122)) ([e662a73](https://github.com/Halildeu/platform-web/commit/e662a731904c739e898d56ba59615d2a7d380af9))
* **design-system:** normalize sidebar icon sizes to 18px ([7ebebf0](https://github.com/Halildeu/platform-web/commit/7ebebf0aa1f623b130ec548c74abbb39e5e6f050))
* **design-system:** precise a11y detection + doctor threshold tuning ([45f4fc8](https://github.com/Halildeu/platform-web/commit/45f4fc8977f1f99316a7de842e8a3e1d2df93352))
* **design-system:** reduce false positives in a11y-guardian, token-audit, test-quality ([c1baff2](https://github.com/Halildeu/platform-web/commit/c1baff2997ae184dfe30343a0def6f6ad24ca523))
* **design-system:** remove 223 fake depth tests + add CI gate + generator ([0fc0231](https://github.com/Halildeu/platform-web/commit/0fc023130e6f38ed6ae08e8a655476a13e209a63))
* **design-system:** remove 223 fake depth tests + add CI gate + props-aware generator ([3cca03f](https://github.com/Halildeu/platform-web/commit/3cca03f4cc34145ec70ee80cf60341ebf88c6a80))
* **design-system:** remove inline position:relative from AppSidebar ([f6b4527](https://github.com/Halildeu/platform-web/commit/f6b45274111a7664a1c8d920ac652a46916d05dc))
* **design-system:** remove noisy unstable module runtime warnings ([793545e](https://github.com/Halildeu/platform-web/commit/793545e92ff222124b8ac2edb5f88df7992b8082))
* **design-system:** rename webpack+babel configs to .cjs for ESM compat ([21d4fdc](https://github.com/Halildeu/platform-web/commit/21d4fdc344c03b56e1b9aba316138beb2eddfe62))
* **design-system:** resolve 4 verified a11y errors from doctor audit ([76f4ef8](https://github.com/Halildeu/platform-web/commit/76f4ef89a6544f1bf1319c8d97444819e3b9c421))
* **design-system:** resolve all a11y errors + hardcoded colors ([79aaf45](https://github.com/Halildeu/platform-web/commit/79aaf4517e1682ce8a39b44136d6e60e47e26358))
* **design-system:** resolve all doctor warnings + add theme-axis check ([bf38a0e](https://github.com/Halildeu/platform-web/commit/bf38a0e2cd31b86a9f4d4129db720d055e86f203))
* **design-system:** resolve pre-existing dark-mode chart test failures ([25bd4a4](https://github.com/Halildeu/platform-web/commit/25bd4a4c6b508f9f4277e04e557780c469a0d1d3))
* **design-system:** resolve remaining 3 doctor warnings ([773843d](https://github.com/Halildeu/platform-web/commit/773843d6486643a4b5442ef9e6cb5183efe9f575))
* **design-system:** resolve remaining test failures + ESLint cleanup ([057f355](https://github.com/Halildeu/platform-web/commit/057f355a46cbe5cb5056d27bf016a50b851bd877))
* **design-system:** scorecard utility module detection — D-grade false positives resolved ([f037c7f](https://github.com/Halildeu/platform-web/commit/f037c7f20e9a1a901299c48f53f207c4618b8f3c))
* **design-system:** TS2352 CSSStyleDeclaration cast via unknown ([3fa3175](https://github.com/Halildeu/platform-web/commit/3fa317566b01c3c169085423e1dca1abdec5c33b))
* **design-system:** unify all sidebar icons to 18px, modernize header ([3808440](https://github.com/Halildeu/platform-web/commit/38084404254d122c42cebdba9b04283c9a89874f))
* **filter-builder:** expand comma-separated values into OR conditions ([8a9d0f5](https://github.com/Halildeu/platform-web/commit/8a9d0f5ef8d27f1e57637d54def8252fb01c1524))
* **filter-builder:** expand multi-value text into OR group before apply ([e0b3b88](https://github.com/Halildeu/platform-web/commit/e0b3b88969eb5b31a09f0d20363cbaf93274e1dc))
* **filter-builder:** fix missing closing div in set filter editor ([f8a98a3](https://github.com/Halildeu/platform-web/commit/f8a98a3bd85b918f33d50b16c79f1ec7cf994476))
* **filter-builder:** make Koşul Ekle and Grup Ekle buttons visible ([5aca6b1](https://github.com/Halildeu/platform-web/commit/5aca6b1bdaee1cf98bfe4ceaf160fe4a4836b2bc))
* **filter-builder:** move useState hooks to component top level ([8e8e548](https://github.com/Halildeu/platform-web/commit/8e8e5481ff9f3adb4ae0eaf7896882bdae832f60))
* **filter-builder:** persist full tree state including AND/OR logic ([8462916](https://github.com/Halildeu/platform-web/commit/8462916de60e688414de6859d7d1a241732d50a6))
* **filter-builder:** prevent state reset while panel is open ([8ac9a16](https://github.com/Halildeu/platform-web/commit/8ac9a16c3c8b87e1efeef7ff62a0472c034a4893))
* **filter-builder:** remove stray closing div causing parse error ([022f627](https://github.com/Halildeu/platform-web/commit/022f627754e0cffa2793a51d0c0fb5b3cd3800b2))
* **filter-builder:** restore missing createEmptyGroup import ([4499ef8](https://github.com/Halildeu/platform-web/commit/4499ef8e63e4c8e9cf24829c2436bf3cadb52128))
* **filter-builder:** restore multiSearch terms when re-opening panel ([fbdcaf6](https://github.com/Halildeu/platform-web/commit/fbdcaf6819c4cf9167649ff7afeedb757280dcdb))
* **filter-builder:** simplify apply + handle multiSearch in mapFilterModel ([d826d26](https://github.com/Halildeu/platform-web/commit/d826d26b35717315ddc24810e24f227984a016c6))
* **filter-builder:** use Set filter for multi-value text (AG Grid 2-condition limit) ([9c1389a](https://github.com/Halildeu/platform-web/commit/9c1389a8d4d94d06e677a8cae4f42ca649e8fbab))
* **filter-builder:** widen panel from 480px to 620px ([8e89932](https://github.com/Halildeu/platform-web/commit/8e8993212ef8d54671e25bf565bf72c1c94b8b6c))
* **grid-variants:** add 3s timeout to all API calls ([2981785](https://github.com/Halildeu/platform-web/commit/2981785ee6cd9160ee0598f3dfacc592b375ed29))
* **grid-variants:** add 3s timeout to all fetch calls — prevent UI freeze ([4499438](https://github.com/Halildeu/platform-web/commit/44994380700e48c1f46bddd243cbf32f05bd7624))
* **grid-variants:** add local fallback for clone operation ([c9e6810](https://github.com/Halildeu/platform-web/commit/c9e681071bb79262f0fcb66227ef655886330f11))
* **grid-variants:** enforce single default in fallback path ([9b0f2c8](https://github.com/Halildeu/platform-web/commit/9b0f2c8a9f2676c098938e0d778ecc7bfc1b676a))
* **grid:** CSV export — use semicolon separator + UTF-8 BOM ([3c7e2ec](https://github.com/Halildeu/platform-web/commit/3c7e2eced1947bb2a323831a98815e141e3e306f))
* **grid:** don't revert variant on preference sync failure ([c4d3bd1](https://github.com/Halildeu/platform-web/commit/c4d3bd18ea3c7ce0b4b2dc8f4712014eb2b8dcee))
* **grid:** enforce single default variant — pass gridId to preference API ([d5c3ce9](https://github.com/Halildeu/platform-web/commit/d5c3ce9904a6ebfed18f5eb52774c402fa21b920))
* **grid:** make filters variant-specific — clear on switch, always apply ([a397396](https://github.com/Halildeu/platform-web/commit/a397396637bd19d6e748afbe1d6edd4de7a07402))
* **grid:** render variant manager panel via portal to body ([e163c3c](https://github.com/Halildeu/platform-web/commit/e163c3ce02e25124429f30adaaeee0146287be6b))
* **grid:** replace floppy emoji with IconSave + run docs ([3ed48a2](https://github.com/Halildeu/platform-web/commit/3ed48a251c04504ea16781f7f90da90b4d7ed5ae))
* **grid:** variant manager panel — gear icon SVG + positioning fix ([eccc056](https://github.com/Halildeu/platform-web/commit/eccc0560f31f02f12692034792791a6c42c929ed))
* **grid:** variant manager panel overflow — max-height + scroll ([80a54b7](https://github.com/Halildeu/platform-web/commit/80a54b7652c226a565f0b4f07ca94ef27d878e18))
* **layout:** align header, sidebar, and content padding ([b5225a2](https://github.com/Halildeu/platform-web/commit/b5225a2122c2a7ed7ddf8335117a1c0594b984a1))
* **reporting:** correct AG Charts event name and chart ID mappings ([44b7c21](https://github.com/Halildeu/platform-web/commit/44b7c211c61fb9ae88bac2209c17110bb1e3ad6e))
* resolve 5 more doctor warnings — HC forced-colors, dark readiness, token sync ([c31b868](https://github.com/Halildeu/platform-web/commit/c31b86851181de6bb8a1bd27c73df621d7131204))
* resolve ci-gate, doc-qa, layout-qa and guardrails failures ([#111](https://github.com/Halildeu/platform-web/issues/111)) ([90bb2d2](https://github.com/Halildeu/platform-web/commit/90bb2d28fe0500dd73a0dea640fcf536f1ab2cf1))
* resolve merge conflict in transformer tests (keep valueFormatter assertions) ([6b225c9](https://github.com/Halildeu/platform-web/commit/6b225c90eaef7b358d789f42f73d77736dcb732c))
* resolve warnings — dark mode readiness + API fixes + doctor tuning ([5e52022](https://github.com/Halildeu/platform-web/commit/5e520228026bd544dcdd4e51fe99dc1347983d65))
* **taxonomy:** 103 doc files — correct taxonomyGroupId + subgroup ([53f1e30](https://github.com/Halildeu/platform-web/commit/53f1e309eb3f5d39670a96a2eb71e287e293db88))
* **test:** FlowBuilder keyboard test — verify selection, not callback ([0fec8f6](https://github.com/Halildeu/platform-web/commit/0fec8f6fdbb19a45c06d139e54d2f6ac81931341))
* **tests:** fix useBreakpoint matchMedia mock, Image getByAlt, TreeSelect getAllByText ([7119978](https://github.com/Halildeu/platform-web/commit/71199782b51cb811757019b992476c9978ebc3ea))
* **test:** skip pagination tests requiring gridApi instance ([6a79386](https://github.com/Halildeu/platform-web/commit/6a79386918c17a784bc1ae6564b8b9d34b0e1c15))
* **test:** update pagination tests for unified ServerPaginationFooter ([e3840b0](https://github.com/Halildeu/platform-web/commit/e3840b0dbcd6dec59c7cf8d131f57d48ca684ead))
* **theme:** resolve 3 doctor warnings — contrast, deprecation, missing tokens ([e35194f](https://github.com/Halildeu/platform-web/commit/e35194fc4c73c5a42d8492ff452b69b60cf29042))
* **variant-manager:** optimistic delete — don't reload variants after delete ([696b191](https://github.com/Halildeu/platform-web/commit/696b191f605af2c8dfd7a6a87282bfd133da577e))
* **variant-manager:** stop keyboard events from propagating to sidebar search ([a4777cc](https://github.com/Halildeu/platform-web/commit/a4777cc79b61874a7e88e4a87cc5cbf89867f23b))
* **vite:** final webpack cleanup — stale locks, DS config, comments ([3b9f606](https://github.com/Halildeu/platform-web/commit/3b9f60671b8d3ecff9b7843cf6d11b853bdf742a))
* **vite:** remove design-system webpack configs + deps ([b53536b](https://github.com/Halildeu/platform-web/commit/b53536bd8849dfadd9a583451396a7f334d6b02e))
* **web:** wire remote shell services after auth ([148595b](https://github.com/Halildeu/platform-web/commit/148595bd64ef3085606a0d70d4a4bc5fa6b127e1))


### Performance

* **ci:** ci-gate-web 8min → ~2min — incremental tests + parallel execution ([#229](https://github.com/Halildeu/platform-web/issues/229)) ([5f03d51](https://github.com/Halildeu/platform-web/commit/5f03d515e8f0672bb8a8b6d7d6b982d0dcb39080))
* **ci:** parallel web-qa, blocking audit/size-limit, Playwright cache ([#223](https://github.com/Halildeu/platform-web/issues/223)) ([36588c2](https://github.com/Halildeu/platform-web/commit/36588c2be1b7701791bd906f1ffe1bd31c325e01))


### Documentation

* **design-system:** add CATALOG-STATUS.md — component lifecycle registry ([7c4ee15](https://github.com/Halildeu/platform-web/commit/7c4ee155361ddb7d18e86c540a80079e69801919))

## [Unreleased]

### Added
- **Build Pipeline**: ESM + CJS dual output via tsup, TypeScript declarations via tsc
- **"use client" directive**: Barrel-level RSC boundary on `src/index.ts` and `src/advanced/data-grid/setup.ts`
- **SSR Safety**: Guarded all module-level browser API access (OverlayPositioning, scroll-lock, ui-adapter)
- **SSR Smoke Test**: 3-test suite verifying safe Node.js import (`src/__tests__/ssr-smoke.test.ts`)
- **Hydration Smoke Test**: SSR-to-hydration round-trip verification for presentational components
- **Uncontrolled Mode**: Added `defaultChecked`/`defaultValue`/`defaultCurrent` to Checkbox, Radio, Select, Switch, Pagination, Steps
- **Focus Restore**: `useFocusRestore` hook for overlay components (FormDrawer, DetailDrawer)
- **Component Scaffold**: `scripts/scaffold-component.mjs` for new component creation
- **CI Scripts**:
  - `scripts/ci/bundle-size.mjs` -- per-module size tracking with budget enforcement
  - `scripts/ci/semver-check.mjs` -- public API surface change detection
  - `scripts/ci/deprecation-audit.mjs` -- @deprecated annotation scanner
  - `scripts/ci/adoption-report.mjs` -- app x component usage matrix
  - `scripts/ci/visual-regression.sh` -- visual regression runner
  - `scripts/ci/generate-stories-report.mjs` -- Storybook coverage report
- **API Reference Generator**: `scripts/generate-api-reference.mjs` for auto-generated prop docs
- **Migration Guide Generator**: `scripts/generate-migration-guide.mjs`
- **Component Diff**: `scripts/component-diff.mjs` for API surface diffing
- **Documentation**:
  - `docs/CLIENT-ONLY-COMPONENTS.md` -- SSR boundary analysis
  - `docs/SSR-RSC-BOUNDARY.md` -- "use client" strategy decision
  - `docs/OVERLAY-CAPABILITY-MATRIX.md` -- per-component x per-capability breakdown
  - `docs/OVERLAY-DECISIONS.md` -- overlay architecture decisions
  - `docs/BEHAVIOR-CONTRACT-MATRIX.md` -- component x behavior matrix
  - `docs/TOKEN-PIPELINE.md` -- token build ownership contract
  - `docs/ANTD-LOCKFILE-AUDIT.md` -- antd residue audit
  - `docs/COMPATIBILITY.md` -- runtime/browser/framework support matrix
  - `docs/API-STABILITY-TIERS.md` -- prop stability classification
  - `docs/EDGE-CASES.md` -- verified edge-case behaviors
  - `docs/PORTAL-BEHAVIOR.md` -- portal rendering strategy
  - `docs/SLOT-PATTERN.md` -- slot/slotProps composition guide
  - `docs/USAGE-RECIPES.md` -- integration recipes overview
  - `docs/MIGRATION-NOTES.md` -- migration notes
  - `docs/rationale/DESIGN-DECISIONS.md` -- architecture decisions
  - `docs/recipes/` -- react-hook-form, zod, Next.js integration guides
- **Issue Templates**: Bug report, feature request, RFC templates (`.github/ISSUE_TEMPLATE/`)
- **Test Suites**: Edge-case, infrastructure, keyboard-integration, robustness, visual-quality, state-preview-contract tests

### Changed
- **Package exports**: Source paths for dev, dist paths in `publishConfig`
- **displayName**: Added to GridShell, SectionTabs, Calendar, TimePicker, Slider, Combobox, DatePicker, Upload, IconButton, LazyComponent, PortalProvider, and drawer patterns
- **FormField re-export**: Renamed adaptive-form FormField to AdaptiveFormField to resolve naming clash

### Fixed
- **usePortal.tsx**: Renamed from .ts to .tsx (JSX in non-JSX file)
- **OverlayPositioning**: SSR-safe window.innerWidth/innerHeight access
- **scroll-lock**: SSR-safe document.body access
- **ui-adapter**: SSR-safe document.documentElement default parameter

### Deprecated
- See `docs/API-STABILITY-TIERS.md` for full deprecation inventory

## [1.0.0] - Initial Release
- Enterprise-grade component library with 91 components across primitives, components, patterns, and advanced tiers
- Full accessibility: axe-core, keyboard navigation, WCAG compliance
- Access control system (full/readonly/hidden/disabled)
- AG Grid v34.3.1 integration (data-grid, charts)
- Token-based theming with dark mode support
- Slot/slotProps composition pattern
- Overlay engine (Dialog, Modal, Popover, Tooltip, Drawers)
