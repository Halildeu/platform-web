import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { closeSync, constants, fstatSync, openSync, readFileSync } from 'node:fs';
import {
  expect,
  test,
  type APIRequestContext,
  type Browser,
  type BrowserContext,
  type Page,
} from '@playwright/test';

const canonicalPublic = process.env.ETIK_PUBLIC_URL ?? 'https://etik.acik.com';
const aliasPublic = process.env.SPEAKUP_PUBLIC_URL ?? 'https://speakup.acik.com';
const managerRoot = process.env.ETIK_MANAGER_ROOT ?? 'https://testai.acik.com';
const managerUsername = process.env.ETIK_MANAGER_USERNAME ?? 'ethics-manager-test';
const wrongOrgUsername = 'ethics-manager-wrong-org-test';
const deniedUsername = 'ethics-manager-denied-test';

type ReporterJourney = {
  label: string;
  base: string;
  context: BrowserContext;
  page: Page;
  receiptId: string;
  accessSecret: string;
  subject: string;
  staffReply: string;
  internalNote: string;
  reporterReply: string;
  observedUrls: string[];
  observedConsole: string[];
};

const requiredSecretFile = (environmentName: string) => {
  const path = process.env[environmentName]?.trim();
  if (!path) throw new Error(`${environmentName} is required for the live synthetic gate.`);
  const descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const metadata = fstatSync(descriptor);
    if (!metadata.isFile()) {
      throw new Error(`${environmentName} must point to a regular non-symlink file.`);
    }
    if ((metadata.mode & 0o077) !== 0) {
      throw new Error(`${environmentName} must not be accessible by group or other users.`);
    }
    if (typeof process.getuid === 'function' && metadata.uid !== process.getuid()) {
      throw new Error(`${environmentName} must be owned by the current user.`);
    }
    const value = readFileSync(descriptor, 'utf8').trim();
    if (!value) throw new Error(`${environmentName} is empty.`);
    return value;
  } finally {
    closeSync(descriptor);
  }
};

const requiredManagerPassword = () => requiredSecretFile('ETIK_MANAGER_PASSWORD_FILE');
const requiredWrongOrgPassword = () => requiredSecretFile('ETIK_WRONG_ORG_PASSWORD_FILE');
const requiredDeniedPassword = () => requiredSecretFile('ETIK_DENIED_PASSWORD_FILE');

const firstVisible = async (page: Page, selectors: string[], timeout = 20_000) => {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    for (const selector of selectors) {
      const candidate = page.locator(selector).first();
      if (await candidate.isVisible().catch(() => false)) return candidate;
    }
    await page.waitForTimeout(200);
  }
  return null;
};

const fillFirst = async (page: Page, selectors: string[], value: string) => {
  const target = await firstVisible(page, selectors);
  if (!target) throw new Error(`Visible input not found: ${selectors.join(', ')}`);
  await target.fill(value);
};

const clickFirst = async (page: Page, selectors: string[]) => {
  const target = await firstVisible(page, selectors);
  if (!target) throw new Error(`Visible action not found: ${selectors.join(', ')}`);
  await target.click();
};

const assertCanonicalAccessSecret = (value: string) => {
  if (!/^[A-Za-z0-9_-]{43}$/.test(value)) {
    throw new Error('Mailbox access secret failed canonical format validation.');
  }
};

type ManagerClaims = {
  audience: string | string[];
  scope: string;
  orgId: string;
  roles: string[];
};

const decodeManagerTokenContract = (token: string): ManagerClaims => {
  const parsed = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')) as {
    aud: string | string[];
    scope?: string;
    org_id?: string;
    realm_access?: { roles?: string[] };
  };
  return {
    audience: parsed.aud,
    scope: parsed.scope ?? '',
    orgId: parsed.org_id ?? '',
    roles: parsed.realm_access?.roles ?? [],
  };
};

const assertManagerTokenContract = (claims: ManagerClaims) => {
  expect(Array.isArray(claims.audience) ? claims.audience : [claims.audience]).toContain(
    'ethics-manager',
  );
  expect(claims.scope.split(' ')).toContain('ethics:case:manage');
  expect(claims.roles).toContain('ethics-manager');
  expect(claims.orgId).toBe('00000000-0000-0000-0000-000000000001');
};

