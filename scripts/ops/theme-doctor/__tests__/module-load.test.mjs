import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { test } from 'node:test';

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const THEME_DOCTOR_DIR = join(TEST_DIR, '..');
const MODULE_FILES = readdirSync(THEME_DOCTOR_DIR, { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith('.mjs'))
  .map((entry) => entry.name)
  .sort();

test('all Theme Doctor check modules parse and expose register()', async (t) => {
  assert.ok(MODULE_FILES.length > 0, 'expected Theme Doctor check modules');

  for (const fileName of MODULE_FILES) {
    await t.test(fileName, async () => {
      const filePath = join(THEME_DOCTOR_DIR, fileName);
      const syntax = spawnSync(process.execPath, ['--check', filePath], {
        encoding: 'utf8',
      });

      assert.equal(syntax.status, 0, [syntax.stdout, syntax.stderr].filter(Boolean).join('\n'));

      const module = await import(pathToFileURL(filePath).href);
      assert.equal(typeof module.register, 'function', `${fileName} must export register()`);
    });
  }
});
