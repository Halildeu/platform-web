/**
 * WEB outdated-software view slice tests — Faz 22.5 Track C (AG-036).
 *
 * Pattern mirrors the AG-033 DeviceHealthView test approach: vi.mock the
 * RTK Query slice and drive each branch via the generated hooks' return
 * values directly. Route shape is enforced at compile time — the
 * generated useGetOutdatedSoftwareLatestQuery /
 * useGetOutdatedSoftwareHistoryQuery hooks only exist if the
 * builder.query URLs in endpointAdminApi.ts are correct; a route typo
 * fails the TypeScript build before this file runs.
 *
 * The with-upgrades / clean / unsupported snapshots are the contract's
 * golden examples loaded VERBATIM
 *   (schema/endpoint-outdated-software-payload-v1.schema.json `examples`),
 * which the contract designates as the cross-repo regression corpus
 * (backend ingest + web render MUST accept/render each). The golden
 * examples carry the upgradeable list under the wire key `upgrade`; the
 * view reads packages-canonical-then-`upgrade`, so the verbatim examples
 * exercise the contract render path, and a separate test exercises the
 * live backend `packages` response shape.
 *
 * Redaction is machine-enforced with a POISONED package fixture (carrying
 * every off-contract key with realistic, non-key-echoing VALUES): the
 * renderer reads only the 3 contract keys BY KEY, so none of the poisoned
 * values may reach the DOM. Truncation is fail-safe: the contract rule
 * (upgradeCount == maxUpgrade ⇒ possibly truncated) is ORed in so a wrong
 * backend possiblyTruncated flag can never suppress the hint.
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { OutdatedSoftwareView } from '../OutdatedSoftwareView';
import type {
  OutdatedSoftwarePackage,
  OutdatedSoftwareSnapshot,
} from '../../../../../entities/endpoint-outdated-software/types';

vi.mock('../../../../../app/services/endpointAdminApi', () => ({
  endpointAdminApi: {
    useGetOutdatedSoftwareLatestQuery: vi.fn(),
    useGetOutdatedSoftwareHistoryQuery: vi.fn(),
  },
}));

vi.mock('../../../../../i18n', () => ({
  useEndpointAdminI18n: () => ({
    t: (key: string) => key,
  }),
}));

import { endpointAdminApi } from '../../../../../app/services/endpointAdminApi';

const mockedLatest = endpointAdminApi.useGetOutdatedSoftwareLatestQuery as ReturnType<typeof vi.fn>;
const mockedHistory = endpointAdminApi.useGetOutdatedSoftwareHistoryQuery as ReturnType<
  typeof vi.fn
>;

function emptyHistoryResult() {
  return {
    data: undefined,
    currentData: undefined,
    error: undefined,
    isError: false,
    isLoading: false,
    isFetching: false,
    isUninitialized: true,
  };
}

// ---------------------------------------------------------------------------
// Contract golden examples (schema `examples`), loaded verbatim. These are
// the AG-036 v1 payload blocks; the backend folds a persistence envelope
// (deviceId / collectedAt) around them at ingest, which the type tolerates.
// The upgradeable list arrives under `upgrade` in the golden block (the
// view reads `packages ?? upgrade`).
// ---------------------------------------------------------------------------

/** Golden example #1 — supported, complete, two upgradeable packages. */
const GOLDEN_WITH_UPGRADES: OutdatedSoftwareSnapshot = {
  schemaVersion: 1,
  supported: true,
  probeComplete: true,
  upgradeCount: 2,
  upgrade: [
    { packageId: '7zip.7zip', installedVersion: '24.09', availableVersion: '25.01' },
    {
      packageId: 'Microsoft.VisualStudioCode',
      installedVersion: '1.89.0',
      availableVersion: '1.91.1',
    },
  ],
  upgradeTruncated: false,
  maxUpgrade: 512,
  sourceUsed: 'winget',
  probeDurationMs: 45,
};