const loginManager = async (page: Page, password: string) => {
  await page.goto(`${managerRoot}/login?redirect=${encodeURIComponent('/ethic')}`, {
    waitUntil: 'domcontentloaded',
  });
  const login = await firstVisible(page, [
    '[data-testid="corporate-login-button"]',
    'button:has-text("Güvenli Kurumsal Giriş")',
    'button:has-text("Kurumsal Giriş")',
    'button:has-text("Sign In")',
  ]);
  if (login) await login.click();
  await fillFirst(
    page,
    ['#username', 'input[name="username"]', 'input[type="email"]'],
    managerUsername,
  );
  await fillFirst(page, ['#password', 'input[name="password"]'], password);
  await clickFirst(page, ['#kc-login', 'button[type="submit"]', 'input[type="submit"]']);
  await page.waitForURL((url) => !url.pathname.includes('/realms/'), { timeout: 60_000 });
  await page.goto(`${managerRoot}/ethic`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Etik Speak' })).toBeVisible({ timeout: 60_000 });
};

const publicArtifact = async (request: APIRequestContext, base: string) => {
  const response = await request.get(base, {
    failOnStatusCode: true,
  });
  const body = await response.body();
  return {
    digest: createHash('sha256').update(body).digest('hex'),
    csp: response.headers()['content-security-policy'] ?? '',
    referrer: response.headers()['referrer-policy'] ?? '',
    cache: response.headers()['cache-control'] ?? '',
    hsts: response.headers()['strict-transport-security'] ?? '',
  };
};

const assertPublicBoundaryAndIdempotency = async (
  browser: Browser,
  base: string,
  runNonce: string,
) => {
  const unauthenticated = await browser.newContext({
    extraHTTPHeaders: { Origin: base },
  });
  const unauthenticatedResponse = await unauthenticated.request.post(
    `${base}/api/v1/public/ethics/reports`,
    {
      headers: { 'Idempotency-Key': `es210-invalid-${runNonce}` },
      data: {},
    },
  );
  expect(unauthenticatedResponse.status()).toBe(400);
  await unauthenticated.close();

  const context = await browser.newContext({
    extraHTTPHeaders: { Origin: base },
  });
  const payload = {
    mode: 'ANONYMOUS',
    category: 'OTHER',
    subject: `ES210 idempotency ${runNonce}`,
    description: 'Sentetik idempotency ve ingress credential-stripping kanıtı.',
    locale: 'tr',
    accessSecret: randomBytes(32).toString('base64url'),
    noticeVersion: 'tr-test-pilot-v1',
  };
  const idempotencyKey = `es210-idempotency-${runNonce}`;
  const create = await context.request.post(`${base}/api/v1/public/ethics/reports`, {
    headers: { 'Idempotency-Key': idempotencyKey },
    data: payload,
  });
  // Success here proves the reviewed open-reporter path accepts a valid
  // anonymous request after ingress injects the internal transport proof.
  expect(create.status()).toBe(201);
  const replay = await context.request.post(`${base}/api/v1/public/ethics/reports`, {
    headers: { 'Idempotency-Key': idempotencyKey },
    data: payload,
  });
  expect(replay.status()).toBe(200);
  expect((await replay.json()).idempotentReplay).toBe(true);
  const conflict = await context.request.post(`${base}/api/v1/public/ethics/reports`, {
    headers: { 'Idempotency-Key': idempotencyKey },
    data: { ...payload, subject: `${payload.subject} changed` },
  });
  expect(conflict.status()).toBe(409);

  const cookieConfusion = await context.request.post(`${base}/api/v1/public/ethics/reports`, {
    headers: {
      'Idempotency-Key': `es210-cookie-confusion-${runNonce}`,
      Cookie: 'SUITE_SESSION=synthetic-not-a-real-session',
    },
    data: payload,
  });
  // The public host edge must strip every suite credential before proxying.
  // A successful anonymous create proves the backend did not receive the
  // synthetic SUITE_SESSION value; if it leaked, the backend would fail closed
  // with CREDENTIAL_CONFUSION instead.
  expect(cookieConfusion.status()).toBe(201);
  expect((await cookieConfusion.json()).idempotentReplay).toBe(false);
  await context.close();
};

const mintSyntheticManagerToken = async (
  request: APIRequestContext,
  username: string,
  password: string,
) => {
  const response = await request.post(
    `${managerRoot}/realms/platform-test/protocol/openid-connect/token`,
    {
      form: {
        grant_type: 'password',
        client_id: 'frontend',
        username,
        password,
        scope: 'openid ethics-manager-audience ethics:case:manage',
      },
    },
  );
  expect(response.status()).toBe(200);
  const token = ((await response.json()) as { access_token?: string }).access_token;
  if (!token) throw new Error(`Synthetic negative persona ${username} did not receive a token.`);
  return token;
};

const findAuthorizedCase = async (request: APIRequestContext, token: string, subject: string) => {
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json' };
  const list = await request.get(`${managerRoot}/api/v1/ethics/cases`, { headers });
  expect(list.status()).toBe(200);
  const summaries = (await list.json()) as Array<{ id: string; version: number }>;
  for (const summary of summaries) {
    const response = await request.get(`${managerRoot}/api/v1/ethics/cases/${summary.id}`, {
      headers,
    });
    if (!response.ok()) continue;
    const detail = (await response.json()) as { subject: string; version: number };
    if (detail.subject === subject) return { id: summary.id, version: detail.version };
  }
  throw new Error('Exact synthetic case was not readable through live Keycloak + OpenFGA.');
};

const assertManagerTokenAndStaleWriter = async (
  request: APIRequestContext,
  subject: string,
  password: string,
) => {
  const token = await mintSyntheticManagerToken(request, managerUsername, password);
  assertManagerTokenContract(decodeManagerTokenContract(token));
  const selected = await findAuthorizedCase(request, token, subject);
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'If-Match': `"${selected.version}"`,
  };
  const update = () =>
    request.patch(`${managerRoot}/api/v1/ethics/cases/${selected.id}`, {
      headers,
      data: { assignedTo: 'team:ethics-test' },
    });
  const accepted = await update();
  const stale = await update();
  expect([accepted.status(), stale.status()]).toEqual([200, 412]);
  return selected.id;
};

