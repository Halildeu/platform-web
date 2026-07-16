#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const contractPath = new URL('./build-image-contract.json', import.meta.url);
const parsedContract = JSON.parse(readFileSync(contractPath, 'utf8'));

const topLevelKeys = Object.keys(parsedContract).sort();
const repositoryKeys = Object.keys(parsedContract.repositories ?? {}).sort();
if (
  JSON.stringify(topLevelKeys) !==
    JSON.stringify([
      'owner',
      'registry',
      'repositories',
      'schemaVersion',
      'shortShaLength',
      'tagPrefix',
    ]) ||
  JSON.stringify(repositoryKeys) !== JSON.stringify(['prod', 'testai']) ||
  parsedContract.schemaVersion !== 'acik.platform.web-build-image/v1' ||
  parsedContract.registry !== 'ghcr.io' ||
  parsedContract.owner !== 'halildeu' ||
  parsedContract.repositories.prod !== 'platform-web-frontend' ||
  parsedContract.repositories.testai !== 'platform-web-frontend-testai' ||
  parsedContract.tagPrefix !== 'sha-' ||
  parsedContract.shortShaLength !== 7
) {
  throw new Error('invalid build image identity contract');
}

export const BUILD_IMAGE_CONTRACT = Object.freeze({
  ...parsedContract,
  repositories: Object.freeze({ ...parsedContract.repositories }),
});

export function deriveBuildImageRef(variant, sourceSha) {
  if (!Object.hasOwn(BUILD_IMAGE_CONTRACT.repositories, variant)) {
    throw new Error(`unsupported build image variant: ${JSON.stringify(variant)}`);
  }
  if (!/^[0-9a-f]{40}$/.test(sourceSha)) {
    throw new Error('source SHA must be 40 lowercase hexadecimal characters');
  }
  const repository = BUILD_IMAGE_CONTRACT.repositories[variant];
  const shortSha = sourceSha.slice(0, BUILD_IMAGE_CONTRACT.shortShaLength);
  return `${BUILD_IMAGE_CONTRACT.registry}/${BUILD_IMAGE_CONTRACT.owner}/${repository}:${BUILD_IMAGE_CONTRACT.tagPrefix}${shortSha}`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  const [variant, sourceSha] = process.argv.slice(2);
  process.stdout.write(`${deriveBuildImageRef(variant, sourceSha)}\n`);
}
