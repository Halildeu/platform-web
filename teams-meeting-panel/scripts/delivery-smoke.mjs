import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

// Run against the runtime target AND the final published frontend image.
// No institutional credentials are used. The config below is a public fixture.
const image = process.argv[2];
const expectedSource = process.argv[3] ?? execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
assert(image && !image.startsWith('-'), 'Supply the image to test');
assert.match(expectedSource, /^[0-9a-f]{40}$/);
const docker = (...args) => execFileSync('docker', args, { encoding: 'utf8', timeout: 120_000 }).trim();
const directory = mkdtempSync(join(tmpdir(), 'teams-panel-delivery-'));
const configPath = join(directory, 'config.json');
const config = { keycloak: { url: 'https://panel.example.test', realm: 'fixture', clientId: 'fixture-public' }, calendarEnabled: false };
writeFileSync(configPath, JSON.stringify(config), { mode: 0o644 });

async function verify(configured) {
  let id;
  try {
    id = docker('run', '--rm', '-d', '-p', '127.0.0.1::80',
      ...(configured ? ['--mount', `type=bind,source=${configPath},target=/usr/share/nginx/html/teams/panel/config.json,readonly`] : []), image);
    const port = docker('port', id, '80/tcp').split(':').at(-1);
    const origin = `http://127.0.0.1:${port}`;
    const get = path => fetch(`${origin}${path}`, { redirect: 'manual', signal: AbortSignal.timeout(5000) });
    let ready = false;
    for (let attempt = 0; attempt < 30; attempt++) {
      try { if ((await get('/teams/panel/index.html')).status === 200) { ready = true; break; } } catch {}
      await delay(500);
    }
    assert(ready, 'Panel HTML did not become available');
    const short = await get('/teams/panel');
    assert.equal(short.status, 308);
    assert.equal(new URL(short.headers.get('location'), origin).pathname, '/teams/panel/');

    for (const path of ['/teams/panel/', '/teams/panel/index.html', '/teams/panel/login.html?code=fixture-code-do-not-log&state=fixture']) {
      const response = await get(path);
      assert.equal(response.status, 200, path);
      assert.match(response.headers.get('content-type') ?? '', /^text\/html/);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
      assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
      assert.equal(response.headers.get('x-frame-options'), null);
      assert.notEqual(response.headers.get('cross-origin-opener-policy'), 'same-origin');
      const csp = response.headers.get('content-security-policy') ?? '';
      assert.match(csp, /frame-ancestors .*https:\/\/\*\.cloud\.microsoft/);
      assert.match(csp, /connect-src 'self'/);
      const html = await response.text();
      const assets = [...html.matchAll(/(?:src|href)="(\/teams\/panel\/assets\/[^"?#]+)"/g)].map(match => match[1]);
      assert(assets.some(asset => asset.endsWith('.js')), 'Actual compiled panel script missing');
      for (const asset of assets) {
        const resource = await get(asset);
        assert.equal(resource.status, 200, asset);
        assert.match(resource.headers.get('content-type') ?? '', asset.endsWith('.css') ? /^text\/css/ : /javascript/);
        assert(!((await resource.text()).trimStart().startsWith('<')), 'Asset returned fallback HTML');
      }
    }
    for (const path of ['/teams/panel/assets/absent.js', '/teams/panel/absent.html']) {
      assert.equal((await get(path)).status, 404, 'Missing panel path must not fall back to shell');
    }
    const source = await get('/teams/panel/SOURCE_COMMIT');
    assert.equal(source.status, 200);
    assert.equal((await source.text()).trim(), expectedSource);
    const settings = await get('/teams/panel/config.json');
    assert.equal(settings.status, configured ? 200 : 404);
    assert.equal(settings.headers.get('cache-control'), 'no-store');
    if (configured) {
      assert.match(settings.headers.get('content-type') ?? '', /^application\/json/);
      assert.deepEqual(await settings.json(), config);
    }
    const logs = docker('logs', id);
    assert(!logs.includes('fixture-code-do-not-log'), 'OAuth query appeared in container logs');
    console.log(`Panel HTTP delivery PASS (config ${configured ? 'mounted' : 'absent'})`);
  } finally {
    if (id) docker('stop', id);
  }
}
try { await verify(false); await verify(true); }
finally { rmSync(directory, { recursive: true, force: true }); }