const assertTenantAndOpenFgaDeny = async (
  request: APIRequestContext,
  caseId: string,
  wrongOrgPassword: string,
  deniedPassword: string,
) => {
  const wrongOrgToken = await mintSyntheticManagerToken(
    request,
    wrongOrgUsername,
    wrongOrgPassword,
  );
  const wrongOrgList = await request.get(`${managerRoot}/api/v1/ethics/cases`, {
    headers: { Authorization: `Bearer ${wrongOrgToken}` },
  });
  expect(wrongOrgList.status()).toBe(200);
  expect(await wrongOrgList.json()).toEqual([]);

  const deniedToken = await mintSyntheticManagerToken(request, deniedUsername, deniedPassword);
  const deniedDetail = await request.get(`${managerRoot}/api/v1/ethics/cases/${caseId}`, {
    headers: { Authorization: `Bearer ${deniedToken}` },
  });
  // Object existence, explicit deny and policy health are intentionally
  // indistinguishable at this boundary.
  expect(deniedDetail.status()).toBe(404);
};

const createReporterJourney = async (
  browser: Browser,
  base: string,
  label: string,
  runNonce: string,
): Promise<ReporterJourney> => {
  const context = await browser.newContext();
  const page = await context.newPage();
  const observedUrls: string[] = [];
  const observedConsole: string[] = [];
  page.on('request', (request) => observedUrls.push(request.url()));
  page.on('console', (message) => observedConsole.push(message.text()));

  const subject = `ES210 ${label} sentetik ${runNonce}`;
  const staffReply = `ES210 ${label} yetkili yanıtı ${runNonce}`;
  const internalNote = `ES210 ${label} iç not ${runNonce}`;
  const reporterReply = `ES210 ${label} reporter yanıtı ${runNonce}`;

  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Yeni bildirim yap' }).click();
  await page.getByLabel('Kategori').selectOption('WORKPLACE_CONDUCT');
  await page.getByLabel('Kısa konu').fill(subject);
  await page.getByLabel('Ne oldu?').fill(`Yalnız sentetik kabul verisi ${runNonce}`);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Bildirimi gönder' }).click();
  await expect(page.getByRole('heading', { name: /kalıcı olarak kaydedildi/i })).toBeVisible();
  const receiptId = (await page.getByTestId('etik-receipt-id').textContent())?.trim() ?? '';
  const accessSecret = (await page.getByTestId('etik-access-secret').textContent())?.trim() ?? '';
  expect(receiptId).not.toBe('');
  assertCanonicalAccessSecret(accessSecret);
  await page.getByRole('checkbox').check();
  await page.goto(`${base}/`, { waitUntil: 'domcontentloaded' });

  return {
    label,
    base,
    context,
    page,
    receiptId,
    accessSecret,
    subject,
    staffReply,
    internalNote,
    reporterReply,
    observedUrls,
    observedConsole,
  };
};