/** Golden example #2 — supported, complete, zero upgrades (clean). */
const GOLDEN_CLEAN: OutdatedSoftwareSnapshot = {
  schemaVersion: 1,
  supported: true,
  probeComplete: true,
  upgradeCount: 0,
  upgrade: [],
  upgradeTruncated: false,
  maxUpgrade: 512,
  sourceUsed: 'winget',
  probeDurationMs: 28,
};

/** Golden example #3 — non-Windows unsupported. */
const GOLDEN_UNSUPPORTED: OutdatedSoftwareSnapshot = {
  schemaVersion: 1,
  supported: false,
  probeComplete: false,
  upgradeCount: 0,
  upgrade: [],
  upgradeTruncated: false,
  maxUpgrade: 512,
  sourceUsed: 'none',
  probeErrors: [
    {
      source: 'none',
      code: 'UNSUPPORTED_PLATFORM',
      summary: 'outdated-software probe not supported on this runtime',
    },
  ],
  probeDurationMs: 0,
};

function latestOk(snapshot: OutdatedSoftwareSnapshot) {
  return {
    data: snapshot,
    currentData: snapshot,
    error: undefined,
    isError: false,
    isLoading: false,
    isFetching: false,
    isUninitialized: false,
  };
}

// ---------------------------------------------------------------------------
// POISONED redaction fixture. A package object that carries every known
// off-contract key (publisher / name / displayName / installLocation / path /
// license / downloadUrl / url) with REALISTIC VALUES that do NOT echo their
// key name. The renderer reads only `packageId` / `installedVersion` /
// `availableVersion` by key (NOT via Object.entries / map-over-keys), so a
// machine-enforced assertion that NONE of these poisoned VALUES appears in the
// rendered DOM proves the off-contract keys are never surfaced. This catches a
// future leak even of a value that does not contain the substrings
// "publisher"/"license"/etc. — the previous key-name-substring check could not.
//
// Cast through `unknown` because `OutdatedSoftwarePackage` is exactly the 3
// contract keys; the extra keys are intentionally off-contract here. This is a
// payload an attacker / a leaky future backend could send — the view must drop
// them regardless of the compile-time type.
const POISONED_OFF_CONTRACT_VALUES = [
  'Igor Pavlov', // publisher
  '7-Zip File Manager', // name
  '7-Zip', // displayName (also a substring guard for the id 7zip.7zip → see note)
  'C:/Program Files/7-Zip', // installLocation
  'C:/Program Files/7-Zip/7zFM.exe', // path
  'GNU LGPL', // license
  'https://example.com/7z.exe', // downloadUrl
  'https://example.com', // url
] as const;

const POISONED_PACKAGE = {
  packageId: '7zip.7zip',
  installedVersion: '24.09',
  availableVersion: '25.01',
  // --- off-contract keys (MUST never render) ---
  publisher: 'Igor Pavlov',
  name: '7-Zip File Manager',
  displayName: '7-Zip',
  installLocation: 'C:/Program Files/7-Zip',
  path: 'C:/Program Files/7-Zip/7zFM.exe',
  license: 'GNU LGPL',
  downloadUrl: 'https://example.com/7z.exe',
  url: 'https://example.com',
} as unknown as OutdatedSoftwarePackage;

const GOLDEN_POISONED: OutdatedSoftwareSnapshot = {
  schemaVersion: 1,
  supported: true,
  probeComplete: true,
  upgradeCount: 1,
  upgrade: [POISONED_PACKAGE],
  upgradeTruncated: false,
  maxUpgrade: 512,
  sourceUsed: 'winget',
  probeDurationMs: 33,
};

