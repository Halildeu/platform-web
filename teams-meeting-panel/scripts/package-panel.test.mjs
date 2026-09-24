import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withPanel } from './package-panel.mjs';

const original = { id: '589d9568-2d70-4c08-94f8-31848498966d', manifestVersion: '1.19', version: '0.1.0',
  icons: { color: 'color.png', outline: 'outline.png' },
  bots: [{ botId: 'e1fda65d-f00d-4f00-8014-181781f1e324', supportsCalling: true, scopes: ['personal', 'groupchat', 'team'] }],
  validDomains: ['testai.acik.com'], developer: { privacyUrl: 'https://testai.acik.com/privacy' } };

test('adds meeting surfaces without changing bot identity, consent or original input', () => {
  const before = JSON.stringify(original); const result = withPanel(original, 'https://testai.acik.com', '0.2.0');
  assert.equal(result.id, original.id); assert.deepEqual(result.bots, original.bots); assert.deepEqual(result.developer, original.developer);
  assert.equal(JSON.stringify(original), before);
  assert.deepEqual(result.configurableTabs[0].context, ['meetingSidePanel', 'meetingChatTab', 'meetingDetailsTab']);
  assert.equal(result.configurableTabs[0].configurationUrl, 'https://testai.acik.com/teams/panel/index.html?configure=1');
});
test('requires an already approved HTTPS domain without credentials or alternate paths', () => {
  for (const origin of ['http://testai.acik.com', 'https://evil.example', 'https://testai.acik.com/path', 'https://user:password@testai.acik.com', 'https://testai.acik.com/?token=x'])
    assert.throws(() => withPanel(original, origin, '0.2.0'));
});
test('requires a strictly newer valid package version', () => {
  for (const version of ['0.1.0', '0.0.9', '1.0', '1.01.0', 'x', undefined]) assert.throws(() => withPanel(original, 'https://testai.acik.com', version));
  assert.equal(withPanel(original, 'https://testai.acik.com', '1.0.0').version, '1.0.0');
});
test('rejects placeholders, a zero identity, other manifest contracts or existing tabs', () => {
  for (const overrides of [{ id: '{{ID}}' }, { id: '00000000-0000-0000-0000-000000000000' }, { bots: [] },
    { manifestVersion: '1.20' }, { configurableTabs: [{}] }, { icons: { color: '../secret' } }])
    assert.throws(() => withPanel({ ...original, ...overrides }, 'https://testai.acik.com', '0.2.0'));
});
