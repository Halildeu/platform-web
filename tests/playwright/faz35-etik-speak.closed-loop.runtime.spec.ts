import { createHash, randomUUID } from 'node:crypto';
import { lstatSync, readFileSync } from 'node:fs';
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
const publicGateUsername = process.env.ETIK_PUBLIC_GATE_USERNAME ?? 'etik-test';

type HttpCredentials = { username: string; password: string };

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
  const metadata = lstatSync(path);
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new Error(`${environmentName} must point to a regular non-symlink file.`);
  }
  if ((metadata.mode & 0o077) !== 0) {
    throw new Error(`${environmentName} must not be accessible by group or other users.`);
  }
  if (typeof process.getuid === 'function' && metadata.uid !== process.getuid()) {
    throw new Error(`${environmentName} must be owned by the current user.`);
  }
  const value = readFileSync(path, 'utf8').trim();
  if (!value) throw new Error(`${environmentName} is empty.`);
  return value;
};

const requiredManagerPassword = () => requiredSecretFile('ETIK_MANAGER_PASSWORD_FILE');

const requiredPublicGate = (): HttpCredentials => ({
  username: publicGateUsername,
  password: requiredSecretFile('ETIK_PUBLIC_GATE_PASSWORD_FILE'),
});

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

const publicArtifact = async (
  request: APIRequestContext,
  base: string,
  credentials: HttpCredentials,
) => {
  const authorization = `Basic ${Buffer.from(
    `${credentials.username}:${credentials.password}`,
    'utf8',
  ).toString('base64')}`;
  const response = await request.get(base, {
    failOnStatusCode: true,
    headers: { Authorization: authorization },
  });
  const body = await response.body();
  return {
    digest: createHash('sha256').update(body).digest('hex'),
    csp: response.headers()['content-security-policy'] ?? '',
    referrer: response.headers()['referrer-policy'] ?? '',
    cache: response.headers()['cache-control'] ?? '',
  };
};

const createReporterJourney = async (
  browser: Browser,
  base: string,
  label: string,
  runNonce: string,
  credentials: HttpCredentials,
): Promise<ReporterJourney> => {
  const context = await browser.newContext({ httpCredentials: credentials });
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
  expect(accessSecret).toMatch(/^[A-Za-z0-9_-]{43}$/);
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

const openManagerCase = async (page: Page, subject: string) => {
  await page.getByRole('button', { name: 'Yenile' }).click();
  const candidates = page.getByRole('button', { name: /Vaka #/ });
  await expect(candidates.first()).toBeVisible({ timeout: 30_000 });
  for (let index = 0; index < (await candidates.count()); index += 1) {
    await candidates.nth(index).click();
    if (
      await page
        .getByRole('heading', { name: subject, exact: true })
        .isVisible()
        .catch(() => false)
    ) {
      return;
    }
  }
  throw new Error('The exact synthetic case was not visible to the authorized manager.');
};

const addManagerResponse = async (page: Page, journey: ReporterJourney) => {
  await openManagerCase(page, journey.subject);
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
  await expect(page.getByText(journey.staffReply)).toBeVisible();
  await expect(page.getByText(journey.internalNote)).toHaveCount(0);
  await page.getByLabel('Yanıtınız').fill(journey.reporterReply);
  await page.getByRole('button', { name: 'Yanıtı gönder' }).click();
  await expect(page.getByText(journey.reporterReply)).toBeVisible();
  await page.getByRole('button', { name: 'Mailbox oturumunu kapat' }).click();
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

test.describe('Faz 35 ES-210 live synthetic closed loop', () => {
  test('both public hosts and testai manager persist one authorized dialogue per host', async ({
    browser,
    request,
  }) => {
    const password = requiredManagerPassword();
    const publicGate = requiredPublicGate();
    const canonicalArtifact = await publicArtifact(request, canonicalPublic, publicGate);
    const aliasArtifact = await publicArtifact(request, aliasPublic, publicGate);
    expect(aliasArtifact.digest).toBe(canonicalArtifact.digest);
    for (const artifact of [canonicalArtifact, aliasArtifact]) {
      expect(artifact.csp).toContain("default-src 'self'");
      expect(artifact.referrer).toBe('no-referrer');
      expect(artifact.cache).toContain('no-store');
    }

    const runNonce = `${Date.now()}-${randomUUID().slice(0, 8)}`;
    const journeys = [
      await createReporterJourney(browser, canonicalPublic, 'etik', runNonce, publicGate),
      await createReporterJourney(browser, aliasPublic, 'speakup', runNonce, publicGate),
    ];

    // A receipt is bound to its ingress channel; alias parity must not become
    // cross-host mailbox credential portability.
    const crossHostContext = await browser.newContext({ httpCredentials: publicGate });
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
    for (const journey of journeys) await addManagerResponse(manager, journey);
    for (const journey of journeys) await completeReporterMailbox(journey);

    // The next authorized actor reads the same durable reporter result.
    for (const journey of journeys) {
      await openManagerCase(manager, journey.subject);
      await expect(manager.getByText(journey.reporterReply)).toBeVisible();
    }

    await managerContext.close();
    for (const journey of journeys) await journey.context.close();
  });
});