describe('OutdatedSoftwareView', () => {
  it('renders nothing while the tab is inactive', () => {
    mockedLatest.mockReturnValue({
      data: undefined,
      currentData: undefined,
      error: undefined,
      isError: false,
      isLoading: false,
      isFetching: false,
      isUninitialized: true,
    });
    mockedHistory.mockReturnValue(emptyHistoryResult());

    const { container } = render(<OutdatedSoftwareView deviceId="dev-1" active={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the empty state when the backend returns 404', () => {
    mockedLatest.mockReturnValue({
      data: undefined,
      currentData: undefined,
      error: { status: 404 },
      isError: true,
      isLoading: false,
      isFetching: false,
      isUninitialized: false,
    });
    mockedHistory.mockReturnValue(emptyHistoryResult());

    render(<OutdatedSoftwareView deviceId="dev-1" active />);
    expect(screen.getByTestId('outdated-software-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('outdated-software-panel')).not.toBeInTheDocument();
  });

  it('shows the forbidden message on 403 (RBAC tuple lost)', () => {
    mockedLatest.mockReturnValue({
      data: undefined,
      currentData: undefined,
      error: { status: 403 },
      isError: true,
      isLoading: false,
      isFetching: false,
      isUninitialized: false,
    });
    mockedHistory.mockReturnValue(emptyHistoryResult());

    render(<OutdatedSoftwareView deviceId="dev-1" active />);
    expect(screen.getByTestId('outdated-software-forbidden')).toBeInTheDocument();
    expect(screen.queryByTestId('outdated-software-panel')).not.toBeInTheDocument();
  });

  it('shows the generic error on a non-404/403 failure', () => {
    mockedLatest.mockReturnValue({
      data: undefined,
      currentData: undefined,
      error: { status: 500 },
      isError: true,
      isLoading: false,
      isFetching: false,
      isUninitialized: false,
    });
    mockedHistory.mockReturnValue(emptyHistoryResult());

    render(<OutdatedSoftwareView deviceId="dev-1" active />);
    expect(screen.getByTestId('outdated-software-error')).toBeInTheDocument();
  });

  it('renders the with-upgrades golden example: package rows + count badge, contract fields only', () => {
    mockedLatest.mockReturnValue(latestOk(GOLDEN_WITH_UPGRADES));
    mockedHistory.mockReturnValue(emptyHistoryResult());

    render(<OutdatedSoftwareView deviceId="dev-1" active />);

    expect(screen.getByTestId('outdated-software-panel')).toBeInTheDocument();
    // "N upgradeable" count badge surfaces the upgrade count.
    expect(screen.getByTestId('outdated-software-upgradeCount-badge')).toHaveTextContent('2');
    // Per-package rows: packageId + installed → available.
    expect(screen.getByTestId('outdated-software-package-id-7zip.7zip')).toHaveTextContent(
      '7zip.7zip',
    );
    expect(screen.getByTestId('outdated-software-package-installed-7zip.7zip')).toHaveTextContent(
      '24.09',
    );
    expect(screen.getByTestId('outdated-software-package-available-7zip.7zip')).toHaveTextContent(
      '25.01',
    );
    expect(
      screen.getByTestId('outdated-software-package-id-Microsoft.VisualStudioCode'),
    ).toHaveTextContent('Microsoft.VisualStudioCode');
    expect(
      screen.getByTestId('outdated-software-package-installed-Microsoft.VisualStudioCode'),
    ).toHaveTextContent('1.89.0');
    expect(
      screen.getByTestId('outdated-software-package-available-Microsoft.VisualStudioCode'),
    ).toHaveTextContent('1.91.1');
    // Source surfaces; not possibly-truncated at 2/512.
    expect(screen.getByTestId('outdated-software-meta-sourceUsed')).toHaveTextContent('winget');
    expect(screen.queryByTestId('outdated-software-possiblyTruncated')).not.toBeInTheDocument();

    // Redaction: the only table columns are the 3 contract keys, and each
    // package row renders exactly 3 cells (packageId / installed / available).
    const headers = screen
      .getByTestId('outdated-software-packages-table')
      .querySelectorAll('thead th');
    expect(headers).toHaveLength(3);
    const bodyRows = screen
      .getByTestId('outdated-software-packages-table')
      .querySelectorAll('tbody tr');
    expect(bodyRows).toHaveLength(2);
    for (const row of bodyRows) {
      expect(row.querySelectorAll('td')).toHaveLength(3);
    }
    // No off-contract field text leaks into the rendered DOM. (None of
    // these exist on the wire; this guards against any future widening.)
    const dom = screen.getByTestId('outdated-software-panel').textContent ?? '';
    for (const forbidden of ['publisher', 'license', 'installLocation', 'downloadUrl']) {
      expect(dom.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
  });

  it('redaction: a poisoned package carrying off-contract keys renders ONLY the 3 contract cells, leaking no off-contract VALUE', () => {
    // Machine-enforced redaction with a POISONED payload: the package object
    // carries every off-contract key (publisher / name / displayName /
    // installLocation / path / license / downloadUrl / url) with realistic
    // values that do NOT echo their key name. The renderer accesses only
    // packageId / installedVersion / availableVersion BY KEY (not via
    // Object.entries / map-over-keys), so none of the poisoned values must
    // reach the DOM. This proves a future leak of an arbitrary off-contract
    // value is caught even when the value contains none of the
    // "publisher"/"license"/... key-name substrings.
    mockedLatest.mockReturnValue(latestOk(GOLDEN_POISONED));
    mockedHistory.mockReturnValue(emptyHistoryResult());

    render(<OutdatedSoftwareView deviceId="dev-1" active />);

    expect(screen.getByTestId('outdated-software-panel')).toBeInTheDocument();

    // Exactly 3 column headers (the contract keys) — no widening.
    const headers = screen
      .getByTestId('outdated-software-packages-table')
      .querySelectorAll('thead th');
    expect(headers).toHaveLength(3);

    // Exactly one row, exactly 3 cells — the renderer does not emit an extra
    // cell per off-contract key.
    const bodyRows = screen
      .getByTestId('outdated-software-packages-table')
      .querySelectorAll('tbody tr');
    expect(bodyRows).toHaveLength(1);
    expect(bodyRows[0]?.querySelectorAll('td')).toHaveLength(3);

    // The 3 contract values DO render (positive control: the redaction did
    // not over-redact the legitimate fields).
    expect(screen.getByTestId('outdated-software-package-id-7zip.7zip')).toHaveTextContent(
      '7zip.7zip',
    );
    expect(screen.getByTestId('outdated-software-package-installed-7zip.7zip')).toHaveTextContent(
      '24.09',
    );
    expect(screen.getByTestId('outdated-software-package-available-7zip.7zip')).toHaveTextContent(
      '25.01',
    );

    // NONE of the poisoned off-contract VALUES appears anywhere in the
    // rendered DOM (whole-view scope, not just the panel).
    const fullDom = screen.getByTestId('outdated-software-view').textContent ?? '';
    for (const leaked of POISONED_OFF_CONTRACT_VALUES) {
      expect(fullDom).not.toContain(leaked);
    }
    // Belt-and-suspenders: also assert the rendered HTML markup (attributes
    // included) carries no poisoned value, in case a value ever lands in an
    // attribute rather than text content.
    const html = screen.getByTestId('outdated-software-view').innerHTML;
    for (const leaked of POISONED_OFF_CONTRACT_VALUES) {
      expect(html).not.toContain(leaked);
    }
  });

  it('renders the clean golden example: zero upgrades, packages-empty state, no panel crash', () => {
    mockedLatest.mockReturnValue(latestOk(GOLDEN_CLEAN));
    mockedHistory.mockReturnValue(emptyHistoryResult());

    render(<OutdatedSoftwareView deviceId="dev-1" active />);

    expect(screen.getByTestId('outdated-software-panel')).toBeInTheDocument();
    expect(screen.getByTestId('outdated-software-upgradeCount-badge')).toHaveTextContent('0');
    // Zero upgrades → packages-empty message, no table.
    expect(screen.getByTestId('outdated-software-packages-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('outdated-software-packages-table')).not.toBeInTheDocument();
  });

  it('renders the unsupported state for the non-Windows golden example (probe not supported)', () => {
    mockedLatest.mockReturnValue(latestOk(GOLDEN_UNSUPPORTED));
    mockedHistory.mockReturnValue(emptyHistoryResult());

    render(<OutdatedSoftwareView deviceId="dev-1" active />);

    // supported=false wins → unsupported state, NOT the panel (must not
    // render the empty upgrade list as a fully-up-to-date device).
    expect(screen.getByTestId('outdated-software-unsupported')).toBeInTheDocument();
    expect(screen.queryByTestId('outdated-software-panel')).not.toBeInTheDocument();
    // The probe error is surfaced.
    expect(screen.getByText('UNSUPPORTED_PLATFORM')).toBeInTheDocument();
  });

  it('renders the incomplete (evidence-incomplete) state when probeComplete=false but supported', () => {
    // Fail-closed: a supported probe that did not complete must render
    // "evidence incomplete", never the (possibly empty) upgrade list as
    // "fully up to date".
    const incomplete: OutdatedSoftwareSnapshot = {
      ...GOLDEN_WITH_UPGRADES,
      probeComplete: false,
      probeErrors: [
        { source: 'winget', code: 'WINGET_TIMEOUT', summary: 'winget upgrade timed out' },
      ],
    };
    mockedLatest.mockReturnValue(latestOk(incomplete));
    mockedHistory.mockReturnValue(emptyHistoryResult());

    render(<OutdatedSoftwareView deviceId="dev-1" active />);

    expect(screen.getByTestId('outdated-software-incomplete')).toBeInTheDocument();
    expect(screen.queryByTestId('outdated-software-panel')).not.toBeInTheDocument();
    expect(screen.getByText('WINGET_TIMEOUT')).toBeInTheDocument();
  });

  it('renders the possibly-truncated hint when upgradeCount == maxUpgrade (512)', () => {
    // Known v1 limitation: upgradeCount==maxUpgrade → "possibly truncated"
    // even though upgradeTruncated stayed false. Use the backend-derived
    // possiblyTruncated flag.
    const truncated: OutdatedSoftwareSnapshot = {
      ...GOLDEN_WITH_UPGRADES,
      upgradeCount: 512,
      maxUpgrade: 512,
      possiblyTruncated: true,
    };
    mockedLatest.mockReturnValue(latestOk(truncated));
    mockedHistory.mockReturnValue(emptyHistoryResult());

    render(<OutdatedSoftwareView deviceId="dev-1" active />);

    expect(screen.getByTestId('outdated-software-possiblyTruncated')).toBeInTheDocument();
    expect(screen.getByTestId('outdated-software-possiblyTruncated')).toHaveTextContent('512');
  });

  it('truncation fail-safe (a): possiblyTruncated ABSENT + upgradeCount==maxUpgrade → hint shown', () => {
    // The contract rule (upgradeCount == maxUpgrade ⇒ possibly truncated) is
    // authoritative. With no backend-derived flag (a verbatim golden block),
    // the view must derive the hint locally from the count == cap condition.
    const truncated: OutdatedSoftwareSnapshot = {
      ...GOLDEN_WITH_UPGRADES,
      upgradeCount: 512,
      maxUpgrade: 512,
    };
    // The golden block does NOT carry possiblyTruncated; assert it really is
    // absent so this test exercises the local-derivation path.
    expect('possiblyTruncated' in truncated).toBe(false);
    mockedLatest.mockReturnValue(latestOk(truncated));
    mockedHistory.mockReturnValue(emptyHistoryResult());

    render(<OutdatedSoftwareView deviceId="dev-1" active />);

    expect(screen.getByTestId('outdated-software-possiblyTruncated')).toBeInTheDocument();
    expect(screen.getByTestId('outdated-software-possiblyTruncated')).toHaveTextContent('512');
  });

  it('truncation fail-safe (b): possiblyTruncated=FALSE + 512/512 → hint STILL shown (fail-safe over a wrong backend flag)', () => {
    // A wrong / stale / false backend flag must NOT suppress the hint when
    // the count is at the cap. The view ORs the contract condition in, so a
    // contradictory possiblyTruncated:false still renders the hint.
    const truncated: OutdatedSoftwareSnapshot = {
      ...GOLDEN_WITH_UPGRADES,
      upgradeCount: 512,
      maxUpgrade: 512,
      possiblyTruncated: false,
    };
    mockedLatest.mockReturnValue(latestOk(truncated));
    mockedHistory.mockReturnValue(emptyHistoryResult());

    render(<OutdatedSoftwareView deviceId="dev-1" active />);

    expect(screen.getByTestId('outdated-software-possiblyTruncated')).toBeInTheDocument();
    expect(screen.getByTestId('outdated-software-possiblyTruncated')).toHaveTextContent('512');
  });

  it('#1148: upgradeTruncated=TRUE wins regardless of count (agent authoritative)', () => {
    // The agent's authoritative upgradeTruncated flag (set post-platform-agent
    // #40 / e64c131) takes precedence: even a count well below the cap with
    // both possiblyTruncated and the fallback inactive must still render the
    // hint when the agent says the list was truncated.
    const truncated: OutdatedSoftwareSnapshot = {
      ...GOLDEN_WITH_UPGRADES,
      upgradeCount: 17,
      maxUpgrade: 512,
      upgradeTruncated: true,
      possiblyTruncated: false,
    };
    mockedLatest.mockReturnValue(latestOk(truncated));
    mockedHistory.mockReturnValue(emptyHistoryResult());

    render(<OutdatedSoftwareView deviceId="dev-1" active />);

    expect(screen.getByTestId('outdated-software-possiblyTruncated')).toBeInTheDocument();
  });

  it('#1148: upgradeTruncated=FALSE + count<max + possiblyTruncated absent → hint HIDDEN (regression on lower bound)', () => {
    // Pre-#1148 the rule was `possiblyTruncated || count === max`. The new
    // helper is `upgradeTruncated || possiblyTruncated || count >= max`. This
    // case pins the lower bound of `>=`: just-below-cap with no agent flag and
    // no backend flag must NOT render the hint (regression guard).
    const safe: OutdatedSoftwareSnapshot = {
      ...GOLDEN_WITH_UPGRADES,
      upgradeCount: 511,
      maxUpgrade: 512,
      upgradeTruncated: false,
    };
    expect('possiblyTruncated' in safe).toBe(false);
    mockedLatest.mockReturnValue(latestOk(safe));
    mockedHistory.mockReturnValue(emptyHistoryResult());

    render(<OutdatedSoftwareView deviceId="dev-1" active />);

    expect(screen.queryByTestId('outdated-software-possiblyTruncated')).not.toBeInTheDocument();
  });

  it('#1148: count > maxUpgrade (above-cap aggregate, future bulk path) → hint shown', () => {
    // Widening the fallback from `==` to `>=` keeps the hint stable if a
    // future projection (e.g. fleet-wide bulk path) ever surfaces a count
    // above the per-snapshot cap. Codex thread 019e77df / 019e802d.
    const truncated: OutdatedSoftwareSnapshot = {
      ...GOLDEN_WITH_UPGRADES,
      upgradeCount: 700,
      maxUpgrade: 512,
      upgradeTruncated: false,
    };
    mockedLatest.mockReturnValue(latestOk(truncated));
    mockedHistory.mockReturnValue(emptyHistoryResult());

    render(<OutdatedSoftwareView deviceId="dev-1" active />);

    expect(screen.getByTestId('outdated-software-possiblyTruncated')).toBeInTheDocument();
  });

  it('renders the backend `packages` response shape (live envelope), not just the `upgrade` golden', () => {
    // The live backend response surfaces the upgradeable list under
    // `packages` (AdminOutdatedSoftwareSnapshotResponse.packages) folded
    // inside the persistence envelope; the contract golden uses `upgrade`.
    // This exercises the real backend shape end-to-end through the view.
    const backendShape: OutdatedSoftwareSnapshot = {
      schemaVersion: 1,
      supported: true,
      probeComplete: true,
      upgradeCount: 1,
      // NOTE: list under `packages` (backend), NOT `upgrade` (golden).
      packages: [
        { packageId: 'Mozilla.Firefox', installedVersion: '128.0', availableVersion: '129.0' },
      ],
      upgradeTruncated: false,
      maxUpgrade: 512,
      sourceUsed: 'winget',
      probeDurationMs: 41,
    };
    mockedLatest.mockReturnValue(latestOk(backendShape));
    mockedHistory.mockReturnValue(emptyHistoryResult());

    render(<OutdatedSoftwareView deviceId="dev-1" active />);

    expect(screen.getByTestId('outdated-software-panel')).toBeInTheDocument();
    expect(screen.getByTestId('outdated-software-upgradeCount-badge')).toHaveTextContent('1');
    expect(screen.getByTestId('outdated-software-package-id-Mozilla.Firefox')).toHaveTextContent(
      'Mozilla.Firefox',
    );
    expect(
      screen.getByTestId('outdated-software-package-installed-Mozilla.Firefox'),
    ).toHaveTextContent('128.0');
    expect(
      screen.getByTestId('outdated-software-package-available-Mozilla.Firefox'),
    ).toHaveTextContent('129.0');
  });

  it('mixed payload: an EMPTY `packages` must not silently drop a populated `upgrade`', () => {
    // Codex concern: `packages ?? upgrade` would render empty for a
    // contradictory payload because `[]` is non-nullish. The view selects the
    // first NON-EMPTY of [packages, upgrade], so a populated `upgrade` is
    // never dropped by an empty `packages`.
    const mixed: OutdatedSoftwareSnapshot = {
      ...GOLDEN_WITH_UPGRADES,
      packages: [],
      // upgrade still carries the two GOLDEN_WITH_UPGRADES packages.
    };
    mockedLatest.mockReturnValue(latestOk(mixed));
    mockedHistory.mockReturnValue(emptyHistoryResult());

    render(<OutdatedSoftwareView deviceId="dev-1" active />);

    // The populated `upgrade` list renders — NOT the empty `packages`.
    expect(screen.getByTestId('outdated-software-packages-table')).toBeInTheDocument();
    expect(screen.getByTestId('outdated-software-package-id-7zip.7zip')).toHaveTextContent(
      '7zip.7zip',
    );
    expect(screen.queryByTestId('outdated-software-packages-empty')).not.toBeInTheDocument();
  });

  it('packages is canonical for the live path: a populated `packages` wins over a populated `upgrade`', () => {
    // When BOTH carry entries (the backend folds its own `packages` AND a
    // golden-style `upgrade` is somehow present), `packages` is canonical for
    // the live path and is the rendered list.
    const both: OutdatedSoftwareSnapshot = {
      schemaVersion: 1,
      supported: true,
      probeComplete: true,
      upgradeCount: 1,
      packages: [
        { packageId: 'Backend.Canonical', installedVersion: '1.0', availableVersion: '2.0' },
      ],
      upgrade: [{ packageId: 'Golden.Fallback', installedVersion: '9.0', availableVersion: '9.1' }],
      upgradeTruncated: false,
      maxUpgrade: 512,
      sourceUsed: 'winget',
      probeDurationMs: 50,
    };
    mockedLatest.mockReturnValue(latestOk(both));
    mockedHistory.mockReturnValue(emptyHistoryResult());

    render(<OutdatedSoftwareView deviceId="dev-1" active />);

    expect(
      screen.getByTestId('outdated-software-package-id-Backend.Canonical'),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId('outdated-software-package-id-Golden.Fallback'),
    ).not.toBeInTheDocument();
  });

  it('history hook is skipped while the accordion is closed', () => {
    mockedLatest.mockReturnValue(latestOk(GOLDEN_WITH_UPGRADES));
    mockedHistory.mockReturnValue(emptyHistoryResult());

    render(<OutdatedSoftwareView deviceId="dev-1" active />);
    // Lazy contract: history hook is invoked with skip=true while the
    // <details> stays collapsed.
    expect(mockedHistory).toHaveBeenCalled();
    const lastCall = mockedHistory.mock.calls[mockedHistory.mock.calls.length - 1];
    expect(lastCall?.[1]).toMatchObject({ skip: true });
  });

  it('resets history page/open when the device id changes', () => {
    mockedLatest.mockReturnValue(latestOk(GOLDEN_WITH_UPGRADES));
    mockedHistory.mockReturnValue(emptyHistoryResult());

    const { rerender } = render(<OutdatedSoftwareView deviceId="dev-1" active />);
    rerender(<OutdatedSoftwareView deviceId="dev-2" active />);

    // The history hook must always be called with the current deviceId
    // and the page reset to 0 after a device switch.
    const lastCall = mockedHistory.mock.calls[mockedHistory.mock.calls.length - 1];
    expect(lastCall?.[0]).toMatchObject({ deviceId: 'dev-2', page: 0 });
  });

  it('does not render a stale snapshot when currentData belongs to a previous device', () => {
    // Stale-guard regression: data (the last successful result) belongs
    // to dev-1, but currentData (the result for the active arg dev-2) is
    // still undefined while the refetch is in flight. The view MUST NOT
    // render the dev-1 snapshot under the dev-2 drawer.
    const dev1Snapshot: OutdatedSoftwareSnapshot = {
      ...GOLDEN_WITH_UPGRADES,
      deviceId: 'dev-1',
    };
    mockedLatest.mockReturnValue({
      data: dev1Snapshot, // stale `.data` from the previous arg
      currentData: undefined, // refetch for dev-2 still in flight
      error: undefined,
      isError: false,
      isLoading: true,
      isFetching: true,
      isUninitialized: false,
    });
    mockedHistory.mockReturnValue(emptyHistoryResult());

    render(<OutdatedSoftwareView deviceId="dev-2" active />);

    // Loading branch wins; no stale snapshot panel.
    expect(screen.getByTestId('outdated-software-loading')).toBeInTheDocument();
    expect(screen.queryByTestId('outdated-software-panel')).not.toBeInTheDocument();
  });

  it('rejects a currentData snapshot whose deviceId mismatches the active device', () => {
    // Stale-guard precision: currentData is populated but its envelope
    // deviceId belongs to dev-1 while the drawer is on dev-2. The guard
    // must drop it (render nothing in the latest slot), not show dev-1's
    // panel under dev-2.
    const dev1Snapshot: OutdatedSoftwareSnapshot = {
      ...GOLDEN_WITH_UPGRADES,
      deviceId: 'dev-1',
    };
    mockedLatest.mockReturnValue({
      data: dev1Snapshot,
      currentData: dev1Snapshot,
      error: undefined,
      isError: false,
      isLoading: false,
      isFetching: false,
      isUninitialized: false,
    });
    mockedHistory.mockReturnValue(emptyHistoryResult());

    render(<OutdatedSoftwareView deviceId="dev-2" active />);

    // The mismatched snapshot is dropped — no panel, no package rows.
    expect(screen.queryByTestId('outdated-software-panel')).not.toBeInTheDocument();
    expect(screen.queryByTestId('outdated-software-package-row-7zip.7zip')).not.toBeInTheDocument();
  });
});
