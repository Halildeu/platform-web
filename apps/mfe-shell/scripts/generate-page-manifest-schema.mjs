import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { z } from 'zod';

const require = createRequire(import.meta.url);
require('ts-node/register/transpile-only');

const { PageManifestSchema } = require('../src/app/manifest/pageManifestSchema');

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const outputPath = join(__dirname, '..', 'src', 'app', 'manifest', 'page-manifest.schema.json');

// Zod 4 native JSON Schema export (replaces the third-party
// `zod-to-json-schema` package — same output, one less dependency).
const jsonSchema = z.toJSONSchema(PageManifestSchema, {
  target: 'draft-7',
});
const serialized = `${JSON.stringify(jsonSchema, null, 2)}\n`;

const isCheckMode = process.argv.includes('--check');
const existing = existsSync(outputPath) ? readFileSync(outputPath, 'utf8') : null;

if (isCheckMode) {
  if (existing !== serialized) {
    throw new Error('page-manifest.schema.json güncel değil. `npm run generate:manifest-schema` komutunu çalıştırın.');
  }
  console.log('✅ Page manifest şeması güncel.');
  process.exit(0);
}

writeFileSync(outputPath, serialized, 'utf8');
console.log('✅ Page manifest şeması oluşturuldu:', outputPath);
