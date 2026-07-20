import { chromium } from 'playwright';

const baseUrl = process.argv[2];
if (!baseUrl) throw new Error('browser-smoke requires an explicit base URL');

const browser = await chromium.launch({ headless: true });
try {
  for (const path of ['/ethic/', '/ethic/cases/synthetic']) {
    const page = await browser.newPage();
    const runtimeErrors = [];
    const authRequests = [];
    let renderedHeading = false;
    await page.exposeFunction('recordEtikSpeakHeading', () => {
      renderedHeading = true;
    });
    await page.addInitScript(() => {
      const observer = new MutationObserver(() => {
        if (document.querySelector('h1')?.textContent?.trim() === 'Etik Speak') {
          window.recordEtikSpeakHeading();
          observer.disconnect();
        }
      });
      observer.observe(document, { childList: true, subtree: true });
    });
    page.on('pageerror', (error) => runtimeErrors.push(`pageerror: ${error.message}`));
    page.on('request', (request) => {
      if (request.url().includes('/realms/platform-test/protocol/openid-connect/auth')) {
        authRequests.push(request.url());
      }
    });
    page.on('console', (message) => {
      if (message.type() === 'error' && /content security policy|refused to/i.test(message.text())) {
        runtimeErrors.push(`console: ${message.text()}`);
      }
    });
    await page.goto(`${baseUrl}${path}`, { waitUntil: 'networkidle' });
    if (!renderedHeading) throw new Error(`${path}: React auth gate did not render`);
    if (authRequests.length !== 1) {
      throw new Error(`${path}: expected one Keycloak check-sso request`);
    }
    const authorize = new URL(authRequests[0]);
    if (authorize.searchParams.get('client_id') !== 'frontend') {
      throw new Error(`${path}: wrong client`);
    }
    if (authorize.searchParams.get('code_challenge_method') !== 'S256') {
      throw new Error(`${path}: PKCE missing`);
    }
    if (authorize.searchParams.get('prompt') !== 'none') {
      throw new Error(`${path}: check-sso not bounded`);
    }
    if (runtimeErrors.length) throw new Error(`${path}: ${runtimeErrors.join('; ')}`);
    await page.close();
  }
} finally {
  await browser.close();
}