const openManagerCase = async (
  page: Page,
  request: APIRequestContext,
  subject: string,
  password: string,
) => {
  const token = await mintSyntheticManagerToken(request, managerUsername, password);
  const selected = await findAuthorizedCase(request, token, subject);
  const target = page.getByRole('button', { name: new RegExp(`Vaka #${selected.id}`, 'i') });
  await expect(target).toBeVisible({ timeout: 30_000 });
  await target.click();
  await expect(page.getByRole('heading', { name: subject, exact: true })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByRole('button', { name: 'Atamayı kaydet' })).toBeEnabled();
};

const addManagerResponse = async (
  page: Page,
  request: APIRequestContext,
  journey: ReporterJourney,
  password: string,
) => {
  await openManagerCase(page, request, journey.subject, password);
  await page.getByLabel('Yetkili ataması').fill('team:ethics-test');
  await page.getByRole('button', { name: 'Atamayı kaydet' }).click();
  await page.getByRole('button', { name: 'İncelemeye al' }).click();
  await expect(page.getByText('İncelemede', { exact: true }).first()).toBeVisible();
  await page.getByLabel('Yetkili ekip notu').fill(journey.internalNote);
  await page.getByRole('button', { name: 'İç notu kaydet' }).click();
  await page.getByLabel("Reporter'a güvenli yanıt").fill(journey.staffReply);
  await page.getByRole('button', { name: 'Yanıtı gönder' }).click();
  await expect(page.getByText(journey.staffReply)).toBeVisible();
};

const completeReporterMailbox = async (journey: ReporterJourney) => {
  const { page } = journey;
  await page.getByRole('button', { name: 'Bildirimi takip et' }).click();
  await page.getByLabel('Bildirim numarası').fill(journey.receiptId);
  await page.getByLabel('Erişim sırrı').fill(journey.accessSecret);
  await page.getByRole('button', { name: 'Güvenli mailbox aç' }).click();
  await expect(page.getByTestId('etik-case-status')).toHaveText('Bildirim durumu: İncelemede');
  await expect(page.getByText(journey.staffReply)).toBeVisible();
  await expect(page.getByText(journey.internalNote)).toHaveCount(0);
  await page.getByLabel('Yanıtınız').fill(journey.reporterReply);
  await page.getByRole('button', { name: 'Yanıtı gönder' }).click();
  await expect(page.getByText(journey.reporterReply)).toBeVisible();
  await page.getByRole('button', { name: 'Mailbox oturumunu kapat' }).click();
  await expect(page.getByRole('button', { name: 'Yeni bildirim yap' })).toBeVisible();
  const revokedStatus = await page.evaluate(async () =>
    fetch('/api/v1/public/ethics/mailbox/messages', {
      credentials: 'include',
      cache: 'no-store',
    }).then((response) => response.status),
  );
  expect(revokedStatus).toBe(404);

  const cookies = await journey.context.cookies();
  expect(cookies.some((cookie) => cookie.domain === '.acik.com')).toBe(false);
  expect(
    journey.observedUrls.some(
      (url) => url.includes(journey.receiptId) || url.includes(journey.accessSecret),
    ),
  ).toBe(false);
  expect(
    journey.observedConsole.some(
      (line) => line.includes(journey.receiptId) || line.includes(journey.accessSecret),
    ),
  ).toBe(false);
};

