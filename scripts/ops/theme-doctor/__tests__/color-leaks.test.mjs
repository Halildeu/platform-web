import test from 'node:test';
import assert from 'node:assert/strict';
import { collectColorLeakFileOccurrences } from '../checks-theme-token.mjs';

test('repeated canonical color leaks in the same file and rule preserve occurrence count', () => {
  const measured = collectColorLeakFileOccurrences(`
    const first = { color: '#FFF' };
    const second = { color : '#fff' };
  `, 'src/repeated.tsx');

  assert.equal(measured.count, 2);
  assert.deepEqual(measured.fingerprintItems, [{
    key: '["src/repeated.tsx","inline-hex","color:\'#fff\'"]',
    count: 2,
  }]);
});