// Receipt/access secret must never land in retry traces, videos or failure screenshots.
test.use({ trace: 'off', video: 'off', screenshot: 'off' });

test('mailbox access-secret format failure is redacted', () => {
  const sentinel = 'raw-mailbox-secret-that-must-never-appear';
  let message = '';
  try {
    assertCanonicalAccessSecret(sentinel);
  } catch (error) {
    message = error instanceof Error ? error.message : String(error);
  }
  expect(message).toBe('Mailbox access secret failed canonical format validation.');
  expect(message.includes(sentinel)).toBe(false);
});

test.describe('Faz 35 ES-210 live synthetic closed loop', () => {
  test('both public hosts and testai manager persist one authorized dialogue per host', async ({
    browser,
    request,
  }) => {
    const password = requiredManagerPassword();
    const wrongOrgPassword = requiredWrongOrgPassword();
    const deniedPassword = requiredDeniedPassword();
    const canonicalArtifact = await publicArtifact(request, canonicalPublic);
    const aliasArtifact = await publicArtifact(request, aliasPublic);
    expect(aliasArtifact.digest).toBe(canonicalArtifact.digest);
    for (const artifact of [canonicalArtifact, aliasArtifact]) {
      expect(artifact.csp).toContain("default-src 'self'");
      const referrerPolicies = artifact.referrer
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);
      expect(referrerPolicies.length).toBeGreaterThan(0);
      expect(referrerPolicies.every((value) => value === 'no-referrer')).toBe(true);
      expect(artifact.cache).toContain('no-store');
      expect(artifact.hsts).toContain('max-age=31536000');
    }

    const runNonce = `${Date.now()}-${randomUUID().slice(0, 8)}`;
    await assertPublicBoundaryAndIdempotency(browser, canonicalPublic, runNonce);
    const journeys = [
      await createReporterJourney(browser, canonicalPublic, 'etik', runNonce),
      await createReporterJourney(browser, aliasPublic, 'speakup', runNonce),
    ];

    // A receipt is bound to its ingress channel; alias parity must not become
    // cross-host mailbox credential portability.
    const crossHostContext = await browser.newContext();
    const crossHostPage = await crossHostContext.newPage();
    await crossHostPage.goto(aliasPublic, { waitUntil: 'domcontentloaded' });
    await crossHostPage.getByRole('button', { name: 'Bildirimi takip et' }).click();
    await crossHostPage.getByLabel('Bildirim numarası').fill(journeys[0].receiptId);
    await crossHostPage.getByLabel('Erişim sırrı').fill(journeys[0].accessSecret);
    await crossHostPage.getByRole('button', { name: 'Güvenli mailbox aç' }).click();
    await expect(crossHostPage.getByRole('alert')).toHaveText(/doğrulanamadı|kilitlendi/i);
    await crossHostContext.close();

    const managerContext = await browser.newContext();
    const manager = await managerContext.newPage();
    await loginManager(manager, password);
    for (const journey of journeys) {
      await addManagerResponse(manager, request, journey, password);
    }
    const authorizedCaseId = await assertManagerTokenAndStaleWriter(
      request,
      journeys[0].subject,
      password,
    );
    await assertTenantAndOpenFgaDeny(request, authorizedCaseId, wrongOrgPassword, deniedPassword);
    for (const journey of journeys) await completeReporterMailbox(journey);

    // The next authorized actor reads the same durable reporter result.
    for (const journey of journeys) {
      await openManagerCase(manager, request, journey.subject, password);
      await expect(manager.getByText(journey.reporterReply)).toBeVisible();
    }

    await managerContext.close();
    for (const journey of journeys) await journey.context.close();
  });
});
